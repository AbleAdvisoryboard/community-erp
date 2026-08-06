import { getDb } from "../db/connection.js";

function numberOrZero(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function getDashboardSnapshot() {
  const db = getDb();

  const fundraisingRow = db.prepare(
    `SELECT
        SUM(CASE WHEN donated_at >= date('now','start of month') THEN amount ELSE 0 END) AS mtd_total,
        SUM(CASE WHEN donated_at >= date('now','start of month') THEN 1 ELSE 0 END) AS mtd_count,
        SUM(CASE WHEN strftime('%Y', donated_at) = strftime('%Y','now') THEN amount ELSE 0 END) AS ytd_total,
        SUM(CASE WHEN strftime('%Y', donated_at) = strftime('%Y','now') THEN 1 ELSE 0 END) AS ytd_count,
        COUNT(DISTINCT CASE WHEN strftime('%Y', donated_at) = strftime('%Y','now') THEN COALESCE(contact_id, account_id) END) AS donors_ytd
      FROM donations
     WHERE COALESCE(status, 'Posted') != 'Refunded'`
  ).get();

  const topCampaign = db.prepare(
    `SELECT camp.name AS name, SUM(d.amount) AS total
       FROM donations d
       INNER JOIN campaigns camp ON camp.id = d.campaign_id
      WHERE strftime('%Y', d.donated_at) = strftime('%Y','now')
      GROUP BY camp.id
      ORDER BY total DESC
      LIMIT 1`
  ).get();

  const financeRow = db.prepare(
    `SELECT
        SUM(CASE WHEN account_type = 'Asset' THEN balance ELSE 0 END) AS assets,
        SUM(CASE WHEN account_type = 'Liability' THEN balance ELSE 0 END) AS liabilities,
        SUM(CASE WHEN account_type = 'Revenue' THEN balance ELSE 0 END) AS revenue,
        SUM(CASE WHEN account_type = 'Expense' THEN balance ELSE 0 END) AS expenses
      FROM v_trial_balance`
  ).get();

  const volunteerRow = db.prepare(
    `SELECT
        SUM(CASE WHEN service_date >= date('now','start of month') THEN hours ELSE 0 END) AS hours_mtd,
        SUM(CASE WHEN strftime('%Y', service_date) = strftime('%Y','now') THEN hours ELSE 0 END) AS hours_ytd
      FROM volunteer_hours`
  ).get();

  const upcomingShifts = db.prepare(
    `SELECT COUNT(*) AS upcoming
       FROM volunteer_shifts
      WHERE status = 'Scheduled' AND datetime(start_at) >= datetime('now')`
  ).get();

  const activeVolunteers = db.prepare(
    `SELECT COUNT(*) AS total
       FROM volunteers
      WHERE is_active = 1`
  ).get();

  const eventStats = db.prepare(
    `SELECT
        COUNT(DISTINCT e.id) AS upcoming_events,
        COALESCE(SUM(CASE WHEN r.status IN ('Pending','Confirmed','CheckedIn') THEN r.quantity ELSE 0 END), 0) AS registrations
       FROM events e
       LEFT JOIN event_registrations r ON r.event_id = e.id
      WHERE datetime(e.start_at) >= datetime('now')`
  ).get();

  const nextEvent = db.prepare(
    `SELECT id, name, start_at, venue_name, venue_city
       FROM events
      WHERE datetime(start_at) >= datetime('now')
      ORDER BY start_at
      LIMIT 1`
  ).get();

  const fundraisingTotals = {
    monthToDate: {
      total: numberOrZero(fundraisingRow?.mtd_total),
      count: numberOrZero(fundraisingRow?.mtd_count),
    },
    yearToDate: {
      total: numberOrZero(fundraisingRow?.ytd_total),
      count: numberOrZero(fundraisingRow?.ytd_count),
    },
    donorsYtd: numberOrZero(fundraisingRow?.donors_ytd),
    averageGiftYtd:
      numberOrZero(fundraisingRow?.ytd_count) > 0
        ? numberOrZero(fundraisingRow?.ytd_total) / numberOrZero(fundraisingRow?.ytd_count)
        : 0,
    topCampaign: topCampaign
      ? {
          name: topCampaign.name,
          total: numberOrZero(topCampaign.total),
        }
      : null,
  };

  const assets = numberOrZero(financeRow?.assets);
  const liabilities = numberOrZero(financeRow?.liabilities);
  const revenueBalance = numberOrZero(financeRow?.revenue);
  const expensesBalance = numberOrZero(financeRow?.expenses);
  const revenueYtd = Math.abs(revenueBalance);
  const expensesYtd = Math.abs(expensesBalance);

  const financeTotals = {
    cashOnHand: assets,
    liabilities: Math.abs(liabilities),
    netAssets: assets + liabilities,
    revenueYtd,
    expensesYtd,
    operatingResult: revenueYtd - expensesYtd,
  };

  const volunteerTotals = {
    hoursThisMonth: numberOrZero(volunteerRow?.hours_mtd),
    hoursThisYear: numberOrZero(volunteerRow?.hours_ytd),
    upcomingShifts: numberOrZero(upcomingShifts?.upcoming),
    activeVolunteers: numberOrZero(activeVolunteers?.total),
  };

  const eventTotals = {
    upcomingEvents: numberOrZero(eventStats?.upcoming_events),
    registrations: numberOrZero(eventStats?.registrations),
    nextEvent: nextEvent
      ? {
          id: nextEvent.id,
          name: nextEvent.name,
          startAt: nextEvent.start_at,
          venue: [nextEvent.venue_name, nextEvent.venue_city].filter(Boolean).join(' • '),
        }
      : null,
  };

  return {
    fundraising: fundraisingTotals,
    finance: financeTotals,
    volunteers: volunteerTotals,
    events: eventTotals,
  };
}
