import { fetchContacts, fetchFunds, fetchDonations, createDonation, fetchCampaigns, createPledgePayment, postDonationToGL } from "./api.js";
import { showToast } from "./ui.js";

const state = { donations: [], funds: [], contacts: [], campaigns: [], filters: {} };

const donationsBody = document.querySelector("[data-donations-body]");
const donationsSummary = document.getElementById("donations-summary");
const donationsFilter = document.getElementById("donations-filter");
const donationForm = document.getElementById("donation-form");
const donationMessage = document.getElementById("donation-form-message");
const fundSelect = document.getElementById("donation-fund");
const contactSelect = document.getElementById("donation-contact");
const campaignSelect = document.getElementById("donation-campaign");
const pledgeCheckbox = document.getElementById("donation-is-pledge");

function arrangeCampaignBeforeFund() {
  if (!campaignSelect || !fundSelect) return;
  const fundWrap = fundSelect.closest("label");
  const campWrap = campaignSelect.closest("label");
  if (fundWrap && campWrap && campWrap.nextSibling !== fundWrap) {
    fundWrap.parentNode.insertBefore(campWrap, fundWrap);
  }
}
function setFundDisabled(disabled) { if (fundSelect) fundSelect.disabled = !!disabled; }
function refreshFundOptions() {
  if (!fundSelect) return;
  const currentValue = fundSelect.value;
  const options = ['<option value="">Select fund</option>'];
  const selectedCampaignId = campaignSelect && campaignSelect.value ? Number(campaignSelect.value) : null;
  if (selectedCampaignId) {
    const list = (state.funds || []).filter((f) => f.campaignId === selectedCampaignId);
    for (const fund of list) options.push(`<option value="${fund.id}">${fund.name}</option>`);
  }
  fundSelect.innerHTML = options.join("");
  if (currentValue && fundSelect.querySelector(`option[value="${currentValue}"]`)) {
    fundSelect.value = currentValue;
  }
}
function handleCampaignChange() {
  const hasCampaign = !!(campaignSelect && campaignSelect.value);
  setFundDisabled(!hasCampaign);
  if (!hasCampaign) { if (fundSelect) fundSelect.selectedIndex = 0; return; }
  const prev = fundSelect ? fundSelect.value : "";
  refreshFundOptions();
  if (fundSelect) {
    if (prev && fundSelect.querySelector(`option[value="${prev}"]`)) fundSelect.value = prev;
    else fundSelect.selectedIndex = 0;
  }
}
function setupCampaignFundDependency() {
  arrangeCampaignBeforeFund();
  refreshFundOptions();
  setFundDisabled(!campaignSelect || !campaignSelect.value);
  if (campaignSelect) campaignSelect.addEventListener("change", handleCampaignChange);
}

function renderDonations(list) {
  if (!donationsBody) return;
  if (!Array.isArray(list) || !list.length) {
    donationsBody.innerHTML = '<tr><td colspan="7">No donations found.</td></tr>';
    if (donationsSummary) donationsSummary.textContent = "0 donations";
    return;
  }
  const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  let total = 0;
  donationsBody.innerHTML = list.map((d) => {
    total += d.amount || 0;
    const date = d.donatedAt ? new Date(d.donatedAt).toLocaleDateString() : "-";
    const pledgeBalance = getPledgeBalance(d);
    const receiveButton = pledgeBalance > 0
      ? `<button class="button secondary" data-receive-pledge="${d.id}" data-balance="${pledgeBalance.toFixed(2)}">Receive</button>`
      : "";
    return `<tr>
      <td>${date}</td>
      <td>${d.contactName || d.accountName || "-"}</td>
      <td>${d.fundName || "-"}</td>
      <td>${d.campaignName || "-"}</td>
      <td>${d.paymentMethod || "-"}</td>
      <td style="text-align:right;">${fmt.format(d.amount || 0)}</td>
      <td>${receiveButton}</td>
    </tr>`;
  }).join("");
  if (donationsSummary) donationsSummary.textContent = `${list.length} donation${list.length===1?"":"s"} - ${fmt.format(total)}`;
}

function getPledgeBalance(donation) {
  if (donation?.paymentMethod !== "Pledge") return 0;
  const amount = Number(donation.amount || 0);
  const paid = (Array.isArray(donation.payments) ? donation.payments : [])
    .filter((payment) => String(payment.status || "").toLowerCase() === "succeeded")
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  return Math.max(0, amount - paid);
}

async function loadFunds() {
  try { const { data } = await fetchFunds(); state.funds = data || []; refreshFundOptions(); } catch {}
}
async function loadContacts() {
  try {
    const { data } = await fetchContacts({ limit: 100 });
    state.contacts = data || [];
    if (contactSelect) {
      const opts = ['<option value="">Select contact</option>'];
      for (const c of state.contacts) opts.push(`<option value="${c.id}">${(c.firstName||"") + " " + (c.lastName||"")}</option>`);
      contactSelect.innerHTML = opts.join("");
    }
  } catch {}
}
async function loadCampaigns() {
  try {
    const { data } = await fetchCampaigns({ status: "Active" });
    state.campaigns = data || [];
    if (campaignSelect) {
      const opts = ['<option value="">Select campaign</option>'];
      for (const c of state.campaigns) opts.push(`<option value="${c.id}">${c.name}</option>`);
      campaignSelect.innerHTML = opts.join("");
    }
    handleCampaignChange();
  } catch {}
}
async function loadDonations() {
  if (!donationsBody) return;
  try {
    const { data } = await fetchDonations({ limit: 50, ...state.filters });
    state.donations = Array.isArray(data) ? data : [];
    renderDonations(state.donations);
  } catch (e) {
    const msg = e?.message || "Failed to load";
    donationsBody.innerHTML = `<tr><td colspan="7">${msg}</td></tr>`;
    if (donationsSummary) donationsSummary.textContent = msg;
  }
}

function wireDonationActions() {
  if (!donationsBody) return;
  donationsBody.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-receive-pledge]");
    if (!button) return;
    if (!window.__ERP_USER__) {
      showToast("Sign in to receive pledge payments", "error");
      return;
    }

    const donationId = Number(button.dataset.receivePledge);
    const balance = Number(button.dataset.balance || 0);
    const raw = window.prompt("Amount received", balance > 0 ? balance.toFixed(2) : "");
    if (raw === null) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("Enter a payment amount greater than zero", "error");
      return;
    }
    if (balance > 0 && amount > balance) {
      showToast("Payment cannot be more than the pledge balance", "error");
      return;
    }

    button.disabled = true;
    try {
      await createPledgePayment(donationId, {
        amount,
        receivedAt: new Date().toISOString(),
        method: "Offline",
      });
      showToast("Pledge payment received", "ok");
      await loadDonations();
    } catch (error) {
      button.disabled = false;
      showToast(error.message || "Failed to receive pledge payment", "error");
    }
  });
}

function wireFilters() {
  if (!donationsFilter) return;
  donationsFilter.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const fd = new FormData(donationsFilter);
    state.filters.from = fd.get("from") || undefined;
    state.filters.to = fd.get("to") || undefined;
    loadDonations();
  });
}

function wireDonationForm() {
  if (!donationForm) return;
  const dateInput = donationForm.querySelector("input[name='donatedAt']");
  if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);
  donationForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!window.__ERP_USER__) {
      if (donationMessage) { donationMessage.textContent = "Sign in to create donations."; donationMessage.style.display = "block"; donationMessage.style.color = "var(--color-danger)"; }
      return;
    }
    const fd = new FormData(donationForm);
    const payload = {
      contactId: fd.get("contactId") ? Number(fd.get("contactId")) : null,
      campaignId: fd.get("campaignId") ? Number(fd.get("campaignId")) : null,
      fundId: fd.get("fundId") ? Number(fd.get("fundId")) : null,
      amount: fd.get("amount") ? Number(fd.get("amount")) : 0,
      donatedAt: fd.get("donatedAt") || new Date().toISOString(),
      paymentMethod: fd.get("paymentMethod") || "Offline",
      isPledge: !!(pledgeCheckbox && pledgeCheckbox.checked),
    };
    try {
      const res = await createDonation(payload);
      if (donationMessage) { donationMessage.textContent = "Donation recorded."; donationMessage.style.display = "block"; donationMessage.style.color = "var(--color-success)"; }
      const roles = (window.__ERP_USER__?.roles || []).map(r => typeof r === 'string' ? r : r?.name).filter(Boolean);
      const canPost = roles.includes('Admin') || roles.includes('Finance');
      if (canPost && !payload.isPledge) {
        try { const p = await postDonationToGL(res?.data?.id); if (p?.data?.journalNumber) showToast(`Posted ${p.data.journalNumber}`,'ok'); } catch {}
      }
      donationForm.reset();
      if (dateInput) dateInput.value = new Date().toISOString().slice(0,10);
      handleCampaignChange();
      await loadDonations();
    } catch (err) {
      if (donationMessage) { donationMessage.textContent = err.message || "Failed to save donation"; donationMessage.style.display = "block"; donationMessage.style.color = "var(--color-danger)"; }
      showToast(err.message || 'Failed to save donation', 'error');
    }
  });
}

function init() {
  const onReady = () => {
    setupCampaignFundDependency();
    wireFilters();
    wireDonationForm();
    wireDonationActions();
    loadFunds();
    loadContacts();
    loadCampaigns();
    loadDonations();
  };

  let started = false;
  const startOnce = () => {
    if (started) return;
    started = true;
    onReady();
  };

  if (window.__ERP_USER__) {
    // Already authenticated; start immediately
    startOnce();
  } else {
    // Wait until auth is ready to avoid double-wiring handlers
    document.addEventListener("auth:ready", () => startOnce(), { once: true });
  }
}

init();
