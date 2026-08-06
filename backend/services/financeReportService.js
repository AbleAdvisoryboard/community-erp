import { getDb } from "../db/connection.js";

export function trialBalance({ asOf, fundId, classId } = {}) {
  const where = ["1=1"]; const params = {};
  if (asOf) { where.push("j.journal_date <= @asOf"); params.asOf = String(asOf).slice(0,10); }
  if (fundId) { where.push("jl.fund_id = @fundId"); params.fundId = fundId; }
  if (classId) { where.push("jl.class_id = @classId"); params.classId = classId; }
  const sql = `SELECT ga.code, ga.name, ga.type,
    SUM(CASE WHEN jl.drcr='D' THEN jl.amount ELSE 0 END) AS debits,
    SUM(CASE WHEN jl.drcr='C' THEN jl.amount ELSE 0 END) AS credits,
    SUM(CASE WHEN jl.drcr='D' THEN jl.amount ELSE -jl.amount END) AS balance
    FROM gl_accounts ga
    LEFT JOIN journal_lines jl ON jl.gl_account_id = ga.id
    LEFT JOIN journals j ON j.id = jl.journal_id
    WHERE ${where.join(' AND ')}
    GROUP BY ga.id
    ORDER BY ga.code`;
  return getDb().prepare(sql).all(params);
}

export function statementOfActivities({ from, to, fundId } = {}) {
  const where = ["1=1"]; const params = {};
  if (from) { where.push("j.journal_date >= @from"); params.from = String(from).slice(0,10); }
  if (to) { where.push("j.journal_date <= @to"); params.to = String(to).slice(0,10); }
  if (fundId) { where.push("jl.fund_id = @fundId"); params.fundId = fundId; }
  const sql = `SELECT ga.type AS account_type,
    SUM(CASE WHEN jl.drcr='C' THEN jl.amount ELSE 0 END) AS credits,
    SUM(CASE WHEN jl.drcr='D' THEN jl.amount ELSE 0 END) AS debits
    FROM journal_lines jl
    INNER JOIN journals j ON j.id = jl.journal_id
    INNER JOIN gl_accounts ga ON ga.id = jl.gl_account_id
    WHERE ${where.join(' AND ')} AND ga.type IN ('Revenue','Expense')
    GROUP BY ga.type`;
  const rows = getDb().prepare(sql).all(params);
  const revenueRow = rows.find(r => r.account_type === 'Revenue') || { credits: 0, debits: 0 };
  const expenseRow = rows.find(r => r.account_type === 'Expense') || { credits: 0, debits: 0 };
  const revenue = (revenueRow.credits || 0) - (revenueRow.debits || 0);
  const expenses = (expenseRow.debits || 0) - (expenseRow.credits || 0);
  return { revenue, expenses, changeInNetAssets: revenue - expenses };
}

export function functionalExpenses({ from, to } = {}) {
  const where = ["1=1", "ga.type = 'Expense'"]; const params = {};
  if (from) { where.push("j.journal_date >= @from"); params.from = String(from).slice(0,10); }
  if (to) { where.push("j.journal_date <= @to"); params.to = String(to).slice(0,10); }
  const sql = `SELECT c.name AS class_name,
    SUM(CASE WHEN jl.drcr='D' THEN jl.amount ELSE -jl.amount END) AS expenses
    FROM journal_lines jl
    INNER JOIN journals j ON j.id = jl.journal_id
    INNER JOIN gl_accounts ga ON ga.id = jl.gl_account_id
    LEFT JOIN classes c ON c.id = jl.class_id
    WHERE ${where.join(' AND ')}
    GROUP BY c.id`;
  return getDb().prepare(sql).all(params);
}

export function arAging() {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM v_ar_aging").all();
  return rows.map(r => ({ ...r, bucket_120_plus: Math.max(0, (r.bucket_90_plus || 0) - 0) }));
}

export function apAging() {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM v_ap_aging").all();
  return rows.map(r => ({ ...r, bucket_120_plus: Math.max(0, (r.bucket_90_plus || 0) - 0) }));
}

