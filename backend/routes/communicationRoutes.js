import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { csrfProtection } from "../middleware/csrf.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import {
  templateSchema,
  templateUpdateSchema,
  messageSchema,
  messageQuerySchema,
  communicationSettingsSchema,
  getTemplates,
  getSettings,
  putSettings,
  postTemplate,
  patchTemplate,
  deleteTemplateById,
  getMessages,
  postMessage,
  postSendMessage,
  getMessageDeliveries,
} from "../controllers/communicationController.js";

const router = Router();

router.use(authenticate);

router.get(
  "/settings",
  requirePermission("admin.manage_settings"),
  getSettings
);

router.put(
  "/settings",
  requirePermission("admin.manage_settings"),
  csrfProtection,
  validateBody(communicationSettingsSchema),
  putSettings
);

router.get(
  "/templates",
  requirePermission("communications.send"),
  getTemplates
);

router.post(
  "/templates",
  requirePermission("communications.send"),
  csrfProtection,
  validateBody(templateSchema),
  postTemplate
);

router.patch(
  "/templates/:id",
  requirePermission("communications.send"),
  csrfProtection,
  validateBody(templateUpdateSchema),
  patchTemplate
);

router.delete(
  "/templates/:id",
  requirePermission("communications.send"),
  csrfProtection,
  deleteTemplateById
);

router.get(
  "/messages",
  requirePermission("communications.send"),
  validateQuery(messageQuerySchema),
  getMessages
);

router.post(
  "/messages",
  requirePermission("communications.send"),
  csrfProtection,
  validateBody(messageSchema),
  postMessage
);

router.post(
  "/messages/:id/send",
  requirePermission("communications.send"),
  csrfProtection,
  postSendMessage
);

router.get(
  "/messages/:id/deliveries",
  requirePermission("communications.send"),
  getMessageDeliveries
);

export default router;
