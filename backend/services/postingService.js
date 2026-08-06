import { getDb } from "../db/connection.js";
import { GL_CODES } from "../utils/gl.js";
import { getJlInsert } from "../utils/journalLines.js";

function isBalanced(db, journalId) {
  const row = db.prepare(
    `SELECT SUM(CASE WHEN drcr='D' THEN amount ELSE 0 END) AS debits,
            SUM(CASE WHEN drcr='C' THEN amount ELSE 0 END) AS credits
       FROM journal_lines WHERE journal_id = ?`
  ).get(journalId);
  const d = Number(row?.debits || 0);
  const c = Number(row?.credits || 0);
  return Math.abs(d - c) < 0.005;
}

export function validatePeriodOpen(dateStr) {
  const db = getDb();
  const date = (dateStr || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const row = db
    .prepare(
      `SELECT id, name, is_closed FROM periods
         WHERE start_date <= @d AND (end_date IS NULL OR end_date >= @d)
         ORDER BY start_date DESC LIMIT 1`
    )
    .get({ d: date });
  if (row && row.is_closed) {
    throw new Error("Posting period is closed");
  }
  return row || null;
}

export function postJournal(journalId) {
  const db = getDb();
  const j = db.prepare("SELECT * FROM journals WHERE id = ?").get(journalId);
  if (!j) throw new Error("Journal not found");
  validatePeriodOpen(j.journal_date);
  if (!isBalanced(db, journalId)) {
    throw new Error("Journal not balanced");
  }
  if (j.posted_at) {
    return { id: journalId, number: j.number || j.entry_no, posted: true };
  }
  db.prepare("UPDATE journals SET posted_at = CURRENT_TIMESTAMP, is_posted = 1 WHERE id = ?").run(journalId);
  return { id: journalId, number: j.number || j.entry_no, posted: true };
}

function nextJournalNumber(db) {
  const row = db
    .prepare("SELECT printf('JE-%s-%04d', strftime('%Y', 'now'), COALESCE(MAX(id),0)+1) AS num FROM journals")
    .get();
  return row.num;
}

function ensureAccountByCode(db, code, fallbackName, type) {
  const row = db.prepare("SELECT id FROM gl_accounts WHERE code = ?").get(code);
  if (row?.id) return row.id;
  const res = db
    .prepare("INSERT INTO gl_accounts (code, name, type, is_active) VALUES (?,?,?,1)")
    .run(code, fallbackName, type);
  return res.lastInsertRowid;
}

function createSimpleJournal(db, { date, memo, lines }) {
  if (!Array.isArray(lines) || lines.length < 2) throw new Error('Journal must have at least two lines');
  let deb = 0, cred = 0;
  for (const ln of lines) {
    const amt = Number(ln.amount || 0);
    if (!(amt > 0)) throw new Error('Journal line amount must be > 0');
    if (ln.drcr === 'D') deb += amt; else if (ln.drcr === 'C') cred += amt; else throw new Error('Journal line drcr must be D or C');
  }
  if (Math.abs(deb - cred) > 0.005) throw new Error('Journal not balanced');
  const number = nextJournalNumber(db);
  const run = db.transaction(() => {
    const jRes = db
      .prepare(
        `INSERT INTO journals (entry_no, number, journal_date, memo, created_by, posted_at, is_posted)
         VALUES (@entry_no, @number, @journal_date, @memo, @created_by, CURRENT_TIMESTAMP, 1)`
      )
      .run({
        entry_no: number.replace('JE-','J'),
        number,
        journal_date: date || new Date().toISOString().slice(0, 10),
        memo: memo || null,
        created_by: null,
      });
    const jId = jRes.lastInsertRowid;
    const { stmt: ins, cols } = getJlInsert(db);
    for (const ln of lines) {
      const base = {
        journal_id: jId,
        gl_account_id: ln.gl_account_id,
        amount: ln.amount,
        drcr: ln.drcr,
        fund_id: ln.fund_id ?? null,
        class_id: ln.class_id ?? null,
        campaign_id: ln.campaign_id ?? null,
        memo: ln.memo || memo || null,
        source_table: ln.source_table ?? null,
        source_id: ln.source_id ?? null,
        source_line: ln.source_line ?? null,
      };
      ins.run(cols.map(c => base[c]));
    }
    return { id: jId, number };
  });
  return run();
}

export function generateAndPostFromAR({ invoiceId, paymentId }) {
  const db = getDb();
  if (invoiceId) {
    const inv = db.prepare("SELECT * FROM invoices WHERE id = ?").get(invoiceId);
    if (!inv) throw new Error("Invoice not found");
    // If already posted (posted_at present), consider done.
    const already = db.prepare("SELECT 1 FROM journal_lines WHERE source_table='invoices' AND source_id=? LIMIT 1").get(invoiceId);
    if (inv.posted_at || already) {
      return { ok: true, alreadyPosted: true, invoiceId };
    }
    // Post AR: Dr AR total, Cr revenue per line
    validatePeriodOpen(inv.invoice_date);
    const arId = ensureAccountByCode(db, GL_CODES.AR, 'Accounts Receivable', 'Asset');
    const lines = db
      .prepare("SELECT amount, COALESCE(revenue_gl_account_id, (SELECT id FROM gl_accounts WHERE code='4000')) AS rev_id FROM invoice_lines WHERE invoice_id = ?")
      .all(invoiceId);
    const total = lines.reduce((s, l) => s + (l.amount || 0), 0);
    const result = createSimpleJournal(db, {
      date: inv.invoice_date,
      memo: `Invoice ${inv.invoice_no}`,
      lines: [
        { gl_account_id: arId, fund_id: null, amount: total, drcr: 'D', source_table: 'invoices', source_id: inv.id },
        ...lines.map((l) => ({ gl_account_id: l.rev_id, fund_id: null, amount: l.amount, drcr: 'C', source_table: 'invoices', source_id: inv.id })),
      ],
    });
    db.prepare("UPDATE invoices SET posted_at = CURRENT_TIMESTAMP WHERE id = ?").run(invoiceId);
    return { ok: true, invoiceId, journalId: result.id, journalNumber: result.number };
  }
  if (paymentId) {
    const pay = db.prepare("SELECT * FROM invoice_payments WHERE id = ?").get(paymentId);
    if (!pay) throw new Error("Payment not found");
    const inv = db.prepare("SELECT * FROM invoices WHERE id = ?").get(pay.invoice_id);
    const already = db.prepare("SELECT 1 FROM journal_lines WHERE source_table='invoice_payments' AND source_id=? LIMIT 1").get(paymentId);
    if (already) return { ok: true, alreadyPosted: true, paymentId };
    validatePeriodOpen(String(pay.received_at).slice(0, 10));
    const pm = db.prepare("SELECT cash_gl_account_id FROM payment_method_gl_mappings WHERE method = ?").get(pay.method);
    const cashId = pm?.cash_gl_account_id || ensureAccountByCode(db, GL_CODES.CASH, 'Cash', 'Asset');
    const arId = ensureAccountByCode(db, GL_CODES.AR, 'Accounts Receivable', 'Asset');
    const result = createSimpleJournal(db, {
      date: String(pay.received_at).slice(0, 10),
      memo: `Payment ${inv?.invoice_no || inv?.id}`,
      lines: [
        { gl_account_id: cashId, fund_id: null, amount: pay.amount, drcr: 'D', source_table: 'invoice_payments', source_id: pay.id },
        { gl_account_id: arId, fund_id: null, amount: pay.amount, drcr: 'C', source_table: 'invoice_payments', source_id: pay.id },
      ],
    });
    return { ok: true, invoiceId: pay.invoice_id, paymentId, journalId: result.id, journalNumber: result.number };
  }
  throw new Error("Must provide invoiceId or paymentId");
}

export function generateAndPostFromAP({ billId, paymentId }) {
  const db = getDb();
  if (billId) {
    const bill = db.prepare("SELECT * FROM bills WHERE id = ?").get(billId);
    if (!bill) throw new Error("Bill not found");
    const already = db.prepare("SELECT 1 FROM journal_lines WHERE source_table='bills' AND source_id=? LIMIT 1").get(billId);
    if (bill.posted_at || already) return { ok: true, alreadyPosted: true, billId };
    validatePeriodOpen(bill.bill_date);
    const apId = ensureAccountByCode(db, GL_CODES.AP, 'Accounts Payable', 'Liability');
    const lines = db
      .prepare("SELECT amount, COALESCE(expense_gl_account_id, (SELECT id FROM gl_accounts WHERE code='6000')) AS exp_id FROM bill_lines WHERE bill_id = ?")
      .all(billId);
    const total = lines.reduce((s, l) => s + (l.amount || 0), 0);
    const result = createSimpleJournal(db, {
      date: bill.bill_date,
      memo: `Bill ${bill.bill_no}`,
      lines: [
        ...lines.map((l) => ({ gl_account_id: l.exp_id, fund_id: null, amount: l.amount, drcr: 'D', source_table: 'bills', source_id: bill.id })),
        { gl_account_id: apId, fund_id: null, amount: total, drcr: 'C', source_table: 'bills', source_id: bill.id },
      ],
    });
    db.prepare("UPDATE bills SET posted_at = CURRENT_TIMESTAMP WHERE id = ?").run(billId);
    return { ok: true, billId, journalId: result.id, journalNumber: result.number };
  }
  if (paymentId) {
    const pay = db.prepare("SELECT * FROM bill_payments WHERE id = ?").get(paymentId);
    if (!pay) throw new Error("Payment not found");
    const bill = db.prepare("SELECT * FROM bills WHERE id = ?").get(pay.bill_id);
    const already = db.prepare("SELECT 1 FROM journal_lines WHERE source_table='bill_payments' AND source_id=? LIMIT 1").get(paymentId);
    if (already) return { ok: true, alreadyPosted: true, paymentId };
    validatePeriodOpen(String(pay.paid_at).slice(0, 10));
    const apId = ensureAccountByCode(db, GL_CODES.AP, 'Accounts Payable', 'Liability');
    const cash = ensureAccountByCode(db, GL_CODES.CASH, 'Cash', 'Asset');
    const result = createSimpleJournal(db, {
      date: String(pay.paid_at).slice(0, 10),
      memo: `Bill Payment ${bill?.bill_no || bill?.id}`,
      lines: [
        { gl_account_id: apId, fund_id: null, amount: pay.amount, drcr: 'D', source_table: 'bill_payments', source_id: pay.id },
        { gl_account_id: cash, fund_id: null, amount: pay.amount, drcr: 'C', source_table: 'bill_payments', source_id: pay.id },
      ],
    });
    return { ok: true, billId: pay.bill_id, paymentId, journalId: result.id, journalNumber: result.number };
  }
  throw new Error("Must provide billId or paymentId");
}

export function generateAndPostFromDonation(donationId) {
  const db = getDb();
  const don = db.prepare("SELECT * FROM donations WHERE id = ?").get(donationId);
  if (!don) throw new Error("Donation not found");
  const existing = db.prepare("SELECT 1 FROM journal_lines WHERE source_table = 'donations' AND source_id = ? LIMIT 1").get(donationId);
  if (existing) {
    return { ok: true, alreadyPosted: true, donationId };
  }
  validatePeriodOpen(String(don.donated_at).slice(0, 10));
  const map = db
    .prepare(
      `SELECT m.*, ga1.id AS rev_id, ga2.id AS cash_id
         FROM campaign_gl_map m
    LEFT JOIN gl_accounts ga1 ON ga1.id = m.revenue_gl_id
    LEFT JOIN gl_accounts ga2 ON ga2.id = m.cash_gl_id
        WHERE m.campaign_id IS ? AND m.fund_id IS ?`
    )
    .get(don.campaign_id ?? null, don.fund_id ?? null);
  const revenueId = map?.rev_id || ensureAccountByCode(db, GL_CODES.CONTRIB_REV_BASE, 'Contributions Revenue', 'Revenue');
  // Use payment method mapping or cash mapping
  let cashId = map?.cash_id || null;
  if (!cashId) {
    const pm = db.prepare("SELECT cash_gl_account_id FROM payment_method_gl_mappings WHERE method = ?").get(don.payment_method || 'Offline');
    cashId = pm?.cash_gl_account_id || ensureAccountByCode(db, GL_CODES.UNDEPOSITED, 'Undeposited Funds', 'Asset');
  }
  const result = createSimpleJournal(db, {
    date: String(don.donated_at).slice(0, 10),
    memo: `Donation ${don.id}`,
    lines: [
      { gl_account_id: cashId, fund_id: don.fund_id ?? null, campaign_id: don.campaign_id ?? null, amount: don.amount, drcr: 'D', source_table: 'donations', source_id: don.id },
      { gl_account_id: revenueId, fund_id: don.fund_id ?? null, campaign_id: don.campaign_id ?? null, amount: don.amount, drcr: 'C', source_table: 'donations', source_id: don.id },
    ],
  });
  return { ok: true, donationId, journalId: result.id, journalNumber: result.number };
}

export function releaseRestrictions({ amount, memo, date }) {
  const db = getDb();
  const restricted = ensureAccountByCode(db, '3200', 'Net Assets with Donor Restrictions', 'Equity');
  const unrestricted = ensureAccountByCode(db, '3100', 'Net Assets Without Donor Restrictions', 'Equity');
  const result = createSimpleJournal(db, {
    date: date || new Date().toISOString().slice(0, 10),
    memo: memo || 'Release of restrictions',
    lines: [
      { gl_account_id: restricted, fund_id: null, amount, drcr: 'D' },
      { gl_account_id: unrestricted, fund_id: null, amount, drcr: 'C' },
    ],
  });
  return { ok: true, journalId: result.id, journalNumber: result.number };
}
