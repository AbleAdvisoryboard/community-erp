import { Router } from "express";
import Joi from "joi";
import { login, logout, me, refresh, register } from "../controllers/authController.js";
import { authenticate, optionalAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { csrfProtection } from "../middleware/csrf.js";
import { validateBody } from "../middleware/validate.js";

const router = Router();

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
});

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(10).regex(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/).message("Password must contain upper, lower, number, and symbol").required(),
  displayName: Joi.string().min(2).required(),
  roleNames: Joi.array().items(Joi.string()).min(1).required(),
});

router.post("/login", validateBody(loginSchema), login);
router.post("/logout", authenticate, csrfProtection, logout);
router.get("/me", authenticate, me);
router.post("/refresh", optionalAuth, refresh);
router.post(
  "/register",
  authenticate,
  requirePermission("auth.manage_users"),
  csrfProtection,
  validateBody(registerSchema),
  register
);

export default router;
