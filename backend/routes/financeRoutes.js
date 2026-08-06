import { Router } from "express";
import Joi from "joi";
import {
  getGlAccounts,
  postGlAccount,
  patchGlAccount,
  removeGlAccount,
  postJournal,
  getJournals,
  getTrialBalanceReport,
  getBalanceSheetReport,
  getIncomeStatementReport,
  getFinancialOverviewReport,
  getNonprofitStatementReport,
  getBalanceSheetClassifiedReport,
} from "../controllers/financeController.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { csrfProtection } from "../middleware/csrf.js";
import { validateBody } from "../middleware/validate.js";

const router = Router();

const accountSchema = Joi.object({
  code: Joi.string().max(20).required(),
  name: Joi.string().min(2).required(),
  type: Joi.string().valid("Asset", "Liability", "Equity", "Revenue", "Expense").required(),
  parentId: Joi.number().integer().positive().allow(null),
  description: Joi.string().allow("", null),
  isActive: Joi.boolean().optional(),
  linkedRevenueBucket: Joi.string().valid(
    'restr_endow','restr_found','restr_other',
    'unres_indiv','unres_found','unres_org',
    'gov_federal','gov_state'
  ).allow(null),
  isCurrentAsset: Joi.boolean().optional(),
  fsCategory: Joi.string().max(120).allow('', null),
});

const accountUpdateSchema = Joi.object({
  fsCategory: Joi.string().max(120).allow('', null).required(),
});

const journalSchema = Joi.object({
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
});

router.use(authenticate);

router.get(
  "/gl-accounts",
  requirePermission("finance.read"),
  getGlAccounts
);

router.post(
  "/gl-accounts",
  requirePermission("finance.write"),
  csrfProtection,
  validateBody(accountSchema),
  postGlAccount
);

router.patch(
  "/gl-accounts/:id",
  requirePermission("finance.write"),
  csrfProtection,
  validateBody(accountUpdateSchema),
  patchGlAccount
);

router.delete(
  "/gl-accounts/:id",
  requirePermission("finance.write"),
  csrfProtection,
  removeGlAccount
);

router.get(
  "/journals",
  requirePermission("finance.read"),
  getJournals
);

router.post(
  "/journals",
  requirePermission("finance.write"),
  csrfProtection,
  validateBody(journalSchema),
  postJournal
);

router.get(
  "/trial-balance",
  requirePermission("finance.read"),
  getTrialBalanceReport
);

router.get(
  "/financials/balance-sheet",
  requirePermission("finance.read"),
  getBalanceSheetReport
);

router.get(
  "/financials/income-statement",
  requirePermission("finance.read"),
  getIncomeStatementReport
);

router.get(
  "/financials/overview",
  requirePermission("finance.read"),
  getFinancialOverviewReport
);

router.get(
  "/financials/nonprofit-statement",
  requirePermission("finance.read"),
  getNonprofitStatementReport
);

router.get(
  "/financials/balance-sheet-detailed",
  requirePermission("finance.read"),
  getBalanceSheetClassifiedReport
);

export default router;
