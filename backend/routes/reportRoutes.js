import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { csrfProtection } from "../middleware/csrf.js";
import { validateBody } from "../middleware/validate.js";
import { trialBalance as tbReport, statementOfActivities as soaReport, functionalExpenses as feReport, arAging as arAgingReport, apAging as apAgingReport } from "../services/financeReportService.js";
import {
  createReportSchema,
  updateReportSchema,
  runReportSchema,
  reportViewSchema,
  handleListDatasets,
  handleGetDataset,
  handleListReports,
  handleGetReport,
  handleCreateReport,
  handleUpdateReport,
  handleDeleteReport,
  handleRunReport,
  handleListViews,
  handleCreateView,
  handleDeleteView,
  handleDashboardCards,
} from "../controllers/reportController.js";

const router = Router();

router.use(authenticate);

router.get("/datasets", requirePermission("reports.run"), handleListDatasets);
router.get("/datasets/:key", requirePermission("reports.run"), handleGetDataset);

router.get("/dashboard/cards", requirePermission("reports.run"), handleDashboardCards);

// Finance reports
router.get("/trial-balance", requirePermission("reports.run"), (req, res) => {
  const { as_of, fund_id, class_id } = req.query || {};
  const data = tbReport({ asOf: as_of, fundId: fund_id ? Number(fund_id) : undefined, classId: class_id ? Number(class_id) : undefined });
  res.json({ data });
});
router.get("/statement-of-activities", requirePermission("reports.run"), (req, res) => {
  const { from, to, fund_id } = req.query || {};
  const data = soaReport({ from, to, fundId: fund_id ? Number(fund_id) : undefined });
  res.json({ data });
});
router.get("/functional-expenses", requirePermission("reports.run"), (req, res) => {
  const { from, to } = req.query || {};
  const data = feReport({ from, to });
  res.json({ data });
});
router.get("/ar-aging", requirePermission("reports.run"), (_req, res) => res.json({ data: arAgingReport() }));
router.get("/ap-aging", requirePermission("reports.run"), (_req, res) => res.json({ data: apAgingReport() }));

router.get("/", requirePermission("reports.run"), handleListReports);
router.post(
  "/",
  requirePermission("reports.manage"),
  csrfProtection,
  validateBody(createReportSchema),
  handleCreateReport
);

router.get("/:id", requirePermission("reports.run"), handleGetReport);
router.patch(
  "/:id",
  requirePermission("reports.manage"),
  csrfProtection,
  validateBody(updateReportSchema),
  handleUpdateReport
);
router.delete(
  "/:id",
  requirePermission("reports.manage"),
  csrfProtection,
  handleDeleteReport
);

router.post(
  "/:id/run",
  requirePermission("reports.run"),
  csrfProtection,
  validateBody(runReportSchema),
  handleRunReport
);

router.get(
  "/:id/views",
  requirePermission("reports.run"),
  handleListViews
);
router.post(
  "/:id/views",
  requirePermission("reports.run"),
  csrfProtection,
  validateBody(reportViewSchema),
  handleCreateView
);
router.delete(
  "/:id/views/:viewId",
  requirePermission("reports.run"),
  csrfProtection,
  handleDeleteView
);

export default router;
