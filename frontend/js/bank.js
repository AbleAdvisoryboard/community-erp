import { request } from './api.js';
import { showToast } from './ui.js';

const body = document.querySelector('[data-undeposited]');
const summary = document.getElementById('undeposited-summary');
const selectAll = document.getElementById('select-all');
const acctSelect = document.getElementById('bank-account');
const dateInput = document.getElementById('deposit-date');
const memoInput = document.getElementById('deposit-memo');
const form = document.getElementById('deposit-form');
let depositMessage = document.getElementById('deposit-form-message');

async function fetchUndeposited() {
  return request('/bank/undeposited');
}
async function fetchBankAccounts() {
  return request('/bank/accounts');
}
async function createDeposit(body) {
  return request('/bank/deposits', { method: 'POST', body });
}

function approvalMessage(approval) {
  if (!approval?.required) return '';
  return ` Review required: ${approval.approver || 'Approval not configured'}.`;
}

function ensureDepositMessage() {
  if (depositMessage || !form) return;
  depositMessage = document.createElement('p');
  depositMessage.id = 'deposit-form-message';
  depositMessage.className = 'page-subtitle';
  depositMessage.style.display = 'none';
  depositMessage.style.margin = '10px 0 0';
  form.insertAdjacentElement('afterend', depositMessage);
}

function setDepositMessage(message, isError = false) {
  ensureDepositMessage();
  if (!depositMessage) return;
  depositMessage.textContent = message;
  depositMessage.style.display = message ? 'block' : 'none';
  depositMessage.style.color = isError ? 'var(--color-danger)' : 'var(--color-muted)';
}

function renderRows(rows) {
  if (!body) return;
  if (!rows.length) { body.innerHTML = '<tr><td colspan="6">No undeposited payments.</td></tr>'; if (summary) summary.textContent = '0 payments'; setDepositMessage('No undeposited payments are available to deposit.'); return; }
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  body.innerHTML = rows.map(p => `
    <tr>
      <td><input type="checkbox" data-id="${p.id}" /></td>
      <td>${p.id}</td>
      <td>${p.invoice_no}</td>
      <td>${p.received_at ? String(p.received_at).slice(0,10) : ''}</td>
      <td>${p.method || ''}</td>
      <td style="text-align:right;">${fmt.format(p.amount || 0)}</td>
    </tr>
  `).join('');
  if (summary) summary.textContent = `${rows.length} payment${rows.length===1?'':'s'} available. Check one or more payments, then create the deposit.`;
  setDepositMessage('Check one or more undeposited payments before creating a deposit.');
}

async function load() {
  try {
    const [undep, accts] = await Promise.all([fetchUndeposited(), fetchBankAccounts()]);
    renderRows(undep.data || []);
    if (acctSelect) {
      const opts = (accts.data || []).map(a => `<option value="${a.gl_account_id}">${a.name} (${a.gl_code || ''})</option>`);
      acctSelect.innerHTML = opts.join('');
    }
    if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0,10);
  } catch (e) {
    if (body) body.innerHTML = `<tr><td colspan="6">${e.message}</td></tr>`;
  }
}

if (selectAll && body) {
  selectAll.addEventListener('change', () => {
    body.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = selectAll.checked; });
  });
}

if (form) {
  ensureDepositMessage();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ids = Array.from(body.querySelectorAll('input[type="checkbox"]:checked')).map(cb => Number(cb.getAttribute('data-id')));
    if (!ids.length) {
      setDepositMessage('Select at least one undeposited payment first.', true);
      showToast('Select at least one payment','error');
      return;
    }
    try {
      const payload = { bankAccountId: Number(acctSelect.value), depositDate: dateInput.value, paymentIds: ids };
      const memo = memoInput ? String(memoInput.value || '').trim() : '';
      if (memo) payload.memo = memo;
      const res = await createDeposit(payload);
      const message = `Deposit created ${res?.data?.journalNumber || ''}${approvalMessage(res?.data?.approval)}`;
      setDepositMessage(message);
      showToast(message,'ok');
      await load();
    } catch (err) {
      setDepositMessage(err.message || 'Failed to create deposit', true);
      showToast(err.message || 'Failed to create deposit','error');
    }
  });
}

function init() {
  const onReady = () => load();
  if (!window.__ERP_USER__) document.addEventListener('auth:ready', onReady, { once: true }); else onReady();
}

init();
