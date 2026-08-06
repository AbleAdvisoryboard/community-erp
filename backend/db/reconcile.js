import { getDb } from './connection.js';
import { ensureSchemaBaseline } from './schema.js';

function columnExists(db, table, column) {
  const r = db.prepare("PRAGMA table_info('" + table + "')").all();
  return r.some(row => row.name === column);
}

function ensureColumn(db, table, column, ddl) {
  if (!columnExists(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

const DEFAULT_CONTACT_TAGS = [
  "Household",
  "Major Donor",
  "Donor",
  "Operations",
  "Volunteer",
  "Non-profit Rep",
  "Executive Director",
];

function ensureContactTagDefaults(db) {
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'contact_tags'")
    .get();
  if (!table) return;

  const insert = db.prepare("INSERT OR IGNORE INTO contact_tags (name) VALUES (?)");
  const tx = db.transaction(() => {
    for (const tag of DEFAULT_CONTACT_TAGS) {
      insert.run(tag);
    }
  });
  tx();

  const legacy = db.prepare("SELECT id FROM contact_tags WHERE name = ?").get("Doner");
  const donor = db.prepare("SELECT id FROM contact_tags WHERE name = ?").get("Donor");
  if (legacy && donor && legacy.id !== donor.id) {
    db.prepare(
      "INSERT OR IGNORE INTO contact_tag_links (contact_id, tag_id) SELECT contact_id, ? FROM contact_tag_links WHERE tag_id = ?"
    ).run(donor.id, legacy.id);
    db.prepare("DELETE FROM contact_tag_links WHERE tag_id = ?").run(legacy.id);
    db.prepare("DELETE FROM contact_tags WHERE id = ?").run(legacy.id);
  }
}

function ensureVolunteerVocabDefaults(db) {
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'volunteer_vocab'")
    .get();
  if (!table) return;

  const row = db.prepare("SELECT COUNT(1) AS count FROM volunteer_vocab").get();
  if (Number(row?.count || 0) > 0) return;

  const insert = db.prepare("INSERT OR IGNORE INTO volunteer_vocab (type, name) VALUES (?, ?)");
  const defaults = [
    ["skill", "Administrative Support"],
    ["skill", "Childcare"],
    ["skill", "Cooking"],
    ["skill", "Data Entry"],
    ["skill", "Driving"],
    ["skill", "Event Setup"],
    ["skill", "First Aid"],
    ["skill", "Food Prep"],
    ["skill", "Fundraising"],
    ["skill", "Grant Writing"],
    ["skill", "Inventory"],
    ["skill", "Logistics"],
    ["skill", "Mentoring"],
    ["skill", "Outreach"],
    ["skill", "Photography"],
    ["skill", "Technology Support"],
    ["skill", "Training"],
    ["skill", "Translation"],
    ["skill", "Tutoring"],
    ["interest", "Administration"],
    ["interest", "Advocacy"],
    ["interest", "Communications"],
    ["interest", "Community Meals"],
    ["interest", "Cooking"],
    ["interest", "Education"],
    ["interest", "Emergency Response"],
    ["interest", "Events"],
    ["interest", "Food Pantry"],
    ["interest", "Fundraising"],
    ["interest", "Health and Wellness"],
    ["interest", "Housing Support"],
    ["interest", "Inventory"],
    ["interest", "Mentoring"],
    ["interest", "Outreach"],
    ["interest", "Senior Support"],
    ["interest", "Transportation"],
    ["interest", "Tutoring"],
    ["interest", "Youth Programs"],
  ];

  const tx = db.transaction(() => {
    for (const [type, name] of defaults) {
      insert.run(type, name);
    }
  });
  tx();
}

export function reconcileSchema() {
  const db = getDb();
  ensureSchemaBaseline();
  // journal_lines trace fields
  ensureColumn(db, 'journal_lines', 'class_id', 'INTEGER');
  ensureColumn(db, 'journal_lines', 'campaign_id', 'INTEGER');
  ensureColumn(db, 'journal_lines', 'source_table', 'TEXT');
  ensureColumn(db, 'journal_lines', 'source_id', 'INTEGER');
  ensureColumn(db, 'journal_lines', 'source_line', 'INTEGER');
  // donations deposit linkage
  ensureColumn(db, 'donations', 'deposit_batch_id', 'INTEGER');
  // auth security settings
  ensureColumn(db, 'users', 'failed_login_count', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'users', 'locked_until', 'TEXT');
  // GL account enhancements
  ensureColumn(db, 'gl_accounts', 'linked_revenue_bucket', 'TEXT');
  ensureColumn(db, 'gl_accounts', 'is_current_asset', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'gl_accounts', 'fs_category', 'TEXT');
  // Helpful indexes
  db.exec("CREATE INDEX IF NOT EXISTS idx_journal_lines_source ON journal_lines(source_table, source_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_journal_lines_campaign ON journal_lines(campaign_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_donations_deposit ON donations(deposit_batch_id)");
  // Populate FS category defaults for common COA codes if not set
  try {
    db.exec("UPDATE gl_accounts SET fs_category = 'balance.asset.cash_current' WHERE code IN ('1000','1010') AND (fs_category IS NULL OR fs_category = '')");
    db.exec("UPDATE gl_accounts SET fs_category = 'balance.asset.trade_receivables' WHERE code IN ('1100','1200') AND (fs_category IS NULL OR fs_category = '')");
    db.exec("UPDATE gl_accounts SET fs_category = 'balance.liability.current.ap' WHERE code = '2000' AND (fs_category IS NULL OR fs_category = '')");
    db.exec("UPDATE gl_accounts SET fs_category = 'balance.liability.current.other' WHERE code = '2100' AND (fs_category IS NULL OR fs_category = '')");
    db.exec("UPDATE gl_accounts SET fs_category = 'balance.equity.net_assets' WHERE code IN ('3000','3100','3200') AND (fs_category IS NULL OR fs_category = '')");
    db.exec("UPDATE gl_accounts SET fs_category = 'activities.revenue.unres_org' WHERE code IN ('4000','4100') AND (fs_category IS NULL OR fs_category = '')");
    db.exec("UPDATE gl_accounts SET fs_category = 'activities.revenue.gov_state' WHERE code = '4200' AND (fs_category IS NULL OR fs_category = '')");
    db.exec("UPDATE gl_accounts SET fs_category = 'activities.exp.operational.other' WHERE code IN ('5000','6000') AND (fs_category IS NULL OR fs_category = '')");
    db.exec("UPDATE gl_accounts SET fs_category = 'activities.exp.program.generic' WHERE code = '5100' AND (fs_category IS NULL OR fs_category = '')");
    db.exec("UPDATE gl_accounts SET fs_category = 'activities.exp.operational.salaries' WHERE code = '6100' AND (fs_category IS NULL OR fs_category = '')");
    db.exec("UPDATE gl_accounts SET fs_category = 'activities.exp.operational.benefits' WHERE code = '6200' AND (fs_category IS NULL OR fs_category = '')");
    db.exec("UPDATE gl_accounts SET fs_category = 'activities.exp.operational.rent' WHERE code = '6300' AND (fs_category IS NULL OR fs_category = '')");
  } catch (e) {
    // ignore
  }
  ensureContactTagDefaults(db);
  ensureVolunteerVocabDefaults(db);
  // Set trace flag
  db.exec("INSERT OR IGNORE INTO app_schema_version(flag) VALUES ('2025-10-22-trace')");
}
