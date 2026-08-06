import { getDb } from "../db/connection.js";

// Cache prepared insert tailored to current schema (once per process)
let cached = null;

export function getJlInsert(db = getDb()) {
  if (cached) return cached;
  const cols = new Set(db.prepare("PRAGMA table_info('journal_lines')").all().map(r => r.name));
  // Minimum schema columns we target
  const base = ['journal_id','gl_account_id','amount','drcr'];
  const optionals = [];
  // Always include these if present
  ['fund_id','campaign_id','memo','source_table','source_id','source_line'].forEach(c => { if (cols.has(c)) optionals.push(c); });
  // class_id is optional; insert NULL if absent by just omitting the column
  if (cols.has('class_id')) optionals.splice(1, 0, 'class_id'); // near fund/campaign
  const all = [...base, ...optionals];
  const sql = `INSERT INTO journal_lines (${all.join(',')}) VALUES (${all.map(()=>'?').join(',')})`;
  const stmt = db.prepare(sql);
  cached = { stmt, cols: all };
  return cached;
}

