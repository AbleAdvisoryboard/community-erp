import { getDb } from "../db/connection.js";
import { writeAuditLog } from "../utils/audit.js";
import { getJlInsert } from "../utils/journalLines.js";
import { getApprovalNote } from "./financeControlsService.js";

function nextBillNumber(db) {
  const row = db.prepare("SELECT printf('BILL%06d', COALESCE(MAX(id), 0) + 1) AS next_no FROM bills").get();
  return row.next_no;
}
function getGlIdByCode(db, code) {
  const row = db.prepare("SELECT id FROM gl_accounts WHERE code = ?").get(code);
  return row?.id || null;
}

export function listBills({ status, vendorAccountId, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = { limit, offset };
  if (status) { where.push("b.status = @status"); params.status = status; }
  if (vendorAccountId) { where.push("b.vendor_account_id = @vendorAccountId"); params.vendorAccountId = vendorAccountId; }
  const sql = `SELECT b.*, a.name AS vendor_name
    FROM bills b
    LEFT JOIN accounts a ON a.id = b.vendor_account_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY b.bill_date DESC, b.id DESC
    LIMIT @limit OFFSET @offset`;
  return getDb().prepare(sql).all(params);
}

export function getApAging() {
  const db = getDb();
  return db.prepare("SELECT * FROM v_ap_aging ORDER BY bill_date DESC, bill_id DESC").all();
}

export function createBill(data, auditContext) {
  const db = getDb();
  const approval = getApprovalNote("bill");
  const lines = Array.isArray(data.lines) ? data.lines : [];
  if (!lines.length) throw new Error('Bill must have at least one line');

  let total = 0;
  const normLines = lines.map(l => {
    const qty = Number(l.quantity ?? 1);
    const price = Number(l.unitPrice ?? 0);
    const amount = qty * price;
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid line');
    total += amount;
    return { description: l.description ?? null, quantity: qty, unit_price: price, amount, expense_gl_account_id: l.expenseGlAccountId ?? null };
  });

  const apId = getGlIdByCode(db, '2000');
  const defaultExpense = getGlIdByCode(db, '6000');

  const run = db.transaction(() => {
    const billNo = nextBillNumber(db);
    const res = db.prepare(`INSERT INTO bills (vendor_account_id, bill_no, bill_date, due_date, status, currency_code, fx_rate, memo, total_amount, balance_amount, created_by, posted_at)
      VALUES (@vendor_account_id, @bill_no, @bill_date, @due_date, @status, @currency_code, @fx_rate, @memo, @total_amount, @balance_amount, @created_by, CURRENT_TIMESTAMP)`).run({
      vendor_account_id: data.vendorAccountId ?? null,
      bill_no: billNo,
      bill_date: data.billDate ?? new Date().toISOString().slice(0,10),
      due_date: data.dueDate ?? null,
      status: data.status ?? 'Posted',
      currency_code: data.currencyCode ?? 'USD',
      fx_rate: Number(data.fxRate ?? 1),
      memo: data.memo ?? null,
      total_amount: total,
      balance_amount: total,
      created_by: auditContext?.userId ?? null,
    });
    const billId = res.lastInsertRowid;
    const insLine = db.prepare(`INSERT INTO bill_lines (bill_id, description, quantity, unit_price, amount, expense_gl_account_id)
      VALUES (@bill_id, @description, @quantity, @unit_price, @amount, @expense_gl_account_id)`);
    for (const ln of normLines) insLine.run({ ...ln, bill_id: billId, expense_gl_account_id: ln.expense_gl_account_id ?? defaultExpense });

    // Post to GL: Dr Expense (per line), Cr AP (total)
    const entryNo = db.prepare("SELECT printf('J%06d', COALESCE(MAX(id), 0) + 1) AS entry_no FROM journals").get().entry_no;
    const jRes = db.prepare(`INSERT INTO journals (entry_no, journal_date, memo, created_by, posted_at, number, is_posted)
      VALUES (@entry_no, @journal_date, @memo, @created_by, CURRENT_TIMESTAMP, @number, 1)`).run({
      entry_no: entryNo,
      journal_date: data.billDate ?? new Date().toISOString().slice(0,10),
      memo: `Bill ${billNo}`,
      created_by: auditContext?.userId ?? null,
      number: `JE-${new Date().getFullYear()}-${String((db.prepare('SELECT COALESCE(MAX(id),0)+1 AS n FROM journals').get().n)).padStart(4,'0')}`,
    });
    const jId = jRes.lastInsertRowid;
    const { stmt: jl, cols: jlCols } = getJlInsert(db);
    const linesNow = db.prepare("SELECT id, amount, expense_gl_account_id FROM bill_lines WHERE bill_id = ?").all(billId);
    for (const l of linesNow) jl.run(jlCols.map(c => ({ journal_id: jId, gl_account_id: l.expense_gl_account_id ?? defaultExpense, amount: l.amount, drcr: 'D', fund_id: null, class_id: null, campaign_id: null, memo: `Bill ${billNo}`, source_table: 'bills', source_id: billId, source_line: l.id })[c]));
    jl.run(jlCols.map(c => ({ journal_id: jId, gl_account_id: apId, amount: total, drcr: 'C', fund_id: null, class_id: null, campaign_id: null, memo: `Bill ${billNo}`, source_table: 'bills', source_id: billId, source_line: null })[c]));

    return billId;
  });

  const billId = run();
  const bill = db.prepare("SELECT * FROM bills WHERE id = ?").get(billId);
  const jRow = db.prepare("SELECT number, entry_no FROM journals ORDER BY id DESC LIMIT 1").get();
  writeAuditLog({ userId: auditContext?.userId ?? null, entity: 'bills', entityId: String(billId), action: 'create', after: bill, ipAddress: auditContext?.ip, userAgent: auditContext?.userAgent });
  return { ...bill, journal_number: jRow?.number || jRow?.entry_no, approval };
}

export function applyBillPayment(billId, data, auditContext) {
  const db = getDb();
  const approval = getApprovalNote("payment");
  const bill = db.prepare("SELECT * FROM bills WHERE id = ?").get(billId);
  if (!bill) return null;
  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Payment amount must be > 0');
  const method = data.method ?? 'Offline';
  const run = db.transaction(() => {
    const payRes = db.prepare(`INSERT INTO bill_payments (bill_id, paid_at, amount, method, reference, created_by)
      VALUES (@bill_id, @paid_at, @amount, @method, @reference, @created_by)`).run({
      bill_id: billId,
      paid_at: data.paidAt ?? new Date().toISOString(),
      amount,
      method,
      reference: data.reference ?? null,
      created_by: auditContext?.userId ?? null,
    });
    const paymentId = payRes.lastInsertRowid;
    const newBal = Math.max(0, (bill.balance_amount || 0) - amount);
    db.prepare("UPDATE bills SET balance_amount = @bal, status = @status WHERE id = @id").run({ id: billId, bal: newBal, status: newBal === 0 ? 'Paid' : bill.status });
    // GL: Dr AP, Cr Cash
    const pm = db.prepare("SELECT cash_gl_account_id FROM payment_method_gl_mappings WHERE method = ?").get(method);
    let cashId = pm?.cash_gl_account_id || getGlIdByCode(db,'1000');
    // AP payments should credit Bank, not Undeposited; coerce if mapping points to 1010
    const undepId = getGlIdByCode(db,'1010');
    const bankId = getGlIdByCode(db,'1000');
    if (cashId === undepId) cashId = bankId;
    const apId = getGlIdByCode(db,'2000');
    const entryNo = db.prepare("SELECT printf('J%06d', COALESCE(MAX(id), 0) + 1) AS entry_no FROM journals").get().entry_no;
    const jRes = db.prepare(`INSERT INTO journals (entry_no, journal_date, memo, created_by, posted_at, number, is_posted)
      VALUES (@entry_no, @journal_date, @memo, @created_by, CURRENT_TIMESTAMP, @number, 1)`).run({
      entry_no: entryNo,
      journal_date: data.paidAt ? String(data.paidAt).slice(0,10) : new Date().toISOString().slice(0,10),
      memo: `Bill Payment ${bill.bill_no}`,
      created_by: auditContext?.userId ?? null,
      number: `JE-${new Date().getFullYear()}-${String((db.prepare('SELECT COALESCE(MAX(id),0)+1 AS n FROM journals').get().n)).padStart(4,'0')}`,
    });
    const jId = jRes.lastInsertRowid;
    const { stmt: jl, cols: jlCols } = getJlInsert(db);
    jl.run(jlCols.map(c => ({ journal_id: jId, gl_account_id: apId, amount, drcr: 'D', fund_id: null, class_id: null, campaign_id: null, memo: `Bill Payment ${bill.bill_no}`, source_table: 'bill_payments', source_id: paymentId, source_line: null })[c]));
    jl.run(jlCols.map(c => ({ journal_id: jId, gl_account_id: cashId, amount, drcr: 'C', fund_id: null, class_id: null, campaign_id: null, memo: `Bill Payment ${bill.bill_no}`, source_table: 'bill_payments', source_id: paymentId, source_line: null })[c]));
    return { journalId: jId, paymentId };
  });
  const { journalId: jId, paymentId } = run();
  const updated = db.prepare("SELECT * FROM bills WHERE id = ?").get(billId);
  const jRow = db.prepare("SELECT number, entry_no FROM journals WHERE id = ?").get(jId);
  writeAuditLog({ userId: auditContext?.userId ?? null, entity: 'bill_payments', entityId: String(billId), action: 'create', after: { bill: updated, payment: { amount, method } }, ipAddress: auditContext?.ip, userAgent: auditContext?.userAgent });
  return { ...updated, payment_id: paymentId, journal_id: jId, journal_number: jRow?.number || jRow?.entry_no, approval };
}
