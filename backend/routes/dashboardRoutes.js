import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { getDashboard } from "../controllers/dashboardController.js";

const router = Router();

router.use(authenticate);

router.get(
  "/snapshot",
  requirePermission("reports.run"),
  getDashboard
);

export default router;
