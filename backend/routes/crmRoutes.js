import { Router } from "express";
import Joi from "joi";
import {
  getAccounts,
  postAccount,
  patchAccount,
  deleteAccount,
  getContacts,
  postContact,
  patchContact,
  deleteContact,
  postActivity,
  getContactTags,
  postContactTag,
  deleteContactTag,
} from "../controllers/crmController.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { csrfProtection } from "../middleware/csrf.js";
import { validateBody } from "../middleware/validate.js";
import { getDb, getDbPath } from "../db/connection.js";

const router = Router();

const accountSchema = Joi.object({
  type: Joi.string().valid("Household", "Organization").required(),
  name: Joi.string().min(2).required(),
  displayName: Joi.string().allow("", null),
  status: Joi.string().valid("Active", "Inactive", "Prospect").optional(),
  primaryContactId: Joi.number().integer().positive().allow(null),
  phone: Joi.string().allow("", null),
  email: Joi.string().email({ tlds: false }).allow("", null),
  website: Joi.string().uri().allow("", null),
  notes: Joi.string().allow("", null),
  addresses: Joi.array()
    .items(
      Joi.object({
        type: Joi.string().valid("Primary", "Billing", "Shipping", "Other").optional(),
        line1: Joi.string().required(),
        line2: Joi.string().allow("", null),
        city: Joi.string().required(),
        region: Joi.string().allow("", null),
        postalCode: Joi.string().allow("", null),
        country: Joi.string().length(2).optional(),
        isPrimary: Joi.boolean().optional(),
      })
    )
    .default([]),
});

const accountUpdateSchema = accountSchema.fork(["type", "name"], (schema) => schema.optional());

const contactSchema = Joi.object({
  accountId: Joi.number().integer().positive().allow(null),
  firstName: Joi.string().min(1).required(),
  lastName: Joi.string().min(1).required(),
  preferredName: Joi.string().allow("", null),
  email: Joi.string().email({ tlds: false }).allow("", null),
  phone: Joi.string().allow("", null),
  mobile: Joi.string().allow("", null),
  isPrimary: Joi.boolean().optional(),
  doNotContact: Joi.boolean().optional(),
  tags: Joi.array().items(Joi.string().trim()).optional(),
});

const contactUpdateSchema = contactSchema.fork(["firstName", "lastName"], (schema) => schema.optional());

const activitySchema = Joi.object({
  accountId: Joi.number().integer().positive().allow(null),
  contactId: Joi.number().integer().positive().allow(null),
  subject: Joi.string().min(1).required(),
  notes: Joi.string().allow("", null),
  activityType: Joi.string()
    .valid("Note", "Call", "Meeting", "Email", "Task")
    .optional(),
  dueAt: Joi.string().isoDate().allow(null),
  completedAt: Joi.string().isoDate().allow(null),
});

const tagCreateSchema = Joi.object({
  name: Joi.string().min(1).required(),
});

router.use(authenticate);

router.get(
  "/accounts",
  requirePermission("crm.read"),
  getAccounts
);

router.post(
  "/accounts",
  requirePermission("crm.write"),
  csrfProtection,
  validateBody(accountSchema),
  postAccount
);

router.patch(
  "/accounts/:id",
  requirePermission("crm.write"),
  csrfProtection,
  validateBody(accountUpdateSchema),
  patchAccount
);

router.delete(
  "/accounts/:id",
  requirePermission("crm.write"),
  csrfProtection,
  deleteAccount
);

router.get(
  "/contacts",
  requirePermission("crm.read"),
  getContacts
);

router.post(
  "/contacts",
  requirePermission("crm.write"),
  csrfProtection,
  validateBody(contactSchema),
  postContact
);

router.patch(
  "/contacts/:id",
  requirePermission("crm.write"),
  csrfProtection,
  validateBody(contactUpdateSchema),
  patchContact
);

router.delete(
  "/contacts/:id",
  requirePermission("crm.write"),
  csrfProtection,
  deleteContact
);

router.post(
  "/activities",
  requirePermission("crm.write"),
  csrfProtection,
  validateBody(activitySchema),
  postActivity
);

router.get(
  "/contacts/debug/count",
  requirePermission("crm.read"),
  (req, res) => {
    const db = getDb();
    const row = db.prepare("SELECT COUNT(*) AS total FROM contacts").get();
    const dbPath = process.env.DB_PATH || getDbPath();
    res.json({ data: row, dbPath, nodeEnv: process.env.NODE_ENV || "development" });
  }
);

// Contact tags
router.get(
  "/tags",
  requirePermission("crm.read"),
  getContactTags
);

router.post(
  "/tags",
  requirePermission("crm.write"),
  csrfProtection,
  validateBody(tagCreateSchema),
  postContactTag
);

router.delete(
  "/tags/:id",
  requirePermission("crm.write"),
  csrfProtection,
  deleteContactTag
);

export default router;
