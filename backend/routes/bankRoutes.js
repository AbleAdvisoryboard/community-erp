import { Router } from "express";
import Joi from "joi";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { csrfProtection } from "../middleware/csrf.js";
import { validateBody } from "../middleware/validate.js";
import { getDb } from "../db/connection.js";
import { getJlInsert } from "../utils/journalLines.js";
import { writeAuditLog } from "../utils/audit.js";
import { getApprovalNote } from "../services/financeControlsService.js";

const router = Router();
router.use(authenticate);

router.get("/accounts", requirePermission("finance.read"), (_req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT b.*, ga.code AS gl_code, ga.name AS gl_name
         FROM bank_accounts b INNER JOIN gl_accounts ga ON ga.id = b.gl_account_id
        ORDER BY b.name`
    )
    .all();
  res.json({ data: rows });
});

router.post(
  "/accounts",
  requirePermission("finance.write"),
  csrfProtection,
  validateBody(
    Joi.object({ name: Joi.string().min(2).required(), glAccountId: Joi.number().integer().positive().required() })
  ),
  (req, res) => {
    const db = getDb();
    const r = db
      .prepare("INSERT INTO bank_accounts (name, gl_account_id) VALUES (?, ?)")
      .run(req.body.name, Number(req.body.glAccountId));
    const row = db.prepare("SELECT * FROM bank_accounts WHERE id = ?").get(r.lastInsertRowid);
    writeAuditLog({
      userId: req.user?.id ?? null,
      entity: "bank_accounts",
      entityId: String(row.id),
      action: "create",
      after: row,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json({ data: row });
  }
);

router.post(
  "/reconciliations/start",
  requirePermission("finance.write"),
  csrfProtection,
  validateBody(Joi.object({ bankAccountId: Joi.number().integer().positive().required(), period: Joi.string().required() })),
  (req, res) => {
    // For v1, simply validate the bank account exists and echo a token
    const db = getDb();
    const bank = db.prepare("SELECT * FROM bank_accounts WHERE id = ?").get(Number(req.body.bankAccountId));
    if (!bank) return res.status(404).json({ message: 'Bank account not found' });
    res.status(201).json({ data: { ok: true, bankAccountId: bank.id, period: req.body.period } });
  }
);

router.post(
  "/reconciliations/complete",
  requirePermission("finance.write"),
  csrfProtection,
  validateBody(Joi.object({ bankAccountId: Joi.number().integer().positive().required(), reconciledDate: Joi.string().isoDate().required() })),
  (req, res) => {
    const db = getDb();
    const before = db.prepare("SELECT * FROM bank_accounts WHERE id = ?").get(Number(req.body.bankAccountId));
    db.prepare("UPDATE bank_accounts SET last_reconciled_date = ? WHERE id = ?").run(req.body.reconciledDate, Number(req.body.bankAccountId));
    const row = db.prepare("SELECT * FROM bank_accounts WHERE id = ?").get(Number(req.body.bankAccountId));
    writeAuditLog({
      userId: req.user?.id ?? null,
      entity: "bank_reconciliations",
      entityId: String(req.body.bankAccountId),
      action: "complete",
      before,
      after: row,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json({ data: row });
  }
);

// Undeposited payments (invoice_payments without deposit_batch_id)
router.get(
  "/undeposited",
  requirePermission("finance.read"),
  (_req, res) => {
    const db = getDb();
    // AR payments not yet deposited
    const ar = db
      .prepare(
        `SELECT p.id AS id, i.invoice_no, p.received_at, p.method, p.amount
           FROM invoice_payments p
           INNER JOIN invoices i ON i.id = p.invoice_id
          WHERE p.deposit_batch_id IS NULL`
      )
      .all();
    // Donation receipts that map to Undeposited Funds (1010) and not yet deposited
    const donations = db
      .prepare(
        `SELECT d.id AS id, printf('Donation %d', d.id) AS invoice_no, d.donated_at AS received_at, d.payment_method AS method, d.amount
           FROM donations d
           LEFT JOIN payment_method_gl_mappings pm ON pm.method = d.payment_method
           LEFT JOIN gl_accounts ga ON ga.id = pm.cash_gl_account_id
          WHERE (ga.code = '1010' OR d.payment_method IN ('Cash','Check','Offline'))
            AND d.deposit_batch_id IS NULL`
      )
      .all();
    const rows = [...ar, ...donations].sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)));
    res.json({ data: rows });
  }
);

// Create a bank deposit from selected payments
router.post(
  "/deposits",
  requirePermission("finance.write"),
  csrfProtection,
  validateBody(
    Joi.object({
      bankAccountId: Joi.number().integer().positive().required(),
      depositDate: Joi.string().isoDate().required(),
      paymentIds: Joi.array().items(Joi.number().integer().positive()).default([]),
      donationIds: Joi.array().items(Joi.number().integer().positive()).default([]),
      memo: Joi.string().allow("", null),
    })
  ),
  (req, res) => {
    const db = getDb();
    const { bankAccountId, depositDate } = req.body;
    const approval = getApprovalNote("bankDeposit");
    const memo = (req.body.memo ? String(req.body.memo).trim() : '') || null;
    let { paymentIds = [] } = req.body;
    // Backward-compatible: UI only sends paymentIds. Split into AR payments and donations by existence.
    const donationIds = [];
    const arPaymentIds = [];
    if (paymentIds && paymentIds.length) {
      for (const id of paymentIds) {
        const isAr = db.prepare("SELECT 1 FROM invoice_payments WHERE id = ? AND deposit_batch_id IS NULL").get(id);
        if (isAr) arPaymentIds.push(id); else {
          const isDon = db.prepare("SELECT 1 FROM donations WHERE id = ? AND deposit_batch_id IS NULL").get(id);
          if (isDon) donationIds.push(id);
        }
      }
    }
    paymentIds = arPaymentIds;
    if ((!paymentIds || !paymentIds.length) && (!donationIds || !donationIds.length)) {
      return res.status(400).json({ message: 'No items provided' });
    }
    const payments = paymentIds.length
      ? db
          .prepare(
            `SELECT p.* FROM invoice_payments p
              WHERE p.id IN (${paymentIds.map(() => '?').join(',')}) AND p.deposit_batch_id IS NULL`
          )
          .all(...paymentIds)
      : [];
    if (payments.length !== paymentIds.length) {
      return res.status(409).json({ message: 'One or more AR paymentIds are invalid or already deposited' });
    }
    const donationRows = donationIds.length
      ? db
          .prepare(
            `SELECT d.* FROM donations d
              WHERE d.id IN (${donationIds.map(() => '?').join(',')})
                AND d.deposit_batch_id IS NULL`
          )
          .all(...donationIds)
      : [];
    if (donationRows.length !== donationIds.length) {
      return res.status(409).json({ message: 'One or more donationIds are invalid or already deposited' });
    }
    const total = payments.reduce((s, p) => s + Number(p.amount || 0), 0) + donationRows.reduce((s, d) => s + Number(d.amount || 0), 0);
    const run = db.transaction(() => {
      const dep = db
        .prepare(
          `INSERT INTO bank_deposits (bank_account_id, deposit_date, total_amount, memo, created_by)
           VALUES (?,?,?,?,NULL)`
        )
        .run(bankAccountId, depositDate.slice(0,10), total, memo);
      const depositId = dep.lastInsertRowid;
      if (payments.length) {
        const insLine = db.prepare(
          `INSERT INTO bank_deposit_lines (deposit_id, payment_id, amount) VALUES (?,?,?)`
        );
        for (const p of payments) insLine.run(depositId, p.id, p.amount);
        db.prepare(
          `UPDATE invoice_payments SET deposit_batch_id = ? WHERE id IN (${paymentIds.map(() => '?').join(',')})`
        ).run(depositId, ...paymentIds);
      }
      if (donationRows.length) {
        const insDon = db.prepare(`INSERT INTO bank_deposit_donation_lines (deposit_id, donation_id, amount) VALUES (?,?,?)`);
        for (const d of donationRows) insDon.run(depositId, d.id, d.amount);
        db.prepare(
          `UPDATE donations SET deposit_batch_id = ? WHERE id IN (${donationIds.map(() => '?').join(',')})`
        ).run(depositId, ...donationIds);
      }

      // Post GL: Dr Bank (bank GL), Cr Undeposited Funds (1010)
      const undep = db.prepare("SELECT id FROM gl_accounts WHERE code='1010'").get()?.id;
      if (!undep) throw new Error('Undeposited Funds account (1010) missing');
      // Frontend sends GL account id as bankAccountId; use directly for GL posting
      const bankGl = Number(bankAccountId);
      const j = db.prepare(`INSERT INTO journals (entry_no, number, journal_date, memo, posted_at, is_posted)
          VALUES (printf('J%06d', COALESCE((SELECT MAX(id) FROM journals),0)+1),
                  printf('JE-%s-%04d', strftime('%Y','now'), COALESCE((SELECT MAX(id) FROM journals),0)+1),
                  @d, @m, CURRENT_TIMESTAMP, 1)`).run({ d: depositDate.slice(0,10), m: memo || `Deposit ${depositId}` });
      const jId = j.lastInsertRowid;
      const { stmt, cols } = getJlInsert(db);
      const mk = (o) => cols.map(c => (o[c] === undefined ? null : o[c]));
      stmt.run(...mk({ journal_id: jId, gl_account_id: bankGl, amount: total, drcr: 'D', fund_id: null, class_id: null, campaign_id: null, memo: memo || `Deposit ${depositId}`, source_table: 'bank_deposits', source_id: depositId, source_line: null }));
      stmt.run(...mk({ journal_id: jId, gl_account_id: undep,  amount: total, drcr: 'C', fund_id: null, class_id: null, campaign_id: null, memo: memo || `Deposit ${depositId}`, source_table: 'bank_deposits', source_id: depositId, source_line: null }));
      db.prepare("UPDATE bank_deposits SET journal_id = ? WHERE id = ?").run(jId, depositId);
      const numRow = db.prepare("SELECT number FROM journals WHERE id = ?").get(jId);
      const out = { id: depositId, journalId: jId, journalNumber: numRow?.number, approval };
      writeAuditLog({
        userId: req.user?.id ?? null,
        entity: "bank_deposits",
        entityId: String(depositId),
        action: "create",
        after: {
          ...out,
          bankAccountId,
          depositDate: depositDate.slice(0, 10),
          totalAmount: total,
          paymentIds,
          donationIds,
        },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });
      return out;
    });
    try {
      const out = run();
      res.status(201).json({ data: out });
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  }
);

export default router;
