import {
  fetchFunds,
  createFund,
  updateFund,
  fetchCampaigns,
  createCampaign,
  updateCampaign,
  fetchGlAccounts,
} from "./api.js";
import { showToast } from "./ui.js";

const state = {
  funds: [],
  campaigns: [],
  revenueAccounts: [],
  fundFilter: "",
  campaignFilter: "",
  showActiveFunds: true,
  showInactiveFunds: true,
  showActiveCampaigns: true,
  showInactiveCampaigns: true,
};

const els = {
  fundForm: document.getElementById("fund-form"),
  fundFormMessage: document.getElementById("fund-form-message"),
  fundBody: document.querySelector("[data-fund-body]"),
  fundsSummary: document.getElementById("funds-summary"),
  fundCodeInput: document.getElementById("fund-code"),
  fundCampaignSelect: document.getElementById("fund-campaign"),
  fundRevenueSelect: document.getElementById("fund-revenue-gl"),
  fundFilterForm: document.getElementById("fund-filter"),
  fundFilterQuery: document.getElementById("fund-filter-query"),
  fundFilterActive: document.getElementById("fund-filter-active"),
  fundFilterInactive: document.getElementById("fund-filter-inactive"),
  fundFilterClear: document.getElementById("fund-filter-clear"),
  campaignForm: document.getElementById("campaign-form"),
  campaignFormMessage: document.getElementById("campaign-form-message"),
  campaignBody: document.querySelector("[data-campaign-body]"),
  campaignsSummary: document.getElementById("campaigns-summary"),
  campaignFilterForm: document.getElementById("campaign-filter"),
  campaignFilterQuery: document.getElementById("campaign-filter-query"),
  campaignFilterActive: document.getElementById("campaign-filter-active"),
  campaignFilterInactive: document.getElementById("campaign-filter-inactive"),
  campaignFilterClear: document.getElementById("campaign-filter-clear"),
};

function setMessage(target, text, tone = "info") {
  if (!target) return;
  if (!text) {
    target.style.display = "none";
    target.textContent = "";
    return;
  }
  target.style.display = "block";
  target.textContent = text;
  target.style.color =
    tone === "error"
      ? "var(--color-danger)"
      : tone === "success"
      ? "var(--color-success)"
      : "var(--color-muted)";
}

function notifyFundraisingChange(entity) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("fundraising:data-changed", { detail: { entity } })
    );
  }
}

function formatCurrency(value) {
  if (!Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function matchesFilter(item, fields, query) {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) return true;
  return fields.some((field) =>
    String(item[field] ?? "").toLowerCase().includes(normalized)
  );
}

function renderFunds() {
  if (!els.fundBody) return;
  const visibleFunds = state.funds.filter((fund) =>
    matchesFilter(fund, ["name", "code", "restriction", "description"], state.fundFilter)
    && ((fund.isActive && state.showActiveFunds) || (!fund.isActive && state.showInactiveFunds))
  );
  if (!visibleFunds.length) {
    els.fundBody.innerHTML = '<tr><td colspan="6">No funds found.</td></tr>';
  } else {
    els.fundBody.innerHTML = visibleFunds
      .map(
        (fund) => `
          <tr data-fund-id="${fund.id}">
            <td>${fund.name}</td>
            <td>${fund.code}</td>
            <td>${fund.restriction || "--"}</td>
            <td>${fund.description || "--"}</td>
            <td>${fund.isActive ? "Active" : "Inactive"}</td>
            <td>
              <button class="button tertiary" data-action="toggle-fund">
                ${fund.isActive ? "Deactivate" : "Activate"}
              </button>
            </td>
          </tr>`
      )
      .join("");
  }
  if (els.fundsSummary) {
    const activeCount = state.funds.filter((f) => f.isActive).length;
    const prefix = state.fundFilter ? `${visibleFunds.length} of ` : "";
    els.fundsSummary.textContent = `${prefix}${state.funds.length} fund${
      state.funds.length === 1 ? "" : "s"
    } • ${activeCount} active`;
  }
}

function renderCampaigns() {
  if (!els.campaignBody) return;
  const visibleCampaigns = state.campaigns.filter((campaign) =>
    matchesFilter(campaign, ["name", "code", "status", "description"], state.campaignFilter)
    && ((campaign.status === "Active" && state.showActiveCampaigns)
      || (campaign.status !== "Active" && state.showInactiveCampaigns))
  );
  if (!visibleCampaigns.length) {
    els.campaignBody.innerHTML = '<tr><td colspan="7">No campaigns found.</td></tr>';
  } else {
    els.campaignBody.innerHTML = visibleCampaigns
      .map((campaign) => {
        const fmt = (v) => { if (!v) return "-"; try { const s = String(v); if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10); const d = new Date(s); if (!isNaN(d.getTime())) return d.toISOString().slice(0,10); return s.slice(0,10);} catch(_) { return String(v).slice(0,10);} }; const start = fmt(campaign.startDate); const end = fmt(campaign.endDate); const windowText = (campaign.startDate || campaign.endDate) ? `${start} - ${end}` : "--";
        const isActive = campaign.status === "Active";
        return `
          <tr data-campaign-id="${campaign.id}">
            <td>${campaign.name}</td>
            <td>${campaign.code}</td>
            <td>${campaign.status}</td>
            <td>${formatCurrency(campaign.goalAmount)}</td>
            <td>${windowText}</td>
            <td>${campaign.description || "--"}</td>
            <td>
              <button class="button tertiary" data-action="${
                isActive ? "deactivate-campaign" : "activate-campaign"
              }">
                ${isActive ? "Deactivate" : "Activate"}
              </button>
            </td>
          </tr>`;
      })
      .join("");
  }
  if (els.campaignsSummary) {
    const activeCount = state.campaigns.filter((c) => c.status === "Active").length;
    const prefix = state.campaignFilter ? `${visibleCampaigns.length} of ` : "";
    els.campaignsSummary.textContent = `${prefix}${state.campaigns.length} campaign${
      state.campaigns.length === 1 ? "" : "s"
    } • ${activeCount} active`;
  }
}

async function loadFunds() {
  try {
    const { data } = await fetchFunds({ includeInactive: true });
    state.funds = Array.isArray(data) ? data : [];
    renderFunds();
  } catch (error) {
    console.error("Failed to load funds", error);
    setMessage(els.fundFormMessage, error.message || "Unable to load funds", "error");
  }
}

function refreshFundRevenueOptions() {
  if (!els.fundRevenueSelect) return;
  const sel = els.fundRevenueSelect;
  const current = sel.value;
  const restrictionEl = els.fundForm
    ? els.fundForm.querySelector("select[name='restriction']")
    : null;
  const restriction = restrictionEl ? restrictionEl.value : "Unrestricted";
  const isRestricted =
    restriction === "TempRestricted" || restriction === "PermRestricted";

  const options = ['<option value="">(Default contributions revenue)</option>'];
  const list = (state.revenueAccounts || []).filter((acc) => {
    const cat = acc.fsCategory || "";
    const isRestrCat = cat.startsWith("activities.revenue.restr_");
    if (isRestricted) {
      return isRestrCat;
    }
    // Unrestricted funds: allow any revenue that is not explicitly restricted
    return !isRestrCat;
  });

  for (const acc of list) {
    options.push(
      `<option value="${acc.id}">${acc.code} - ${acc.name}</option>`
    );
  }

  sel.innerHTML = options.join("");
  if (current && sel.querySelector(`option[value="${current}"]`)) {
    sel.value = current;
  }
}

async function loadRevenueAccounts() {
  try {
    const { data } = await fetchGlAccounts({ type: "Revenue" });
    state.revenueAccounts = Array.isArray(data) ? data : [];
    refreshFundRevenueOptions();
  } catch (error) {
    console.error("Failed to load revenue GL accounts", error);
  }
}

async function loadCampaigns() {
  try {
    const { data } = await fetchCampaigns({ includeInactive: true });
    state.campaigns = Array.isArray(data) ? data : [];
    renderCampaigns();
    if (els.fundCampaignSelect) {
      const current = els.fundCampaignSelect.value;
      const options = ['<option value="">(Optional) Link to campaign</option>']
        .concat(state.campaigns
          .filter((c) => c.status === "Active")
          .map((c) => `<option value="${c.id}">${c.name}</option>`));
      els.fundCampaignSelect.innerHTML = options.join("");
      if (current) els.fundCampaignSelect.value = current;
    }
  } catch (error) {
    console.error("Failed to load campaigns", error);
    setMessage(els.campaignFormMessage, error.message || "Unable to load campaigns", "error");
  }
}

function attachFundHandlers() {
  if (els.fundForm) {
    const restrictionEl = els.fundForm.querySelector(
      "select[name='restriction']"
    );
    if (restrictionEl) {
      restrictionEl.addEventListener("change", () => {
        refreshFundRevenueOptions();
      });
    }

    els.fundForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!window.__ERP_USER__) {
        setMessage(els.fundFormMessage, "Sign in to add funds.", "error");
        return;
      }
      const formData = new FormData(els.fundForm);
      const payload = {
        name: formData.get("name"),
        code: formData.get("code"),
        revenueGlAccountId: formData.get("revenueGlAccountId")
          ? Number(formData.get("revenueGlAccountId"))
          : null,
        campaignId: formData.get("campaignId") ? Number(formData.get("campaignId")) : null,
        description: formData.get("description") || null,
        restriction: formData.get("restriction") || "Unrestricted",
        isActive: formData.get("isActive") === "on",
      };
      if (!payload.code) {
        setMessage(els.fundFormMessage, "Fund code is required.", "error");
        return;
      }
      if (!payload.campaignId) {
        setMessage(els.fundFormMessage, "Campaign is required for each fund.", "error");
        return;
      }
      try {
        await createFund(payload);
        setMessage(els.fundFormMessage, "Fund created.", "success");
        showToast("Fund created", "ok");
        els.fundForm.reset();
        await loadFunds();
        notifyFundraisingChange("fund");
      } catch (error) {
        setMessage(els.fundFormMessage, error.message || "Failed to create fund.", "error");
      }
    });
  }

  if (els.fundBody) {
    els.fundBody.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const row = button.closest("tr[data-fund-id]");
      if (!row) return;
      const fundId = Number(row.getAttribute("data-fund-id"));
      const fund = state.funds.find((f) => f.id === fundId);
      if (!fund) return;

      if (button.dataset.action === "toggle-fund") {
        try {
          await updateFund(fundId, { isActive: !fund.isActive });
          showToast(`Fund ${fund.isActive ? "deactivated" : "activated"}`, "ok");
          await loadFunds();
          notifyFundraisingChange("fund");
        } catch (error) {
          showToast(error.message || "Failed to update fund", "error");
        }
      }
    });
  }

  if (els.fundFilterForm) {
    els.fundFilterForm.addEventListener("submit", (event) => {
      event.preventDefault();
      state.fundFilter = els.fundFilterQuery?.value || "";
      renderFunds();
    });
  }
  if (els.fundFilterQuery) {
    els.fundFilterQuery.addEventListener("input", () => {
      state.fundFilter = els.fundFilterQuery.value;
      renderFunds();
    });
  }
  if (els.fundFilterActive) {
    els.fundFilterActive.addEventListener("change", () => {
      state.showActiveFunds = els.fundFilterActive.checked;
      renderFunds();
    });
  }
  if (els.fundFilterInactive) {
    els.fundFilterInactive.addEventListener("change", () => {
      state.showInactiveFunds = els.fundFilterInactive.checked;
      renderFunds();
    });
  }
  if (els.fundFilterClear) {
    els.fundFilterClear.addEventListener("click", () => {
      state.fundFilter = "";
      state.showActiveFunds = true;
      state.showInactiveFunds = true;
      if (els.fundFilterQuery) els.fundFilterQuery.value = "";
      if (els.fundFilterActive) els.fundFilterActive.checked = true;
      if (els.fundFilterInactive) els.fundFilterInactive.checked = true;
      renderFunds();
    });
  }
}

function attachCampaignHandlers() {
  if (els.campaignForm) {
    els.campaignForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!window.__ERP_USER__) {
        setMessage(els.campaignFormMessage, "Sign in to add campaigns.", "error");
        return;
      }
      const formData = new FormData(els.campaignForm);
      const payload = {
        name: formData.get("name"),
        code: formData.get("code"),
        goalAmount: formData.get("goalAmount") ? Number(formData.get("goalAmount")) : null,
        startDate: formData.get("startDate") || null,
        endDate: formData.get("endDate") || null,
        status: formData.get("isActive") === "on" ? "Active" : "Draft",
        description: formData.get("description") || null,
      };
      try {
        await createCampaign(payload);
        setMessage(els.campaignFormMessage, "Campaign created.", "success");
        showToast("Campaign created", "ok");
        els.campaignForm.reset();
        await loadCampaigns();
        notifyFundraisingChange("campaign");
      } catch (error) {
        setMessage(els.campaignFormMessage, error.message || "Failed to create campaign.", "error");
      }
    });
  }

  if (els.campaignBody) {
    els.campaignBody.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const row = button.closest("tr[data-campaign-id]");
      if (!row) return;
      const campaignId = Number(row.getAttribute("data-campaign-id"));
      if (!state.campaigns.some((c) => c.id === campaignId)) return;

      try {
        if (button.dataset.action === "deactivate-campaign") {
          await updateCampaign(campaignId, { status: "Draft" });
          showToast("Campaign deactivated", "ok");
        } else if (button.dataset.action === "activate-campaign") {
          await updateCampaign(campaignId, { status: "Active" });
          showToast("Campaign activated", "ok");
        }
        await loadCampaigns();
        notifyFundraisingChange("campaign");
      } catch (error) {
        showToast(error.message || "Failed to update campaign", "error");
      }
    });
  }

  if (els.campaignFilterForm) {
    els.campaignFilterForm.addEventListener("submit", (event) => {
      event.preventDefault();
      state.campaignFilter = els.campaignFilterQuery?.value || "";
      renderCampaigns();
    });
  }
  if (els.campaignFilterQuery) {
    els.campaignFilterQuery.addEventListener("input", () => {
      state.campaignFilter = els.campaignFilterQuery.value;
      renderCampaigns();
    });
  }
  if (els.campaignFilterActive) {
    els.campaignFilterActive.addEventListener("change", () => {
      state.showActiveCampaigns = els.campaignFilterActive.checked;
      renderCampaigns();
    });
  }
  if (els.campaignFilterInactive) {
    els.campaignFilterInactive.addEventListener("change", () => {
      state.showInactiveCampaigns = els.campaignFilterInactive.checked;
      renderCampaigns();
    });
  }
  if (els.campaignFilterClear) {
    els.campaignFilterClear.addEventListener("click", () => {
      state.campaignFilter = "";
      state.showActiveCampaigns = true;
      state.showInactiveCampaigns = true;
      if (els.campaignFilterQuery) els.campaignFilterQuery.value = "";
      if (els.campaignFilterActive) els.campaignFilterActive.checked = true;
      if (els.campaignFilterInactive) els.campaignFilterInactive.checked = true;
      renderCampaigns();
    });
  }
}

function init() {
  const onReady = () => {
    loadFunds();
    loadCampaigns();
    loadRevenueAccounts();
  };

  if (window.__ERP_USER__) {
    onReady();
  } else {
    document.addEventListener("auth:ready", onReady, { once: true });
  }

  attachFundHandlers();
  attachCampaignHandlers();
}

init();




