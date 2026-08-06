import { getDb } from './connection.js';

export function ensureSchemaBaseline() {
  const db = getDb();
  db.exec("CREATE TABLE IF NOT EXISTS app_schema_version (flag TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
}

export function requireSchemaAtLeast(flag) {
  ensureSchemaBaseline();
  const db = getDb();
  const row = db.prepare("SELECT 1 FROM app_schema_version WHERE flag = ?").get(flag);
  if (!row) {
    throw new Error(`Database schema missing required flag ${flag}. Please run migrations.`);
  }
}

