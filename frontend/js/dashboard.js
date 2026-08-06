import { fetchDashboardSnapshot } from "./api.js";

const dashboardSection = document.querySelector("[data-dashboard-section]");
const loadingMessage = document.querySelector("[data-dashboard-loading]");
const errorMessage = document.querySelector("[data-dashboard-error]");

const els = {
  fundraisingMtd: document.querySelector("[data-kpi='fundraising-mtd']"),
  fundraisingMtdCount: document.querySelector("[data-kpi='fundraising-mtd-count']"),
  fundraisingYtd: document.querySelector("[data-kpi='fundraising-ytd']"),
  fundraisingYtdCount: document.querySelector("[data-kpi='fundraising-ytd-count']"),
  fundraisingAverage: document.querySelector("[data-kpi='fundraising-average']"),
  fundraisingDonors: document.querySelector("[data-kpi='fundraising-donors']"),
  fundraisingTopName: document.querySelector("[data-kpi='fundraising-top-name']"),
  fundraisingTopTotal: document.querySelector("[data-kpi='fundraising-top-total']"),
  financeCash: document.querySelector("[data-kpi='finance-cash']"),
  financeLiabilities: document.querySelector("[data-kpi='finance-liabilities']"),
  financeNet: document.querySelector("[data-kpi='finance-net']"),
  financeOperating: document.querySelector("[data-kpi='finance-operating']"),
  financeRevenue: document.querySelector("[data-kpi='finance-revenue']"),
  volunteersHoursMtd: document.querySelector("[data-kpi='volunteers-hours-mtd']"),
  volunteersHoursYtd: document.querySelector("[data-kpi='volunteers-hours-ytd']"),
  volunteersUpcoming: document.querySelector("[data-kpi='volunteers-upcoming']"),
  volunteersActive: document.querySelector("[data-kpi='volunteers-active']"),
  eventsUpcoming: document.querySelector("[data-kpi='events-upcoming']"),
  eventsRegistrations: document.querySelector("[data-kpi='events-registrations']"),
  eventsNextName: document.querySelector("[data-kpi='events-next-name']"),
  eventsNextDate: document.querySelector("[data-kpi='events-next-date']"),
};

function formatCurrency(amount) {
  return Number(amount || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatHours(value) {
  return `${formatNumber(value)} hrs`;
}

function formatDateTime(iso) {
  if (!iso) return "TBD";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "TBD";
  return dt.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function setText(el, text) {
  if (!el) return;
  el.textContent = text;
}

function showSection() {
  if (dashboardSection) {
    dashboardSection.style.display = "block";
  }
}

function setLoading(isLoading) {
  if (loadingMessage) {
    loadingMessage.style.display = isLoading ? "block" : "none";
  }
}

function setError(message) {
  if (!errorMessage) return;
  if (message) {
    errorMessage.textContent = message;
    errorMessage.style.display = "block";
  } else {
    errorMessage.textContent = "";
    errorMessage.style.display = "none";
  }
}

function renderSnapshot(snapshot) {
  const fundraising = snapshot?.fundraising ?? {};
  const finance = snapshot?.finance ?? {};
  const volunteers = snapshot?.volunteers ?? {};
  const events = snapshot?.events ?? {};

  setText(els.fundraisingMtd, formatCurrency(fundraising.monthToDate?.total));
  setText(els.fundraisingMtdCount, `${formatNumber(fundraising.monthToDate?.count)} gifts`);
  setText(els.fundraisingYtd, formatCurrency(fundraising.yearToDate?.total));
  setText(els.fundraisingYtdCount, `${formatNumber(fundraising.yearToDate?.count)} gifts`);
  setText(els.fundraisingDonors, `${formatNumber(fundraising.donorsYtd || 0)} donors YTD`);
  setText(els.fundraisingAverage, formatCurrency(fundraising.averageGiftYtd));

  if (fundraising.topCampaign) {
    setText(els.fundraisingTopName, fundraising.topCampaign.name);
    setText(els.fundraisingTopTotal, formatCurrency(fundraising.topCampaign.total));
  } else {
    setText(els.fundraisingTopName, "No campaign data");
    setText(els.fundraisingTopTotal, formatCurrency(0));
  }

  setText(els.financeCash, formatCurrency(finance.cashOnHand));
  setText(els.financeLiabilities, formatCurrency(finance.liabilities));
  setText(els.financeNet, formatCurrency(finance.netAssets));
  setText(els.financeOperating, formatCurrency(finance.operatingResult));
  setText(els.financeRevenue, `${formatCurrency(finance.revenueYtd || 0)} revenue / ${formatCurrency(finance.expensesYtd || 0)} expenses`);

  setText(els.volunteersHoursMtd, formatHours(volunteers.hoursThisMonth));
  setText(els.volunteersHoursYtd, formatHours(volunteers.hoursThisYear));
  setText(els.volunteersUpcoming, formatNumber(volunteers.upcomingShifts));
  setText(els.volunteersActive, `${formatNumber(volunteers.activeVolunteers)} active`);

  setText(els.eventsUpcoming, formatNumber(events.upcomingEvents));
  setText(els.eventsRegistrations, `${formatNumber(events.registrations)} attendees`);
  if (events.nextEvent) {
    setText(els.eventsNextName, events.nextEvent.name);
    const when = `${formatDateTime(events.nextEvent.startAt)}${events.nextEvent.venue ? ` — ${events.nextEvent.venue}` : ""}`;
    setText(els.eventsNextDate, when);
  } else {
    setText(els.eventsNextName, "No upcoming events");
    setText(els.eventsNextDate, "");
  }
}

async function loadDashboard() {
  if (!window.__ERP_USER__) return;
  try {
    setLoading(true);
    setError("");
    const { data } = await fetchDashboardSnapshot();
    renderSnapshot(data);
    showSection();
  } catch (error) {
    console.error("Dashboard load failed", error);
    setError(error?.message || "Unable to load dashboard metrics.");
  } finally {
    setLoading(false);
  }
}

if (window.__ERP_USER__) {
  loadDashboard();
}

document.addEventListener("auth:ready", () => {
  loadDashboard();
});
