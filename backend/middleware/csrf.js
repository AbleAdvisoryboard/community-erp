import { validateCsrfToken } from "../utils/csrf.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required" });
  }
  const token = req.headers["x-csrf-token"] || req.headers["x-xsrf-token"];
  if (!token) {
    return res.status(403).json({ message: "Missing CSRF token" });
  }
  const isValid = validateCsrfToken(req.user.id, token);
  if (!isValid) {
    return res.status(403).json({ message: "Invalid CSRF token" });
  }
  return next();
}
