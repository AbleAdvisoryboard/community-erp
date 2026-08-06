import { fetchGlAccounts, fetchTrialBalance, fetchJournals, createGlAccount, createJournal, fetchFunds, deleteGlAccount, updateGlAccount } from "./api.js";
import { showToast } from "./ui.js";

// FS category options per account type
const FS_OPTIONS = {
  Asset: [
    { v: '', l: 'None' },
    { v: 'balance.asset.cash_current', l: 'Cash, cash equivalents and restricted cash' },
    { v: 'balance.asset.investments_current', l: 'Investments (current)' },
    { v: 'balance.asset.trade_receivables', l: 'Trade receivables' },
    { v: 'balance.asset.current_regulatory', l: 'Current regulatory assets' },
    { v: 'balance.asset.inventories', l: 'Inventories' },
    { v: 'balance.asset.prepayments_current', l: 'Prepayments and other current assets' },
    { v: 'balance.asset.discontinued_current', l: 'Current assets of discontinued operations' },
    { v: 'balance.asset.other_current', l: 'Other current assets' },
    { v: 'balance.asset.ppe', l: 'Property, plant and equipment' },
    { v: 'balance.asset.accum_dep_amort', l: 'Less accumulated depreciation and amortization' },
    { v: 'balance.asset.goodwill', l: 'Goodwill' },
    { v: 'balance.asset.regulatory_noncurrent', l: 'Regulatory assets (noncurrent)' },
    { v: 'balance.asset.investments_noncurrent', l: 'Investments (noncurrent)' },
    { v: 'balance.asset.rou_operating', l: 'Right of use assets - operating leases' },
    { v: 'balance.asset.held_for_sale', l: 'Assets held for sale, net' },
    { v: 'balance.asset.prepaid_noncurrent', l: 'Prepaid assets (noncurrent)' },
    { v: 'balance.asset.contrib_rcv_noncurrent', l: 'Contribution receivable (noncurrent)' },
    { v: 'balance.asset.other_noncurrent', l: 'Other (Noncurrent assets)' },
  ],
  Liability: [
    { v: '', l: 'None' },
    { v: 'balance.liability.current.debt_current', l: 'Long-term debt due within one year' },
    { v: 'balance.liability.current.ap', l: 'Accounts payable' },
    { v: 'balance.liability.current.regulatory', l: 'Regulatory liabilities due within one year' },
    { v: 'balance.liability.current.taxes', l: 'Taxes payable' },
    { v: 'balance.liability.current.dividends', l: 'Dividends payable' },
    { v: 'balance.liability.current.accrued_compensation', l: 'Accrued compensation' },
    { v: 'balance.liability.current.lease_operating', l: 'Current portion of lease obligation - operations' },
    { v: 'balance.liability.current.retirement_benefits', l: 'Retirement benefits' },
    { v: 'balance.liability.current.other', l: 'Other current liabilities' },
    { v: 'balance.liability.noncurrent.long_term_debt', l: 'Long-term debt' },
    { v: 'balance.liability.noncurrent.lease_operating', l: 'Long-term lease obligations - operating' },
    { v: 'balance.liability.noncurrent.deferred_taxes', l: 'Deferred income taxes' },
    { v: 'balance.liability.noncurrent.regulatory', l: 'Regulatory liabilities' },
    { v: 'balance.liability.noncurrent.aro', l: 'Asset retirement obligations' },
    { v: 'balance.liability.noncurrent.other', l: 'Other Noncurrent liabilities' },
  ],
  Equity: [
    { v: '', l: 'None' },
    { v: 'balance.equity.net_assets', l: 'Net assets' },
  ],
  Revenue: [
    { v: '', l: 'None' },
    { v: 'activities.revenue.restr_endow', l: 'Restricted: Endowments' },
    { v: 'activities.revenue.restr_found', l: 'Restricted: Foundations' },
    { v: 'activities.revenue.restr_other', l: 'Restricted: Other' },
    { v: 'activities.revenue.unres_indiv', l: 'Unrestricted: Individuals' },
    { v: 'activities.revenue.unres_found', l: 'Unrestricted: Foundations/Trusts' },
    { v: 'activities.revenue.unres_org', l: 'Unrestricted: Organizations' },
    { v: 'activities.revenue.unres_other', l: 'Unrestricted: Other public support' },
    { v: 'activities.revenue.gov_federal', l: 'Federal Grants' },
    { v: 'activities.revenue.gov_state', l: 'State Grants' },
    { v: 'activities.revenue.program1', l: 'Program revenue: Program 1' },
    { v: 'activities.revenue.program2', l: 'Program revenue: Program 2' },
    { v: 'activities.revenue.program3', l: 'Program revenue: Program 3' },
    { v: 'activities.revenue.fees_services', l: 'Fees for services' },
    { v: 'activities.revenue.inventory', l: 'Inventory revenue' },
    { v: 'activities.revenue.investment_income', l: 'Investment income, net' },
    { v: 'activities.revenue.other_income', l: 'Other income' },
    { v: 'activities.revenue.special_events', l: 'Special Events' },
    { v: 'activities.revenue.legacies', l: 'Legacies and Bequests' },
  ],
  Expense: [
    { v: '', l: 'None' },
    { v: 'activities.exp.operational.salaries', l: 'Salaries and wages' },
    { v: 'activities.exp.operational.benefits', l: 'Employee benefits' },
    { v: 'activities.exp.operational.travel', l: 'Travel' },
    { v: 'activities.exp.operational.maintenance', l: 'Maintenance' },
    { v: 'activities.exp.operational.equipment_maint_rental', l: 'Equipment maintenance and rental' },
    { v: 'activities.exp.operational.supplies', l: 'Supplies and materials' },
    { v: 'activities.exp.operational.contracts', l: 'Contractual services' },
    { v: 'activities.exp.operational.assistance', l: 'Financial and material assistance' },
    { v: 'activities.exp.operational.depr', l: 'Depreciation and amortization' },
    { v: 'activities.exp.operational.rent', l: 'Rent' },
    { v: 'activities.exp.operational.other', l: 'Other Operational Expenses' },
    { v: 'activities.exp.program.prog1', l: 'Program 1 services (generic)' },
    { v: 'activities.exp.program.prog2', l: 'Program 2 services (generic)' },
    { v: 'activities.exp.program.prog3', l: 'Program 3 services (generic)' },
  ],
};

// Map FS category value -> anchor id on Financial Statements page
const FS_ANCHORS = {
  // Balance Sheet (classified/current assets/liabilities)
  'balance.asset.cash_current': 'fs-balance-asset-cash',
  'balance.asset.trade_receivables': 'fs-balance-asset-receivables',
  'balance.asset.other_current': 'fs-balance-asset-other-current',
  'balance.liability.current.ap': 'fs-balance-liability-ap',
   'balance.liability.current.lease_operating': 'fs-balance-liability-current-lease-operating',
  'balance.liability.current.other': 'fs-balance-liability-other',
  'balance.equity.net_assets': 'fs-balance-equity-net-assets',

  // Activities (revenues)
  'activities.revenue.restr_endow': 'fs-activities-restr-endow',
  'activities.revenue.restr_found': 'fs-activities-restr-found',
  'activities.revenue.restr_other': 'fs-activities-restr-other',
  'activities.revenue.unres_indiv': 'fs-activities-unres-indiv',
  'activities.revenue.unres_found': 'fs-activities-unres-found',
  'activities.revenue.unres_org': 'fs-activities-unres-org',
  'activities.revenue.unres_other': 'fs-activities-unres-other',
  'activities.revenue.gov_federal': 'fs-activities-gov-federal',
  'activities.revenue.gov_state': 'fs-activities-gov-state',
  'activities.revenue.fees_services': 'fs-activities-fees-services',
  'activities.revenue.inventory': 'fs-activities-inventory',
  'activities.revenue.investment_income': 'fs-activities-investment-income',
  'activities.revenue.other_income': 'fs-activities-other-income',
  'activities.revenue.special_events': 'fs-activities-events',
  'activities.revenue.legacies': 'fs-activities-legacies',
  'activities.revenue.program1': 'fs-activities-prog1',
  'activities.revenue.program2': 'fs-activities-prog2',
  'activities.revenue.program3': 'fs-activities-prog3',

  // Activities (expenses)
  'activities.exp.operational.salaries': 'fs-exp-ops-salary',
  'activities.exp.operational.benefits': 'fs-exp-ops-benefits',
  'activities.exp.operational.rent': 'fs-exp-ops-rent',
  'activities.exp.operational.other': 'fs-exp-ops-other',
  'activities.exp.program.prog1': 'fs-exp-prog1',
  'activities.exp.program.prog2': 'fs-exp-prog2',
  'activities.exp.program.prog3': 'fs-exp-prog3',
  // Legacy alias: treat old generic program mapping as Program 1
  'activities.exp.program.generic': 'fs-exp-prog1',
};

function fsLabelFor(value) {
  let v = value;
  // Legacy alias: show old generic program category as Program 1 services
  if (v === 'activities.exp.program.generic') v = 'activities.exp.program.prog1';
  for (const t of Object.keys(FS_OPTIONS)) {
    const hit = FS_OPTIONS[t].find(o => o.v === v);
    if (hit) return hit.l;
  }
  return value || '';
}

// Provide sensible defaults by account code if fsCategory is unset
function guessFsCategory(account) {
  if (account?.fsCategory) return account.fsCategory;
  const code = String(account?.code || '');
  const type = String(account?.type || '');
  // Common COA defaults
  if (code === '1000' || code === '1010') return 'balance.asset.cash_current';
  if (code === '1100' || code === '1200') return 'balance.asset.trade_receivables';
  if (code === '2000') return 'balance.liability.current.ap';
  if (code === '2100') return 'balance.liability.current.other';
  if (code === '3000' || code === '3100' || code === '3200') return 'balance.equity.net_assets';
  if (code === '4000' || code === '4100') return 'activities.revenue.unres_org';
  if (code === '4200') return 'activities.revenue.gov_state';
  if (code === '5000' || code === '6000') return 'activities.exp.operational.other';
  if (code === '5100') return 'activities.exp.program.prog1';
  if (code === '5200') return 'activities.exp.program.prog2';
  if (code === '5300') return 'activities.exp.program.prog3';
  if (code === '6100') return 'activities.exp.operational.salaries';
  if (code === '6200') return 'activities.exp.operational.benefits';
  if (code === '6300') return 'activities.exp.operational.rent';
  // Fallback by type
  if (type === 'Asset') return 'balance.asset.other_current';
  if (type === 'Liability') return 'balance.liability.current.other';
  if (type === 'Equity') return 'balance.equity.net_assets';
  if (type === 'Revenue') return 'activities.revenue.other_income';
  if (type === 'Expense') return 'activities.exp.operational.other';
  return '';
}

function fsLinkCell(account) {
  const cat = guessFsCategory(account);
  if (!cat) return '';
  const anchor = FS_ANCHORS[cat];
  const label = fsLabelFor(cat);
  if (anchor) {
    return `<a href="/html/financial-statements.html#${anchor}">${label}</a>`;
  }
  return label;
}

function refreshFsCategoryOptions() {
  const typeSel = document.querySelector('#create-gl-account-form select[name="type"]');
  const fsSel = document.querySelector('#create-gl-account-form select[name="fsCategory"]');
  if (!typeSel || !fsSel) return;
  const t = String(typeSel.value || 'Asset');
  const opts = FS_OPTIONS[t] || [{ v: '', l: 'None' }];
  fsSel.innerHTML = opts.map(o => `<option value="${o.v}">${o.l}</option>`).join('');
}const accountsBody = document.querySelector("[data-gl-accounts]");
const trialBody = document.querySelector("[data-trial-balance]");
const accountsSummary = document.getElementById("gl-account-summary");
const trialSummary = document.getElementById("trial-balance-summary");
let journalsBody = document.querySelector("[data-journal-entries]");
let journalsSummary = document.getElementById("journal-list-summary");
let journalFilters = document.getElementById("journal-filters");
const tbFilterForm = document.getElementById('tb-filters');
const tbAsOf = document.getElementById('tb-asof');
const tbFund = document.getElementById('tb-fund');
const tbClass = document.getElementById('tb-class');

const createAccountForm = document.getElementById("create-gl-account-form");
const glCreateMsg = document.getElementById("gl-create-message");
const journalForm = document.getElementById("create-journal-form");
const journalMsg = document.getElementById("journal-create-message");
const addLineBtn = document.getElementById("add-journal-line");
let glAccountOptions = [];

function approvalMessage(approval) {
  if (!approval?.required) return "";
  return ` Review required: ${approval.approver || "Approval not configured"}.`;
}

function renderAccountOptions(selectEl) {
  if (!selectEl) return;
  const current = selectEl.value;
  // Clean placeholder without any mojibake/extra characters
  selectEl.innerHTML = '<option value="">Select account</option>' +
    glAccountOptions.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');
  if (current) selectEl.value = current;
}

function renderAccounts(accounts) {
  if (!accountsBody) return;
  if (!accounts.length) {
    accountsBody.innerHTML = '<tr><td colspan="5">No GL accounts found.</td></tr>';
    if (accountsSummary) accountsSummary.textContent = "0 accounts";
    return;
  }
  accountsBody.innerHTML = accounts
    .map((account) => `
      <tr data-id="${account.id}" data-type="${account.type}" data-code="${account.code}" data-fs-category="${account.fsCategory || ''}">
        <td>${account.code}</td>
        <td>${account.name}</td>
        <td>${account.type}</td>
        <td data-cell="fs">${fsLinkCell(account)}</td>
        <td data-cell="actions">
          <button class="button secondary" data-action="edit-account" data-id="${account.id}">Edit</button>
          <button class="button secondary" data-action="del-account" data-id="${account.id}">Delete</button>
        </td>
      </tr>`)
    .join("");
  // Wire delete buttons
  accountsBody.querySelectorAll('button[data-action="del-account"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.getAttribute('data-id'));
      const ok = window.confirm('Delete this account? This cannot be undone.');
      if (!ok) return;
      try {
        await deleteGlAccount(id);
        showToast('Account deleted', 'ok');
        loadAccounts();
      } catch (err) {
        showToast(err.message || 'Unable to delete account', 'error');
        alert(err.message || 'Unable to delete account');
      }
    });
  });
  // Wire edit buttons
  accountsBody.querySelectorAll('button[data-action="edit-account"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('tr');
      if (!row) return;
      const id = Number(row.getAttribute('data-id'));
      const type = row.getAttribute('data-type') || 'Asset';
      const code = row.getAttribute('data-code') || '';
      const currentFs = row.getAttribute('data-fs-category') || guessFsCategory({ code, type });
      const fsCell = row.querySelector('td[data-cell="fs"]');
      const actionsCell = row.querySelector('td[data-cell="actions"]');
      if (!fsCell || !actionsCell) return;

      // Build select
      const sel = document.createElement('select');
      const opts = FS_OPTIONS[type] || [{ v: '', l: 'None' }];
      sel.innerHTML = opts.map(o => `<option value="${o.v}">${o.l}</option>`).join('');
      sel.value = currentFs || '';
      fsCell.innerHTML = '';
      fsCell.appendChild(sel);

      // Replace actions with Save/Cancel
      const originalActions = actionsCell.innerHTML;
      actionsCell.innerHTML = '';
      const saveBtn = document.createElement('button');
      saveBtn.className = 'button';
      saveBtn.textContent = 'Save';
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'button secondary';
      cancelBtn.textContent = 'Cancel';
      actionsCell.appendChild(saveBtn);
      actionsCell.appendChild(cancelBtn);

      const restore = () => {
        // Restore FS cell
        fsCell.innerHTML = fsLinkCell({ code, type, fsCategory: sel.value });
        // Restore actions
        actionsCell.innerHTML = originalActions;
        // Rewire listeners on restored buttons
        accountsBody.querySelectorAll('button[data-action="del-account"]').forEach(b => {
          b.addEventListener('click', async () => {
            const rid = Number(b.getAttribute('data-id'));
            const ok = window.confirm('Delete this account? This cannot be undone.');
            if (!ok) return;
            try { await deleteGlAccount(rid); showToast('Account deleted', 'ok'); loadAccounts(); } catch (err) { showToast(err.message || 'Unable to delete account', 'error'); alert(err.message || 'Unable to delete account'); }
          });
        });
        accountsBody.querySelectorAll('button[data-action="edit-account"]').forEach(b => {
          b.addEventListener('click', () => btn.click());
        });
      };

      cancelBtn.addEventListener('click', () => {
        fsCell.innerHTML = fsLinkCell({ code, type, fsCategory: currentFs });
        restore();
      });

      saveBtn.addEventListener('click', async () => {
        try {
          await updateGlAccount(id, { fsCategory: sel.value || null });
          showToast('Account updated', 'ok');
          // Sync row attribute for future edits
          row.setAttribute('data-fs-category', sel.value || '');
          restore();
        } catch (err) {
          showToast(err.message || 'Failed to update account', 'error');
        }
      });
    });
  });
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
          <td>${row.account_code} - ${row.account_name}</td>
          <td>${row.account_type}</td>
          <td style="text-align:right;">${formatter.format(row.total_debits || 0)}</td>
          <td style="text-align:right;">${formatter.format(row.total_credits || 0)}</td>
          <td style="text-align:right;">${formatter.format(row.balance || 0)}</td>
        </tr>`;
    })
    .join("");
  if (trialSummary) {
    trialSummary.textContent = `Debits ${formatter.format(totalDebits)} - Credits ${formatter.format(totalCredits)}`;
  }
}

function ensureJournalEntriesSection() {
  if (document.querySelector("[data-journal-entries]")) {
    journalsBody = document.querySelector("[data-journal-entries]");
    journalsSummary = document.getElementById("journal-list-summary");
    journalFilters = document.getElementById("journal-filters");
    return;
  }
  const main = document.querySelector("main.content");
  const trialCard = trialBody?.closest("section.card");
  if (!main || !trialCard) return;
  const section = document.createElement("section");
  section.className = "card";
  section.innerHTML = `
    <header style="display:flex;justify-content:space-between;align-items:center;gap:12px 8px;flex-wrap:wrap;">
      <div>
        <h2>Journal Entries</h2>
        <p class="page-subtitle" id="journal-list-summary">Loading journal entries...</p>
      </div>
      <form id="journal-filters" style="display:flex;gap:8px;align-items:end;flex-wrap:wrap;">
        <label style="display:flex;flex-direction:column;font-size:0.75rem;gap:4px;">
          <span>Search</span>
          <input type="search" name="search" placeholder="Entry or memo" />
        </label>
        <label style="display:flex;flex-direction:column;font-size:0.75rem;gap:4px;">
          <span>From</span>
          <input type="date" name="from" />
        </label>
        <label style="display:flex;flex-direction:column;font-size:0.75rem;gap:4px;">
          <span>To</span>
          <input type="date" name="to" />
        </label>
        <label style="display:flex;flex-direction:column;font-size:0.75rem;gap:4px;">
          <span>Source</span>
          <select name="source">
            <option value="">All sources</option>
            <option value="Manual">Manual</option>
            <option value="donations">Donations</option>
            <option value="invoices">Invoices</option>
            <option value="invoice_payments">AR payments</option>
            <option value="bills">Bills</option>
            <option value="bill_payments">AP payments</option>
            <option value="bank_deposits">Bank deposits</option>
          </select>
        </label>
        <label style="display:flex;flex-direction:column;font-size:0.75rem;gap:4px;">
          <span>Show</span>
          <select name="limit">
            <option value="25">25</option>
            <option value="50" selected>50</option>
            <option value="100">100</option>
            <option value="200">200</option>
          </select>
        </label>
        <button class="button secondary" type="submit">Apply</button>
      </form>
    </header>
    <div class="table-wrapper" style="overflow:auto;margin-top:16px;">
      <table class="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Entry</th>
            <th>Memo</th>
            <th>Source</th>
            <th style="text-align:right;">Debits</th>
            <th style="text-align:right;">Credits</th>
          </tr>
        </thead>
        <tbody data-journal-entries>
          <tr><td colspan="6">Sign in to view journal entries.</td></tr>
        </tbody>
      </table>
    </div>`;
  main.insertBefore(section, trialCard);
  journalsBody = section.querySelector("[data-journal-entries]");
  journalsSummary = section.querySelector("#journal-list-summary");
  journalFilters = section.querySelector("#journal-filters");
  journalFilters?.addEventListener("submit", (event) => {
    event.preventDefault();
    loadJournals();
  });
}

function renderJournals(entries) {
  if (!journalsBody) return;
  if (!entries.length) {
    journalsBody.innerHTML = '<tr><td colspan="6">No journal entries posted yet.</td></tr>';
    if (journalsSummary) journalsSummary.textContent = "0 journal entries";
    return;
  }
  const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  journalsBody.innerHTML = entries.map((entry) => {
    const journal = entry.journal || {};
    const lines = entry.lines || [];
    const debits = lines.reduce((sum, line) => sum + (line.drcr === "D" ? Number(line.amount || 0) : 0), 0);
    const credits = lines.reduce((sum, line) => sum + (line.drcr === "C" ? Number(line.amount || 0) : 0), 0);
    const source = lines.find((line) => line.source_table)?.source_table || "Manual";
    const entryNo = journal.number || journal.entry_no || `Journal ${journal.id}`;
    const date = journal.journal_date ? String(journal.journal_date).slice(0, 10) : "";
    return `
      <tr>
        <td>${date}</td>
        <td>${entryNo}</td>
        <td>${journal.memo || ""}</td>
        <td>${source}</td>
        <td style="text-align:right;">${formatter.format(debits)}</td>
        <td style="text-align:right;">${formatter.format(credits)}</td>
      </tr>`;
  }).join("");
  if (journalsSummary) {
    journalsSummary.textContent = `${entries.length} journal entr${entries.length === 1 ? "y" : "ies"}`;
  }
}

async function loadJournals() {
  ensureJournalEntriesSection();
  try {
    const params = {};
    if (journalFilters) {
      const form = new FormData(journalFilters);
      const source = String(form.get("source") || "");
      params.limit = Number(form.get("limit") || 50);
      if (form.get("search")) params.search = String(form.get("search")).trim();
      if (form.get("from")) params.from = form.get("from");
      if (form.get("to")) params.to = form.get("to");
      if (source) params.source = source;
    } else {
      params.limit = 50;
    }
    const { data } = await fetchJournals(params);
    renderJournals(data || []);
  } catch (error) {
    if (journalsBody) journalsBody.innerHTML = `<tr><td colspan="6">${error.message}</td></tr>`;
  }
}

async function loadAccounts() {
  try {
    const { data } = await fetchGlAccounts();
    renderAccounts(data);
    // Build options for journal account select(s)
    glAccountOptions = (data || []).map(a => ({ value: a.id, label: `${a.code} - ${a.name}` }));
    if (journalForm) {
      journalForm.querySelectorAll('select[name="glAccountId[]"]').forEach(sel => renderAccountOptions(sel));
    }
  } catch (error) {
    if (accountsBody) accountsBody.innerHTML = `<tr><td colspan="3">${error.message}</td></tr>`;
  }
}

async function loadTrialBalance() {
  try {
    const params = {};
    if (tbAsOf && tbAsOf.value) params.as_of = tbAsOf.value;
    if (tbFund && tbFund.value) params.fund_id = Number(tbFund.value);
    if (tbClass && tbClass.value) params.class_id = Number(tbClass.value);
    const { data } = await fetchTrialBalance(params);
    renderTrialBalance(data);
  } catch (error) {
    if (trialBody) trialBody.innerHTML = `<tr><td colspan="5">${error.message}</td></tr>`;
  }
}

function cloneJournalLine() {
  if (!journalForm) return;
  const grid = journalForm.querySelector("div[style*='grid-template-columns:repeat(6']");
  if (!grid) return;
  const rowLabels = Array.from(grid.querySelectorAll("label")).slice(0, 6);
  for (const lbl of rowLabels) {
    const clone = lbl.cloneNode(true);
    const input = clone.querySelector("input, select");
    if (input) {
      if (input.tagName === 'INPUT') input.value = '';
      if (input.tagName === 'SELECT') input.selectedIndex = 0;
    }
    grid.appendChild(clone);
  }
  // Re-render options for any new Account select
  grid.querySelectorAll('select[name="glAccountId[]"]').forEach(sel => {
    renderAccountOptions(sel);
  });
}

if (addLineBtn) {
  addLineBtn.addEventListener('click', () => cloneJournalLine());
}

if (createAccountForm) {
  // FS category options follow selected Type
  const typeSel = createAccountForm.querySelector('select[name="type"]');
  const fsSel = createAccountForm.querySelector('select[name="fsCategory"]');
  if (typeSel && fsSel) { typeSel.addEventListener('change', refreshFsCategoryOptions); refreshFsCategoryOptions(); }
  createAccountForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!window.__ERP_USER__) {
      if (glCreateMsg) { glCreateMsg.textContent = 'Sign in to create accounts.'; glCreateMsg.style.display = 'block'; glCreateMsg.style.color = 'var(--color-danger)'; }
      return;
    }
    const fd = new FormData(createAccountForm);
    const payload = {
      code: String(fd.get('code')||'').trim(),
      name: String(fd.get('name')||'').trim(),
      type: fd.get('type')||'Asset',
      description: String(fd.get('description')||'').trim() || null,
    };
    const fsCat = String(fd.get('fsCategory')||'').trim();
    if (fsCat) payload.fsCategory = fsCat;
    if (payload.type === 'Asset'){
      const bucket = fd.get('linkedRevenueBucket') || '';
      if (bucket) payload.linkedRevenueBucket = bucket;
    }
    try {
      await createGlAccount(payload);
      if (glCreateMsg) { glCreateMsg.textContent = 'Account created.'; glCreateMsg.style.display = 'block'; glCreateMsg.style.color = 'var(--color-success)'; }
      createAccountForm.reset();
      loadAccounts();
    } catch (err) {
      if (glCreateMsg) { glCreateMsg.textContent = err.message || 'Failed to create account'; glCreateMsg.style.display = 'block'; glCreateMsg.style.color = 'var(--color-danger)'; }
    }
  });
}

if (journalForm) {
  const dateInput = journalForm.querySelector("input[name='journalDate']");
  if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0,10);
  journalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!window.__ERP_USER__) {
      if (journalMsg) { journalMsg.textContent = 'Sign in to post journals.'; journalMsg.style.display = 'block'; journalMsg.style.color = 'var(--color-danger)'; }
      return;
    }
    const fd = new FormData(journalForm);
    const journalDate = fd.get('journalDate');
    const memo = fd.get('memo') || null;
    const glAccountIds = fd.getAll('glAccountId[]');
    const fundIds = fd.getAll('fundId[]');
    const amounts = fd.getAll('amount[]');
    const drcrs = fd.getAll('drcr[]');
    const lineMemos = fd.getAll('lineMemo[]');
    const lines = [];
    for (let i=0;i<glAccountIds.length;i++) {
      const ga = Number(glAccountIds[i]||0);
      const amt = Number(amounts[i]||0);
      const dc = (drcrs[i]||'').toString();
      if (!ga || !amt || (dc !== 'D' && dc !== 'C')) continue;
      lines.push({ glAccountId: ga, fundId: fundIds[i] ? Number(fundIds[i]) : null, amount: amt, drcr: dc, memo: lineMemos[i] || null });
    }
    if (lines.length < 2) {
      if (journalMsg) { journalMsg.textContent = 'Provide at least two balanced lines.'; journalMsg.style.display = 'block'; journalMsg.style.color = 'var(--color-danger)'; }
      return;
    }
    try {
      const result = await createJournal({ journalDate, memo, lines });
      const review = approvalMessage(result?.data?.approval);
      if (journalMsg) { journalMsg.textContent = `Journal posted.${review}`; journalMsg.style.display = 'block'; journalMsg.style.color = 'var(--color-success)'; }
      showToast(`Journal posted${review}`, 'ok');
      journalForm.reset(); if (dateInput) dateInput.value = new Date().toISOString().slice(0,10);
      loadJournals();
      loadTrialBalance();
    } catch (err) {
      if (journalMsg) { journalMsg.textContent = err.message || 'Failed to post journal'; journalMsg.style.display = 'block'; journalMsg.style.color = 'var(--color-danger)'; }
      showToast(err.message || 'Failed to post journal', 'error');
    }
  });
}

function init() {
  let started = false;
  const startOnce = () => { if (started) return; started = true; onReady(); };
  const onReady = async () => {
    // Inject Financial Overview card removed; keep section reorder only
    try {
      // Reorder sections: GL Account -> Chart of Accounts -> Enter Journal -> Trial Balance
      try {
        const main = document.querySelector('main.content');
        if (main) {
          const findCardBy = (selector) => {
            const el = document.querySelector(selector);
            return el ? el.closest('section.card') : null;
          };
          const glCreateCard = Array.from(main.querySelectorAll('section.card'))
            .find(sec => (sec.querySelector('h2')?.textContent || '').trim().toLowerCase() === 'create gl account');
          const chartCard = findCardBy('tbody[data-gl-accounts]');
          const journalCard = findCardBy('#create-journal-form');
          const tbCard = findCardBy('tbody[data-trial-balance]');
          // Anchor to first card on page
          const anchor = main.firstElementChild;
          // Ensure GL Create follows summary
          if (glCreateCard) {
            if (anchor && glCreateCard !== anchor.nextElementSibling) {
              main.insertBefore(glCreateCard, anchor ? anchor.nextElementSibling : null);
            }
          }
          // Ensure Chart of Accounts follows GL Create
          if (chartCard && glCreateCard) {
            if (chartCard !== glCreateCard.nextElementSibling) {
              main.insertBefore(chartCard, glCreateCard.nextElementSibling);
            }
          }
          // Ensure Enter Journal follows Chart of Accounts
          if (journalCard && (chartCard || glCreateCard)) {
            const afterNode = chartCard || glCreateCard;
            if (journalCard !== afterNode.nextElementSibling) {
              main.insertBefore(journalCard, afterNode.nextElementSibling);
            }
          }
          // Ensure Trial Balance follows Enter Journal
          if (tbCard && journalCard) {
            if (tbCard !== journalCard.nextElementSibling) {
              main.insertBefore(tbCard, journalCard.nextElementSibling);
            }
          }
        }
      } catch {}
      // Financial Overview removed; no data load
    } catch {}
    loadAccounts();
    ensureJournalEntriesSection();
    loadJournals();
    // init TB filters
    try {
      if (tbAsOf && !tbAsOf.value) tbAsOf.value = new Date().toISOString().slice(0,10);
      if (tbFund) {
        const funds = await fetchFunds();
        const opts = ['<option value="">All funds</option>']
          .concat((funds?.data||[]).map(f => `<option value="${f.id}">${f.code} - ${f.name}</option>`));
        tbFund.innerHTML = opts.join('');
      }
    } catch {}
    if (tbFilterForm) {
      tbFilterForm.addEventListener('submit', (e) => { e.preventDefault(); loadTrialBalance(); });
    }
    loadTrialBalance();
  };
  // Fire once ASAP, and also when auth becomes ready (covers race conditions)
  document.addEventListener("auth:ready", startOnce, { once: true });
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    startOnce();
  } else {
    document.addEventListener('DOMContentLoaded', startOnce, { once: true });
  }
}

init();
