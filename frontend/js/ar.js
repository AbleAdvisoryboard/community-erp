import { fetchInvoices, createInvoice, applyInvoicePayment, fetchArAging, postInvoiceToGL, postArPaymentToGL, fetchAccounts, fetchContacts, fetchGlAccounts } from "./api.js";
import { showToast } from "./ui.js";

const invBody = document.querySelector('[data-invoices]');
const invSummary = document.getElementById('invoices-summary');
const invForm = document.getElementById('invoice-form');
const invMsg = document.getElementById('invoice-form-msg');
const addLineBtn = document.getElementById('add-inv-line');
const agingBody = document.querySelector('[data-aging]');
const accountSelect = document.getElementById('invoice-account');
const contactSelect = document.getElementById('invoice-contact');
const filtersForm = document.getElementById('invoice-filters');
const filterAccountSelect = document.getElementById('filter-invoice-account');
const filterShowPaid = document.getElementById('filter-show-paid');

const arState = {
  revenueAccounts: [],
  accounts: [],
  contacts: [],
  filters: {},
};

function approvalMessage(approval) {
  if (!approval?.required) return '';
  return ` Review required: ${approval.approver || 'Approval not configured'}.`;
}

function addLine() {
  if (!invForm) return;
  const grid = invForm.querySelector(".invoice-lines-grid");
  if (!grid) return;
  const labels = Array.from(grid.querySelectorAll('label')).slice(0,4);
  for (const lbl of labels) {
    const clone = lbl.cloneNode(true);
    const input = clone.querySelector('input');
    if (input) input.value = '';
    const revSel = clone.querySelector("select[name='revGl[]']");
    if (revSel) revSel.selectedIndex = 0;
    grid.appendChild(clone);
  }
  populateRevenueSelects();
}

// Wire add-line button
if (addLineBtn) addLineBtn.addEventListener('click', addLine);

function renderInvoices(list) {
  if (!invBody) return;
  if (!list.length) {
    invBody.innerHTML = '<tr><td colspan="7">No invoices.</td></tr>';
    if (invSummary) invSummary.textContent = '0 invoices';
    return;
  }
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  invBody.innerHTML = list.map(inv => {
    const date = inv.invoice_date ? String(inv.invoice_date).slice(0,10) : '';
    const payBtn = inv.balance_amount > 0 ? `<button class="button secondary" data-pay="${inv.id}">Pay $${(inv.balance_amount).toFixed(2)}</button>` : '';
    return `<tr>
      <td>${inv.invoice_no}</td>
      <td>${date}</td>
      <td>${inv.account_name || '-'}</td>
      <td>${inv.status}</td>
      <td style="text-align:right;">${fmt.format(inv.total_amount || 0)}</td>
      <td style="text-align:right;">${fmt.format(inv.balance_amount || 0)}</td>
      <td>${payBtn}</td>
    </tr>`;
  }).join('');
  if (invSummary) invSummary.textContent = `${list.length} invoice${list.length===1?'':'s'}`;

  invBody.querySelectorAll('button[data-pay]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.getAttribute('data-pay'));
      const amount = prompt('Payment amount', '');
      if (!amount) return;
      try {
        const res = await applyInvoicePayment(id, { receivedAt: new Date().toISOString(), amount: Number(amount), method: 'Offline' });
        try { const p = await postArPaymentToGL(res.data?.payment_id || id); if (p?.data?.journalNumber) showToast(`Payment posted ${p.data.journalNumber}`,'ok'); } catch {}
        await loadInvoices();
        await loadAging();
        const jn = res?.data?.journal_number; if (jn) showToast(`Payment posted ${jn}${approvalMessage(res?.data?.approval)}`,'ok');
      } catch (e) {
        showToast(e.message || 'Payment failed', 'error');
      }
    })
  });
}


function renderAging(list) {
  if (!agingBody) return;
  if (!list.length) { agingBody.innerHTML = '<tr><td colspan="6">No open invoices.</td></tr>'; return; }
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  agingBody.innerHTML = list.map(r => `
    <tr>
      <td>${r.invoice_no}</td>
      <td>${r.due_date ? String(r.due_date).slice(0,10) : ''}</td>
      <td style="text-align:right;">${fmt.format(r.bucket_0_30 || 0)}</td>
      <td style="text-align:right;">${fmt.format(r.bucket_31_60 || 0)}</td>
      <td style="text-align:right;">${fmt.format(r.bucket_61_90 || 0)}</td>
      <td style="text-align:right;">${fmt.format(r.bucket_90_plus || 0)}</td>
    </tr>
  `).join('');
}

async function loadInvoices() {
  try {
    const params = { limit: 50 };
    const f = arState.filters || {};
    if (f.from) params.from = f.from;
    if (f.to) params.to = f.to;
    if (f.accountId) params.accountId = f.accountId;
    if (!f.showPaid) params.status = 'Posted';
    const { data } = await fetchInvoices(params);
    renderInvoices(data);
  } catch (_) { if (invBody) invBody.innerHTML = '<tr><td colspan="7">Failed to load</td></tr>'; }
}
async function loadAging() {
  try { const { data } = await fetchArAging(); renderAging(data); } catch (_) { if (agingBody) agingBody.innerHTML = '<tr><td colspan="6">Failed to load</td></tr>'; }
}

function renderAccountOptions() {
  if (!accountSelect) return;
  const options = ['<option value="">Select account</option>'];
  for (const acc of arState.accounts) {
    options.push(`<option value="${acc.id}">${acc.displayName || acc.name}</option>`);
  }
  accountSelect.innerHTML = options.join("");
  if (filterAccountSelect) {
    const fopts = ['<option value="">All accounts</option>'];
    for (const acc of arState.accounts) {
      fopts.push(`<option value="${acc.id}">${acc.displayName || acc.name}</option>`);
    }
    filterAccountSelect.innerHTML = fopts.join("");
  }
}

function renderContactOptions() {
  if (!contactSelect) return;
  const selectedAccountId = accountSelect && accountSelect.value ? Number(accountSelect.value) : null;
  const options = ['<option value="">Select contact</option>'];
  const list = Array.isArray(arState.contacts) ? arState.contacts : [];
  for (const c of list) {
    if (selectedAccountId && c.accountId && Number(c.accountId) !== selectedAccountId) continue;
    const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.preferredName || c.email || 'Unknown';
    options.push(`<option value="${c.id}">${name}</option>`);
  }
  contactSelect.innerHTML = options.join("");
}

async function loadAccountsAndContacts() {
  try {
    const [accRes, conRes] = await Promise.all([
      fetchAccounts({ limit: 1000 }),
      fetchContacts({ limit: 1000 }),
    ]);
    arState.accounts = Array.isArray(accRes?.data) ? accRes.data : [];
    arState.contacts = Array.isArray(conRes?.data) ? conRes.data : [];
    renderAccountOptions();
    renderContactOptions();
  } catch (_e) {
    // Leave selects empty on failure
    renderAccountOptions();
    renderContactOptions();
  }
}

if (invForm) {
  const date = invForm.querySelector("input[name='invoiceDate']");
  if (date && !date.value) date.value = new Date().toISOString().slice(0,10);
  if (accountSelect) accountSelect.addEventListener('change', renderContactOptions);
  invForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!window.__ERP_USER__) { if (invMsg) { invMsg.textContent = 'Sign in to create invoices.'; invMsg.style.display='block'; invMsg.style.color='var(--color-danger)'; } return; }
    const fd = new FormData(invForm);
    const lines = [];
    const desc = fd.getAll('desc[]');
    const qty = fd.getAll('qty[]');
    const price = fd.getAll('price[]');
    const rev = fd.getAll('revGl[]');
    for (let i=0;i<desc.length;i++) {
      const q = Number(qty[i]||0), p = Number(price[i]||0);
      if (q>0 && p>0) lines.push({ description: desc[i]||null, quantity: q, unitPrice: p, revenueGlAccountId: rev[i]?Number(rev[i]):null });
    }
    if (!lines.length) { if (invMsg) { invMsg.textContent = 'Add at least one line.'; invMsg.style.display='block'; invMsg.style.color='var(--color-danger)'; } return; }
    const payload = {
      accountId: fd.get('accountId')?Number(fd.get('accountId')):null,
      contactId: fd.get('contactId')?Number(fd.get('contactId')):null,
      invoiceDate: fd.get('invoiceDate'),
      dueDate: fd.get('dueDate')||null,
      memo: fd.get('memo')||null,
      lines,
    };
    try {
      const res = await createInvoice(payload);
      const review = approvalMessage(res?.data?.approval);
      if (invMsg) { invMsg.textContent = `Invoice created.${review}`; invMsg.style.display='block'; invMsg.style.color='var(--color-success)'; }
      const jn = res?.data?.journal_number; if (jn) showToast(`Posted ${jn}`,'ok');
      // Also call explicit post-to-GL for idempotency and to retrieve journal number if not returned
      try { const postRes = await postInvoiceToGL(res?.data?.id); if (postRes?.data?.journalNumber) showToast(`Posted ${postRes.data.journalNumber}`,'ok'); } catch {}
      invForm.reset(); if (date) date.value = new Date().toISOString().slice(0,10);
      await loadInvoices(); await loadAging();
    } catch (e) {
      if (invMsg) { invMsg.textContent = e.message || 'Failed to create invoice'; invMsg.style.display='block'; invMsg.style.color='var(--color-danger)'; }
      showToast(e.message || 'Failed to create invoice','error');
    }
  });
}

function init() {
  const onReady = () => { loadInvoices(); loadAging(); loadAccountsAndContacts(); loadRevenueAccounts(); };
  if (!window.__ERP_USER__) { document.addEventListener('auth:ready', onReady, { once: true }); } else { onReady(); }

  if (filtersForm) {
    if (filterShowPaid) filterShowPaid.checked = false;
    filtersForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(filtersForm);
      arState.filters = {
        from: fd.get('from') || undefined,
        to: fd.get('to') || undefined,
        accountId: fd.get('accountId') ? Number(fd.get('accountId')) : undefined,
        showPaid: fd.get('showPaid') === 'on',
      };
      loadInvoices();
    });
  }
}

init();
function populateRevenueSelects() {
  const selects = document.querySelectorAll("select[name='revGl[]']");
  const opts = ['<option value="">Select revenue account</option>']
    .concat((arState.revenueAccounts || []).map(a => `<option value="${a.id}">${a.code} - ${a.name}</option>`));
  selects.forEach((sel) => {
    const current = sel.value;
    sel.innerHTML = opts.join('');
    if (current) sel.value = current;
  });
}

async function loadRevenueAccounts() {
  try {
    const { data } = await fetchGlAccounts();
    arState.revenueAccounts = (data || []).filter(a => a.type === 'Revenue');
    populateRevenueSelects();
  } catch (_) {
    arState.revenueAccounts = [];
    populateRevenueSelects();
  }
}
