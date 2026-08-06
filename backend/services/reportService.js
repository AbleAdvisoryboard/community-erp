import { createHash } from "node:crypto";
import { getDb } from "../db/connection.js";
import { writeAuditLog } from "../utils/audit.js";
import {
  getDataset,
  listDatasetMetadata,
  getDatasetMetadata,
  buildDatasetQuery,
  createQueryBuilder,
  applyDatasetFilters,
} from "./reportDatasets.js";

function safeParse(json, fallback = null) {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch (_err) {
    return fallback;
  }
}

function getUserRoleNames(user) {
  return new Set((user?.roles || []).map((role) => role.name));
}

function mergeFilters(base, override) {
  const result = base && typeof base === "object" && !Array.isArray(base) ? { ...base } : {};
  if (!override || typeof override !== "object") {
    return result;
  }
  for (const [key, value] of Object.entries(override)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key])
    ) {
      result[key] = mergeFilters(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function ensureReportAccess(reportRow, user) {
  const db = getDb();
  const roleRows = db
    .prepare("SELECT role_name, filters_json FROM report_roles WHERE report_id = ?")
    .all(reportRow.id);
  if (!roleRows.length) {
    return { roleFilters: [] };
  }
  const userRoles = getUserRoleNames(user);
  const matching = roleRows.filter((row) => userRoles.has(row.role_name));
  if (!matching.length) {
    const error = new Error("You do not have access to this report");
    error.status = 403;
    throw error;
  }
  return { roleFilters: matching.map((row) => safeParse(row.filters_json, {})) };
}

export function listDatasets() {
  return listDatasetMetadata();
}

export function describeDataset(datasetKey) {
  return getDatasetMetadata(datasetKey);
}

export function listReports(user) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT rd.*, GROUP_CONCAT(rr.role_name, ',') AS role_names
       FROM report_definitions rd
       LEFT JOIN report_roles rr ON rr.report_id = rd.id
       GROUP BY rd.id
       ORDER BY rd.name`
    )
    .all();
  const userRoles = getUserRoleNames(user);
  const result = [];
  for (const row of rows) {
    const roleNames = row.role_names ? row.role_names.split(",").filter(Boolean) : [];
    if (roleNames.length) {
      const allowed = roleNames.some((role) => userRoles.has(role));
      if (!allowed) {
        continue;
      }
    }
    result.push({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      dataset: row.dataset,
      columns: safeParse(row.columns_json, []),
      filters: safeParse(row.filters_json, {}),
      sort: safeParse(row.sort_json, []),
      options: safeParse(row.options_json, {}),
      allowedRoles: roleNames,
    });
  }
  return result;
}

export function getReport(reportId, user) {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM report_definitions WHERE id = ?")
    .get(reportId);
  if (!row) {
    const error = new Error("Report not found");
    error.status = 404;
    throw error;
  }
  const rolesResult = ensureReportAccess(row, user);
  const views = user?.id
    ? db
        .prepare(
          `SELECT id, name, description, columns_json, filters_json, sort_json, is_default, created_at, updated_at
           FROM report_views
           WHERE report_id = ? AND user_id = ?
           ORDER BY is_default DESC, updated_at DESC`
        )
        .all(reportId, user.id)
        .map((view) => ({
          id: view.id,
          name: view.name,
          description: view.description,
          columns: safeParse(view.columns_json, null),
          filters: safeParse(view.filters_json, {}),
          sort: safeParse(view.sort_json, null),
          isDefault: view.is_default === 1,
          createdAt: view.created_at,
          updatedAt: view.updated_at,
        }))
    : [];

  const datasetMeta = getDatasetMetadata(row.dataset);

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    dataset: row.dataset,
    columns: safeParse(row.columns_json, []),
    filters: safeParse(row.filters_json, {}),
    sort: safeParse(row.sort_json, []),
    options: safeParse(row.options_json, {}),
    permissionCode: row.permission_code ?? null,
    datasetMeta,
    roleFilters: rolesResult.roleFilters,
    views,
  };
}

export function createReport(payload, context) {
  const dataset = getDataset(payload.dataset);
  validateColumns(dataset, payload.columns);
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO report_definitions (
        slug, name, description, dataset, columns_json, filters_json, sort_json, options_json, permission_code, created_by, updated_by
     ) VALUES (@slug, @name, @description, @dataset, @columns_json, @filters_json, @sort_json, @options_json, @permission_code, @created_by, @updated_by)`
  );
  const info = stmt.run({
    slug: payload.slug,
    name: payload.name,
    description: payload.description ?? null,
    dataset: payload.dataset,
    columns_json: JSON.stringify(payload.columns),
    filters_json: payload.filters ? JSON.stringify(payload.filters) : null,
    sort_json: payload.sort ? JSON.stringify(payload.sort) : null,
    options_json: payload.options ? JSON.stringify(payload.options) : null,
    permission_code: payload.permissionCode ?? null,
    created_by: context.userId ?? null,
    updated_by: context.userId ?? null,
  });
  const reportId = info.lastInsertRowid;

  if (Array.isArray(payload.roles) && payload.roles.length) {
    const insertRole = db.prepare(
      `INSERT INTO report_roles (report_id, role_name, filters_json)
       VALUES (@report_id, @role_name, @filters_json)`
    );
    for (const role of payload.roles) {
      insertRole.run({
        report_id: reportId,
        role_name: role.name,
        filters_json: role.filters ? JSON.stringify(role.filters) : null,
      });
    }
  }

  writeAuditLog({
    userId: context.userId ?? null,
    entity: "report",
    entityId: reportId,
    action: "create",
    after: payload,
    ipAddress: context.ip,
    userAgent: context.userAgent,
  });

  return getReport(reportId, context.user ?? null);
}

export function updateReport(reportId, payload, context) {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM report_definitions WHERE id = ?").get(reportId);
  if (!existing) {
    const error = new Error("Report not found");
    error.status = 404;
    throw error;
  }
  ensureReportAccess(existing, context.user);

  if (payload.dataset && payload.dataset !== existing.dataset) {
    getDataset(payload.dataset);
  }
  if (payload.columns) {
    const dataset = getDataset(payload.dataset ?? existing.dataset);
    validateColumns(dataset, payload.columns);
  }

  const updated = {
    slug: payload.slug ?? existing.slug,
    name: payload.name ?? existing.name,
    description: payload.description ?? existing.description,
    dataset: payload.dataset ?? existing.dataset,
    columns_json: payload.columns ? JSON.stringify(payload.columns) : existing.columns_json,
    filters_json: payload.filters ? JSON.stringify(payload.filters) : existing.filters_json,
    sort_json: payload.sort ? JSON.stringify(payload.sort) : existing.sort_json,
    options_json: payload.options ? JSON.stringify(payload.options) : existing.options_json,
    permission_code: payload.permissionCode ?? existing.permission_code,
    updated_by: context.userId ?? existing.updated_by,
    id: reportId,
  };

  db.prepare(
    `UPDATE report_definitions
       SET slug = @slug,
           name = @name,
           description = @description,
           dataset = @dataset,
           columns_json = @columns_json,
           filters_json = @filters_json,
           sort_json = @sort_json,
           options_json = @options_json,
           permission_code = @permission_code,
           updated_by = @updated_by
     WHERE id = @id`
  ).run(updated);

  if (Array.isArray(payload.roles)) {
    const deleteRoles = db.prepare("DELETE FROM report_roles WHERE report_id = ?");
    deleteRoles.run(reportId);
    const insertRole = db.prepare(
      `INSERT INTO report_roles (report_id, role_name, filters_json)
       VALUES (@report_id, @role_name, @filters_json)`
    );
    for (const role of payload.roles) {
      insertRole.run({
        report_id: reportId,
        role_name: role.name,
        filters_json: role.filters ? JSON.stringify(role.filters) : null,
      });
    }
  }

  writeAuditLog({
    userId: context.userId ?? null,
    entity: "report",
    entityId: reportId,
    action: "update",
    before: {
      slug: existing.slug,
      name: existing.name,
      dataset: existing.dataset,
    },
    after: payload,
    ipAddress: context.ip,
    userAgent: context.userAgent,
  });

  return getReport(reportId, context.user ?? null);
}

export function deleteReport(reportId, context) {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM report_definitions WHERE id = ?").get(reportId);
  if (!existing) {
    const error = new Error("Report not found");
    error.status = 404;
    throw error;
  }
  ensureReportAccess(existing, context.user);
  db.prepare("DELETE FROM report_definitions WHERE id = ?").run(reportId);
  writeAuditLog({
    userId: context.userId ?? null,
    entity: "report",
    entityId: reportId,
    action: "delete",
    before: { slug: existing.slug, name: existing.name },
    ipAddress: context.ip,
    userAgent: context.userAgent,
  });
}

function gatherRoleFilters(rows, user) {
  if (!rows || !rows.length) return [];
  const userRoles = getUserRoleNames(user);
  return rows
    .filter((row) => userRoles.has(row.role_name))
    .map((row) => safeParse(row.filters_json, {}));
}

function validateColumns(dataset, columns) {
  if (!Array.isArray(columns) || !columns.length) {
    const error = new Error("At least one column must be selected");
    error.status = 400;
    throw error;
  }
  for (const column of columns) {
    if (!dataset.columns[column]) {
      const error = new Error(`Unknown column '${column}' for dataset '${dataset.name}'`);
      error.status = 400;
      throw error;
    }
  }
}

export function runReport(reportId, options, context) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM report_definitions WHERE id = ?").get(reportId);
  if (!row) {
    const error = new Error("Report not found");
    error.status = 404;
    throw error;
  }
  const { roleFilters } = ensureReportAccess(row, context.user);

  const dataset = getDataset(row.dataset);
  const reportColumns = safeParse(row.columns_json, dataset.defaultColumns);
  validateColumns(dataset, options.columns ?? reportColumns);

  const baseFilters = safeParse(row.filters_json, {});
  let mergedFilters = mergeFilters(baseFilters, {});
  for (const roleFilter of roleFilters) {
    mergedFilters = mergeFilters(mergedFilters, roleFilter);
  }
  mergedFilters = mergeFilters(mergedFilters, options.filters ?? {});

  const sort = options.sort ?? safeParse(row.sort_json, []);
  const reportOptions = safeParse(row.options_json, {});
  const limit = options.limit ?? reportOptions?.limit ?? dataset.limit;

  const query = buildDatasetQuery(dataset, {
    columns: options.columns ?? reportColumns,
    filters: mergedFilters,
    sort,
    limit,
  });

  const started = Date.now();
  const statement = db.prepare(query.sql);
  const rows = statement.all(query.params);
  const duration = Date.now() - started;

  const allowedFormats = new Set(["csv", "html", "doc"]);
  const format = allowedFormats.has(options.format) ? options.format : "json";
  const filtersJson = mergedFilters && Object.keys(mergedFilters).length ? JSON.stringify(mergedFilters) : null;
  const filtersHash = filtersJson ? createHash("sha1").update(filtersJson).digest("hex") : null;

  db.prepare(
    `INSERT INTO report_runs (report_id, user_id, format, filters_hash, filters_json, row_count, duration_ms, output_path)
     VALUES (@report_id, @user_id, @format, @filters_hash, @filters_json, @row_count, @duration_ms, @output_path)`
  ).run({
    report_id: reportId,
    user_id: context.user?.id ?? null,
    format,
    filters_hash: filtersHash,
    filters_json: filtersJson,
    row_count: rows.length,
    duration_ms: duration,
    output_path: null,
  });

  if (format === "csv") {
    const csv = buildCsv(rows, query.columns);
    const filename = `${row.slug || `report-${reportId}`}-${Date.now()}.csv`;
    return {
      format: "csv",
      filename,
      csv,
      meta: {
        rowCount: rows.length,
        durationMs: duration,
      },
    };
  }

  if (format === "html" || format === "doc") {
    const html = buildReportDocument({
      title: row.name || `Report ${reportId}`,
      description: row.description,
      rows,
      columns: query.columns,
      meta: {
        rowCount: rows.length,
        durationMs: duration,
        limit: query.limit,
      },
    });
    const extension = format === "doc" ? "doc" : "html";
    return {
      format,
      filename: `${row.slug || `report-${reportId}`}-${Date.now()}.${extension}`,
      html,
      meta: {
        rowCount: rows.length,
        durationMs: duration,
      },
    };
  }

  return {
    format: "json",
    rows,
    columns: query.columns,
    meta: {
      rowCount: rows.length,
      durationMs: duration,
      limit: query.limit,
    },
  };
}

function buildCsv(rows, columns) {
  const headers = columns.map((col) => escapeCsv(col.label || col.id));
  const lines = [headers.join(",")];
  for (const row of rows) {
    const record = columns.map((col) => escapeCsv(row[col.id]));
    lines.push(record.join(","));
  }
  return lines.join("\r\n");
}

function buildReportDocument({ title, description, rows, columns, meta }) {
  const generatedAt = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
  const headerCells = columns.map((col) => `<th>${escapeHtml(col.label || col.id)}</th>`).join("");
  const bodyRows = rows.length
    ? rows
        .map((row) => {
          const cells = columns.map((col) => `<td>${escapeHtml(formatReportValue(row[col.id], col.type))}</td>`).join("");
          return `<tr>${cells}</tr>`;
        })
        .join("")
    : `<tr><td colspan="${columns.length || 1}">No rows returned.</td></tr>`;
  const metaParts = [];
  if (meta?.rowCount !== undefined) metaParts.push(`${meta.rowCount} rows`);
  if (meta?.limit !== undefined) metaParts.push(`limit ${meta.limit}`);
  metaParts.push(`generated ${generatedAt}`);

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { color: #1f2933; font-family: Arial, sans-serif; margin: 32px; }
      h1 { font-size: 24px; margin: 0 0 8px; }
      p { margin: 0 0 16px; }
      .meta { color: #5f6b7a; font-size: 12px; margin-bottom: 20px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #d7dee8; font-size: 12px; padding: 8px; text-align: left; vertical-align: top; }
      th { background: #f1f5f9; font-weight: 700; }
      tr:nth-child(even) td { background: #f8fafc; }
      @media print { body { margin: 18mm; } }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    ${description ? `<p>${escapeHtml(description)}</p>` : ""}
    <div class="meta">${escapeHtml(metaParts.join(" | "))}</div>
    <table>
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </body>
</html>`;
}

function formatReportValue(value, type) {
  if (value === null || value === undefined) return "";
  switch (type) {
    case "currency":
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);
    case "number":
      return new Intl.NumberFormat("en-US").format(Number(value) || 0);
    case "date":
    case "datetime": {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-US");
    }
    default:
      return String(value);
  }
}

function escapeCsv(value) {
  if (value === null || value === undefined) {
    return "";
  }
  const stringValue = String(value);
  if (stringValue.includes("\"") || stringValue.includes(",") || stringValue.includes("\n")) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function listViews(reportId, userId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, name, description, columns_json, filters_json, sort_json, is_default, created_at, updated_at
       FROM report_views
       WHERE report_id = ? AND user_id = ?
       ORDER BY is_default DESC, updated_at DESC`
    )
    .all(reportId, userId)
    .map((view) => ({
      id: view.id,
      name: view.name,
      description: view.description,
      columns: safeParse(view.columns_json, null),
      filters: safeParse(view.filters_json, {}),
      sort: safeParse(view.sort_json, null),
      isDefault: view.is_default === 1,
      createdAt: view.created_at,
      updatedAt: view.updated_at,
    }));
}

export function createView(reportId, payload, context) {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO report_views (report_id, user_id, name, description, columns_json, filters_json, sort_json, is_default)
     VALUES (@report_id, @user_id, @name, @description, @columns_json, @filters_json, @sort_json, @is_default)`
  );
  const info = stmt.run({
    report_id: reportId,
    user_id: context.userId,
    name: payload.name,
    description: payload.description ?? null,
    columns_json: payload.columns ? JSON.stringify(payload.columns) : null,
    filters_json: payload.filters ? JSON.stringify(payload.filters) : null,
    sort_json: payload.sort ? JSON.stringify(payload.sort) : null,
    is_default: payload.isDefault ? 1 : 0,
  });
  if (payload.isDefault) {
    db.prepare(
      `UPDATE report_views SET is_default = 0 WHERE report_id = ? AND user_id = ? AND id != ?`
    ).run(reportId, context.userId, info.lastInsertRowid);
  }
  return listViews(reportId, context.userId);
}

export function deleteView(reportId, viewId, userId) {
  const db = getDb();
  db.prepare("DELETE FROM report_views WHERE report_id = ? AND id = ? AND user_id = ?").run(reportId, viewId, userId);
  return listViews(reportId, userId);
}

export function listDashboardCards(user) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT dc.*, dcr.role_name, dcr.filters_json
       FROM dashboard_cards dc
       LEFT JOIN dashboard_card_roles dcr ON dcr.card_id = dc.id
       ORDER BY dc.title`
    )
    .all();
  const grouped = new Map();
  for (const row of rows) {
    let record = grouped.get(row.id);
    if (!record) {
      record = {
        card: {
          id: row.id,
          slug: row.slug,
          title: row.title,
          description: row.description,
          dataset: row.dataset,
          query: safeParse(row.query_json, {}),
          permissionCode: row.permission_code ?? null,
          config: safeParse(row.config_json, {}),
        },
        roles: [],
      };
      grouped.set(row.id, record);
    }
    if (row.role_name) {
      record.roles.push({
        role_name: row.role_name,
        filters_json: row.filters_json,
      });
    }
  }

  const results = [];
  const userRoles = getUserRoleNames(user);
  for (const { card, roles } of grouped.values()) {
    if (roles.length) {
      const allowed = roles.some((role) => userRoles.has(role.role_name));
      if (!allowed) {
        continue;
      }
    }
    const value = evaluateCard(card, roles, user);
    results.push(value);
  }
  return results;
}

function evaluateCard(card, roleRows, user) {
  const dataset = getDataset(card.dataset);
  const roleFilters = gatherRoleFilters(roleRows, user);
  let mergedFilters = card.query?.filters ? { ...card.query.filters } : {};
  for (const roleFilter of roleFilters) {
    mergedFilters = mergeFilters(mergedFilters, roleFilter);
  }

  const builder = createQueryBuilder();
  applyDatasetFilters(dataset, builder, mergedFilters);

  const aggregate = card.query?.aggregate || "count";
  let expression;
  if (aggregate === "count") {
    expression = "COUNT(*)";
  } else if (aggregate === "sum" || aggregate === "avg" || aggregate === "count_unique") {
    const columnId = card.query?.field;
    const columnDef = dataset.columns[columnId];
    if (!columnDef) {
      const error = new Error(`Unknown field '${columnId}' for card '${card.slug}'`);
      error.status = 400;
      throw error;
    }
    if (aggregate === "sum") {
      expression = `SUM(${columnDef.sql})`;
    } else if (aggregate === "avg") {
      expression = `AVG(${columnDef.sql})`;
    } else {
      expression = `COUNT(DISTINCT ${columnDef.sql})`;
    }
  } else if (aggregate === "max") {
    const columnId = card.query?.field;
    const columnDef = dataset.columns[columnId];
    if (!columnDef) {
      const error = new Error(`Unknown field '${columnId}' for card '${card.slug}'`);
      error.status = 400;
      throw error;
    }
    expression = `MAX(${columnDef.sql})`;
  } else {
    expression = "COUNT(*)";
  }

  const whereClause = builder.where.length ? `WHERE ${builder.where.join(" AND ")}` : "";
  const sql = `SELECT ${expression} AS value ${dataset.baseQuery}\n${whereClause}`;
  const db = getDb();
  const row = db.prepare(sql).get(builder.params) || { value: 0 };
  const value = row?.value ?? 0;

  let comparisonResult = null;
  const comparisonConfig = card.config?.comparison;
  if (comparisonConfig && comparisonConfig.filters) {
    let comparisonFilters = card.query?.filters ? { ...card.query.filters } : {};
    for (const roleFilter of roleFilters) {
      comparisonFilters = mergeFilters(comparisonFilters, roleFilter);
    }
    comparisonFilters = mergeFilters(comparisonFilters, comparisonConfig.filters);
    const comparisonBuilder = createQueryBuilder();
    applyDatasetFilters(dataset, comparisonBuilder, comparisonFilters);
    const comparisonWhere = comparisonBuilder.where.length ? `WHERE ${comparisonBuilder.where.join(" AND ")}` : "";
    const comparisonRow = db
      .prepare(`SELECT ${expression} AS value ${dataset.baseQuery}\n${comparisonWhere}`)
      .get(comparisonBuilder.params) || { value: 0 };
    comparisonResult = {
      label: comparisonConfig.label || "comparison",
      value: comparisonRow?.value ?? 0,
    };
  }

  return {
    id: card.id,
    slug: card.slug,
    title: card.title,
    description: card.description,
    value,
    config: card.config,
    comparison: comparisonResult,
  };
}
