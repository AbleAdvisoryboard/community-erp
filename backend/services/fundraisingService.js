import { getDb } from "../db/connection.js";
import { writeAuditLog } from "../utils/audit.js";
import { getProviderRegistry } from "./providers/registry.js";
import { getJlInsert } from "../utils/journalLines.js";
function getSetting(db, key, defaultValue = null) {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
  return typeof row?.value !== 'undefined' ? row.value : defaultValue;
}
function getGlIdByCode(db, code) {
  const row = db.prepare("SELECT id FROM gl_accounts WHERE code = ?").get(code);
  return row?.id || null;
}

function mapFund(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    revenueGlAccountId: row.revenue_gl_account_id ?? null,
    campaignId: row.campaign_id ?? null,
    description: row.description,
    restriction: row.restriction,
    isActive: !!row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCampaign(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    goalAmount: row.goal_amount,
    startDate: row.start_date,
    endDate: row.end_date,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDonation(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    accountName: row.account_name ?? null,
    contactId: row.contact_id,
    contactName: row.contact_name ?? null,
    fundId: row.fund_id,
    fundName: row.fund_name ?? null,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name ?? null,
    appealId: row.appeal_id,
    appealName: row.appeal_name ?? null,
    designationId: row.designation_id,
    amount: row.amount,
    currencyCode: row.currency_code,
    fxRate: row.fx_rate,
    donatedAt: row.donated_at,
    paymentMethod: row.payment_method,
    isRecurring: !!row.is_recurring,
    receiptId: row.receipt_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    softCredits: row.soft_credits ? JSON.parse(row.soft_credits) : [],
    payments: row.payments ? JSON.parse(row.payments) : [],
  };
}

function normalizeCurrency(value, fallback = "USD") {
  if (!value) return fallback;
  return value.trim().toUpperCase();
}

function normalizeCode(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9-_]/g, "")
    .toUpperCase();
}

export function listFunds({ includeInactive = false } = {}) {
  const db = getDb();
  const sql = includeInactive
    ? `SELECT f.*, m.revenue_gl_account_id
         FROM funds f
         LEFT JOIN fund_gl_mappings m ON m.fund_id = f.id
        ORDER BY f.name`
    : `SELECT f.*, m.revenue_gl_account_id
         FROM funds f
         LEFT JOIN fund_gl_mappings m ON m.fund_id = f.id
        WHERE f.is_active = 1
        ORDER BY f.name`;
  return db.prepare(sql).all().map(mapFund);
}

export function createFund(data, auditContext) {
  const db = getDb();
  const code = normalizeCode(data.code);
  if (!code) {
    throw new Error("Fund code is required");
  }
  const result = db.prepare(
    `INSERT INTO funds (name, code, description, restriction, is_active, campaign_id)
     VALUES (@name, @code, @description, @restriction, @is_active, @campaign_id)`
  ).run({
    name: data.name,
    code,
    description: data.description ?? null,
    restriction: data.restriction ?? "Unrestricted",
    is_active: data.isActive === false ? 0 : 1,
    campaign_id: data.campaignId ?? null,
  });
  const fundId = result.lastInsertRowid;

  // Optional Fund -> Revenue GL mapping
  if (data.revenueGlAccountId) {
    db.prepare(
      `INSERT INTO fund_gl_mappings (fund_id, revenue_gl_account_id)
       VALUES (@fund_id, @revenue_gl_account_id)
       ON CONFLICT(fund_id) DO UPDATE SET revenue_gl_account_id = excluded.revenue_gl_account_id`
    ).run({
      fund_id: fundId,
      revenue_gl_account_id: Number(data.revenueGlAccountId),
    });
  }

  const fund = db.prepare(
    `SELECT f.*, m.revenue_gl_account_id
       FROM funds f
       LEFT JOIN fund_gl_mappings m ON m.fund_id = f.id
      WHERE f.id = ?`
  ).get(fundId);
  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "funds",
    entityId: String(fund.id),
    action: "create",
    after: mapFund(fund),
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });
  return mapFund(fund);
}

export function listCampaigns({ status, includeInactive = false } = {}) {
  const db = getDb();
  const params = {};
  let sql = "SELECT * FROM campaigns";
  if (status) {
    sql += " WHERE status = @status";
    params.status = status;
  } else if (!includeInactive) {
    sql += " WHERE status = 'Active'";
  }
  sql += " ORDER BY created_at DESC";
  return db.prepare(sql).all(params).map(mapCampaign);
}

export function createCampaign(data, auditContext) {
  const db = getDb();
  const code = normalizeCode(data.code);
  if (!code) {
    throw new Error("Campaign code is required");
  }
  const result = db.prepare(
    `INSERT INTO campaigns (name, code, goal_amount, start_date, end_date, status, description)
     VALUES (@name, @code, @goal_amount, @start_date, @end_date, @status, @description)`
  ).run({
    name: data.name,
    code,
    goal_amount: data.goalAmount ?? null,
    start_date: data.startDate ?? null,
    end_date: data.endDate ?? null,
    status: data.status ?? "Active",
    description: data.description ?? null,
  });
  const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(result.lastInsertRowid);
  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "campaigns",
    entityId: String(campaign.id),
    action: "create",
    after: mapCampaign(campaign),
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });
  return mapCampaign(campaign);
}

export function updateFund(fundId, updates, auditContext) {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM funds WHERE id = ?").get(fundId);
  if (!existing) {
    return null;
  }

  const allowed = {
    name: "name",
    code: "code",
    campaignId: "campaign_id",
    description: "description",
    restriction: "restriction",
    isActive: "is_active",
  };

  const params = { id: fundId };
  const sets = [];
  for (const [key, column] of Object.entries(allowed)) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      let value = updates[key];
      if (key === "code") {
        value = normalizeCode(value);
        if (!value) continue;
      }
      if (key === "isActive") {
        value = updates[key] ? 1 : 0;
      }
      if (key === "campaignId") {
        value = updates[key] == null ? null : Number(updates[key]);
      }
      params[column] = value ?? null;
      sets.push(`${column} = @${column}`);
    }
  }

  if (sets.length) {
    db.prepare(`UPDATE funds SET ${sets.join(", ")} WHERE id = @id`).run(params);
  }

  // Optional Fund -> Revenue GL mapping
  if (Object.prototype.hasOwnProperty.call(updates, "revenueGlAccountId")) {
    const raw = updates.revenueGlAccountId;
    if (raw == null || raw === "") {
      db.prepare("DELETE FROM fund_gl_mappings WHERE fund_id = ?").run(fundId);
    } else {
      db.prepare(
        `INSERT INTO fund_gl_mappings (fund_id, revenue_gl_account_id)
         VALUES (@fund_id, @revenue_gl_account_id)
         ON CONFLICT(fund_id) DO UPDATE SET revenue_gl_account_id = excluded.revenue_gl_account_id`
      ).run({
        fund_id: fundId,
        revenue_gl_account_id: Number(raw),
      });
    }
  }

  const updated = db.prepare(
    `SELECT f.*, m.revenue_gl_account_id
       FROM funds f
       LEFT JOIN fund_gl_mappings m ON m.fund_id = f.id
      WHERE f.id = ?`
  ).get(fundId);

  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "funds",
    entityId: String(fundId),
    action: "update",
    before: mapFund(existing),
    after: mapFund(updated),
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });

  return mapFund(updated);
}

export function updateCampaign(campaignId, updates, auditContext) {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId);
  if (!existing) {
    return null;
  }

  const allowed = {
    name: "name",
    code: "code",
    goalAmount: "goal_amount",
    startDate: "start_date",
    endDate: "end_date",
    status: "status",
    description: "description",
  };

  const params = { id: campaignId };
  const sets = [];
  for (const [key, column] of Object.entries(allowed)) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      let value = updates[key];
      if (key === "code") {
        value = normalizeCode(value);
        if (!value) continue;
      }
      if (key === "goalAmount" && value !== null && value !== undefined) {
        value = Number(value);
      }
      params[column] = value ?? null;
      sets.push(`${column} = @${column}`);
    }
  }

  if (sets.length) {
    db.prepare(`UPDATE campaigns SET ${sets.join(", ")} WHERE id = @id`).run(params);
  }

  const updated = db.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId);

  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "campaigns",
    entityId: String(campaignId),
    action: "update",
    before: mapCampaign(existing),
    after: mapCampaign(updated),
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });

  return mapCampaign(updated);
}

export function createAppeal(data, auditContext) {
  const db = getDb();
  const result = db.prepare(
    `INSERT INTO appeals (campaign_id, name, code, goal_amount, start_date, end_date)
     VALUES (@campaign_id, @name, @code, @goal_amount, @start_date, @end_date)`
  ).run({
    campaign_id: data.campaignId,
    name: data.name,
    code: data.code,
    goal_amount: data.goalAmount ?? null,
    start_date: data.startDate ?? null,
    end_date: data.endDate ?? null,
  });
  const appeal = db.prepare("SELECT * FROM appeals WHERE id = ?").get(result.lastInsertRowid);
  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "appeals",
    entityId: String(appeal.id),
    action: "create",
    after: appeal,
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });
  return appeal;
}

function insertSoftCredits(db, donationId, credits = []) {
  const normalized = credits
    .map((credit) => ({
      contactId: credit.contactId,
      amount: Number(credit.amount ?? 0),
    }))
    .filter((credit) => credit.contactId && credit.amount > 0);

  const insert = db.prepare(
    `INSERT INTO donation_soft_credits (donation_id, contact_id, amount)
     VALUES (@donation_id, @contact_id, @amount)`
  );

  db.prepare("DELETE FROM donation_soft_credits WHERE donation_id = ?").run(donationId);
  for (const credit of normalized) {
    insert.run({
      donation_id: donationId,
      contact_id: credit.contactId,
      amount: credit.amount,
    });
  }
}

export async function createDonation(data, auditContext) {
  const db = getDb();
  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Donation amount must be greater than zero");
  }

  const currencyCode = normalizeCurrency(data.currencyCode);
  const fxRate = Number(data.fxRate ?? 1);
  const donatedAt = data.donatedAt ?? new Date().toISOString();
  let paymentMethod = data.paymentMethod ?? "Offline";
  let paymentDetails = null;

  if (data.payment) {
    const registry = getProviderRegistry();
    const paymentProvider = registry.payment;
    if (!paymentProvider || typeof paymentProvider.charge !== "function") {
      throw new Error("Payment provider not configured");
    }
    const charge = await paymentProvider.charge({
      amount,
      currency: currencyCode,
      source: data.payment.source ?? null,
      metadata: {
        contactId: data.contactId ?? null,
        accountId: data.accountId ?? null,
        campaignId: data.campaignId ?? null,
      },
    });
    if (!charge || charge.status === "failed") {
      const reason = charge?.error || "Payment failed";
      throw new Error(reason);
    }
    paymentDetails = charge;
    if (!data.paymentMethod) {
      paymentMethod = "Online";
    }
  }

  const insertDonation = db.prepare(
    `INSERT INTO donations (account_id, contact_id, fund_id, campaign_id, appeal_id, designation_id, amount, currency_code, fx_rate, donated_at, payment_method, is_recurring, status)
     VALUES (@account_id, @contact_id, @fund_id, @campaign_id, @appeal_id, @designation_id, @amount, @currency_code, @fx_rate, @donated_at, @payment_method, @is_recurring, @status)`
  );
  const insertPaymentTxn = paymentDetails
    ? db.prepare(
        `INSERT INTO payment_transactions (donation_id, provider, provider_reference, status, amount, currency_code, raw_response)
         VALUES (@donation_id, @provider, @provider_reference, @status, @amount, @currency_code, @raw_response)`
      )
    : null;

  const run = db.transaction(() => {
    const result = insertDonation.run({
      account_id: data.accountId ?? null,
      contact_id: data.contactId ?? null,
      fund_id: data.fundId ?? null,
      campaign_id: data.campaignId ?? null,
      appeal_id: data.appealId ?? null,
      designation_id: data.designationId ?? null,
      amount,
      currency_code: currencyCode,
      fx_rate: fxRate,
      donated_at: donatedAt,
      payment_method: data.isPledge ? "Pledge" : paymentMethod,
      is_recurring: data.isRecurring ? 1 : 0,
      status: data.status ?? "Posted",
    });
    const donationId = result.lastInsertRowid;
    insertSoftCredits(db, donationId, data.softCredits);
    if (insertPaymentTxn && paymentDetails) {
      insertPaymentTxn.run({
        donation_id: donationId,
        provider: paymentDetails.provider || "unknown",
        provider_reference: paymentDetails.id ?? null,
        status: paymentDetails.status ?? "succeeded",
        amount,
        currency_code: currencyCode,
        raw_response: JSON.stringify(paymentDetails),
      });
    }
    return donationId;
  });

  const donationId = run();
  const donationRow = db.prepare(
    `SELECT d.*, a.name AS account_name,
            printf('%s %s', c.first_name, c.last_name) AS contact_name,
            f.name AS fund_name,
            camp.name AS campaign_name,
            app.name AS appeal_name,
            COALESCE(json_group_array(json_object('contactId', sc.contact_id, 'amount', sc.amount)) FILTER (WHERE sc.contact_id IS NOT NULL), '[]') AS soft_credits,
            (SELECT COALESCE(json_group_array(json_object('id', pt.id, 'provider', pt.provider, 'status', pt.status, 'reference', pt.provider_reference, 'amount', pt.amount, 'currencyCode', pt.currency_code, 'createdAt', pt.created_at)), '[]')
               FROM payment_transactions pt
              WHERE pt.donation_id = d.id) AS payments
       FROM donations d
       LEFT JOIN accounts a ON a.id = d.account_id
       LEFT JOIN contacts c ON c.id = d.contact_id
       LEFT JOIN funds f ON f.id = d.fund_id
       LEFT JOIN campaigns camp ON camp.id = d.campaign_id
       LEFT JOIN appeals app ON app.id = d.appeal_id
       LEFT JOIN donation_soft_credits sc ON sc.donation_id = d.id
      WHERE d.id = ?
      GROUP BY d.id`
  ).get(donationId);

  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "donations",
    entityId: String(donationId),
    action: "create",
    after: mapDonation(donationRow),
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });

  // Auto-post to GL if enabled and not In-Kind
  try {
    const autoPost = getSetting(db, 'donations_auto_post_gl', '1') === '1';
    const method = donationRow.payment_method;
    if (autoPost && method !== 'InKind') {
      const fundId = donationRow.fund_id;
      const amountPosted = Number(donationRow.amount || 0);
      if (amountPosted > 0) {
        const entryNo = db.prepare("SELECT printf('J%06d', COALESCE(MAX(id), 0) + 1) AS entry_no FROM journals").get().entry_no;
        const jRes = db.prepare(`INSERT INTO journals (entry_no, journal_date, memo, created_by, posted_at)
          VALUES (@entry_no, @journal_date, @memo, @created_by, CURRENT_TIMESTAMP)`).run({
          entry_no: entryNo,
          journal_date: (donationRow.donated_at || new Date().toISOString()).slice(0,10),
          memo: `Donation ${donationRow.id}`,
          created_by: auditContext?.userId ?? null,
        });
        const jId = jRes.lastInsertRowid;
        const { stmt: jl, cols: all } = getJlInsert(db);
        const mk = (row) => all.map(c => row[c]);

        // Resolve revenue and pledges/cash GL ids
        const getRevenueId = () => {
          let revenueId = null;
          if (fundId) {
            const mapRow = db.prepare("SELECT revenue_gl_id AS revenue_gl_account_id FROM campaign_gl_map WHERE fund_id = ? AND (campaign_id IS NULL OR campaign_id = ?) ORDER BY campaign_id IS NOT NULL DESC LIMIT 1").get(fundId, donationRow.campaign_id ?? null);
            revenueId = mapRow?.revenue_gl_account_id ?? null;
          }
          if (!revenueId && fundId) {
            const mapRow2 = db.prepare("SELECT revenue_gl_account_id FROM fund_gl_mappings WHERE fund_id = ?").get(fundId);
            revenueId = mapRow2?.revenue_gl_account_id ?? null;
          }
          return revenueId || getGlIdByCode(db,'4000');
        };

        if (method === 'Pledge' || data.isPledge) {
          // Dr Pledges Receivable, Cr Revenue
          let pledgesId = null;
          if (fundId) {
            const m = db.prepare("SELECT pledges_gl_id FROM campaign_gl_map WHERE fund_id = ? AND (campaign_id IS NULL OR campaign_id = ?) ORDER BY campaign_id IS NOT NULL DESC LIMIT 1").get(fundId, donationRow.campaign_id ?? null);
            pledgesId = m?.pledges_gl_id ?? null;
          }
          if (!pledgesId) pledgesId = getGlIdByCode(db,'1200');
          const revenueId = getRevenueId();
          jl.run(mk({ journal_id: jId, gl_account_id: pledgesId, amount: amountPosted, drcr: 'D', fund_id: fundId ?? null, class_id: null, campaign_id: donationRow.campaign_id ?? null, memo: `Donation ${donationRow.id} (Pledge)`, source_table: 'donations', source_id: donationRow.id, source_line: null }));
          jl.run(mk({ journal_id: jId, gl_account_id: revenueId, amount: amountPosted, drcr: 'C', fund_id: fundId ?? null, class_id: null, campaign_id: donationRow.campaign_id ?? null, memo: `Donation ${donationRow.id} (Pledge)`, source_table: 'donations', source_id: donationRow.id, source_line: null }));
        } else {
          // Cash-type donation: Dr Cash/Clearing, Cr Revenue
          const pm = db.prepare("SELECT cash_gl_account_id FROM payment_method_gl_mappings WHERE method = ?").get(method || 'Offline');
          let cashId = pm?.cash_gl_account_id;
          if (!cashId) {
            cashId = (method === 'Cash' || method === 'Check' || method === 'Offline') ? getGlIdByCode(db,'1010') : getGlIdByCode(db,'1000');
          }
          const revenueId = getRevenueId();
          jl.run(mk({ journal_id: jId, gl_account_id: cashId, amount: amountPosted, drcr: 'D', fund_id: fundId ?? null, class_id: null, campaign_id: donationRow.campaign_id ?? null, memo: `Donation ${donationRow.id}`, source_table: 'donations', source_id: donationRow.id, source_line: null }));
          jl.run(mk({ journal_id: jId, gl_account_id: revenueId, amount: amountPosted, drcr: 'C', fund_id: fundId ?? null, class_id: null, campaign_id: donationRow.campaign_id ?? null, memo: `Donation ${donationRow.id}`, source_table: 'donations', source_id: donationRow.id, source_line: null }));
        }
      }
    }
  } catch (_err) {
    // ignore auto-post failures
  }

  return mapDonation(donationRow);
}

export function applyPledgePayment(donationId, data, auditContext) {
  const db = getDb();
  const donation = db.prepare("SELECT * FROM donations WHERE id = ?").get(donationId);
  if (!donation) return null;
  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Payment amount must be > 0');
  const method = data.method ?? 'Offline';
  const paidToDate = db.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM payment_transactions WHERE donation_id = ? AND status = 'succeeded'").get(donationId).total;
  if (Number(paidToDate || 0) + amount > Number(donation.amount || 0)) {
    throw new Error('Payment cannot be more than the remaining pledge balance');
  }

  const run = db.transaction(() => {
    // Record payment transaction
    db.prepare(`INSERT INTO payment_transactions (donation_id, provider, provider_reference, status, amount, currency_code, raw_response)
      VALUES (@donation_id, @provider, @provider_reference, @status, @amount, @currency_code, @raw_response)`).run({
      donation_id: donationId,
      provider: 'internal',
      provider_reference: data.reference ?? null,
      status: 'succeeded',
      amount,
      currency_code: donation.currency_code || 'USD',
      raw_response: null,
    });

    // Post GL: Dr Cash/Clearing, Cr Pledges Receivable
    const pm = db.prepare("SELECT cash_gl_account_id FROM payment_method_gl_mappings WHERE method = ?").get(method);
    let cashId = pm?.cash_gl_account_id ?? null;
    if (!cashId) {
      cashId = (method === 'Cash' || method === 'Check' || method === 'Offline') ? getGlIdByCode(db,'1010') : getGlIdByCode(db,'1000');
    }
    let pledgesId = null;
    if (donation.fund_id) {
      const m = db.prepare("SELECT pledges_gl_id FROM campaign_gl_map WHERE fund_id = ? AND (campaign_id IS NULL OR campaign_id = ?) ORDER BY campaign_id IS NOT NULL DESC LIMIT 1").get(donation.fund_id, donation.campaign_id ?? null);
      pledgesId = m?.pledges_gl_id ?? null;
    }
    if (!pledgesId) pledgesId = getGlIdByCode(db,'1200');

    const entryNo = db.prepare("SELECT printf('J%06d', COALESCE(MAX(id), 0) + 1) AS entry_no FROM journals").get().entry_no;
    const jRes = db.prepare(`INSERT INTO journals (entry_no, journal_date, memo, created_by, posted_at)
      VALUES (@entry_no, @journal_date, @memo, @created_by, CURRENT_TIMESTAMP)`).run({
      entry_no: entryNo,
      journal_date: data.receivedAt ? String(data.receivedAt).slice(0,10) : new Date().toISOString().slice(0,10),
      memo: `Pledge Payment ${donationId}`,
      created_by: auditContext?.userId ?? null,
    });
    const jId = jRes.lastInsertRowid;
    const { stmt: jl, cols: all } = getJlInsert(db);
    const mk = (row) => all.map(c => row[c]);
    jl.run(mk({ journal_id: jId, gl_account_id: cashId, amount, drcr: 'D', fund_id: donation.fund_id ?? null, class_id: null, campaign_id: donation.campaign_id ?? null, memo: `Pledge Payment ${donationId}` , source_table: 'donations', source_id: donationId, source_line: null }));
    jl.run(mk({ journal_id: jId, gl_account_id: pledgesId, amount, drcr: 'C', fund_id: donation.fund_id ?? null, class_id: null, campaign_id: donation.campaign_id ?? null, memo: `Pledge Payment ${donationId}` , source_table: 'donations', source_id: donationId, source_line: null }));

    // Update donation status based on total payments
    db.prepare("UPDATE donations SET status = 'Posted' WHERE id = ?").run(donationId);
    return jId;
  });

  run();
  const updated = db.prepare("SELECT * FROM donations WHERE id = ?").get(donationId);
  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: 'donations',
    entityId: String(donationId),
    action: 'pledge_payment',
    after: updated,
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });
  return mapDonation(updated);
}

export function listDonations({
  from,
  to,
  campaignId,
  fundId,
  accountId,
  contactId,
  minAmount,
  maxAmount,
  limit = 50,
  offset = 0,
} = {}) {
  const db = getDb();
  const params = { limit, offset };
  const where = [];
  if (from) {
    where.push("d.donated_at >= @from");
    params.from = from;
  }
  if (to) {
    where.push("d.donated_at <= @to");
    params.to = to;
  }
  if (campaignId) {
    where.push("d.campaign_id = @campaignId");
    params.campaignId = campaignId;
  }
  if (fundId) {
    where.push("d.fund_id = @fundId");
    params.fundId = fundId;
  }
  if (accountId) {
    where.push("d.account_id = @accountId");
    params.accountId = accountId;
  }
  if (contactId) {
    where.push("d.contact_id = @contactId");
    params.contactId = contactId;
  }
  if (typeof minAmount === 'number' && Number.isFinite(minAmount)) {
    where.push("d.amount >= @minAmount");
    params.minAmount = minAmount;
  }
  if (typeof maxAmount === 'number' && Number.isFinite(maxAmount)) {
    where.push("d.amount <= @maxAmount");
    params.maxAmount = maxAmount;
  }

  const sql = `SELECT d.*, a.name AS account_name,
      printf('%s %s', c.first_name, c.last_name) AS contact_name,
      f.name AS fund_name,
      camp.name AS campaign_name,
      app.name AS appeal_name,
      COALESCE(json_group_array(json_object('contactId', sc.contact_id, 'amount', sc.amount)) FILTER (WHERE sc.contact_id IS NOT NULL), '[]') AS soft_credits,
      (SELECT COALESCE(json_group_array(json_object('id', pt.id, 'provider', pt.provider, 'status', pt.status, 'reference', pt.provider_reference, 'amount', pt.amount, 'currencyCode', pt.currency_code, 'createdAt', pt.created_at)), '[]')
         FROM payment_transactions pt
        WHERE pt.donation_id = d.id) AS payments
    FROM donations d
    LEFT JOIN accounts a ON a.id = d.account_id
    LEFT JOIN contacts c ON c.id = d.contact_id
    LEFT JOIN funds f ON f.id = d.fund_id
    LEFT JOIN campaigns camp ON camp.id = d.campaign_id
    LEFT JOIN appeals app ON app.id = d.appeal_id
    LEFT JOIN donation_soft_credits sc ON sc.donation_id = d.id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    GROUP BY d.id
    ORDER BY d.donated_at DESC, d.id DESC
    LIMIT @limit OFFSET @offset`;

  return db.prepare(sql).all(params).map(mapDonation);
}

export function createPledge(data, auditContext) {
  const db = getDb();
  const totalAmount = Number(data.totalAmount);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new Error("Pledge total amount must be greater than zero");
  }

  const insertPledge = db.prepare(
    `INSERT INTO pledges (account_id, contact_id, fund_id, campaign_id, total_amount, frequency, start_date, end_date, reminder_day, status)
     VALUES (@account_id, @contact_id, @fund_id, @campaign_id, @total_amount, @frequency, @start_date, @end_date, @reminder_day, @status)`
  );
  const insertInstallment = db.prepare(
    `INSERT INTO pledge_installments (pledge_id, due_date, amount_due, amount_paid, status)
     VALUES (@pledge_id, @due_date, @amount_due, @amount_paid, @status)`
  );

  const run = db.transaction(() => {
    const pledgeResult = insertPledge.run({
      account_id: data.accountId ?? null,
      contact_id: data.contactId ?? null,
      fund_id: data.fundId ?? null,
      campaign_id: data.campaignId ?? null,
      total_amount: totalAmount,
      frequency: data.frequency ?? "Monthly",
      start_date: data.startDate ?? new Date().toISOString().slice(0, 10),
      end_date: data.endDate ?? null,
      reminder_day: data.reminderDay ?? null,
      status: data.status ?? "Active",
    });
    const pledgeId = pledgeResult.lastInsertRowid;

    for (const installment of data.installments ?? []) {
      insertInstallment.run({
        pledge_id: pledgeId,
        due_date: installment.dueDate,
        amount_due: Number(installment.amountDue ?? 0),
        amount_paid: Number(installment.amountPaid ?? 0),
        status: installment.status ?? "Pending",
      });
    }

    return pledgeId;
  });

  const pledgeId = run();
  const pledge = db.prepare("SELECT * FROM pledges WHERE id = ?").get(pledgeId);

  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "pledges",
    entityId: String(pledgeId),
    action: "create",
    after: pledge,
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });

  return pledge;
}

function generateReceiptNo(db) {
  const row = db
    .prepare(
      "SELECT printf('R%06d', COALESCE(MAX(id), 0) + 1) AS next_no FROM donation_receipts"
    )
    .get();
  return row.next_no;
}

export function issueReceipt(donationId, data, auditContext) {
  const db = getDb();
  const donation = db.prepare("SELECT id, contact_id FROM donations WHERE id = ?").get(donationId);
  if (!donation) {
    return null;
  }

  const insert = db.prepare(
    `INSERT INTO donation_receipts (receipt_no, donation_id, contact_id, issued_at, delivered_at, delivery_method, template_name, metadata_json)
     VALUES (@receipt_no, @donation_id, @contact_id, @issued_at, @delivered_at, @delivery_method, @template_name, @metadata_json)`
  );

  const receiptNo = generateReceiptNo(db);
  const result = insert.run({
    receipt_no: receiptNo,
    donation_id: donationId,
    contact_id: donation.contact_id,
    issued_at: data?.issuedAt ?? new Date().toISOString(),
    delivered_at: data?.deliveredAt ?? null,
    delivery_method: data?.deliveryMethod ?? "Email",
    template_name: data?.templateName ?? null,
    metadata_json: data?.metadata ? JSON.stringify(data.metadata) : null,
  });

  const receiptId = result.lastInsertRowid;
  db.prepare("UPDATE donations SET receipt_id = ? WHERE id = ?").run(receiptId, donationId);
  const receipt = db.prepare("SELECT * FROM donation_receipts WHERE id = ?").get(receiptId);

  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "donation_receipts",
    entityId: String(receiptId),
    action: "create",
    after: receipt,
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });

  return receipt;
}
