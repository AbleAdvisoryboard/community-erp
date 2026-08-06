import {
  fetchReportDatasets,
  fetchReportsList,
  fetchReportDataset,
  createReportDefinition,
  updateReportDefinition,
  deleteReportDefinition,
  runReportRequest as apiRunReportRequest,
  fetchDashboardCards,
  fetchReportViews,
} from "./api.js";

const state = {
  datasets: [],
  datasetMap: new Map(),
  reports: [],
  activeReport: null,
  builder: {
    dataset: null,
    columns: [],
    filters: {},
    sort: null,
    limit: null,
  },
  views: [],
  isManager: false,
};

const elements = {
  datasetSelect: document.getElementById("dataset-select"),
  columnsContainer: document.getElementById("columns-container"),
  filtersContainer: document.getElementById("filters-container"),
  savedList: document.getElementById("saved-reports-list"),
  builderStatus: document.getElementById("builder-status"),
  runButton: document.getElementById("run-report"),
  downloadButton: document.getElementById("download-csv"),
  downloadPdfButton: document.getElementById("download-pdf"),
  downloadDocButton: document.getElementById("download-doc"),
  saveButton: document.getElementById("save-report"),
  deleteButton: document.getElementById("delete-report"),
  manageButtons: document.getElementById("manage-buttons"),
  nameInput: document.getElementById("report-name"),
  slugInput: document.getElementById("report-slug"),
  descriptionInput: document.getElementById("report-description"),
  sortColumn: document.getElementById("sort-column"),
  sortDirection: document.getElementById("sort-direction"),
  limitInput: document.getElementById("result-limit"),
  resultsTable: document.getElementById("results-table"),
  resultsCard: document.getElementById("report-results"),
  resultsMeta: document.getElementById("results-meta"),
  builderTitle: document.getElementById("builder-title"),
  builderSubtitle: document.getElementById("builder-subtitle"),
  reportsIntro: document.getElementById("reports-intro"),
  searchInput: document.getElementById("report-search"),
  newReportButton: document.getElementById("new-report-button"),
  kpiSection: document.getElementById("kpi-card-section"),
  kpiCards: document.getElementById("kpi-cards"),
  kpiSubtitle: document.getElementById("kpi-subtitle"),
  refreshKpi: document.getElementById("refresh-kpi"),
};

function init() {
  const user = window.__ERP_USER__;
  if (user) {
    onAuthReady(user);
  }
  document.addEventListener("auth:ready", (event) => {
    onAuthReady(event.detail.user);
  });

  if (elements.datasetSelect) {
    elements.datasetSelect.addEventListener("change", handleDatasetChange);
  }
  if (elements.runButton) {
    elements.runButton.addEventListener("click", handleRunReport);
  }
  if (elements.downloadButton) {
    elements.downloadButton.addEventListener("click", (event) => handleExport(event, "csv"));
  }
  if (elements.downloadPdfButton) {
    elements.downloadPdfButton.addEventListener("click", (event) => handleExport(event, "html"));
  }
  if (elements.downloadDocButton) {
    elements.downloadDocButton.addEventListener("click", (event) => handleExport(event, "doc"));
  }
  if (elements.saveButton) {
    elements.saveButton.addEventListener("click", handleSaveReport);
  }
  if (elements.deleteButton) {
    elements.deleteButton.addEventListener("click", handleDeleteReport);
  }
  if (elements.sortColumn) {
    elements.sortColumn.addEventListener("change", () => {
      state.builder.sort = state.builder.sort || {};
      state.builder.sort.column = elements.sortColumn.value || null;
    });
  }
  if (elements.sortDirection) {
    elements.sortDirection.addEventListener("change", () => {
      state.builder.sort = state.builder.sort || {};
      state.builder.sort.direction = elements.sortDirection.value || "desc";
    });
  }
  if (elements.limitInput) {
    elements.limitInput.addEventListener("change", () => {
      const value = elements.limitInput.value;
      state.builder.limit = value ? Number(value) : null;
    });
  }
  if (elements.searchInput) {
    elements.searchInput.addEventListener("input", renderSavedReports);
  }
  if (elements.newReportButton) {
    elements.newReportButton.addEventListener("click", resetBuilder);
  }
  if (elements.refreshKpi) {
    elements.refreshKpi.addEventListener("click", loadDashboardCards);
  }
}

function onAuthReady(user) {
  state.isManager = (user?.permissions || []).includes("reports.manage");
  if (state.isManager && elements.manageButtons) {
    elements.manageButtons.style.display = "flex";
    enableManageFields(true);
  } else {
    enableManageFields(false);
  }
  Promise.all([loadDatasets(), loadReports(), loadDashboardCards()]).catch((error) => {
    console.error("Failed to initialize reports", error);
  });
}

function enableManageFields(enabled) {
  const inputs = [elements.nameInput, elements.slugInput, elements.descriptionInput];
  inputs.forEach((input) => {
    if (input) {
      input.disabled = !enabled;
    }
  });
  if (!enabled && elements.manageButtons) {
    elements.manageButtons.style.display = "none";
  }
}

async function loadDatasets() {
  try {
    const { data } = await fetchReportDatasets();
    state.datasets = data || [];
    state.datasetMap = new Map(state.datasets.map((item) => [item.key, item]));
    renderDatasetSelect();
  } catch (error) {
    console.error("Failed to load datasets", error);
    showStatus(`Unable to load datasets: ${error.message}`, true);
  }
}

async function ensureDataset(key) {
  if (!key || state.datasetMap.has(key)) return;
  try {
    const { data } = await fetchReportDataset(key);
    if (data) {
      state.datasetMap.set(key, data);
    }
  } catch (error) {
    console.error("Failed to fetch dataset", error);
  }
}

async function loadReports() {
  try {
    const { data } = await fetchReportsList();
    state.reports = data || [];
    renderSavedReports();
  } catch (error) {
    console.error("Failed to load reports", error);
    showStatus(`Unable to load saved reports: ${error.message}`, true);
  }
}

async function loadDashboardCards() {
  try {
    const { data } = await fetchDashboardCards();
    renderKpiCards(data || []);
  } catch (error) {
    console.error("Failed to load dashboard cards", error);
    if (elements.kpiSection) {
      elements.kpiSection.style.display = "none";
    }
  }
}

function renderKpiCards(cards) {
  if (!elements.kpiSection || !elements.kpiCards) return;
  if (!cards.length) {
    elements.kpiSection.style.display = "none";
    return;
  }
  elements.kpiSection.style.display = "block";
  const formatterCache = new Map();
  const content = cards
    .map((card) => {
      const format = card.config?.format || "number";
      const formatter = getFormatter(format, formatterCache);
      const valueDisplay = formatter(card.value ?? 0);
      let comparison = "";
      if (card.comparison) {
        const compValue = formatter(card.comparison.value ?? 0);
        comparison = `<div class="kpi-comparison">${card.comparison.label || "comparison"}: ${compValue}</div>`;
      }
      return `<div class="kpi-card">
        <div class="kpi-label">${escapeHtml(card.title)}</div>
        <div class="kpi-value">${escapeHtml(valueDisplay)}</div>
        ${comparison}
        ${card.description ? `<p class="kpi-hint">${escapeHtml(card.description)}</p>` : ""}
      </div>`;
    })
    .join("");
  elements.kpiCards.innerHTML = content;
  if (elements.kpiSubtitle) {
    const now = new Date();
    elements.kpiSubtitle.textContent = `Updated ${now.toLocaleString()}`;
  }
}

function getFormatter(format, cache) {
  if (cache.has(format)) {
    return cache.get(format);
  }
  let fn;
  switch (format) {
    case "currency":
      fn = (value) => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(value) || 0);
      break;
    case "percent":
      fn = (value) => `${(Number(value) || 0).toFixed(1)}%`;
      break;
    case "number":
    default:
      fn = (value) => new Intl.NumberFormat().format(Number(value) || 0);
  }
  cache.set(format, fn);
  return fn;
}

function renderDatasetSelect() {
  if (!elements.datasetSelect) return;
  const options = state.datasets
    .map((dataset) => `<option value="${dataset.key}">${escapeHtml(dataset.name)}</option>`)
    .join("");
  elements.datasetSelect.innerHTML = `<option value="">Select dataset</option>${options}`;
  if (state.builder.dataset) {
    elements.datasetSelect.value = state.builder.dataset;
  }
}

function handleDatasetChange() {
  const datasetKey = elements.datasetSelect.value || null;
  const previousDatasetKey = state.builder.dataset;
  const changedFromSavedReport = Boolean(state.activeReport && datasetKey !== state.activeReport.dataset);
  const changedDraftReportType = Boolean(!state.activeReport && previousDatasetKey && previousDatasetKey !== datasetKey);
  if (changedFromSavedReport || changedDraftReportType) {
    state.activeReport = null;
    state.views = [];
    if (elements.nameInput) elements.nameInput.value = "";
    if (elements.slugInput) elements.slugInput.value = "";
    if (elements.descriptionInput) elements.descriptionInput.value = "";
    if (elements.resultsCard) elements.resultsCard.style.display = "none";
    if (elements.reportsIntro) elements.reportsIntro.textContent = "Select a saved definition to view or modify.";
  }
  state.builder.dataset = datasetKey;
  state.builder.columns = [];
  state.builder.filters = {};
  state.builder.sort = null;
  state.builder.limit = null;
  if (datasetKey) {
    const meta = state.datasetMap.get(datasetKey);
    if (meta) {
      state.builder.columns = [...(meta.defaultColumns || [])];
      if (meta.defaultSort && meta.defaultSort.length) {
        state.builder.sort = { ...meta.defaultSort[0] };
      }
      state.builder.limit = meta.limit || null;
    }
  }
  if (!state.activeReport) {
    populateReportFieldsForDataset(datasetKey);
  }
  if (changedFromSavedReport && elements.builderTitle) {
    const dataset = datasetKey ? state.datasetMap.get(datasetKey) : null;
    elements.builderTitle.textContent = dataset ? `${dataset.name} Report` : "Report Builder";
    elements.builderSubtitle.textContent = "This is a new report draft. Choose sections, filters, and save it when it looks right.";
    renderSavedReports();
    showStatus("Started a new report draft because the report type changed.", false);
  }
  renderColumns();
  renderFilters();
  renderSortControls();
}

function populateReportFieldsForDataset(datasetKey) {
  if (!elements.nameInput || !datasetKey) return;
  const dataset = state.datasetMap.get(datasetKey);
  if (!dataset) return;
  if (!elements.nameInput.value) {
    elements.nameInput.value = `${dataset.name} Report`;
  }
  if (!elements.slugInput.value) {
    const baseSlug = datasetKey.replace(/[^a-z0-9]+/g, "-");
    elements.slugInput.value = `${baseSlug}-${Date.now().toString().slice(-4)}`;
  }
}

function renderColumns() {
  if (!elements.columnsContainer) return;
  const dataset = getActiveDataset();
  if (!dataset) {
    elements.columnsContainer.innerHTML = `<p class="page-subtitle">Select a report type to choose sections.</p>`;
    return;
  }
  const selected = new Set(state.builder.columns || []);
  const groups = groupColumnsForSections(dataset.columns);
  const sectionContent = groups
    .map((group) => {
      const groupSelected = group.columns.some((column) => selected.has(column.id));
      return `<label class="report-section-option">
        <input type="checkbox" data-section="${escapeHtml(group.id)}" ${groupSelected ? "checked" : ""}/>
        <span>
          <strong>${escapeHtml(group.label)}</strong>
          <small>${group.columns.map((column) => escapeHtml(column.label)).join(", ")}</small>
        </span>
      </label>`;
    })
    .join("");
  const fieldContent = dataset.columns
    .map((column) => {
      const checked = selected.has(column.id) ? "checked" : "";
      return `<label class="column-option"><input type="checkbox" value="${column.id}" ${checked}/> ${escapeHtml(column.label)}</label>`;
    })
    .join("");
  elements.columnsContainer.innerHTML = `
    <div class="report-section-list">${sectionContent}</div>
    <details class="report-field-details" open>
      <summary>Individual fields for fine tuning</summary>
      <div class="report-field-list">${fieldContent}</div>
    </details>`;
  elements.columnsContainer.querySelectorAll("input[data-section]").forEach((input) => {
    input.addEventListener("change", () => {
      const group = groups.find((item) => item.id === input.getAttribute("data-section"));
      if (!group) return;
      const next = new Set(state.builder.columns || []);
      group.columns.forEach((column) => {
        if (input.checked) {
          next.add(column.id);
        } else {
          next.delete(column.id);
        }
      });
      state.builder.columns = dataset.columns.filter((column) => next.has(column.id)).map((column) => column.id);
      renderColumns();
      renderSortControls();
    });
  });
  elements.columnsContainer.querySelectorAll("input[value]").forEach((input) => {
    input.addEventListener("change", () => {
      const values = Array.from(elements.columnsContainer.querySelectorAll("input[value]:checked")).map((el) => el.value);
      state.builder.columns = values;
      if (state.builder.sort && !values.includes(state.builder.sort.column)) {
        state.builder.sort.column = values[0] || null;
        renderSortControls();
      }
    });
  });
}

function groupColumnsForSections(columns) {
  const groups = [
    { id: "people", label: "People and Organizations", columns: [] },
    { id: "dates", label: "Dates", columns: [] },
    { id: "amounts", label: "Amounts and Counts", columns: [] },
    { id: "summary", label: "Summary", columns: [] },
    { id: "details", label: "Details", columns: [] },
  ];
  columns.forEach((column) => {
    const label = column.label || "";
    if (/contact|client|volunteer|account|created by/i.test(label)) {
      groups[0].columns.push(column);
    } else if (column.type === "date" || column.type === "datetime" || /date|opened|closed|donated|service/i.test(label)) {
      groups[1].columns.push(column);
    } else if (column.type === "currency" || column.type === "number" || /amount|hours|debit|credit|id|record|entry/i.test(label)) {
      groups[2].columns.push(column);
    } else if (/name|status|method|type|program|campaign|fund|shift|receipt|recurring|currency/i.test(label)) {
      groups[3].columns.push(column);
    } else {
      groups[4].columns.push(column);
    }
  });
  return groups.filter((group) => group.columns.length);
}

function renderFilters() {
  if (!elements.filtersContainer) return;
  const dataset = getActiveDataset();
  if (!dataset) {
    elements.filtersContainer.innerHTML = `<p class="page-subtitle">Dataset filters will appear here.</p>`;
    return;
  }
  const current = state.builder.filters || {};
  const controls = dataset.filters
    .map((filter) => renderFilterControl(filter, current[filter.id]))
    .join("");
  elements.filtersContainer.innerHTML = controls || `<p class="page-subtitle">No additional filters for this dataset.</p>`;
  attachFilterListeners(dataset);
}

function renderFilterControl(filter, value) {
  const id = `filter-${filter.id}`;
  switch (filter.type) {
    case "date_range": {
      const fromVal = value?.from || "";
      const toVal = value?.to || "";
      const hasCustomDates = Boolean(fromVal || toVal);
      const preset = hasCustomDates && !value?.preset ? "custom" : value?.preset || "last_30_days";
      const customDisabled = preset === "custom" ? "" : "disabled";
      return `<div class="filter-control" data-filter="${filter.id}">
        <span>${escapeHtml(filter.label)}</span>
        <div class="date-filter">
          <select id="${id}-preset" aria-label="${escapeHtml(filter.label)} range">
            <option value="custom" ${preset === "custom" ? "selected" : ""}>Custom dates</option>
            <option value="current_month" ${preset === "current_month" ? "selected" : ""}>Current Month</option>
            <option value="previous_month" ${preset === "previous_month" ? "selected" : ""}>Previous Month</option>
            <option value="last_30_days" ${preset === "last_30_days" ? "selected" : ""}>Last 30 Days</option>
            <option value="last_60_days" ${preset === "last_60_days" ? "selected" : ""}>Last 60 Days</option>
            <option value="last_90_days" ${preset === "last_90_days" ? "selected" : ""}>Last 90 Days</option>
            <option value="year_to_date" ${preset === "year_to_date" ? "selected" : ""}>Year to Date</option>
          </select>
          <input type="date" id="${id}-from" value="${fromVal}" ${customDisabled} aria-label="${escapeHtml(filter.label)} start date" />
          <input type="date" id="${id}-to" value="${toVal}" ${customDisabled} aria-label="${escapeHtml(filter.label)} end date" />
        </div>
      </div>`;
    }
    case "multi_select": {
      const values = Array.isArray(value) ? value.map(String) : [];
      const options = (filter.options || [])
        .map((option) => `<option value="${option.value}" ${values.includes(String(option.value)) ? "selected" : ""}>${escapeHtml(option.label ?? String(option.value))}</option>`)
        .join("");
      return `<label class="filter-control" data-filter="${filter.id}">
        <span>${escapeHtml(filter.label)}</span>
        <select id="${id}" multiple size="${Math.min(6, (filter.options || []).length || 4)}">${options}</select>
      </label>`;
    }
    case "select": {
      const options = (filter.options || [])
        .map((option) => `<option value="${option.value}" ${value === option.value ? "selected" : ""}>${escapeHtml(option.label ?? String(option.value))}</option>`)
        .join("");
      return `<label class="filter-control" data-filter="${filter.id}">
        <span>${escapeHtml(filter.label)}</span>
        <select id="${id}"><option value="">Any</option>${options}</select>
      </label>`;
    }
    case "number":
    default:
      return `<label class="filter-control" data-filter="${filter.id}">
        <span>${escapeHtml(filter.label)}</span>
        <input type="number" id="${id}" value="${value ?? ""}" />
      </label>`;
  }
}

function attachFilterListeners(dataset) {
  const current = state.builder.filters || {};
  dataset.filters.forEach((filter) => {
    const baseId = `filter-${filter.id}`;
    if (filter.type === "date_range") {
      const fromInput = document.getElementById(`${baseId}-from`);
      const toInput = document.getElementById(`${baseId}-to`);
      const presetSelect = document.getElementById(`${baseId}-preset`);
      const handler = () => {
        const isCustom = presetSelect?.value === "custom";
        if (fromInput) fromInput.disabled = !isCustom;
        if (toInput) toInput.disabled = !isCustom;
        const next = { ...current[filter.id] };
        if (isCustom) {
          next.from = fromInput?.value || null;
          next.to = toInput?.value || null;
          next.preset = "";
        } else {
          next.from = null;
          next.to = null;
          next.preset = presetSelect?.value || "last_30_days";
          if (fromInput) fromInput.value = "";
          if (toInput) toInput.value = "";
        }
        if (!next.from && !next.to && !next.preset) {
          delete current[filter.id];
        } else {
          current[filter.id] = next;
        }
      };
      [fromInput, toInput, presetSelect].forEach((el) => el && el.addEventListener("change", handler));
      handler();
    } else if (filter.type === "multi_select") {
      const select = document.getElementById(baseId);
      if (select) {
        select.addEventListener("change", () => {
          const values = Array.from(select.selectedOptions).map((opt) => opt.value);
          if (values.length) {
            current[filter.id] = values;
          } else {
            delete current[filter.id];
          }
        });
      }
    } else if (filter.type === "select") {
      const select = document.getElementById(baseId);
      if (select) {
        select.addEventListener("change", () => {
          if (select.value) {
            current[filter.id] = select.value;
          } else {
            delete current[filter.id];
          }
        });
      }
    } else {
      const input = document.getElementById(baseId);
      if (input) {
        input.addEventListener("input", () => {
          if (input.value !== "") {
            current[filter.id] = Number.isNaN(Number(input.value)) ? input.value : Number(input.value);
          } else {
            delete current[filter.id];
          }
        });
      }
    }
  });
  state.builder.filters = current;
}

function renderSortControls() {
  if (!elements.sortColumn || !elements.sortDirection) return;
  const dataset = getActiveDataset();
  if (!dataset) {
    elements.sortColumn.innerHTML = "<option value=''>Select column</option>";
    elements.sortColumn.disabled = true;
    elements.sortDirection.disabled = true;
    return;
  }
  const availableColumns = state.builder.columns.length
    ? state.builder.columns
    : dataset.defaultColumns || dataset.columns.map((c) => c.id);
  const options = availableColumns
    .map((columnId) => {
      const meta = dataset.columns.find((col) => col.id === columnId) || dataset.columns.find((col) => col.id === columnId);
      if (!meta) return "";
      return `<option value="${columnId}">${escapeHtml(meta.label)}</option>`;
    })
    .join("");
  elements.sortColumn.innerHTML = `<option value="">None</option>${options}`;
  const sort = state.builder.sort || {};
  elements.sortColumn.value = sort.column || "";
  elements.sortDirection.value = sort.direction || "desc";
  elements.sortColumn.disabled = false;
  elements.sortDirection.disabled = false;
}

function renderSavedReports() {
  if (!elements.savedList) return;
  const query = (elements.searchInput?.value || "").toLowerCase();
  const items = state.reports
    .filter((report) => !query || report.name.toLowerCase().includes(query) || (report.description || "").toLowerCase().includes(query))
    .map((report) => {
      const active = state.activeReport?.id === report.id ? "class=\"active\"" : "";
      const meta = state.datasetMap.get(report.dataset);
      const datasetLabel = meta ? meta.name : report.dataset;
      return `<li ${active}>
        <button type="button" data-report="${report.id}">
          <span class="report-name">${escapeHtml(report.name)}</span>
          <span class="report-meta">${escapeHtml(datasetLabel)}</span>
        </button>
      </li>`;
    })
    .join("");
  elements.savedList.innerHTML = items || '<li class="empty">No saved reports yet.</li>';
  elements.savedList.querySelectorAll("button[data-report]").forEach((button) => {
    button.addEventListener("click", () => {
      const reportId = Number(button.getAttribute("data-report"));
      openReport(reportId);
    });
  });
}

async function openReport(reportId) {
  try {
    showStatus("Loading report...", false);
    const response = await fetch(`/api/v1/reports/${reportId}`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || `Request failed (${response.status})`);
    }
    const payload = await response.json();
    const report = payload.data;
    state.activeReport = report;
    if (report.datasetMeta) {
      state.datasetMap.set(report.dataset, report.datasetMeta);
    }
    state.builder.dataset = report.dataset;
    state.builder.columns = [...(report.columns || [])];
    state.builder.filters = { ...(report.filters || {}) };
    state.builder.sort = report.sort && report.sort.length ? { ...report.sort[0] } : null;
    state.builder.limit = report.options?.limit ?? null;
    elements.nameInput.value = report.name || "";
    elements.slugInput.value = report.slug || "";
    elements.descriptionInput.value = report.description || "";
    elements.datasetSelect.value = report.dataset;
    renderColumns();
    renderFilters();
    renderSortControls();
    if (state.builder.limit) {
      elements.limitInput.value = state.builder.limit;
    } else if (elements.limitInput) {
      elements.limitInput.value = "";
    }
    elements.builderTitle.textContent = report.name;
    elements.builderSubtitle.textContent = report.description || "Customize filters and run to refresh results.";
    elements.reportsIntro.textContent = "Click a saved report to populate the builder.";
    if (state.isManager && elements.manageButtons) {
      elements.manageButtons.style.display = "flex";
      enableManageFields(true);
    }
    const viewsResponse = await fetchReportViews(reportId);
    state.views = viewsResponse?.data || [];
    renderSavedReports();
    showStatus("Report ready.", false);
  } catch (error) {
    console.error("Failed to open report", error);
    showStatus(error.message || "Failed to open report", true);
  }
}

function resetBuilder() {
  state.activeReport = null;
  state.builder = {
    dataset: null,
    columns: [],
    filters: {},
    sort: null,
    limit: null,
  };
  elements.datasetSelect.value = "";
  elements.nameInput.value = "";
  elements.slugInput.value = "";
  elements.descriptionInput.value = "";
  elements.builderTitle.textContent = "Report Builder";
  elements.builderSubtitle.textContent = "Pick the report type, choose the sections to show, and apply filters.";
  renderColumns();
  renderFilters();
  renderSortControls();
  if (elements.limitInput) elements.limitInput.value = "";
  state.views = [];
  showStatus("Start by selecting a dataset.", false);
}

async function handleRunReport(event) {
  event.preventDefault();
  if (!state.builder.dataset) {
    showStatus("Choose a dataset first.", true);
    return;
  }
  const reportId = state.activeReport?.id ?? null;
  const payload = collectRunPayload();
  try {
    showStatus("Running report...", false);
    if (!state.activeReport?.id && !state.isManager) {
      showStatus("Please select a saved report to run.", true);
      return;
    }
    const response = reportId
      ? await apiRunReportRequest(reportId, payload)
      : await runTransientReport(payload);
    const rows = response.data || [];
    const columns = response.columns || [];
    renderResults(rows, columns, response.meta);
    showStatus(`Report returned ${response.meta?.rowCount ?? rows.length} rows.`, false);
  } catch (error) {
    console.error("Run failed", error);
    showStatus(error.message || "Report failed", true);
  }
}

async function runTransientReport(payload) {
  const data = await createTransientReport(payload);
  try {
    return await apiRunReportRequest(data.id, { ...payload });
  } finally {
    try {
      await deleteReportDefinition(data.id);
    } catch (error) {
      console.warn("Failed to delete transient report", error);
    }
  }
}

function collectRunPayload() {
  const dataset = getActiveDataset();
  const columns = state.builder.columns.length && dataset ? state.builder.columns : dataset?.defaultColumns || [];
  const filters = sanitizeFilters(state.builder.filters || {});
  const sort = state.builder.sort && state.builder.sort.column ? [{ column: state.builder.sort.column, direction: state.builder.sort.direction || "desc" }] : [];
  const limit = state.builder.limit || dataset?.limit || 1000;
  return {
    columns,
    filters,
    sort,
    limit,
  };
}

function sanitizeFilters(filters) {
  const cleaned = {};
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    if (Array.isArray(value) && !value.length) return;
    if (typeof value === "object" && !Array.isArray(value)) {
      const nested = sanitizeFilters(value);
      if (Object.keys(nested).length) {
        cleaned[key] = nested;
      }
    } else {
      cleaned[key] = value;
    }
  });
  return cleaned;
}

function renderResults(rows, columns, meta) {
  if (!elements.resultsCard || !elements.resultsTable) return;
  if (!rows.length) {
    elements.resultsTable.innerHTML = "<tbody><tr><td style='padding:16px;'>No rows returned.</td></tr></tbody>";
    elements.resultsCard.style.display = "block";
    elements.resultsMeta.textContent = meta ? formatMeta(meta) : "No data returned.";
    return;
  }
  const header = `<thead><tr>${columns.map((col) => `<th>${escapeHtml(col.label || col.id)}</th>`).join("")}</tr></thead>`;
  const body = rows
    .map((row) => {
      const cells = columns.map((col) => `<td>${escapeHtml(formatCell(row[col.id], col.type))}</td>`).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  elements.resultsTable.innerHTML = `${header}<tbody>${body}</tbody>`;
  elements.resultsCard.style.display = "block";
  elements.resultsMeta.textContent = meta ? formatMeta(meta) : `${rows.length} rows`;
}

function formatCell(value, type) {
  if (value === null || value === undefined) return "";
  switch (type) {
    case "currency":
      return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(value) || 0);
    case "number":
      return new Intl.NumberFormat().format(Number(value) || 0);
    case "date":
    case "datetime":
      return new Date(value).toLocaleString();
    default:
      return String(value);
  }
}

function formatMeta(meta) {
  const parts = [];
  if (meta.rowCount !== undefined) parts.push(`${meta.rowCount} rows`);
  if (meta.durationMs !== undefined) parts.push(`${meta.durationMs} ms`);
  if (meta.limit !== undefined) parts.push(`limit ${meta.limit}`);
  return parts.join(" • ");
}

async function handleExport(event, format) {
  event.preventDefault();
  if (!state.builder.dataset) {
    showStatus("Choose a report type before exporting.", true);
    return;
  }
  if (!state.activeReport?.id && !state.isManager) {
    showStatus("Please select a saved report to export.", true);
    return;
  }
  const payload = collectRunPayload();
  const labels = {
    csv: "CSV",
    html: "PDF preview",
    doc: "Word / LibreOffice file",
  };
  try {
    showStatus(`Preparing ${labels[format] || "export"}...`, false);
    const blob = state.activeReport?.id
      ? await downloadReportExport(state.activeReport.id, payload, format)
      : await downloadTransientReportExport(payload, format);
    if (format === "html") {
      await openPrintableReport(blob);
      showStatus("PDF preview opened. Use your browser's print option to save as PDF.", false);
    } else {
      const extension = format === "doc" ? "doc" : "csv";
      saveBlob(blob, `${getExportSlug()}-${Date.now()}.${extension}`);
      showStatus(`${labels[format] || "Export"} ready.`, false);
    }
  } catch (error) {
    console.error("Report export failed", error);
    showStatus(error.message || "Failed to export report", true);
  }
}

async function downloadTransientReportExport(payload, format) {
  const data = await createTransientReport(payload);
  try {
    return await downloadReportExport(data.id, payload, format);
  } finally {
    try {
      await deleteReportDefinition(data.id);
    } catch (error) {
      console.warn("Failed to delete transient report", error);
    }
  }
}

async function createTransientReport(payload) {
  const tempPayload = {
    slug: `adhoc-${Date.now()}`,
    name: elements.nameInput?.value?.trim() || "Ad-hoc Report",
    dataset: state.builder.dataset,
    columns: payload.columns,
    filters: payload.filters,
    sort: payload.sort,
    options: { limit: payload.limit },
  };
  const { data } = await createReportDefinition(tempPayload);
  return data;
}

async function downloadReportExport(reportId, payload, format) {
  const accepts = {
    csv: "text/csv",
    html: "text/html",
    doc: "application/msword",
  };
  const response = await fetch(`/api/v1/reports/${reportId}/run`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: accepts[format] || "application/octet-stream",
      "Content-Type": "application/json",
      "x-csrf-token": window.__CSRF_TOKEN__ || "",
    },
    body: JSON.stringify({ ...payload, format }),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed (${response.status})`);
  }
  return response.blob();
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function openPrintableReport(blob) {
  const html = await blob.text();
  const frame = document.createElement("iframe");
  frame.setAttribute("title", "Report print preview");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.visibility = "hidden";
  document.body.appendChild(frame);

  await new Promise((resolve, reject) => {
    frame.onload = resolve;
    frame.onerror = reject;
    frame.srcdoc = html;
  });

  const printable = frame.contentWindow;
  if (!printable) {
    frame.remove();
    saveBlob(new Blob([html], { type: "text/html" }), `${getExportSlug()}-${Date.now()}.html`);
    return;
  }
  printable.focus();
  printable.print();
  window.setTimeout(() => frame.remove(), 1000);
}

function getExportSlug() {
  return state.activeReport?.slug || elements.slugInput?.value?.trim() || "report";
}

async function handleSaveReport(event) {
  event.preventDefault();
  if (!state.isManager) {
    showStatus("You do not have permission to save definitions.", true);
    return;
  }
  if (!state.builder.dataset) {
    showStatus("Select a dataset before saving.", true);
    return;
  }
  const name = elements.nameInput.value.trim();
  const slug = elements.slugInput.value.trim();
  if (!name || !slug) {
    showStatus("Provide both a name and slug for the report.", true);
    return;
  }
  const payload = {
    name,
    slug,
    description: elements.descriptionInput.value.trim() || null,
    dataset: state.builder.dataset,
    columns: state.builder.columns,
    filters: sanitizeFilters(state.builder.filters || {}),
    sort: state.builder.sort && state.builder.sort.column ? [{ column: state.builder.sort.column, direction: state.builder.sort.direction || "desc" }] : [],
    options: state.builder.limit ? { limit: state.builder.limit } : undefined,
  };
  try {
    let result;
    if (state.activeReport?.id) {
      result = await updateReportDefinition(state.activeReport.id, payload);
      showStatus("Report definition updated.", false);
    } else {
      result = await createReportDefinition(payload);
      showStatus("Report saved.", false);
    }
    const saved = result.data;
    state.activeReport = saved;
    await Promise.all([loadReports(), ensureDataset(saved.dataset)]);
    renderSavedReports();
    elements.datasetSelect.value = saved.dataset;
  } catch (error) {
    console.error("Save failed", error);
    showStatus(error.message || "Failed to save report", true);
  }
}

async function handleDeleteReport(event) {
  event.preventDefault();
  if (!state.isManager || !state.activeReport?.id) {
    return;
  }
  if (!confirm("Delete this report definition?")) return;
  try {
    await deleteReportDefinition(state.activeReport.id);
    showStatus("Report deleted.", false);
    state.activeReport = null;
    await loadReports();
    resetBuilder();
  } catch (error) {
    console.error("Delete failed", error);
    showStatus(error.message || "Failed to delete report", true);
  }
}

function showStatus(message, isError) {
  if (!elements.builderStatus) return;
  if (!message) {
    elements.builderStatus.style.display = "none";
    return;
  }
  elements.builderStatus.textContent = message;
  elements.builderStatus.style.display = "block";
  elements.builderStatus.style.color = isError ? "var(--color-danger)" : "var(--color-muted)";
}

function getActiveDataset() {
  if (!state.builder.dataset) return null;
  const meta = state.datasetMap.get(state.builder.dataset);
  if (!meta) return null;
  return {
    ...meta,
    columns: meta.columns || [],
    filters: meta.filters || [],
  };
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

init();
