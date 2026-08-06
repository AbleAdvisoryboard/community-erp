import { getDb } from "../db/connection.js";
import { isContributionRevenue } from "../utils/gl.js";
import { writeAuditLog } from "../utils/audit.js";
import { getApprovalNote } from "./financeControlsService.js";

function mapAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    parentId: row.parent_id,
    description: row.description,
    isActive: !!row.is_active,
    fsCategory: row.fs_category,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listGlAccounts({ type } = {}) {
  const db = getDb();
  let sql = "SELECT * FROM gl_accounts";
  const params = {};
  if (type) {
    sql += " WHERE type = @type";
    params.type = type;
  }
  sql += " ORDER BY code";
  return db.prepare(sql).all(params).map(mapAccount);
}

export function createGlAccount(data, auditContext) {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO gl_accounts (code, name, type, parent_id, description, is_active, linked_revenue_bucket, is_current_asset, fs_category)
     VALUES (@code, @name, @type, @parent_id, @description, @is_active, @linked_revenue_bucket, @is_current_asset, @fs_category)`
  );
  const result = insert.run({
    code: data.code,
    name: data.name,
    type: data.type,
    parent_id: data.parentId ?? null,
    description: data.description ?? null,
    is_active: data.isActive === false ? 0 : 1,
    linked_revenue_bucket: data.linkedRevenueBucket ?? null,
    is_current_asset: data.isCurrentAsset ? 1 : 0,
    fs_category: data.fsCategory ?? null,
  });
  const account = db.prepare("SELECT * FROM gl_accounts WHERE id = ?").get(result.lastInsertRowid);
  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "gl_accounts",
    entityId: String(account.id),
    action: "create",
    after: mapAccount(account),
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });
  return mapAccount(account);
}

export function deleteGlAccount(id) {
  const db = getDb();
  const acc = db.prepare("SELECT * FROM gl_accounts WHERE id = ?").get(id);
  if (!acc) throw new Error('Account not found');
  const hasJl = db.prepare("SELECT 1 FROM journal_lines WHERE gl_account_id = ? LIMIT 1").get(id);
  if (hasJl) throw new Error('Cannot delete account with journal activity');
  const hasBank = db.prepare("SELECT 1 FROM bank_accounts WHERE gl_account_id = ? LIMIT 1").get(id);
  if (hasBank) throw new Error('Cannot delete account linked to a bank account');
  const hasMap = db.prepare("SELECT 1 FROM campaign_gl_map WHERE revenue_gl_id = ? OR cash_gl_id = ? OR pledges_gl_id = ? OR restrictions_gl_id = ? LIMIT 1").get(id, id, id, id);
  if (hasMap) throw new Error('Cannot delete account used in campaign/fund mapping');
  const del = db.prepare("DELETE FROM gl_accounts WHERE id = ?");
  del.run(id);
  return { id };
}

export function updateGlAccount(id, data, auditContext) {
  const db = getDb();
  const before = db.prepare("SELECT * FROM gl_accounts WHERE id = ?").get(id);
  if (!before) throw new Error('Account not found');

  const updates = [];
  const params = { id };
  if (data.fsCategory !== undefined) {
    updates.push('fs_category = @fs_category');
    params.fs_category = data.fsCategory ?? null;
  }
  if (updates.length === 0) {
    return mapAccount(before);
  }
  const sql = `UPDATE gl_accounts SET ${updates.join(', ')} WHERE id = @id`;
  db.prepare(sql).run(params);
  const after = db.prepare("SELECT * FROM gl_accounts WHERE id = ?").get(id);

  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "gl_accounts",
    entityId: String(id),
    action: "update",
    before: mapAccount(before),
    after: mapAccount(after),
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });

  return mapAccount(after);
}

function nextEntryNumber(db) {
  const row = db
    .prepare("SELECT printf('J%06d', COALESCE(MAX(id), 0) + 1) AS entry_no FROM journals")
    .get();
  return row.entry_no;
}

function validateJournalLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new Error("Journal must contain at least two lines");
  }
  let debitTotal = 0;
  let creditTotal = 0;
  for (const line of lines) {
    if (!line.glAccountId) {
      throw new Error("Journal line missing account");
    }
    const amount = Number(line.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Journal line amounts must be positive numbers");
    }
    if (line.drcr === "D") {
      debitTotal += amount;
    } else if (line.drcr === "C") {
      creditTotal += amount;
    } else {
      throw new Error("Journal line missing debit/credit designation");
    }
  }
  if (Math.abs(debitTotal - creditTotal) > 0.005) {
    throw new Error("Journal is out of balance");
  }
}

export function createJournal({ journalDate, memo, lines }, auditContext) {
  validateJournalLines(lines);
  const db = getDb();
  const approval = getApprovalNote("manualJournal");
  const entryNo = nextEntryNumber(db);
  const insertJournal = db.prepare(
    `INSERT INTO journals (entry_no, journal_date, memo, created_by, posted_at)
     VALUES (@entry_no, @journal_date, @memo, @created_by, CURRENT_TIMESTAMP)`
  );
  const insertLine = db.prepare(
    `INSERT INTO journal_lines (journal_id, gl_account_id, fund_id, amount, drcr, memo)
     VALUES (@journal_id, @gl_account_id, @fund_id, @amount, @drcr, @memo)`
  );

  const run = db.transaction(() => {
    const journalResult = insertJournal.run({
      entry_no: entryNo,
      journal_date: journalDate,
      memo: memo ?? null,
      created_by: auditContext?.userId ?? null,
    });
    const journalId = journalResult.lastInsertRowid;
    for (const line of lines) {
      insertLine.run({
        journal_id: journalId,
        gl_account_id: line.glAccountId,
        fund_id: line.fundId ?? null,
        amount: Number(line.amount),
        drcr: line.drcr,
        memo: line.memo ?? null,
      });
    }
    return journalId;
  });

  const journalId = run();
  const journal = db
    .prepare("SELECT * FROM journals WHERE id = ?")
    .get(journalId);
  const lineRows = db
    .prepare(
      `SELECT jl.*, ga.code AS account_code, ga.name AS account_name
         FROM journal_lines jl
         INNER JOIN gl_accounts ga ON ga.id = jl.gl_account_id
        WHERE jl.journal_id = ?`
    )
    .all(journalId);

  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "journals",
    entityId: String(journalId),
    action: "create",
    after: {
      journal,
      lines: lineRows,
    },
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });

  return {
    journal,
    lines: lineRows,
    approval,
  };
}

export function listJournals({ limit = 25, offset = 0, from, to, source, search } = {}) {
  const db = getDb();
  const where = [];
  const params = { limit: Math.min(Number(limit) || 25, 200), offset: Number(offset) || 0 };
  if (from) {
    where.push("substr(j.journal_date,1,10) >= @from");
    params.from = String(from).slice(0, 10);
  }
  if (to) {
    where.push("substr(j.journal_date,1,10) <= @to");
    params.to = String(to).slice(0, 10);
  }
  if (source === "Manual") {
    where.push("NOT EXISTS (SELECT 1 FROM journal_lines jl_filter WHERE jl_filter.journal_id = j.id AND jl_filter.source_table IS NOT NULL AND jl_filter.source_table <> '')");
  } else if (source) {
    where.push("EXISTS (SELECT 1 FROM journal_lines jl_filter WHERE jl_filter.journal_id = j.id AND jl_filter.source_table = @source)");
    params.source = source;
  }
  if (search) {
    where.push("(j.entry_no LIKE @search OR j.number LIKE @search OR j.memo LIKE @search)");
    params.search = `%${search}%`;
  }
  const journals = db
    .prepare(
      `SELECT j.* FROM journals j
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY j.journal_date DESC, j.id DESC
       LIMIT @limit OFFSET @offset`
    )
    .all(params);

  const linesStmt = db.prepare(
    `SELECT jl.*, ga.code AS account_code, ga.name AS account_name
       FROM journal_lines jl
       INNER JOIN gl_accounts ga ON ga.id = jl.gl_account_id
      WHERE jl.journal_id = ?`
  );

  return journals.map((journal) => ({
    journal,
    lines: linesStmt.all(journal.id),
  }));
}

export function getTrialBalance({ asOf, fundId, classId } = {}) {
  const db = getDb();
  // Build dynamic TB using journals + journal_lines to support filters
  const where = ["1=1"]; const params = {};
  if (asOf) { where.push("j.journal_date <= @asOf"); params.asOf = String(asOf).slice(0,10); }
  if (fundId) { where.push("jl.fund_id = @fundId"); params.fundId = fundId; }
  if (classId) { where.push("jl.class_id = @classId"); params.classId = classId; }
  const sql = `
    SELECT
      ga.id AS account_id,
      ga.code AS account_code,
      ga.name AS account_name,
      ga.type AS account_type,
      SUM(CASE WHEN jl.drcr = 'D' THEN jl.amount ELSE 0 END) AS total_debits,
      SUM(CASE WHEN jl.drcr = 'C' THEN jl.amount ELSE 0 END) AS total_credits,
      SUM(CASE WHEN jl.drcr = 'D' THEN jl.amount ELSE -jl.amount END) AS balance
    FROM gl_accounts ga
    LEFT JOIN journal_lines jl ON jl.gl_account_id = ga.id
    LEFT JOIN journals j ON j.id = jl.journal_id
    WHERE ${where.join(' AND ')}
    GROUP BY ga.id
    ORDER BY ga.code`;
  return db.prepare(sql).all(params);
}

function getStatementNetActivity(db, { from, to } = {}) {
  const where = ["ga.type IN ('Revenue', 'Expense')"];
  const params = {};
  if (from) {
    where.push("substr(j.journal_date,1,10) >= @from");
    params.from = String(from).slice(0, 10);
  }
  if (to) {
    where.push("substr(j.journal_date,1,10) <= @to");
    params.to = String(to).slice(0, 10);
  }
  const row = db.prepare(
    `SELECT
       SUM(CASE
             WHEN ga.type = 'Revenue' AND jl.drcr = 'C' THEN jl.amount
             WHEN ga.type = 'Revenue' AND jl.drcr = 'D' THEN -jl.amount
             ELSE 0
           END) AS revenue,
       SUM(CASE
             WHEN ga.type = 'Expense' AND jl.drcr = 'D' THEN jl.amount
             WHEN ga.type = 'Expense' AND jl.drcr = 'C' THEN -jl.amount
             ELSE 0
           END) AS expenses
       FROM journal_lines jl
       INNER JOIN journals j ON j.id = jl.journal_id
       INNER JOIN gl_accounts ga ON ga.id = jl.gl_account_id
      WHERE ${where.join(" AND ")}`
  ).get(params);
  return Number(row?.revenue || 0) - Number(row?.expenses || 0);
}

function getNetAssetsFromEquityAndActivity(db, { asOf, before } = {}) {
  const where = ["ga.type = 'Equity'"];
  const params = {};
  if (before) {
    where.push("substr(j.journal_date,1,10) < @before");
    params.before = String(before).slice(0, 10);
  } else if (asOf) {
    where.push("(j.journal_date IS NULL OR substr(j.journal_date,1,10) <= @asOf)");
    params.asOf = String(asOf).slice(0, 10);
  }
  const equityRow = db.prepare(
    `SELECT SUM(CASE WHEN jl.drcr='C' THEN jl.amount ELSE -jl.amount END) AS amount
       FROM gl_accounts ga
       LEFT JOIN journal_lines jl ON jl.gl_account_id = ga.id
       LEFT JOIN journals j ON j.id = jl.journal_id
      WHERE ${where.join(" AND ")}`
  ).get(params);
  const activity = before
    ? getStatementNetActivity(db, { to: new Date(new Date(String(before).slice(0, 10)).getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10) })
    : getStatementNetActivity(db, { to: asOf });
  return Number(equityRow?.amount || 0) + activity;
}

export function getBalanceSheet() {
  const db = getDb();
  const rows = db.prepare("SELECT account_type, balance FROM v_trial_balance").all();
  const totals = { Assets: 0, Liabilities: 0, Equity: 0 };
  for (const r of rows) {
    if (r.account_type === 'Asset') totals.Assets += r.balance || 0;
    if (r.account_type === 'Liability') totals.Liabilities += -(r.balance || 0);
    if (r.account_type === 'Equity') totals.Equity += -(r.balance || 0);
  }
  totals.Equity += getStatementNetActivity(db);
  return {
    assets: totals.Assets,
    liabilities: totals.Liabilities,
    equity: totals.Equity,
    assetsEqualsLiabPlusEquity: Math.abs(totals.Assets - (totals.Liabilities + totals.Equity)) < 0.01,
  };
}

export function getIncomeStatement() {
  const db = getDb();
  const rows = db.prepare("SELECT account_type, balance FROM v_trial_balance").all();
  let revenue = 0;
  let expense = 0;
  for (const r of rows) {
    if (r.account_type === 'Revenue') revenue += -(r.balance || 0);
    if (r.account_type === 'Expense') expense += r.balance || 0; // debits positive
  }
  const netIncome = (revenue || 0) - (expense || 0);
  return { revenue, expense, netIncome };
}

export function getFinancialOverview({ asOf } = {}) {
  const db = getDb();
  // Determine as-of date and fiscal year start (calendar year by default)
  const asOfDate = (asOf ? String(asOf) : new Date().toISOString().slice(0, 10)).slice(0, 10);
  const fyStart = `${asOfDate.slice(0,4)}-01-01`;

  // Balance Sheet summary (as of date)
  const bsRows = db.prepare(
    `SELECT ga.type AS account_type,
            SUM(CASE WHEN jl.drcr='D' THEN jl.amount ELSE -jl.amount END) AS balance
       FROM gl_accounts ga
       LEFT JOIN journal_lines jl ON jl.gl_account_id = ga.id
       LEFT JOIN journals j ON j.id = jl.journal_id
      WHERE j.journal_date IS NULL OR substr(j.journal_date,1,10) <= @asOf
      GROUP BY ga.type`
  ).all({ asOf: asOfDate });
  const bs = { assets: 0, liabilities: 0, equity: 0 };
  for (const r of bsRows) {
    if (r.account_type === 'Asset') bs.assets += r.balance || 0;
    if (r.account_type === 'Liability') bs.liabilities += -(r.balance || 0);
    if (r.account_type === 'Equity') bs.equity += -(r.balance || 0);
  }

  // Statement of Activities YTD (from fiscal year start to as-of)
  const revRows = db
    .prepare(
      `SELECT ga.code, ga.name,
              SUM(CASE WHEN jl.drcr='C' THEN jl.amount ELSE -jl.amount END) AS amount
         FROM journal_lines jl
         INNER JOIN journals j ON j.id = jl.journal_id
         INNER JOIN gl_accounts ga ON ga.id = jl.gl_account_id
        WHERE ga.type = 'Revenue' AND substr(j.journal_date,1,10) BETWEEN @from AND @to
        GROUP BY ga.id, ga.code, ga.name`
    )
    .all({ from: fyStart, to: asOfDate });
  let donations = 0;
  let grants = 0;
  let programServices = 0;
  let otherRevenue = 0;
  for (const r of revRows) {
    const code = String(r.code || "");
    const name = String(r.name || "").toLowerCase();
    const bal = Number(r.amount || 0); // credits positive by calculation above
    if (isContributionRevenue({ code: r.code, name: r.name, type: 'Revenue' })) {
      donations += bal;
    } else if (code.startsWith('4200') || name.includes('grant')) {
      grants += bal;
    } else if (code.startsWith('4100') || name.includes('program service') || name.includes('service')) {
      programServices += bal;
    } else {
      otherRevenue += bal;
    }
  }
  // Expenses
  const expRow = db
    .prepare(
      `SELECT SUM(CASE WHEN jl.drcr='D' THEN jl.amount ELSE -jl.amount END) AS amount
         FROM journal_lines jl
         INNER JOIN journals j ON j.id = jl.journal_id
        INNER JOIN gl_accounts ga ON ga.id = jl.gl_account_id
        WHERE ga.type = 'Expense' AND substr(j.journal_date,1,10) BETWEEN @from AND @to`
    )
    .get({ from: fyStart, to: asOfDate });
  const expenses = Number(expRow?.amount || 0);

  const revenueTotal = donations + grants + programServices + otherRevenue;
  const changeInNetAssets = revenueTotal - Math.abs(expenses);
  const netAssets = bs.equity + getStatementNetActivity(db, { to: asOfDate });

  return {
    balanceSheet: {
      assets: bs.assets,
      liabilities: bs.liabilities,
      equity: netAssets,
      assetsEqualsLiabPlusEquity: Math.abs(bs.assets - (bs.liabilities + netAssets)) < 0.01,
    },
    activities: {
      donations,
      grants,
      programServices,
      otherRevenue,
      expenses: -Math.abs(expenses),
      changeInNetAssets,
      asOf: asOfDate,
      from: fyStart,
    },
  };
}

export function getNonprofitStatement({ asOf } = {}) {
  const db = getDb();
  const asOfDate = (asOf ? String(asOf) : new Date().toISOString().slice(0, 10)).slice(0, 10);
  const fyStart = `${asOfDate.slice(0,4)}-01-01`;
  const ttmStart = new Date(new Date(asOfDate).getTime() - 365*24*60*60*1000).toISOString().slice(0,10);

  // Helper to sum over a query
  const sumQuery = (sql, params) => Number(db.prepare(sql).get(params)?.amount || 0);

  // Revenue YTD by categories using heuristics on code/name plus donor type for contributions
  const revRows = db.prepare(
    `SELECT ga.code, ga.name,
            SUM(CASE WHEN jl.drcr='C' THEN jl.amount ELSE -jl.amount END) AS amount
       FROM journal_lines jl
       INNER JOIN journals j ON j.id = jl.journal_id
       INNER JOIN gl_accounts ga ON ga.id = jl.gl_account_id
      WHERE ga.type = 'Revenue' AND substr(j.journal_date,1,10) BETWEEN @from AND @to
      GROUP BY ga.id, ga.code, ga.name`
  ).all({ from: fyStart, to: asOfDate });

  const pick = (row) => ({ code: String(row.code||''), name: String(row.name||'').toLowerCase(), amt: Number(row.amount||0) });

  let contributions = 0, specialEvents = 0, legaciesBequests = 0, releases = 0;
  // Unrestricted contributions breakdown (heuristics)
  let unresIndiv = 0, unresFound = 0, unresOrg = 0, unresOther = 0;
  // Restricted contributions breakdown (heuristics)
  let restrEndow = 0, restrFound = 0, restrOther = 0;
  let govGrants = 0, govGrantsOther = 0;
  let inventoryRevenue = 0, investmentIncome = 0, otherIncome = 0;

  // Preload donor-type breakdown from donations table for contribution revenue
  const donorRows = db.prepare(
    `SELECT
       COALESCE(a.type, 'Household') AS donor_type,
       SUM(d.amount) AS amount
     FROM donations d
     LEFT JOIN accounts a ON a.id = d.account_id
    WHERE d.status = 'Posted' AND substr(d.donated_at,1,10) BETWEEN @from AND @to`
  ).all({ from: fyStart, to: asOfDate });
  let donorIndiv = 0, donorOrg = 0;
  for (const dr of donorRows) {
    const t = String(dr.donor_type || "Household");
    const amt = Number(dr.amount || 0);
    if (t === "Organization") donorOrg += amt;
    else donorIndiv += amt;
  }

  for (const r0 of revRows) {
    const r = pick(r0);
    if (r.name.includes('special event') || r.code.startsWith('405')) { specialEvents += r.amt; continue; }
    if (r.name.includes('bequest') || r.name.includes('legacy') || r.code.startsWith('406')) { legaciesBequests += r.amt; continue; }
    if (r.name.includes('release') || r.name.includes('restriction') || r.code.startsWith('409')) { releases += r.amt; continue; }
    // Restricted contribution heuristics
    if ((r.name.includes('endow') || r.name.includes('endowment'))) { restrEndow += r.amt; continue; }
    if (r.name.includes('foundation') && r.name.includes('restrict')) { restrFound += r.amt; continue; }
    if (r.name.includes('restrict') && !r.name.includes('release') && !r.name.includes('foundation') && !r.name.includes('endow')) { restrOther += r.amt; continue; }
    if (r.name.includes('grant') && (r.name.includes('federal') || r.name.includes('state') || r.name.includes('government'))) { govGrants += r.amt; continue; }
    if (r.name.includes('grant')) { govGrantsOther += r.amt; continue; }
    if (r.name.includes('inventory') || r.code.startsWith('470')) { inventoryRevenue += r.amt; continue; }
    if (r.name.includes('investment') || r.name.includes('dividend') || r.name.includes('interest') || r.code.startsWith('430')) { investmentIncome += r.amt; continue; }
    if (r.name.includes('other income') || r.code.startsWith('480')) { otherIncome += r.amt; continue; }
    if (isContributionRevenue({ code: r.code, name: r.name, type: 'Revenue' })) {
      contributions += r.amt;
      // Use donor-type breakdown first; fallback to name heuristics only if donor totals are zero
      if (donorIndiv || donorOrg) {
        // Scale the account-level contribution proportionally into donor buckets
        const totalDonor = donorIndiv + donorOrg;
        const indivShare = totalDonor ? (donorIndiv / totalDonor) : 0;
        const orgShare = totalDonor ? (donorOrg / totalDonor) : 0;
        unresIndiv += r.amt * indivShare;
        unresOrg += r.amt * orgShare;
      } else {
        // Fallback: heuristics on revenue account name
        if (r.name.includes('individual') || r.name.includes('member') || r.name.includes('donor') || r.name.includes('person')) {
          unresIndiv += r.amt;
        } else if (r.name.includes('foundation') || r.name.includes('trust')) {
          unresFound += r.amt;
        } else if (r.name.includes('organization') || r.name.includes('corporate') || r.name.includes('company') || r.name.includes('business') || r.name.includes('corp')) {
          unresOrg += r.amt;
        } else {
          unresOther += r.amt;
        }
      }
      continue;
    }
    // Not a contribution: exclude from public support buckets
  }

  const otherPublic = unresOther; // displayed as "UNRESTRICTED OTHER"
  // Total Public Support = Restricted (all) + Unrestricted (all) + Special Events + Legacies + Releases
  const totalPublicSupport =
    restrEndow + restrFound + restrOther +
    unresIndiv + unresFound + unresOrg + unresOther +
    specialEvents + legaciesBequests + releases;
  const totalGovernmentSupport = govGrants + govGrantsOther;
  const totalOtherSupport = inventoryRevenue + investmentIncome + otherIncome;
  const totalSupport = totalPublicSupport + totalGovernmentSupport + totalOtherSupport;
  const totalRevenueAndOtherSupport = totalSupport;

  // Expenses YTD by function (heuristics on names + key codes for Program 1/2/3)
  const expRows = db.prepare(
    `SELECT ga.code,
            ga.name,
            SUM(CASE WHEN jl.drcr='D' THEN jl.amount ELSE -jl.amount END) AS amount
       FROM journal_lines jl
       INNER JOIN journals j ON j.id = jl.journal_id
       INNER JOIN gl_accounts ga ON ga.id = jl.gl_account_id
      WHERE ga.type = 'Expense' AND substr(j.journal_date,1,10) BETWEEN @from AND @to
      GROUP BY ga.id, ga.code, ga.name`
  ).all({ from: fyStart, to: asOfDate });

  let programServices = 0, mgmtAdmin = 0, fundraising = 0, otherSupportSvcs = 0;
  // Explicit buckets for Program 1/2/3 to support FS links for 5100/5200/5300
  let program1 = 0, program2 = 0, program3 = 0;
  for (const e of expRows) {
    const code = String(e.code || '').trim();
    const name = String(e.name||'').toLowerCase();
    const amt = Number(e.amount||0);
    if (name.includes('program')) {
      programServices += amt;
      // Map canonical program codes to Program 1/2/3 buckets
      if (code === '5100') program1 += amt;
      else if (code === '5200') program2 += amt;
      else if (code === '5300') program3 += amt;
    } else if (name.includes('admin') || name.includes('management')) {
      mgmtAdmin += amt;
    } else if (name.includes('fundraising')) {
      fundraising += amt;
    } else {
      otherSupportSvcs += amt;
    }
  }
  const totalExpenses = programServices + mgmtAdmin + fundraising + otherSupportSvcs;

  const changeFromOperations = totalRevenueAndOtherSupport - totalExpenses;

  // Realized gains (YTD) - revenue accounts with 'gain'
  const realizedGains = sumQuery(
    `SELECT SUM(CASE WHEN jl.drcr='C' THEN jl.amount ELSE -jl.amount END) AS amount
       FROM journal_lines jl
       INNER JOIN journals j ON j.id = jl.journal_id
       INNER JOIN gl_accounts ga ON ga.id = jl.gl_account_id
      WHERE ga.type='Revenue' AND substr(j.journal_date,1,10) BETWEEN @from AND @to AND lower(ga.name) LIKE '%gain%'`,
    { from: fyStart, to: asOfDate }
  );

  const changeInNetAssets = changeFromOperations + realizedGains;

  // Net assets include explicit equity balances plus unclosed revenue/expense activity.
  const equityAsOf = getNetAssetsFromEquityAndActivity(db, { asOf: asOfDate });
  const equityBofY = getNetAssetsFromEquityAndActivity(db, { before: fyStart });
  const netAssetsYTD = equityAsOf - equityBofY;
  const ttmChange = sumQuery(
    `SELECT (COALESCE(r.amount,0) - COALESCE(e.amount,0)) AS amount FROM
      (SELECT SUM(CASE WHEN jl.drcr='C' THEN jl.amount ELSE 0 END) AS amount
         FROM journal_lines jl INNER JOIN journals j ON j.id = jl.journal_id INNER JOIN gl_accounts ga ON ga.id = jl.gl_account_id
        WHERE ga.type='Revenue' AND substr(j.journal_date,1,10) BETWEEN @from AND @to) r,
      (SELECT SUM(CASE WHEN jl.drcr='D' THEN jl.amount ELSE 0 END) AS amount
         FROM journal_lines jl INNER JOIN journals j ON j.id = jl.journal_id INNER JOIN gl_accounts ga ON ga.id = jl.gl_account_id
        WHERE ga.type='Expense' AND substr(j.journal_date,1,10) BETWEEN @from AND @to) e`,
    { from: ttmStart, to: asOfDate }
  );

  return {
    asOf: asOfDate,
    from: fyStart,
    revenuesOfSupport: {
      contributions,
      specialEvents,
      legaciesBequests,
      releases,
      otherPublic,
      totalPublicSupport,
      govGrants,
      govGrantsOther,
      totalGovernmentSupport,
      inventoryRevenue,
      investmentIncome,
      otherIncome,
      totalOtherSupport,
      totalSupport,
      totalRevenueAndOtherSupport,
      unresIndiv,
      unresFound,
      unresOrg,
      restrictedBreakdown: {
        endowments: restrEndow,
        foundations: restrFound,
        other: restrOther,
      },
    },
    expenses: {
      programServices,
      program1,
      program2,
      program3,
      mgmtAdmin,
      fundraising,
      otherSupportSvcs,
      totalExpenses,
    },
    changeFromOperations,
    realizedGains,
    changeInNetAssets,
    netAssets: {
      beginningOfYear: equityBofY,
      ytd: netAssetsYTD,
      trailingTwelveMonths: ttmChange,
      endOfYear: equityAsOf,
    },
  };
}

export function getBalanceSheetClassified({ asOf } = {}) {
  const db = getDb();
  const asOfDate = (asOf ? String(asOf) : new Date().toISOString().slice(0, 10)).slice(0, 10);
  const accountColumns = new Set(db.prepare("PRAGMA table_info('gl_accounts')").all().map((column) => column.name));
  const currentAssetSelect = accountColumns.has("is_current_asset") ? "ga.is_current_asset" : "0";
  const rows = db.prepare(
    `SELECT ga.id, ga.code, ga.name, ga.type, ${currentAssetSelect} AS is_current_asset,
            SUM(CASE WHEN jl.drcr='D' THEN jl.amount ELSE -jl.amount END) AS balance
       FROM gl_accounts ga
       LEFT JOIN journal_lines jl ON jl.gl_account_id = ga.id
       LEFT JOIN journals j ON j.id = jl.journal_id
      WHERE (j.journal_date IS NULL OR substr(j.journal_date,1,10) <= @asOf)
      GROUP BY ga.id, ga.code, ga.name, ga.type`
  ).all({ asOf: asOfDate });

  const sum = (pred) => rows.filter(pred).reduce((s, r) => s + Number(r.balance || 0), 0);
  const sumCredit = (pred) => -sum(pred);
  const nameHas = (r, s) => String(r.name || '').toLowerCase().includes(s);
  const codeStarts = (r, prefix) => String(r.code || '').startsWith(prefix);

  // Current Assets
  // Treat any Asset that either mentions "cash" or has a code in the 10xx range as cash/cash equivalents
  const cash = sum(r => r.type === 'Asset' && (nameHas(r,'cash') || codeStarts(r,'10')));
  const receivables = sum(r => r.type === 'Asset' && (nameHas(r,'receivable') || codeStarts(r,'110') || codeStarts(r,'120')));
  const regAssetsCurr = sum(r => r.type === 'Asset' && nameHas(r,'regulatory') && nameHas(r,'current'));
  const inventories = sum(r => r.type === 'Asset' && (nameHas(r,'inventory') || codeStarts(r,'130')));
  const prepaymentsOther = sum(r => r.type === 'Asset' && (nameHas(r,'prepaid') || nameHas(r,'prepayment') || nameHas(r,'other current')));
  const flaggedCurrent = rows.filter(r => r.type === 'Asset' && Number(r.is_current_asset) === 1)
    .reduce((s,r)=> s + Number(r.balance||0), 0);
  const discontinuedCurr = sum(r => r.type === 'Asset' && (nameHas(r,'discontinued') || nameHas(r,'held for sale')));
  const totalCurrentAssets = cash + receivables + regAssetsCurr + inventories + prepaymentsOther + discontinuedCurr + flaggedCurrent;

  // Noncurrent Assets
  const ppe = sum(r => r.type === 'Asset' && (nameHas(r,'property') || nameHas(r,'plant') || nameHas(r,'equipment') || nameHas(r,'fixed asset')));
  const accumDepAmort = sum(r => r.type === 'Asset' && (nameHas(r,'accumulated depreciation') || nameHas(r,'accumulated amortization')));
  const goodwill = sum(r => r.type === 'Asset' && nameHas(r,'goodwill'));
  const regAssetsNon = sum(r => r.type === 'Asset' && nameHas(r,'regulatory') && !nameHas(r,'current'));
  const investments = sum(r => r.type === 'Asset' && nameHas(r,'investment'));
  const noncurrentOther = sum(r => r.type === 'Asset' && !(
    nameHas(r,'property') ||
    nameHas(r,'plant') ||
    nameHas(r,'equipment') ||
    nameHas(r,'fixed asset') ||
    nameHas(r,'accumulated depreciation') ||
    nameHas(r,'accumulated amortization') ||
    nameHas(r,'goodwill') ||
    nameHas(r,'regulatory') ||
    nameHas(r,'investment') ||
    nameHas(r,'cash') ||
    codeStarts(r,'10') || // treat all 10xx (cash/undeposited) as current assets
    nameHas(r,'receivable') ||
    nameHas(r,'inventory') ||
    nameHas(r,'prepaid') ||
    nameHas(r,'prepayment') ||
    nameHas(r,'other current') ||
    nameHas(r,'discontinued')
  ));
  const totalNoncurrentAssets = ppe + accumDepAmort + goodwill + regAssetsNon + investments + noncurrentOther;

  const totalAssets = totalCurrentAssets + totalNoncurrentAssets;

  // Current Liabilities
  const currentPortionDebt = sumCredit(r => r.type === 'Liability' && (nameHas(r,'current portion') && nameHas(r,'debt')));
  const accountsPayable = sumCredit(r => r.type === 'Liability' && nameHas(r,'accounts payable'));
  const regLiabCurr = sumCredit(r => r.type === 'Liability' && nameHas(r,'regulatory') && nameHas(r,'current'));
  const taxesPayable = sumCredit(r => r.type === 'Liability' && (nameHas(r,'tax') && nameHas(r,'payable')));
  const dividendsPayable = sumCredit(r => r.type === 'Liability' && nameHas(r,'dividends payable'));
  const accruedComp = sumCredit(r => r.type === 'Liability' && (nameHas(r,'accrued compensation') || nameHas(r,'accrued payroll') || nameHas(r,'salaries payable')));
  const otherAccrued = sumCredit(r => r.type === 'Liability' && nameHas(r,'accrued') && !(nameHas(r,'compensation')||nameHas(r,'payroll')||nameHas(r,'salary')));
  const totalCurrentLiab = currentPortionDebt + accountsPayable + regLiabCurr + taxesPayable + dividendsPayable + accruedComp + otherAccrued;

  // Noncurrent Liabilities
  const longTermDebt = sumCredit(r => r.type === 'Liability' && (nameHas(r,'long-term debt') || nameHas(r,'long term debt') || nameHas(r,'notes payable')));
  const deferredTaxes = sumCredit(r => r.type === 'Liability' && nameHas(r,'deferred') && nameHas(r,'tax'));
  const regLiabNon = sumCredit(r => r.type === 'Liability' && nameHas(r,'regulatory') && !nameHas(r,'current'));
  const assetRetirement = sumCredit(r => r.type === 'Liability' && (nameHas(r,'asset retirement') || nameHas(r,'aro')));
  const liabOtherNoncurrent = sumCredit(r => r.type === 'Liability' && !(nameHas(r,'long-term debt')||nameHas(r,'long term debt')||nameHas(r,'notes payable')||nameHas(r,'deferred')||nameHas(r,'tax')||nameHas(r,'regulatory')||nameHas(r,'asset retirement')||nameHas(r,'aro')||nameHas(r,'current')||nameHas(r,'accounts payable')||nameHas(r,'dividends payable')||nameHas(r,'accrued') ));
  const totalNoncurrentLiab = longTermDebt + deferredTaxes + regLiabNon + assetRetirement + liabOtherNoncurrent;

  const totalLiabilities = totalCurrentLiab + totalNoncurrentLiab;
  const equity = getNetAssetsFromEquityAndActivity(db, { asOf: asOfDate });
  const totalLiabilitiesAndEquity = totalLiabilities + equity;

  return {
    asOf: asOfDate,
    currentAssets: {
      cash,
      receivables,
      regulatory: regAssetsCurr,
      inventories,
      prepaymentsOther,
      discontinued: discontinuedCurr,
      total: totalCurrentAssets,
    },
    noncurrentAssets: {
      ppe,
      accumDepAmort,
      goodwill,
      regulatory: regAssetsNon,
      investments,
      other: noncurrentOther,
      total: totalNoncurrentAssets,
    },
    totalAssets,
    currentLiabilities: {
      currentPortionDebt,
      accountsPayable,
      regulatory: regLiabCurr,
      taxesPayable,
      dividendsPayable,
      accruedCompensation: accruedComp,
      otherAccrued,
      total: totalCurrentLiab,
    },
    noncurrentLiabilities: {
      longTermDebt,
      deferredTaxes,
      regulatory: regLiabNon,
      assetRetirementObligations: assetRetirement,
      other: liabOtherNoncurrent,
      total: totalNoncurrentLiab,
    },
    equity,
    totalLiabilitiesAndEquity,
  };
}
