import { fetchFinancialOverview, fetchNonprofitStatement, fetchBalanceSheetDetailed } from './api.js';

function fmt(n) {
  const v = Number(n || 0);
  const f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(v));
  return v < 0 ? `(${f})` : f;
}

function setText(sel, val) {
  const el = document.querySelector(sel);
  if (el) el.textContent = fmt(val);
}

function prefillZeros() {
  try {
    document.querySelectorAll('*').forEach((node) => {
      const ds = node.dataset || {};
      // Any data-* that starts with fs / nps / bs2
      const hasKey = Object.keys(ds).some((k) => k.startsWith('fs') || k.startsWith('nps') || k.startsWith('bs2'));
      if (hasKey) node.textContent = fmt(0);
    });
  } catch {}
}

function showFsError(message) {
  try {
    const main = document.querySelector('main.content') || document.body;
    let el = document.getElementById('fs-error');
    if (!el) {
      el = document.createElement('div');
      el.id = 'fs-error';
      el.style.margin = '8px 0';
      el.style.padding = '8px 12px';
      el.style.border = '1px solid var(--color-danger)';
      el.style.color = 'var(--color-danger)';
      el.style.borderRadius = '6px';
      main.insertBefore(el, main.firstChild);
    }
    el.textContent = message;
  } catch {}
}

async function loadFinancialStatement() {
  // Prefill so no dashes linger
  prefillZeros();
  const today = new Date().toISOString().slice(0, 10);

  // Overview (Balance Sheet summary + Activities summary)
  try {
    const { data } = await fetchFinancialOverview({ as_of: today });
    const bs = data?.balanceSheet || {};
    const ac = data?.activities || {};

    setText('[data-fs-assets]', bs.assets);
    setText('[data-fs-liabilities]', bs.liabilities);
    setText('[data-fs-equity]', bs.equity);
    const checkEl = document.getElementById('fs-balance-check');
    if (checkEl) {
      const ok = Math.abs((bs.assets || 0) - ((bs.liabilities || 0) + (bs.equity || 0))) < 0.01;
      checkEl.textContent = ok ? 'Assets = Liabilities + Net Assets' : 'Warning: Balance sheet out of balance';
    }

    setText('[data-fs-donations]', ac.donations);
    setText('[data-fs-grants]', ac.grants);
    setText('[data-fs-services]', ac.programServices);
    setText('[data-fs-other]', ac.otherRevenue);
    const revenueTotal = (ac.donations || 0) + (ac.grants || 0) + (ac.programServices || 0) + (ac.otherRevenue || 0);
    setText('[data-fs-revenue-total]', revenueTotal);
    setText('[data-fs-expenses]', ac.expenses);
    setText('[data-fs-change]', ac.changeInNetAssets);
  } catch (e) {
    const status = e?.status || e?.response?.status;
    if (status === 401 || status === 403) showFsError('You do not have permission to view financial statements (finance.read required).');
    else showFsError('Could not load financial statements.');
  }

  // Detailed Balance Sheet (classified)
  try {
    const { data: bsd } = await fetchBalanceSheetDetailed({ as_of: today });
    const set = (sel, val) => { const el = document.querySelector(sel); if (el) el.textContent = fmt(val); };
    const setRaw = (sel, val) => { const el = document.querySelector(sel); if (el) el.textContent = val; };
    setRaw('[data-bs2-asof]', bsd?.asOf || today);
    // Current Assets
    set('[data-bs2-ca-cash]', bsd?.currentAssets?.cash);
    set('[data-bs2-ca-rcv]', bsd?.currentAssets?.receivables);
    set('[data-bs2-ca-reg]', bsd?.currentAssets?.regulatory);
    set('[data-bs2-ca-inv]', bsd?.currentAssets?.inventories);
    set('[data-bs2-ca-pre]', bsd?.currentAssets?.prepaymentsOther);
    set('[data-bs2-ca-disc]', bsd?.currentAssets?.discontinued);
    set('[data-bs2-ca-total]', bsd?.currentAssets?.total);
    // Noncurrent Assets
    set('[data-bs2-nc-ppe]', bsd?.noncurrentAssets?.ppe);
    set('[data-bs2-nc-accum]', bsd?.noncurrentAssets?.accumDepAmort);
    set('[data-bs2-nc-goodwill]', bsd?.noncurrentAssets?.goodwill);
    set('[data-bs2-nc-reg]', bsd?.noncurrentAssets?.regulatory);
    set('[data-bs2-nc-inv]', bsd?.noncurrentAssets?.investments);
    set('[data-bs2-nc-other]', bsd?.noncurrentAssets?.other);
    set('[data-bs2-nc-total]', bsd?.noncurrentAssets?.total);
    set('[data-bs2-total-assets]', bsd?.totalAssets);
    // Current Liabilities
    set('[data-bs2-cl-debtcur]', bsd?.currentLiabilities?.currentPortionDebt);
    set('[data-bs2-cl-ap]', bsd?.currentLiabilities?.accountsPayable);
    set('[data-bs2-cl-reg]', bsd?.currentLiabilities?.regulatory);
    set('[data-bs2-cl-tax]', bsd?.currentLiabilities?.taxesPayable);
    set('[data-bs2-cl-div]', bsd?.currentLiabilities?.dividendsPayable);
    set('[data-bs2-cl-comp]', bsd?.currentLiabilities?.accruedCompensation);
    set('[data-bs2-cl-other]', bsd?.currentLiabilities?.otherAccrued);
    set('[data-bs2-cl-total]', bsd?.currentLiabilities?.total);
    // Noncurrent Liabilities
    set('[data-bs2-nl-debt]', bsd?.noncurrentLiabilities?.longTermDebt);
    set('[data-bs2-nl-deftax]', bsd?.noncurrentLiabilities?.deferredTaxes);
    set('[data-bs2-nl-reg]', bsd?.noncurrentLiabilities?.regulatory);
    set('[data-bs2-nl-aro]', bsd?.noncurrentLiabilities?.assetRetirementObligations);
    set('[data-bs2-nl-other]', bsd?.noncurrentLiabilities?.other);
    set('[data-bs2-nl-total]', bsd?.noncurrentLiabilities?.total);
    set('[data-bs2-equity]', bsd?.equity);
    set('[data-bs2-tlse]', bsd?.totalLiabilitiesAndEquity);
  } catch (e) {
    console.warn('Detailed balance sheet failed', e);
  }

  // Nonprofit Statement (Statement of Activities)
  try {
    const { data } = await fetchNonprofitStatement({ as_of: today });
    const set = (sel, val) => { const el = document.querySelector(sel); if (el) el.textContent = fmt(val); };
    const r = data?.revenuesOfSupport || {};
    // Unrestricted breakdown
    set('[data-nps-unres-indiv]', r.unresIndiv);
    set('[data-nps-unres-found]', r.unresFound);
    set('[data-nps-unres-org]', r.unresOrg);
    set('[data-nps-other-public]', r.otherPublic);
    // Restricted breakdown
    const rb = r.restrictedBreakdown || {};
    set('[data-nps-restr-endow]', rb.endowments || 0);
    set('[data-nps-restr-found]', rb.foundations || 0);
    set('[data-nps-restr-other]', rb.other || 0);
    // Government support
    set('[data-nps-gov-grants]', r.govGrants);
    set('[data-nps-gov-grants-other]', r.govGrantsOther);
    // Other support lines
    set('[data-nps-events]', r.specialEvents);
    set('[data-nps-legacies]', r.legaciesBequests);
    set('[data-nps-fees-services]', r.feesServices);
    set('[data-nps-inventory-revenue]', r.inventoryRevenue);
    set('[data-nps-invest-income]', r.investmentIncome);
    set('[data-nps-other-income]', r.otherIncome);

    // Totals with fallbacks
    const totalPublic = (r.totalPublicSupport == null)
      ? ((r.unresIndiv || 0) + (r.unresFound || 0) + (r.unresOrg || 0) + (r.otherPublic || 0) + (rb.endowments || 0) + (rb.foundations || 0) + (rb.other || 0))
      : r.totalPublicSupport;
    const totalGov = (r.totalGovernmentSupport == null)
      ? ((r.govGrants || 0) + (r.govGrantsOther || 0))
      : r.totalGovernmentSupport;
    const totalOther = (r.totalOtherSupport == null)
      ? ((r.specialEvents || 0) + (r.legaciesBequests || 0) + (r.feesServices || 0) + (r.inventoryRevenue || 0) + (r.investmentIncome || 0) + (r.otherIncome || 0))
      : r.totalOtherSupport;
    const totalSupport = (r.totalSupport == null) ? (totalPublic + totalGov + totalOther) : r.totalSupport;
    const totalRevOther = (r.totalRevenueAndOtherSupport == null) ? totalSupport : r.totalRevenueAndOtherSupport;

    set('[data-nps-total-public]', totalPublic);
    set('[data-nps-total-gov]', totalGov);
    set('[data-nps-total-other]', totalOther);
    set('[data-nps-total-support]', totalSupport);
    set('[data-nps-total-revenue-support]', totalRevOther);

    // Expenses
    const e = data?.expenses || {};
    const totalExpenses = (e.totalExpenses == null)
      ? ((e.programServices || 0) + (e.mgmtAdmin || 0) + (e.fundraising || 0) + (e.otherSupportSvcs || 0))
      : e.totalExpenses;
    // Program services by program (1/2/3) with explicit, older-browser-safe fallback
    let prog1 = 0;
    if (typeof e.program1 === 'number') prog1 = e.program1;
    else if (typeof e.programServices === 'number') prog1 = e.programServices;
    const prog2 = (typeof e.program2 === 'number') ? e.program2 : 0;
    const prog3 = (typeof e.program3 === 'number') ? e.program3 : 0;
    set('[data-nps-exp-prog1]', prog1);
    set('[data-nps-exp-prog2]', prog2);
    set('[data-nps-exp-prog3]', prog3);
    // Still expose functional breakdown totals
    set('[data-nps-exp-mgmt]', e.mgmtAdmin);
    set('[data-nps-exp-fundraising]', e.fundraising);
    set('[data-nps-exp-other]', e.otherSupportSvcs);
    set('[data-nps-exp-total]', totalExpenses);

    // Changes
    const changeOps = (data.changeFromOperations == null) ? (totalRevOther - totalExpenses) : data.changeFromOperations;
    const changeNet = (data.changeInNetAssets == null) ? (changeOps + (data.realizedGains || 0)) : data.changeInNetAssets;
    set('[data-nps-change-ops]', changeOps);
    set('[data-nps-realized-gains]', data.realizedGains);
    set('[data-nps-change]', changeNet);

    // Net assets
    const na = data?.netAssets || {};
    set('[data-nps-na-begin]', na.beginningOfYear);
    set('[data-nps-na-ytd]', na.ytd);
    set('[data-nps-na-ttm]', na.trailingTwelveMonths);
    set('[data-nps-na-end]', na.endOfYear);
  } catch (e) {
    console.warn('Nonprofit statement failed', e);
    const status = e?.status || e?.response?.status;
    if (status === 401 || status === 403) showFsError('You do not have permission to view the Statement of Activities (finance.read required).');
  }

  // Anchor highlighting
  handleAnchorLink();
}

prefillZeros();

function init() {
  const onReady = () => loadFinancialStatement();
  if (!window.__ERP_USER__) {
    document.addEventListener('auth:ready', onReady, { once: true });
  } else {
    onReady();
  }
}

init();

function handleAnchorLink() {
  const hash = (location.hash || '').replace('#', '');
  if (!hash) return;
  const targetMap = {
    'fs-balance-asset-cash': '[data-bs2-ca-cash]',
    'fs-balance-asset-receivables': '[data-bs2-ca-rcv]',
    'fs-balance-asset-other-current': '[data-bs2-ca-other]',
    'fs-balance-liability-current-lease-operating': '[data-bs2-cl-lease-operating]',
    'fs-balance-liability-ap': '[data-bs2-cl-ap]',
    'fs-balance-liability-other': '[data-bs2-cl-other]',
    'fs-balance-equity-net-assets': '[data-bs2-equity]',
    'fs-activities-restr-endow': '[data-nps-restr-endow]',
    'fs-activities-restr-found': '[data-nps-restr-found]',
    'fs-activities-restr-other': '[data-nps-restr-other]',
    'fs-activities-unres-indiv': '[data-nps-unres-indiv]',
    'fs-activities-unres-found': '[data-nps-unres-found]',
    'fs-activities-unres-org': '[data-nps-unres-org]',
    'fs-activities-unres-other': '[data-nps-other-public]',
    'fs-activities-gov-federal': '[data-nps-gov-grants]',
    'fs-activities-gov-state': '[data-nps-gov-grants-other]',
    'fs-activities-fees-services': '[data-nps-fees-services]',
    'fs-activities-inventory': '[data-nps-inventory-revenue]',
    'fs-activities-investment-income': '[data-nps-invest-income]',
    'fs-activities-other-income': '[data-nps-other-income]',
    'fs-activities-events': '[data-nps-events]',
    'fs-activities-legacies': '[data-nps-legacies]',
    'fs-activities-prog1': '[data-nps-prog1]',
    'fs-activities-prog2': '[data-nps-prog2]',
    'fs-activities-prog3': '[data-nps-prog3]',
    'fs-exp-ops-salary': '[data-nps-exp-ops-salary]',
    'fs-exp-ops-benefits': '[data-nps-exp-ops-benefits]',
    'fs-exp-ops-rent': '[data-nps-exp-ops-rent]',
    'fs-exp-ops-other': '[data-nps-exp-ops-other]',
    'fs-exp-prog1': '[data-nps-exp-prog1]',
    'fs-exp-prog2': '[data-nps-exp-prog2]',
    'fs-exp-prog3': '[data-nps-exp-prog3]',
  };
  const sel = targetMap[hash];
  if (!sel) return;
  const el = document.querySelector(sel);
  if (!el) return;
  try {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const tr = el.closest('tr');
    if (tr) {
      const oldBg = tr.style.backgroundColor;
      tr.style.backgroundColor = 'var(--color-highlight, #fffbcc)';
      setTimeout(() => { tr.style.backgroundColor = oldBg; }, 2000);
    }
  } catch {}
}

window.addEventListener('hashchange', handleAnchorLink);
