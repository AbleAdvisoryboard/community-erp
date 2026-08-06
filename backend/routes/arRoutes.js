import { Router } from "express";
import Joi from "joi";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { csrfProtection } from "../middleware/csrf.js";
import { validateBody } from "../middleware/validate.js";
import { getInvoices, postInvoice, postInvoicePayment, getAgingReport } from "../controllers/arController.js";
import { generateAndPostFromAR } from "../services/postingService.js";

const router = Router();

const invoiceSchema = Joi.object({
  accountId: Joi.number().integer().positive().allow(null),
  contactId: Joi.number().integer().positive().allow(null),
  invoiceDate: Joi.string().isoDate().required(),
  dueDate: Joi.string().isoDate().allow(null),
  currencyCode: Joi.string().max(3).default('USD'),
  fxRate: Joi.number().positive().default(1),
  memo: Joi.string().allow("", null),
  lines: Joi.array().items(Joi.object({
    itemId: Joi.number().integer().positive().allow(null),
    description: Joi.string().allow("", null),
    quantity: Joi.number().positive().default(1),
    unitPrice: Joi.number().required(),
    revenueGlAccountId: Joi.number().integer().positive().allow(null),
  })).min(1).required(),
});

const paymentSchema = Joi.object({
  receivedAt: Joi.string().isoDate().required(),
  amount: Joi.number().positive().required(),
  method: Joi.string().allow('Cash','Check','ACH','CreditCard','Online','Offline'),
  reference: Joi.string().allow("", null),
});

router.use(authenticate);

router.get('/invoices', requirePermission('finance.read'), getInvoices);
router.post('/invoices', requirePermission('finance.write'), csrfProtection, validateBody(invoiceSchema), postInvoice);
router.post('/invoices/:id/payments', requirePermission('finance.write'), csrfProtection, validateBody(paymentSchema), postInvoicePayment);
router.get('/aging', requirePermission('finance.read'), getAgingReport);

// Explicit posting endpoints
router.post('/invoices/:id/postToGL', requirePermission('finance.write'), csrfProtection, (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = generateAndPostFromAR({ invoiceId: id });
    res.status(201).json({ data });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.post('/payments/:id/postToGL', requirePermission('finance.write'), csrfProtection, (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = generateAndPostFromAR({ paymentId: id });
    res.status(201).json({ data });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

export default router;
