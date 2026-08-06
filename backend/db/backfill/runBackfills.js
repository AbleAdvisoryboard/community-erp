import { getDb, closeDb } from "../connection.js";

const backfills = [
  {
    id: "20250925_reports_admin_role",
    description: "Ensure every saved report grants Admin role access",
    run(db) {
      const reports = db.prepare("SELECT id FROM report_definitions").all();
      const insert = db.prepare("INSERT OR IGNORE INTO report_roles (report_id, role_name, filters_json) VALUES (@report_id, @role_name, NULL)");
      for (const report of reports) {
        insert.run({ report_id: report.id, role_name: 'Admin' });
      }
    },
  },
  {
    id: "20250925_dashboard_cards_admin_role",
    description: "Ensure dashboard cards are visible to Admin users",
    run(db) {
      const cards = db.prepare("SELECT id FROM dashboard_cards").all();
      const insert = db.prepare("INSERT OR IGNORE INTO dashboard_card_roles (card_id, role_name, filters_json) VALUES (@card_id, @role_name, NULL)");
      for (const card of cards) {
        insert.run({ card_id: card.id, role_name: 'Admin' });
      }
    },
  },
];

export function runBackfills({ log = true } = {}) {
  const db = getDb();
  db.exec(
    "CREATE TABLE IF NOT EXISTS backfill_history (id TEXT PRIMARY KEY, description TEXT, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  );
  const appliedRows = db.prepare("SELECT id FROM backfill_history").all();
  const applied = new Set(appliedRows.map((row) => row.id));
  const insertHistory = db.prepare(
    "INSERT INTO backfill_history (id, description) VALUES (@id, @description)"
  );

  for (const backfill of backfills) {
    if (applied.has(backfill.id)) {
      if (log) console.log(`Skipping backfill ${backfill.id} (already applied)`);
      continue;
    }
    if (log) console.log(`Applying backfill ${backfill.id}`);
    db.exec("BEGIN");
    try {
      backfill.run(db);
      insertHistory.run(backfill);
      db.exec("COMMIT");
      if (log) console.log(`Backfill ${backfill.id} complete`);
    } catch (error) {
      db.exec("ROLLBACK");
      console.error(`Backfill ${backfill.id} failed`, error);
      throw error;
    }
  }
}

export function closeBackfillDb() {
  closeDb();
}
