import { Router } from "express";
import Joi from "joi";
import {
  getFunds,
  postFund,
  patchFund,
  getCampaigns,
  postCampaign,
  patchCampaign,
  postAppeal,
  postDonation,
  getDonations,
  postPledge,
  postDonationReceipt,
  postPledgePayment,
} from "../controllers/fundraisingController.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { csrfProtection } from "../middleware/csrf.js";
import { validateBody } from "../middleware/validate.js";

const router = Router();

const fundSchema = Joi.object({
  name: Joi.string().min(2).required(),
  code: Joi.string().trim().max(30).required(),
  revenueGlAccountId: Joi.number().integer().positive().allow(null),
  campaignId: Joi.number().integer().positive().allow(null),
  description: Joi.string().allow("", null),
  restriction: Joi.string().valid("Unrestricted", "TempRestricted", "PermRestricted"),
  isActive: Joi.boolean().optional(),
});

const fundUpdateSchema = Joi.object({
  name: Joi.string().min(2),
  code: Joi.string().trim().max(30),
  revenueGlAccountId: Joi.number().integer().positive().allow(null),
  campaignId: Joi.number().integer().positive().allow(null),
  description: Joi.string().allow("", null),
  restriction: Joi.string().valid("Unrestricted", "TempRestricted", "PermRestricted"),
  isActive: Joi.boolean(),
}).min(1);

const campaignSchema = Joi.object({
  name: Joi.string().min(2).required(),
  code: Joi.string().trim().max(30).required(),
  goalAmount: Joi.number().min(0).optional(),
  startDate: Joi.string().isoDate().allow(null),
  endDate: Joi.string().isoDate().allow(null),
  status: Joi.string().valid("Draft", "Active", "Completed", "Archived").optional(),
  description: Joi.string().allow("", null),
});

const campaignUpdateSchema = Joi.object({
  name: Joi.string().min(2),
  code: Joi.string().trim().max(30),
  goalAmount: Joi.number().min(0).allow(null),
  startDate: Joi.string().isoDate().allow(null),
  endDate: Joi.string().isoDate().allow(null),
  status: Joi.string().valid("Draft", "Active", "Completed", "Archived"),
  description: Joi.string().allow("", null),
}).min(1);

const appealSchema = Joi.object({
  campaignId: Joi.number().integer().positive().required(),
  name: Joi.string().min(2).required(),
  code: Joi.string().alphanum().max(20).required(),
  goalAmount: Joi.number().min(0).optional(),
  startDate: Joi.string().isoDate().allow(null),
  endDate: Joi.string().isoDate().allow(null),
});

const donationSchema = Joi.object({
  accountId: Joi.number().integer().positive().allow(null),
  contactId: Joi.number().integer().positive().allow(null),
  fundId: Joi.number().integer().positive().allow(null),
  campaignId: Joi.number().integer().positive().allow(null),
  appealId: Joi.number().integer().positive().allow(null),
  designationId: Joi.number().integer().positive().allow(null),
  amount: Joi.number().positive().required(),
  currencyCode: Joi.string().length(3).optional(),
  fxRate: Joi.number().positive().optional(),
  donatedAt: Joi.string().isoDate().optional(),
  paymentMethod: Joi.string().valid("Offline", "Cash", "Check", "CreditCard", "ACH", "InKind", "Other").optional(),
  isPledge: Joi.boolean().optional(),
  isRecurring: Joi.boolean().optional(),
  status: Joi.string().valid("Pending", "Posted", "Refunded", "Failed").optional(),
  softCredits: Joi.array()
    .items(
      Joi.object({
        contactId: Joi.number().integer().positive().required(),
        amount: Joi.number().positive().required(),
      })
    )
    .optional(),
});

const pledgeSchema = Joi.object({
  accountId: Joi.number().integer().positive().allow(null),
  contactId: Joi.number().integer().positive().allow(null),
  fundId: Joi.number().integer().positive().allow(null),
  campaignId: Joi.number().integer().positive().allow(null),
  totalAmount: Joi.number().positive().required(),
  frequency: Joi.string().valid("OneTime", "Monthly", "Quarterly", "Annually", "Custom").optional(),
  startDate: Joi.string().isoDate().optional(),
  endDate: Joi.string().isoDate().allow(null),
  reminderDay: Joi.number().integer().min(1).max(31).allow(null),
  status: Joi.string().valid("Active", "Completed", "Cancelled", "OnHold").optional(),
  installments: Joi.array()
    .items(
      Joi.object({
        dueDate: Joi.string().isoDate().required(),
        amountDue: Joi.number().positive().required(),
        amountPaid: Joi.number().min(0).optional(),
        status: Joi.string().valid("Pending", "Paid", "PartiallyPaid", "Overdue").optional(),
      })
    )
    .optional(),
});

const receiptSchema = Joi.object({
  issuedAt: Joi.string().isoDate().optional(),
  deliveredAt: Joi.string().isoDate().allow(null),
  deliveryMethod: Joi.string().valid("Email", "Postal", "Manual").optional(),
  templateName: Joi.string().allow("", null),
  metadata: Joi.object().optional(),
});

router.use(authenticate);

router.get(
  "/funds",
  requirePermission("fundraising.read"),
  getFunds
);

router.post(
  "/funds",
  requirePermission("fundraising.write"),
  csrfProtection,
  validateBody(fundSchema),
  postFund
);

router.patch(
  "/funds/:id",
  requirePermission("fundraising.write"),
  csrfProtection,
  validateBody(fundUpdateSchema),
  patchFund
);

router.get(
  "/campaigns",
  requirePermission("fundraising.read"),
  getCampaigns
);

router.post(
  "/campaigns",
  requirePermission("fundraising.write"),
  csrfProtection,
  validateBody(campaignSchema),
  postCampaign
);

router.patch(
  "/campaigns/:id",
  requirePermission("fundraising.write"),
  csrfProtection,
  validateBody(campaignUpdateSchema),
  patchCampaign
);

router.post(
  "/appeals",
  requirePermission("fundraising.write"),
  csrfProtection,
  validateBody(appealSchema),
  postAppeal
);

router.get(
  "/donations",
  requirePermission("fundraising.read"),
  getDonations
);

router.post(
  "/donations",
  requirePermission("fundraising.write"),
  csrfProtection,
  validateBody(donationSchema),
  postDonation
);

router.post(
  "/donations/:id/receipts",
  requirePermission("fundraising.write"),
  csrfProtection,
  validateBody(receiptSchema),
  postDonationReceipt
);

router.post(
  "/pledges",
  requirePermission("fundraising.write"),
  csrfProtection,
  validateBody(pledgeSchema),
  postPledge
);

// Pledge payment for a donation flagged as pledge
const pledgePaymentSchema = Joi.object({
  amount: Joi.number().positive().required(),
  receivedAt: Joi.string().isoDate().optional(),
  method: Joi.string().valid("Offline", "Cash", "Check", "CreditCard", "ACH", "Other").optional(),
  reference: Joi.string().allow("", null),
});

router.post(
  "/donations/:id/pledge-payments",
  requirePermission("fundraising.write"),
  csrfProtection,
  validateBody(pledgePaymentSchema),
  postPledgePayment
);

export default router;
