import { getDb } from "../db/connection.js";

function formatDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function daysAgo(date, days) {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() - days);
  return copy;
}

export function createQueryBuilder() {
  return {
    where: [],
    params: {},
    paramIndex: 0,
    addParam(base, value) {
      const key = `${base}_${++this.paramIndex}`.replace(/[^a-zA-Z0-9_]/g, "_");
      this.params[key] = value;
      return `@${key}`;
    },
  };
}

function resolveDatePreset(preset) {
  const today = new Date();
  switch (preset) {
    case "current_month": {
      const from = startOfMonth(today);
      const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      return { from: formatDate(from), to: formatDate(to) };
    }
    case "previous_month": {
      const firstOfCurrent = startOfMonth(today);
      const prev = new Date(Date.UTC(firstOfCurrent.getUTCFullYear(), firstOfCurrent.getUTCMonth() - 1, 1));
      const endPrev = endOfMonth(prev);
      return { from: formatDate(prev), to: formatDate(endPrev) };
    }
    case "last_30_days": {
      const from = daysAgo(today, 29);
      return { from: formatDate(from), to: formatDate(today) };
    }
    case "last_60_days": {
      const from = daysAgo(today, 59);
      return { from: formatDate(from), to: formatDate(today) };
    }
    case "last_90_days": {
      const from = daysAgo(today, 89);
      return { from: formatDate(from), to: formatDate(today) };
    }
    case "year_to_date": {
      const from = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
      return { from: formatDate(from), to: formatDate(today) };
    }
    default:
      return null;
  }
}

const helpers = {
  resolveDatePreset,
  formatDate,
};

function createDateRangeFilter(column, label = "Date Range") {
  return {
    label,
    type: "date_range",
    apply(builder, value) {
      if (!value) return;
      let from = value.from ?? null;
      let to = value.to ?? null;
      if (value.preset) {
        const preset = resolveDatePreset(value.preset);
        if (preset) {
          from = preset.from;
          to = preset.to;
        }
      }
      if (from) {
        const param = builder.addParam(`${column.replace(/\./g, "_")}_from`, `${from}`);
        builder.where.push(`${column} >= ${param}`);
      }
      if (to) {
        const param = builder.addParam(`${column.replace(/\./g, "_")}_to`, `${to}`);
        builder.where.push(`${column} <= ${param}`);
      }
    },
  };
}

const DATASETS = {
  fundraising_donations: {
    name: "Fundraising - Donations",
    description: "Donation transactions with supporter and campaign context.",
    baseQuery: `
      FROM donations d
      LEFT JOIN accounts acc ON acc.id = d.account_id
      LEFT JOIN contacts con ON con.id = d.contact_id
      LEFT JOIN funds f ON f.id = d.fund_id
      LEFT JOIN campaigns ca ON ca.id = d.campaign_id
      LEFT JOIN appeals ap ON ap.id = d.appeal_id
    `,
    defaultColumns: [
      "donation_id",
      "donated_at",
      "account_name",
      "contact_name",
      "amount",
      "payment_method",
      "fund_name",
      "campaign_name",
    ],
    defaultSort: [{ column: "donated_at", direction: "desc" }],
    limit: 1000,
    columns: {
      donation_id: { label: "Donation ID", sql: "d.id", type: "number" },
      donated_at: { label: "Donated At", sql: "d.donated_at", type: "datetime" },
      amount: { label: "Amount", sql: "d.amount", type: "currency" },
      currency_code: { label: "Currency", sql: "d.currency_code", type: "string" },
      payment_method: { label: "Payment Method", sql: "d.payment_method", type: "string" },
      is_recurring: { label: "Recurring", sql: "CASE WHEN d.is_recurring = 1 THEN 'Yes' ELSE 'No' END", type: "string" },
      account_name: { label: "Account", sql: "COALESCE(acc.display_name, acc.name)", type: "string" },
      contact_name: { label: "Contact", sql: "TRIM(COALESCE(con.preferred_name || ' ', '') || con.first_name || ' ' || con.last_name)", type: "string" },
      fund_name: { label: "Fund", sql: "f.name", type: "string" },
      campaign_name: { label: "Campaign", sql: "ca.name", type: "string" },
      appeal_name: { label: "Appeal", sql: "ap.name", type: "string" },
      receipt_status: { label: "Receipt Status", sql: "CASE WHEN d.receipt_id IS NOT NULL THEN 'Issued' ELSE 'Pending' END", type: "string" },
    },
    filters: {
      date_range: createDateRangeFilter("d.donated_at", "Donated Date"),
      fund_id: {
        label: "Fund",
        type: "multi_select",
        optionsQuery: "SELECT id AS value, name AS label FROM funds ORDER BY name",
        apply(builder, value) {
          const values = Array.isArray(value) ? value : value !== undefined && value !== null ? [value] : [];
          if (!values.length) return;
          const params = values.map((val) => builder.addParam("fund_id", Number(val)));
          builder.where.push(`d.fund_id IN (${params.join(", ")})`);
        },
      },
      campaign_id: {
        label: "Campaign",
        type: "multi_select",
        optionsQuery: "SELECT id AS value, name AS label FROM campaigns ORDER BY name",
        apply(builder, value) {
          const values = Array.isArray(value) ? value : value !== undefined && value !== null ? [value] : [];
          if (!values.length) return;
          const params = values.map((val) => builder.addParam("campaign_id", Number(val)));
          builder.where.push(`d.campaign_id IN (${params.join(", ")})`);
        },
      },
      min_amount: {
        label: "Minimum Amount",
        type: "number",
        apply(builder, value) {
          if (value === undefined || value === null || value === "") return;
          const numeric = Number(value);
          if (Number.isNaN(numeric)) return;
          const param = builder.addParam("min_amount", numeric);
          builder.where.push(`d.amount >= ${param}`);
        },
      },
      max_amount: {
        label: "Maximum Amount",
        type: "number",
        apply(builder, value) {
          if (value === undefined || value === null || value === "") return;
          const numeric = Number(value);
          if (Number.isNaN(numeric)) return;
          const param = builder.addParam("max_amount", numeric);
          builder.where.push(`d.amount <= ${param}`);
        },
      },
      payment_method: {
        label: "Payment Method",
        type: "select",
        optionsQuery: "SELECT DISTINCT payment_method AS value, payment_method AS label FROM donations WHERE payment_method IS NOT NULL ORDER BY payment_method",
        apply(builder, value) {
          if (!value) return;
          const param = builder.addParam("payment_method", value);
          builder.where.push(`d.payment_method = ${param}`);
        },
      },
      is_recurring: {
        label: "Recurring",
        type: "select",
        options: [
          { value: "true", label: "Recurring" },
          { value: "false", label: "One-time" },
        ],
        apply(builder, value) {
          if (value === undefined || value === null || value === "") return;
          const bool = value === true || value === "true" || value === 1 || value === "1";
          builder.where.push(`d.is_recurring = ${bool ? 1 : 0}`);
        },
      },
    },
  },
  finance_journal_lines: {
    name: "Finance - Journal Lines",
    description: "Journal entry lines with account and fund context.",
    baseQuery: `
      FROM journal_lines jl
      INNER JOIN journals j ON j.id = jl.journal_id
      INNER JOIN gl_accounts ga ON ga.id = jl.gl_account_id
      LEFT JOIN funds f ON f.id = jl.fund_id
    `,
    defaultColumns: [
      "entry_number",
      "entry_date",
      "account_code",
      "account_name",
      "debit",
      "credit",
      "fund_name",
    ],
    defaultSort: [{ column: "entry_date", direction: "desc" }],
    limit: 1000,
    columns: {
      entry_number: { label: "Entry #", sql: "j.entry_no", type: "string" },
      entry_date: { label: "Entry Date", sql: "j.journal_date", type: "date" },
      account_code: { label: "Account Code", sql: "ga.code", type: "string" },
      account_name: { label: "Account Name", sql: "ga.name", type: "string" },
      account_type: { label: "Account Type", sql: "ga.type", type: "string" },
      fund_name: { label: "Fund", sql: "f.name", type: "string" },
      debit: { label: "Debit", sql: "CASE WHEN jl.drcr = 'D' THEN jl.amount ELSE 0 END", type: "currency" },
      credit: { label: "Credit", sql: "CASE WHEN jl.drcr = 'C' THEN jl.amount ELSE 0 END", type: "currency" },
      drcr: { label: "DR/CR", sql: "jl.drcr", type: "string" },
      amount: { label: "Amount", sql: "jl.amount", type: "currency" },
      line_memo: { label: "Line Memo", sql: "jl.memo", type: "string" },
      entry_memo: { label: "Entry Memo", sql: "j.memo", type: "string" },
      created_by: { label: "Created By", sql: "j.created_by", type: "number" },
      posted_status: { label: "Status", sql: "CASE WHEN j.posted_at IS NULL THEN 'Draft' ELSE 'Posted' END", type: "string" },
    },
    filters: {
      date_range: createDateRangeFilter("j.journal_date", "Journal Date"),
      account_id: {
        label: "Account",
        type: "multi_select",
        optionsQuery: "SELECT id AS value, code || ' • ' || name AS label FROM gl_accounts ORDER BY code",
        apply(builder, value) {
          const values = Array.isArray(value) ? value : value !== undefined && value !== null ? [value] : [];
          if (!values.length) return;
          const params = values.map((val) => builder.addParam("account", Number(val)));
          builder.where.push(`jl.gl_account_id IN (${params.join(", ")})`);
        },
      },
      fund_id: {
        label: "Fund",
        type: "multi_select",
        optionsQuery: "SELECT id AS value, name AS label FROM funds ORDER BY name",
        apply(builder, value) {
          const values = Array.isArray(value) ? value : value !== undefined && value !== null ? [value] : [];
          if (!values.length) return;
          const params = values.map((val) => builder.addParam("fund", Number(val)));
          builder.where.push(`jl.fund_id IN (${params.join(", ")})`);
        },
      },
      status: {
        label: "Status",
        type: "select",
        options: [
          { value: "Posted", label: "Posted" },
          { value: "Draft", label: "Draft" },
        ],
        apply(builder, value) {
          if (!value) return;
          if (value === "Posted") {
            builder.where.push("j.posted_at IS NOT NULL");
          } else if (value === "Draft") {
            builder.where.push("j.posted_at IS NULL");
          }
        },
      },
    },
  },
  volunteer_hours: {
    name: "Volunteers - Logged Hours",
    description: "Volunteer hour logs with shift context.",
    baseQuery: `
      FROM volunteer_hours vh
      INNER JOIN volunteers v ON v.id = vh.volunteer_id
      INNER JOIN contacts con ON con.id = v.contact_id
      LEFT JOIN volunteer_shifts vs ON vs.id = vh.shift_id
    `,
    defaultColumns: [
      "log_date",
      "volunteer_name",
      "hours",
      "shift_title",
      "status",
    ],
    defaultSort: [{ column: "log_date", direction: "desc" }],
    limit: 1000,
    columns: {
      log_id: { label: "Record ID", sql: "vh.id", type: "number" },
      log_date: { label: "Service Date", sql: "vh.service_date", type: "date" },
      hours: { label: "Hours", sql: "vh.hours", type: "number" },
      notes: { label: "Notes", sql: "vh.notes", type: "string" },
      volunteer_id: { label: "Volunteer ID", sql: "vh.volunteer_id", type: "number" },
      volunteer_name: { label: "Volunteer", sql: "con.first_name || ' ' || con.last_name", type: "string" },
      shift_title: { label: "Shift", sql: "vs.title", type: "string" },
      status: { label: "Shift Status", sql: "COALESCE(vs.status, 'Logged')", type: "string" },
    },
    filters: {
      date_range: createDateRangeFilter("vh.service_date", "Service Date"),
      volunteer_id: {
        label: "Volunteer",
        type: "multi_select",
        optionsQuery: "SELECT v.id AS value, con.first_name || ' ' || con.last_name AS label FROM volunteers v INNER JOIN contacts con ON con.id = v.contact_id ORDER BY con.last_name, con.first_name",
        apply(builder, value) {
          const values = Array.isArray(value) ? value : value !== undefined && value !== null ? [value] : [];
          if (!values.length) return;
          const params = values.map((val) => builder.addParam("volunteer", Number(val)));
          builder.where.push(`vh.volunteer_id IN (${params.join(", ")})`);
        },
      },
      status: {
        label: "Shift Status",
        type: "select",
        options: [
          { value: "Scheduled", label: "Scheduled" },
          { value: "Completed", label: "Completed" },
          { value: "Cancelled", label: "Cancelled" },
        ],
        apply(builder, value) {
          if (!value) return;
          const param = builder.addParam("shift_status", value);
          builder.where.push(`vs.status = ${param}`);
        },
      },
    },
  },
  program_cases: {
    name: "Programs - Cases",
    description: "Program cases with client and status information.",
    baseQuery: `
      FROM program_cases pc
      INNER JOIN clients cl ON cl.id = pc.client_id
    `,
    defaultColumns: [
      "case_id",
      "client_name",
      "program_name",
      "status",
      "opened_at",
      "closed_at",
    ],
    defaultSort: [{ column: "opened_at", direction: "desc" }],
    limit: 1000,
    columns: {
      case_id: { label: "Case ID", sql: "pc.id", type: "number" },
      client_name: { label: "Client", sql: "cl.first_name || ' ' || cl.last_name", type: "string" },
      program_name: { label: "Program", sql: "pc.program_name", type: "string" },
      status: { label: "Status", sql: "pc.status", type: "string" },
      opened_at: { label: "Opened", sql: "pc.opened_at", type: "date" },
      closed_at: { label: "Closed", sql: "pc.closed_at", type: "date" },
      restricted: { label: "Restricted", sql: "CASE WHEN pc.restricted = 1 THEN 'Yes' ELSE 'No' END", type: "string" },
    },
    filters: {
      status: {
        label: "Status",
        type: "select",
        options: [
          { value: "Open", label: "Open" },
          { value: "OnHold", label: "On Hold" },
          { value: "Closed", label: "Closed" },
        ],
        apply(builder, value) {
          if (!value) return;
          const param = builder.addParam("case_status", value);
          builder.where.push(`pc.status = ${param}`);
        },
      },
      restricted: {
        label: "Restricted",
        type: "select",
        options: [
          { value: "true", label: "Restricted" },
          { value: "false", label: "Non-restricted" },
        ],
        apply(builder, value) {
          if (value === undefined || value === null || value === "") return;
          const bool = value === true || value === "true" || value === 1 || value === "1";
          builder.where.push(`pc.restricted = ${bool ? 1 : 0}`);
        },
      },
      date_range: createDateRangeFilter("pc.opened_at", "Opened Date"),
    },
  },
};

export function getDataset(key) {
  const dataset = DATASETS[key];
  if (!dataset) {
    const error = new Error("Dataset not found");
    error.status = 404;
    throw error;
  }
  return dataset;
}

export function listDatasetMetadata() {
  return Object.entries(DATASETS).map(([key, dataset]) => buildDatasetMetadata(key, dataset));
}

export function getDatasetMetadata(key) {
  const dataset = getDataset(key);
  return buildDatasetMetadata(key, dataset);
}

function buildDatasetMetadata(key, dataset) {
  const db = getDb();
  const columns = Object.entries(dataset.columns).map(([columnKey, column]) => ({
    id: columnKey,
    label: column.label,
    type: column.type ?? "string",
  }));
  const filters = Object.entries(dataset.filters ?? {}).map(([filterKey, filter]) => ({
    id: filterKey,
    label: filter.label,
    type: filter.type ?? "string",
    options: filter.options ? filter.options : filter.optionsQuery ? db.prepare(filter.optionsQuery).all() : undefined,
  }));
  return {
    key,
    name: dataset.name,
    description: dataset.description,
    defaultColumns: dataset.defaultColumns,
    defaultSort: dataset.defaultSort ?? [],
    limit: dataset.limit ?? 1000,
    columns,
    filters,
  };
}

export function buildDatasetQuery(dataset, { columns, filters, sort, limit } = {}) {
  const selectedColumns = Array.isArray(columns) && columns.length ? columns : dataset.defaultColumns;
  const selectClauses = [];
  const columnMeta = [];
  for (const columnKey of selectedColumns) {
    const definition = dataset.columns[columnKey];
    if (!definition) {
      const error = new Error(`Unknown column '${columnKey}' for dataset`);
      error.status = 400;
      throw error;
    }
    const alias = columnKey;
    selectClauses.push(`${definition.sql} AS ${alias}`);
    columnMeta.push({
      id: columnKey,
      label: definition.label,
      type: definition.type ?? "string",
    });
  }

  const builder = createQueryBuilder();

  applyDatasetFilters(dataset, builder, filters || {});

  const whereClause = builder.where.length ? `WHERE ${builder.where.join(" AND ")}` : "";

  const sortRecords = Array.isArray(sort) && sort.length ? sort : dataset.defaultSort ?? [];
  const orderClauses = [];
  for (const record of sortRecords) {
    if (!record?.column) continue;
    if (!dataset.columns[record.column]) continue;
    const direction = record.direction && String(record.direction).toLowerCase() === "asc" ? "ASC" : "DESC";
    orderClauses.push(`${record.column} ${direction}`);
  }
  const orderClause = orderClauses.length ? `ORDER BY ${orderClauses.join(", ")}` : "";

  const effectiveLimit = Math.min(
    Number.isInteger(limit) ? Number(limit) : dataset.limit ?? 1000,
    dataset.limit ?? 1000
  );
  const limitParam = builder.addParam("limit", effectiveLimit);

  const sql = `SELECT ${selectClauses.join(", ")} ${dataset.baseQuery}\n${whereClause}\n${orderClause}\nLIMIT ${limitParam}`;

  return {
    sql,
    params: builder.params,
    columns: columnMeta,
    limit: effectiveLimit,
  };
}

export const datasetHelpers = {
  resolveDatePreset,
  formatDate,
};

export function applyDatasetFilters(dataset, builder, filters) {
  if (!dataset.filters) {
    return;
  }
  for (const [filterKey, value] of Object.entries(filters)) {
    const definition = dataset.filters[filterKey];
    if (!definition) {
      continue;
    }
    if (typeof definition.apply === "function") {
      definition.apply(builder, value, helpers);
    }
  }
}
