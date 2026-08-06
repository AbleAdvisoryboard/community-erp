import Joi from "joi";
import {
  getCommunicationSettings,
  updateCommunicationSettings,
} from "../services/communicationSettingsService.js";
import { resetProviderRegistry } from "../services/providers/registry.js";
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  listMessages,
  createMessage,
  sendMessage,
  listMessageDeliveries,
} from "../services/communicationService.js";

export const templateSchema = Joi.object({
  name: Joi.string().trim().min(3).required(),
  channel: Joi.string().valid("Email", "SMS").required(),
  subject: Joi.string().allow(null, ""),
  bodyHtml: Joi.string().allow(null, ""),
  bodyText: Joi.string().allow(null, ""),
  variables: Joi.array().items(Joi.string().trim()).optional(),
  isActive: Joi.boolean().optional(),
});

export const templateUpdateSchema = templateSchema.fork(["name", "channel"], (schema) => schema.optional());

const audienceSchema = Joi.object({
  contactIds: Joi.array().items(Joi.number().integer().positive()).default([]),
  segment: Joi.string().allow(null, ""),
  eventCode: Joi.string().allow(null, ""),
}).default({ contactIds: [] });

export const messageQuerySchema = Joi.object({
  status: Joi.string().valid("Draft", "Queued", "Sending", "Sent", "Failed", "Cancelled").optional(),
  channel: Joi.string().valid("Email", "SMS").optional(),
});

export const messageSchema = Joi.object({
  templateId: Joi.number().integer().positive().allow(null),
  channel: Joi.string().valid("Email", "SMS").optional(),
  subject: Joi.string().allow(null, ""),
  bodyHtml: Joi.string().allow(null, ""),
  bodyText: Joi.string().allow(null, ""),
  audience: audienceSchema,
  status: Joi.string().valid("Draft", "Queued", "Sending", "Sent", "Failed", "Cancelled").default("Draft"),
  scheduledAt: Joi.string().isoDate().allow(null),
});

export const communicationSettingsSchema = Joi.object({
  emailProvider: Joi.string().valid("mock", "sendgrid").optional(),
  sendgridApiKey: Joi.string().allow("", null).optional(),
  emailFrom: Joi.string().allow("", null).optional(),
  emailReplyTo: Joi.string().allow("", null).optional(),
  smsProvider: Joi.string().valid("mock", "twilio").optional(),
  twilioAccountSid: Joi.string().allow("", null).optional(),
  twilioAuthToken: Joi.string().allow("", null).optional(),
  twilioFrom: Joi.string().allow("", null).optional(),
});

export function getTemplates(_req, res, next) {
  try {
    const templates = listTemplates();
    res.json({ data: templates });
  } catch (error) {
    next(error);
  }
}

export function postTemplate(req, res, next) {
  try {
    const template = createTemplate(req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json({ data: template });
  } catch (error) {
    if (error.message && error.message.includes("UNIQUE")) {
      return res.status(409).json({ message: "Template name must be unique" });
    }
    next(error);
  }
}

export function patchTemplate(req, res, next) {
  try {
    const templateId = Number(req.params.id);
    const updated = updateTemplate(templateId, req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    if (!updated) {
      return res.status(404).json({ message: "Template not found" });
    }
    res.json({ data: updated });
  } catch (error) {
    next(error);
  }
}

export function getSettings(_req, res, next) {
  try {
    res.json({ data: getCommunicationSettings() });
  } catch (error) {
    next(error);
  }
}

export function putSettings(req, res, next) {
  try {
    const settings = updateCommunicationSettings(req.body);
    resetProviderRegistry();
    res.json({ data: settings });
  } catch (error) {
    next(error);
  }
}

export function deleteTemplateById(req, res, next) {
  try {
    const templateId = Number(req.params.id);
    const deleted = deleteTemplate(templateId, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    if (!deleted) {
      return res.status(404).json({ message: "Template not found" });
    }
    res.json({ data: deleted });
  } catch (error) {
    next(error);
  }
}

export function getMessages(req, res, next) {
  try {
    const messages = listMessages({ status: req.query.status, channel: req.query.channel });
    res.json({ data: messages });
  } catch (error) {
    next(error);
  }
}

export function postMessage(req, res, next) {
  try {
    const message = createMessage(req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json({ data: message });
  } catch (error) {
    if (error.message === "Template not found") {
      return res.status(404).json({ message: error.message });
    }
    next(error);
  }
}

export async function postSendMessage(req, res, next) {
  try {
    const messageId = Number(req.params.id);
    const result = await sendMessage(messageId, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json({ data: result });
  } catch (error) {
    if (error.message && ["Message not found", "Audience has no contact IDs"].includes(error.message)) {
      const status = error.message === "Message not found" ? 404 : 400;
      return res.status(status).json({ message: error.message });
    }
    next(error);
  }
}

export function getMessageDeliveries(req, res, next) {
  try {
    const messageId = Number(req.params.id);
    const deliveries = listMessageDeliveries(messageId);
    res.json({ data: deliveries });
  } catch (error) {
    next(error);
  }
}
