import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { csrfProtection } from "../middleware/csrf.js";
import { generateAndPostFromDonation } from "../services/postingService.js";

const router = Router();

router.use(authenticate);

router.post(
  "/:id/postToGL",
  requirePermission("finance.write"),
  csrfProtection,
  (req, res) => {
    try {
      const id = Number(req.params.id);
      const result = generateAndPostFromDonation(id);
      res.status(201).json({ data: result });
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
  }
);

export default router;

