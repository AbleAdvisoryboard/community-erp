import { Router } from "express";
import Joi from "joi";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { csrfProtection } from "../middleware/csrf.js";
import { validateBody } from "../middleware/validate.js";
import { getDb } from "../db/connection.js";
import { writeAuditLog } from "../utils/audit.js";

const router = Router();
router.use(authenticate);

router.get("/", requirePermission("finance.read"), (_req, res) => {
  const rows = getDb().prepare("SELECT * FROM periods ORDER BY start_date DESC").all();
  res.json({ data: rows });
});

router.post(
  "/open",
  requirePermission("finance.write"),
  csrfProtection,
  validateBody(
    Joi.object({
      name: Joi.string().required(),
      startDate: Joi.string().isoDate().required(),
      endDate: Joi.string().isoDate().allow(null),
    })
  ),
  (req, res) => {
    const db = getDb();
    const { name, startDate, endDate } = req.body;
    const r = db
      .prepare("INSERT INTO periods (name, start_date, end_date, is_closed) VALUES (?,?,?,0)")
      .run(name, startDate, endDate || null);
    const row = db.prepare("SELECT * FROM periods WHERE id = ?").get(r.lastInsertRowid);
    writeAuditLog({
      userId: req.user?.id ?? null,
      entity: "periods",
      entityId: String(row.id),
      action: "open",
      after: row,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json({ data: row });
  }
);

router.post(
  "/close",
  requirePermission("finance.write"),
  csrfProtection,
  validateBody(Joi.object({ id: Joi.number().integer().positive().required() })),
  (req, res) => {
    const db = getDb();
    const before = db.prepare("SELECT * FROM periods WHERE id = ?").get(req.body.id);
    db.prepare("UPDATE periods SET is_closed = 1 WHERE id = ?").run(req.body.id);
    const row = db.prepare("SELECT * FROM periods WHERE id = ?").get(req.body.id);
    writeAuditLog({
      userId: req.user?.id ?? null,
      entity: "periods",
      entityId: String(req.body.id),
      action: "close",
      before,
      after: row,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json({ data: row });
  }
);

export default router;
