# Accounting Posting Flows and Account Mappings

Overview
- This implementation wires Donations, AR, AP, and Bank Deposits to the General Ledger with fund/campaign/class dimensions where available, and includes traceability on journal lines.

Dimensions on journal_lines
- fund_id: preserved from source where available (donations).
- class_id: additive column available; currently not populated by AR/AP line items (no class fields yet) but ready for use.
- campaign_id: populated for donations.
- source_table, source_id, source_line: populated to support traceability and idempotency.

Donations
- On create (auto-post, non-InKind):
  - Dr Undeposited Funds (1010) for Cash/Check/Offline; Dr Cash (1000) for ACH/CreditCard/Online via payment_method_gl_mappings.
  - Cr Contributions Revenue (by fund mapping fund_gl_mappings, fallback 4000).
  - Carry: fund_id, campaign_id; source_table='donations', source_id=donationId.
- Idempotency: postingService.generateAndPostFromDonation() bails if a journal_line exists for donations/source_id.

Accounts Receivable (AR)
- Invoice (create → auto-post):
  - Dr Accounts Receivable (1100) for total.
  - Cr revenue per line (invoice_lines.revenue_gl_account_id or 4000).
  - Carry: source_table='invoices', source_id=invoiceId, source_line=invoice_line.id.
- Payment:
  - Dr Cash/Undeposited by payment method mapping.
  - Cr Accounts Receivable (1100).
  - Carry: source_table='invoice_payments', source_id=paymentId.
- Idempotency: invoices table uses posted_at; postingService also supports explicit post endpoints.

Accounts Payable (AP)
- Bill (create → auto-post):
  - Dr expense per line (bill_lines.expense_gl_account_id or 6000).
  - Cr Accounts Payable (2000) total.
  - Carry: source_table='bills', source_id=billId, source_line=bill_line.id.
- Payment:
  - Dr Accounts Payable (2000).
  - Cr Cash (by method mapping).
  - Carry: source_table='bill_payments', source_id=paymentId.

Bank Deposits
- GET /bank/undeposited now returns a combined list of:
  - AR invoice payments not deposited (fields: id, invoice_no, received_at, method, amount).
  - Donations that map to Undeposited Funds and not deposited (as pseudo payments: id, invoice_no='Donation X', received_at=donated_at, method, amount).
- POST /bank/deposits accepts existing payload { bankAccountId, depositDate, paymentIds }:
  - Backward-compatible: paymentIds may contain a mix of AR payment IDs and Donation IDs; the backend detects and splits.
  - Creates deposit header + lines in bank_deposit_lines (AR) and bank_deposit_donation_lines (Donations).
  - Posts a single journal: Dr Bank (bankAccountId is the GL account id as per existing UI), Cr Undeposited Funds (1010), with journal_lines.source_table='bank_deposits', source_id=depositId.

Trial Balance and Financial Statements
- Trial balance sums journal_lines with optional filters as_of, fundId, classId.
- Statement of Activities and Balance Sheet derive from GL balances; donations flow into revenue accounts (4000-series by default) and cash/undeposited assets.

Safety & Conventions
- All posting actions perform balanced journal validation.
- Operations are wrapped in transactions.
- No destructive migrations; new columns and tables added additively.
