import Joi from "joi";
import { completeFirstRunSetup, getSetupStatus } from "../services/setupService.js";

export const firstRunSetupSchema = Joi.object({
  organizationName: Joi.string().trim().min(2).max(120).required(),
  organizationLogo: Joi.string().allow("").max(1500000),
  adminName: Joi.string().trim().min(2).max(120).required(),
  adminEmail: Joi.string()
    .email({ tlds: { allow: false } })
    .messages({
      "string.email": "Enter a complete admin email address, like jane@example.com",
      "string.empty": "Admin email is required",
      "any.required": "Admin email is required",
    })
    .required(),
  adminPassword: Joi.string()
    .min(10)
    .regex(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/)
    .messages({
      "string.min": "Password must be at least 10 characters",
      "string.pattern.base": "Password must contain upper, lower, number, and symbol",
      "string.empty": "Admin password is required",
      "any.required": "Admin password is required",
    })
    .required(),
});

export function handleSetupStatus(_req, res, next) {
  try {
    res.json({ data: getSetupStatus() });
  } catch (error) {
    next(error);
  }
}

export async function handleCompleteFirstRunSetup(req, res, next) {
  try {
    const data = await completeFirstRunSetup(req.body, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
}
