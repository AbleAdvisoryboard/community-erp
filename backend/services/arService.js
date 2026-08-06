import { getDb } from "../db/connection.js";
import { writeAuditLog } from "../utils/audit.js";
import { getJlInsert } from "../utils/journalLines.js";
import { getApprovalNote } from "./financeControlsService.js";


function nextInvoiceNumber(db) {
  const row = db
    .prepare("SELECT printf('INV%06d', COALESCE(MAX(id), 0) + 1) AS next_no FROM invoices")
    .get();
  return row.next_no;
}

function getGlAccountIdByCode(db, code) {
  const row = db.prepare("SELECT id FROM gl_accounts WHERE code = ?").get(code);
  return row?.id || null;
}

function requireNumber(n, message) {
  const v = Number(n);
  if (!Number.isFinite(v)) throw new Error(message);
  return v;
}

export function listInvoices({ status, accountId, from, to, limit = 50, offset = 0 } = {}) {
  const db = getDb();
  const where = [];
  const params = { limit, offset };
  if (status) { where.push("i.status = @status"); params.status = status; }
  if (accountId) { where.push("i.account_id = @accountId"); params.accountId = accountId; }
  if (from) { where.push("i.invoice_date >= @from"); params.from = String(from).slice(0,10); }
  if (to) { where.push("i.invoice_date <= @to"); params.to = String(to).slice(0,10); }
  const sql = `SELECT i.*, a.name AS account_name,
    printf('%s %s', c.first_name, c.last_name) AS contact_name
    FROM invoices i
    LEFT JOIN accounts a ON a.id = i.account_id
    LEFT JOIN contacts c ON c.id = i.contact_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY i.invoice_date DESC, i.id DESC
    LIMIT @limit OFFSET @offset`;
  return db.prepare(sql).all(params);
}

export function getAging() {
  const db = getDb();
  return db.prepare("SELECT * FROM v_ar_aging ORDER BY invoice_date DESC, invoice_id DESC").all();
}

export function createInvoice(data, auditContext) {
  const db = getDb();
  const approval = getApprovalNote("manualJournal");
  const lines = Array.isArray(data.lines) ? data.lines : [];
  if (!lines.length) throw new Error("Invoice must have at least one line");

  let total = 0;
  const normLines = lines.map((l) => {
    const qty = requireNumber(l.quantity ?? 1, "Invalid quantity");
    const price = requireNumber(l.unitPrice ?? 0, "Invalid unit price");
    const amount = qty * price;
    if (amount <= 0) throw new Error("Line amount must be > 0");
    total += amount;
    return {
      description: l.description ?? null,
      item_id: l.itemId ?? null,
      quantity: qty,
      unit_price: price,
      amount,
      revenue_gl_account_id: l.revenueGlAccountId ?? null,
    };
  });

  const arAccountId = getGlAccountIdByCode(db, '1100');
  const defaultRevenueId = getGlAccountIdByCode(db, '4000');

  const run = db.transaction(() => {
    const invoiceNo = nextInvoiceNumber(db);
    const insertInv = db.prepare(`INSERT INTO invoices
      (account_id, contact_id, invoice_no, invoice_date, due_date, status, currency_code, fx_rate, memo, total_amount, balance_amount, created_by, posted_at)
      VALUES (@account_id, @contact_id, @invoice_no, @invoice_date, @due_date, @status, @currency_code, @fx_rate, @memo, @total_amount, @balance_amount, @created_by, CURRENT_TIMESTAMP)`);
    const invRes = insertInv.run({
      account_id: data.accountId ?? null,
      contact_id: data.contactId ?? null,
      invoice_no: invoiceNo,
      invoice_date: data.invoiceDate ?? new Date().toISOString().slice(0,10),
      due_date: data.dueDate ?? null,
      status: data.status ?? 'Posted',
      currency_code: data.currencyCode ?? 'USD',
      fx_rate: Number(data.fxRate ?? 1),
      memo: data.memo ?? null,
      total_amount: total,
      balance_amount: total,
      created_by: auditContext?.userId ?? null,
    });
    const invoiceId = invRes.lastInsertRowid;
    const insertLine = db.prepare(`INSERT INTO invoice_lines
      (invoice_id, item_id, description, quantity, unit_price, amount, revenue_gl_account_id)
      VALUES (@invoice_id, @item_id, @description, @quantity, @unit_price, @amount, @revenue_gl_account_id)`);
    for (const ln of normLines) {
      insertLine.run({ ...ln, invoice_id: invoiceId, revenue_gl_account_id: ln.revenue_gl_account_id ?? defaultRevenueId });
    }

    // Post to GL: Dr AR, Cr Revenue (per line)
    const journalMeta = (() => {
      const insertJournal = db.prepare(`INSERT INTO journals (entry_no, journal_date, memo, created_by, posted_at)
       VALUES (@entry_no, @journal_date, @memo, @created_by, CURRENT_TIMESTAMP)`);
      const entryNo = db.prepare("SELECT printf('J%06d', COALESCE(MAX(id), 0) + 1) AS entry_no FROM journals").get().entry_no;
      const jRes = insertJournal.run({ entry_no: entryNo, journal_date: data.invoiceDate ?? new Date().toISOString().slice(0,10), memo: `Invoice ${invoiceNo}`, created_by: auditContext?.userId ?? null });
      const jId = jRes.lastInsertRowid;
      const { stmt: insertJL, cols: jlCols } = getJlInsert(db);
      // Debit AR total
      insertJL.run(jlCols.map(c => ({
        journal_id: jId, gl_account_id: arAccountId, amount: total, drcr: 'D',
        fund_id: null, class_id: null, campaign_id: null, memo: `Invoice ${invoiceNo}`,
        source_table: 'invoices', source_id: invoiceId, source_line: null
      })[c]));
      // Credit revenue by line
      const linesNow = db.prepare("SELECT id, amount, revenue_gl_account_id FROM invoice_lines WHERE invoice_id = ?").all(invoiceId);
      for (const l of linesNow) {
        insertJL.run(jlCols.map(c => ({
          journal_id: jId, gl_account_id: l.revenue_gl_account_id ?? defaultRevenueId, amount: l.amount, drcr: 'C',
          fund_id: null, class_id: null, campaign_id: null, memo: `Invoice ${invoiceNo}`,
          source_table: 'invoices', source_id: invoiceId, source_line: l.id
        })[c]));
      }
      const number = db.prepare("SELECT number, entry_no FROM journals WHERE id = ?").get(jId);
      return { journalId: jId, journalNumber: number?.number || number?.entry_no };
    })();

    return { invoiceId, journalMeta };
  });

  const { invoiceId, journalMeta } = run();
  const invoice = db.prepare("SELECT * FROM invoices WHERE id = ?").get(invoiceId);
  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: 'invoices',
    entityId: String(invoiceId),
    action: 'create',
    after: invoice,
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });
  return { ...invoice, journal_number: journalMeta?.journalNumber || null, approval };
}

export function applyInvoicePayment(invoiceId, data, auditContext) {
  const db = getDb();
  const approval = getApprovalNote("payment");
  const invoice = db.prepare("SELECT * FROM invoices WHERE id = ?").get(invoiceId);
  if (!invoice) return null;
  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Payment amount must be > 0');
  const method = data.method ?? 'Offline';

  const run = db.transaction(() => {
    const payRes = db.prepare(`INSERT INTO invoice_payments (invoice_id, received_at, amount, method, reference, created_by)
      VALUES (@invoice_id, @received_at, @amount, @method, @reference, @created_by)`).run({
      invoice_id: invoiceId,
      received_at: data.receivedAt ?? new Date().toISOString(),
      amount,
      method,
      reference: data.reference ?? null,
      created_by: auditContext?.userId ?? null,
    });
    const paymentId = payRes.lastInsertRowid;

    const newBalance = Math.max(0, (invoice.balance_amount || 0) - amount);
    db.prepare("UPDATE invoices SET balance_amount = @bal, status = @status WHERE id = @id").run({
      id: invoiceId,
      bal: newBalance,
      status: newBalance === 0 ? 'Paid' : invoice.status,
    });

    // Post to GL: Dr Cash (by method), Cr AR
    const pm = db.prepare("SELECT cash_gl_account_id FROM payment_method_gl_mappings WHERE method = ?").get(method);
    const cashId = pm?.cash_gl_account_id ?? getGlAccountIdByCode(db, '1000');
    const arId = getGlAccountIdByCode(db, '1100');
    const entryNo = db.prepare("SELECT printf('J%06d', COALESCE(MAX(id), 0) + 1) AS entry_no FROM journals").get().entry_no;
    const jRes = db.prepare(`INSERT INTO journals (entry_no, journal_date, memo, created_by, posted_at, number, is_posted)
      VALUES (@entry_no, @journal_date, @memo, @created_by, CURRENT_TIMESTAMP, @number, 1)`).run({
      entry_no: entryNo,
      journal_date: data.receivedAt ? String(data.receivedAt).slice(0,10) : new Date().toISOString().slice(0,10),
      memo: `Payment ${invoice.invoice_no}`,
      created_by: auditContext?.userId ?? null,
      number: `JE-${new Date().getFullYear()}-${String((db.prepare('SELECT COALESCE(MAX(id),0)+1 AS n FROM journals').get().n)).padStart(4,'0')}`,
    });
    const jId = jRes.lastInsertRowid;
    const { stmt: jl, cols: jlCols } = getJlInsert(db);
    jl.run(jlCols.map(c => ({ journal_id: jId, gl_account_id: cashId, amount, drcr: 'D', fund_id: null, class_id: null, campaign_id: null, memo: `Payment ${invoice.invoice_no}`, source_table: 'invoice_payments', source_id: paymentId, source_line: null })[c]));
    jl.run(jlCols.map(c => ({ journal_id: jId, gl_account_id: arId, amount, drcr: 'C', fund_id: null, class_id: null, campaign_id: null, memo: `Payment ${invoice.invoice_no}`, source_table: 'invoice_payments', source_id: paymentId, source_line: null })[c]));
    return { journalId: jId, paymentId };
  });
  
  const { journalId: jId, paymentId } = run();

  const updated = db.prepare("SELECT * FROM invoices WHERE id = ?").get(invoiceId);
  const jRow = getDb().prepare("SELECT number, entry_no FROM journals WHERE id = ?").get(jId);
  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: 'invoice_payments',
    entityId: String(invoiceId),
    action: 'create',
    after: { invoice: updated, payment: { amount, method } },
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });
  return { ...updated, payment_id: paymentId, journal_id: jId, journal_number: jRow?.number || jRow?.entry_no, approval };
}
