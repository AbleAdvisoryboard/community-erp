import { Router } from "express";
import Joi from "joi";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { csrfProtection } from "../middleware/csrf.js";
import { validateBody } from "../middleware/validate.js";
import { getBills, postBill, postBillPayment, getApAgingReport } from "../controllers/apController.js";
import { generateAndPostFromAP } from "../services/postingService.js";

const router = Router();

const billSchema = Joi.object({
  vendorAccountId: Joi.number().integer().positive().allow(null),
  billDate: Joi.string().isoDate().required(),
  dueDate: Joi.string().isoDate().allow(null),
  currencyCode: Joi.string().max(3).default('USD'),
  fxRate: Joi.number().positive().default(1),
  memo: Joi.string().allow("", null),
  lines: Joi.array().items(Joi.object({
    description: Joi.string().allow("", null),
    quantity: Joi.number().positive().default(1),
    unitPrice: Joi.number().required(),
    expenseGlAccountId: Joi.number().integer().positive().allow(null),
  })).min(1).required(),
});

const paymentSchema = Joi.object({
  paidAt: Joi.string().isoDate().required(),
  amount: Joi.number().positive().required(),
  method: Joi.string().allow('Cash','Check','ACH','CreditCard','Online','Offline'),
  reference: Joi.string().allow("", null),
});

router.use(authenticate);

router.get('/bills', requirePermission('finance.read'), getBills);
router.post('/bills', requirePermission('finance.write'), csrfProtection, validateBody(billSchema), postBill);
router.post('/bills/:id/payments', requirePermission('finance.write'), csrfProtection, validateBody(paymentSchema), postBillPayment);
router.get('/aging', requirePermission('finance.read'), getApAgingReport);

router.post('/bills/:id/postToGL', requirePermission('finance.write'), csrfProtection, (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = generateAndPostFromAP({ billId: id });
    res.status(201).json({ data });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.post('/payments/:id/postToGL', requirePermission('finance.write'), csrfProtection, (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = generateAndPostFromAP({ paymentId: id });
    res.status(201).json({ data });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

export default router;
