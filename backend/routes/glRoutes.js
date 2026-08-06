import { Router } from "express";
import Joi from "joi";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { csrfProtection } from "../middleware/csrf.js";
import { validateBody } from "../middleware/validate.js";
import {
  getGlAccounts,
  postGlAccount,
  postJournal as createJournal,
  getJournals,
  getTrialBalanceReport,
} from "../controllers/financeController.js";
import { postJournal as postJournalService } from "../services/postingService.js";

const router = Router();

const journalPostSchema = Joi.object({
  id: Joi.number().integer().positive().required(),
});

router.use(authenticate);

router.get("/accounts", requirePermission("finance.read"), getGlAccounts);
router.post(
  "/accounts",
  requirePermission("finance.write"),
  csrfProtection,
  validateBody(
    Joi.object({
      code: Joi.string().max(20).required(),
      name: Joi.string().min(2).required(),
      type: Joi.string().valid("Asset", "Liability", "Equity", "Revenue", "Expense").required(),
      parentId: Joi.number().integer().positive().allow(null),
      description: Joi.string().allow("", null),
      isActive: Joi.boolean().optional(),
      fsCategory: Joi.string().allow("", null),
    })
  ),
  postGlAccount
);

router.get("/journals", requirePermission("finance.read"), getJournals);
router.post(
  "/journals",
  requirePermission("finance.write"),
  csrfProtection,
  validateBody(
    Joi.object({
      journalDate: Joi.string().isoDate().required(),
      memo: Joi.string().allow("", null),
      lines: Joi.array()
        .items(
          Joi.object({
            glAccountId: Joi.number().integer().positive().required(),
            fundId: Joi.number().integer().positive().allow(null),
            amount: Joi.number().positive().required(),
            drcr: Joi.string().valid("D", "C").required(),
            memo: Joi.string().allow("", null),
          })
        )
        .min(2)
        .required(),
    })
  ),
  createJournal
);

router.post(
  "/journals/post",
  requirePermission("finance.write"),
  csrfProtection,
  validateBody(journalPostSchema),
  (req, res) => {
    try {
      const result = postJournalService(Number(req.body.id));
      res.json({ data: result });
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  }
);

router.get("/trial-balance", requirePermission("finance.read"), getTrialBalanceReport);

export default router;
