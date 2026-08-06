import { request, postBillToGL, postApPaymentToGL } from "./api.js";
import { showToast } from "./ui.js";

// Minimal wrapper since api.js doesn't export AP helpers explicitly
function fetchBills(params) { return request('/ap/bills', { params }); }
function createBillApi(body) { return request('/ap/bills', { method: 'POST', body }); }
function applyBillPaymentApi(id, body) { return request(`/ap/bills/${id}/payments`, { method: 'POST', body }); }
function fetchApAging() { return request('/ap/aging'); }

const billsBody = document.querySelector('[data-bills]');
const billsSummary = document.getElementById('bills-summary');
const billForm = document.getElementById('bill-form');
const billMsg = document.getElementById('bill-form-msg');
const addBillLineBtn = document.getElementById('add-bill-line');
const apAgingBody = document.querySelector('[data-ap-aging]');

function approvalMessage(approval) {
  if (!approval?.required) return '';
  return ` Review required: ${approval.approver || 'Approval not configured'}.`;
}

function addLine() {
  if (!billForm) return;
  const grid = billForm.querySelector(".bill-lines-grid");
  if (!grid) return;
  const labels = Array.from(grid.querySelectorAll('label')).slice(0,4);
  for (const lbl of labels) {
    const clone = lbl.cloneNode(true);
    const input = clone.querySelector('input');
    if (input) input.value = '';
    grid.appendChild(clone);
  }
}
if (addBillLineBtn) addBillLineBtn.addEventListener('click', addLine);

function renderBills(list) {
  if (!billsBody) return;
  if (!list.length) { billsBody.innerHTML = '<tr><td colspan="7">No bills.</td></tr>'; if (billsSummary) billsSummary.textContent = '0 bills'; return; }
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  billsBody.innerHTML = list.map(b => {
    const date = b.bill_date ? String(b.bill_date).slice(0,10) : '';
    const payBtn = b.balance_amount > 0 ? `<button class="button secondary" data-pay="${b.id}">Pay $${(b.balance_amount).toFixed(2)}</button>` : '';
    return `<tr>
      <td>${b.bill_no}</td>
      <td>${date}</td>
      <td>${b.vendor_name || '-'}</td>
      <td>${b.status}</td>
      <td style="text-align:right;">${fmt.format(b.total_amount || 0)}</td>
      <td style="text-align:right;">${fmt.format(b.balance_amount || 0)}</td>
      <td>${payBtn}</td>
    </tr>`;
  }).join('');
  if (billsSummary) billsSummary.textContent = `${list.length} bill${list.length===1?'':'s'}`;
  billsBody.querySelectorAll('button[data-pay]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.getAttribute('data-pay'));
      const amount = prompt('Payment amount', '');
      if (!amount) return;
      try {
        const res = await applyBillPaymentApi(id, { paidAt: new Date().toISOString(), amount: Number(amount), method: 'Offline' });
        try { const p = await postApPaymentToGL(res.data?.payment_id || id); if (p?.data?.journalNumber) showToast(`Payment posted ${p.data.journalNumber}`,'ok'); } catch {}
        await loadBills(); await loadApAging();
        const jn = res?.data?.journal_number; if (jn) showToast(`Payment posted ${jn}${approvalMessage(res?.data?.approval)}`,'ok');
      } catch (e) { alert(e.message || 'Payment failed'); }
    });
  });
}

function renderApAging(list) {
  if (!apAgingBody) return;
  if (!list.length) { apAgingBody.innerHTML = '<tr><td colspan="6">No open bills.</td></tr>'; return; }
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  apAgingBody.innerHTML = list.map(r => `
    <tr>
      <td>${r.bill_no}</td>
      <td>${r.due_date ? String(r.due_date).slice(0,10) : ''}</td>
      <td style="text-align:right;">${fmt.format(r.bucket_0_30 || 0)}</td>
      <td style="text-align:right;">${fmt.format(r.bucket_31_60 || 0)}</td>
      <td style="text-align:right;">${fmt.format(r.bucket_61_90 || 0)}</td>
      <td style="text-align:right;">${fmt.format(r.bucket_90_plus || 0)}</td>
    </tr>
  `).join('');
}

async function loadBills() { try { const { data } = await fetchBills({ limit: 50 }); renderBills(data); } catch { if (billsBody) billsBody.innerHTML = '<tr><td colspan="7">Failed to load.</td></tr>'; } }
async function loadApAging() { try { const { data } = await fetchApAging(); renderApAging(data); } catch { if (apAgingBody) apAgingBody.innerHTML = '<tr><td colspan="6">Failed to load.</td></tr>'; } }

if (billForm) {
  const date = billForm.querySelector("input[name='billDate']");
  if (date && !date.value) date.value = new Date().toISOString().slice(0,10);
  billForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!window.__ERP_USER__) { if (billMsg) { billMsg.textContent='Sign in to create bills.'; billMsg.style.display='block'; billMsg.style.color='var(--color-danger)'; } return; }
    const fd = new FormData(billForm);
    const lines = [];
    const desc = fd.getAll('desc[]'); const qty = fd.getAll('qty[]'); const price = fd.getAll('price[]'); const exp = fd.getAll('expGl[]');
    for (let i=0;i<desc.length;i++) { const q=Number(qty[i]||0), p=Number(price[i]||0); if (q>0 && p>0) lines.push({ description: desc[i]||null, quantity: q, unitPrice: p, expenseGlAccountId: exp[i]?Number(exp[i]):null }); }
    if (!lines.length) { if (billMsg) { billMsg.textContent='Add at least one line.'; billMsg.style.display='block'; billMsg.style.color='var(--color-danger)'; } return; }
    const payload = { vendorAccountId: fd.get('vendorAccountId')?Number(fd.get('vendorAccountId')):null, billDate: fd.get('billDate'), dueDate: fd.get('dueDate')||null, memo: fd.get('memo')||null, lines };
    try { const res = await createBillApi(payload); const review = approvalMessage(res?.data?.approval); if (billMsg) { billMsg.textContent=`Bill created.${review}`; billMsg.style.display='block'; billMsg.style.color='var(--color-success)'; } try { const p=await postBillToGL(res?.data?.id); if (p?.data?.journalNumber) showToast(`Posted ${p.data.journalNumber}`,'ok'); } catch {} billForm.reset(); if (date) date.value = new Date().toISOString().slice(0,10); await loadBills(); await loadApAging(); }
    catch (e) { if (billMsg) { billMsg.textContent = e.message || 'Failed to create bill'; billMsg.style.display='block'; billMsg.style.color='var(--color-danger)'; } }
  });
}

function init() { const onReady = () => { loadBills(); loadApAging(); }; if (!window.__ERP_USER__) { document.addEventListener('auth:ready', onReady, { once: true }); } else { onReady(); } }

init();
