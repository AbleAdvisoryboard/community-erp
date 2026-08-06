import { fetchGlAccounts, fetchTrialBalance } from "./api.js";

const accountsBody = document.querySelector("[data-gl-accounts]");
const trialBody = document.querySelector("[data-trial-balance]");
const accountsSummary = document.getElementById("gl-account-summary");
const trialSummary = document.getElementById("trial-balance-summary");
const refreshButton = document.getElementById("refresh-trial-balance");

function renderAccounts(accounts) {
  if (!accountsBody) return;
  if (!accounts.length) {
    accountsBody.innerHTML = '<tr><td colspan="3">No GL accounts found.</td></tr>';
    if (accountsSummary) accountsSummary.textContent = "0 accounts";
    return;
  }
  accountsBody.innerHTML = accounts
    .map((account) => `
      <tr>
        <td>${account.code}</td>
        <td>${account.name}</td>
        <td>${account.type}</td>
      </tr>`)
    .join("");
  if (accountsSummary) {
    accountsSummary.textContent = `${accounts.length} account${accounts.length === 1 ? "" : "s"}`;
  }
}

function renderTrialBalance(rows) {
  if (!trialBody) return;
  if (!rows.length) {
    trialBody.innerHTML = '<tr><td colspan="5">No activity posted yet.</td></tr>';
    if (trialSummary) trialSummary.textContent = "0 rows";
    return;
  }
  const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  let totalDebits = 0;
  let totalCredits = 0;
  trialBody.innerHTML = rows
    .map((row) => {
      totalDebits += row.total_debits || 0;
      totalCredits += row.total_credits || 0;
      return `
        <tr>
          <td>${row.account_code} · ${row.account_name}</td>
          <td>${row.account_type}</td>
          <td style="text-align:right;">${formatter.format(row.total_debits || 0)}</td>
          <td style="text-align:right;">${formatter.format(row.total_credits || 0)}</td>
          <td style="text-align:right;">${formatter.format(row.balance || 0)}</td>
        </tr>`;
    })
    .join("");
  if (trialSummary) {
    trialSummary.textContent = `Debits ${formatter.format(totalDebits)} · Credits ${formatter.format(totalCredits)}`;
  }
}

async function loadAccounts() {
  try {
    const { data } = await fetchGlAccounts();
    renderAccounts(data);
  } catch (error) {
    console.error("Failed to load GL accounts", error);
    if (accountsBody) {
      accountsBody.innerHTML = `<tr><td colspan="3">${error.message}</td></tr>`;
    }
  }
}

async function loadTrialBalance() {
  try {
    const { data } = await fetchTrialBalance();
    renderTrialBalance(data);
  } catch (error) {
    console.error("Failed to load trial balance", error);
    if (trialBody) {
      trialBody.innerHTML = `<tr><td colspan="5">${error.message}</td></tr>`;
    }
  }
}

if (refreshButton) {
  refreshButton.addEventListener("click", loadTrialBalance);
}

function init() {
  const onReady = () => {
    loadAccounts();
    loadTrialBalance();
  };
  if (!window.__ERP_USER__) {
    document.addEventListener("auth:ready", onReady, { once: true });
  } else {
    onReady();
  }
}

init();

