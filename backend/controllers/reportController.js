import Joi from "joi";
import {
  listDatasets,
  describeDataset,
  listReports,
  getReport,
  createReport,
  updateReport,
  deleteReport,
  runReport,
  listViews,
  createView,
  deleteView,
  listDashboardCards,
} from "../services/reportService.js";

const sortSchema = Joi.array()
  .items(
    Joi.object({
      column: Joi.string().required(),
      direction: Joi.string().valid("asc", "desc").default("desc"),
    })
  )
  .optional();

const roleSchema = Joi.object({
  name: Joi.string().trim().min(1).required(),
  filters: Joi.object().unknown(true).optional(),
});

export const createReportSchema = Joi.object({
  slug: Joi.string().pattern(/^[a-z0-9-]+$/).min(3).max(80).required(),
  name: Joi.string().min(3).max(120).required(),
  description: Joi.string().allow(null, ""),
  dataset: Joi.string().required(),
  columns: Joi.array().items(Joi.string()).min(1).required(),
  filters: Joi.object().unknown(true).optional(),
  sort: sortSchema,
  options: Joi.object({ limit: Joi.number().integer().min(1).max(5000) }).optional(),
  permissionCode: Joi.string().allow(null, "").optional(),
  roles: Joi.array().items(roleSchema).optional(),
});

export const updateReportSchema = Joi.object({
  slug: Joi.string().pattern(/^[a-z0-9-]+$/).min(3).max(80),
  name: Joi.string().min(3).max(120),
  description: Joi.string().allow(null, ""),
  dataset: Joi.string(),
  columns: Joi.array().items(Joi.string()).min(1),
  filters: Joi.object().unknown(true),
  sort: sortSchema,
  options: Joi.object({ limit: Joi.number().integer().min(1).max(5000) }),
  permissionCode: Joi.string().allow(null, ""),
  roles: Joi.array().items(roleSchema),
}).min(1);

export const runReportSchema = Joi.object({
  columns: Joi.array().items(Joi.string()).optional(),
  filters: Joi.object().unknown(true).optional(),
  sort: sortSchema,
  limit: Joi.number().integer().min(1).max(5000).optional(),
  format: Joi.string().valid("json", "csv", "html", "doc").default("json"),
});

export const reportViewSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  description: Joi.string().allow(null, ""),
  columns: Joi.array().items(Joi.string()).optional(),
  filters: Joi.object().unknown(true).optional(),
  sort: sortSchema,
  isDefault: Joi.boolean().default(false),
});

export function handleListDatasets(_req, res, next) {
  try {
    const data = listDatasets();
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export function handleGetDataset(req, res, next) {
  try {
    const data = describeDataset(req.params.key);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export function handleListReports(req, res, next) {
  try {
    const data = listReports(req.user);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export function handleGetReport(req, res, next) {
  try {
    const id = Number(req.params.id);
    const data = getReport(id, req.user);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export function handleCreateReport(req, res, next) {
  try {
    const report = createReport(req.body, {
      userId: req.user?.id ?? null,
      user: req.user ?? null,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json({ data: report });
  } catch (error) {
    next(error);
  }
}

export function handleUpdateReport(req, res, next) {
  try {
    const id = Number(req.params.id);
    const report = updateReport(id, req.body, {
      userId: req.user?.id ?? null,
      user: req.user ?? null,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json({ data: report });
  } catch (error) {
    next(error);
  }
}

export function handleDeleteReport(req, res, next) {
  try {
    const id = Number(req.params.id);
    deleteReport(id, {
      userId: req.user?.id ?? null,
      user: req.user ?? null,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export function handleRunReport(req, res, next) {
  try {
    const id = Number(req.params.id);
    const result = runReport(id, req.body ?? {}, {
      userId: req.user?.id ?? null,
      user: req.user ?? null,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    if (result.format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
      res.send(result.csv);
      return;
    }
    if (result.format === "doc") {
      res.setHeader("Content-Type", "application/msword; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
      res.send(result.html);
      return;
    }
    if (result.format === "html") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `inline; filename="${result.filename}"`);
      res.send(result.html);
      return;
    }
    res.json({ data: result.rows, columns: result.columns, meta: result.meta });
  } catch (error) {
    next(error);
  }
}

export function handleListViews(req, res, next) {
  try {
    const id = Number(req.params.id);
    const data = listViews(id, req.user?.id ?? 0);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export function handleCreateView(req, res, next) {
  try {
    const id = Number(req.params.id);
    const data = createView(id, req.body, {
      userId: req.user?.id,
    });
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
}

export function handleDeleteView(req, res, next) {
  try {
    const reportId = Number(req.params.id);
    const viewId = Number(req.params.viewId);
    const data = deleteView(reportId, viewId, req.user?.id ?? 0);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export function handleDashboardCards(req, res, next) {
  try {
    const data = listDashboardCards(req.user);
    res.json({ data });
  } catch (error) {
    next(error);
  }
}
