import { Router } from "express";
import Joi from "joi";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { csrfProtection } from "../middleware/csrf.js";
import { validateBody } from "../middleware/validate.js";
import { getDb } from "../db/connection.js";

const router = Router();

router.use(authenticate);

router.get("/", requirePermission("finance.read"), (_req, res) => {
  const rows = getDb().prepare("SELECT * FROM classes ORDER BY code").all();
  res.json({ data: rows });
});

router.post(
  "/",
  requirePermission("finance.write"),
  csrfProtection,
  validateBody(Joi.object({ code: Joi.string().max(20).required(), name: Joi.string().min(2).required() })),
  (req, res) => {
    const db = getDb();
    try {
      const result = db.prepare("INSERT INTO classes (code, name) VALUES (?, ?)").run(req.body.code, req.body.name);
      const row = db.prepare("SELECT * FROM classes WHERE id = ?").get(result.lastInsertRowid);
      res.status(201).json({ data: row });
    } catch (err) {
      if (String(err.message || '').includes('UNIQUE')) return res.status(409).json({ message: 'Code must be unique' });
      res.status(400).json({ message: err.message });
    }
  }
);

export default router;

