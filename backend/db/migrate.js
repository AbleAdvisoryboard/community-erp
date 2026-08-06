import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { getDb, closeDb } from "./connection.js";

function loadMigrations(dir) {
  const entries = fs.readdirSync(dir).filter((file) => file.endsWith(".sql"));
  entries.sort();
  return entries.map((file) => ({
    id: file,
    sql: fs.readFileSync(path.join(dir, file), "utf-8"),
  }));
}

export function runMigrations({ reset = false } = {}) {
  const db = getDb();
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  );

  if (reset) {
    const applied = db.prepare("SELECT id FROM schema_migrations").all();
    if (applied.length) {
      console.log("Resetting database state...");
    }
    db.exec("PRAGMA foreign_keys = OFF");
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all();
    for (const { name } of tables) {
      if (name === "schema_migrations") {
        continue;
      }
      db.exec(`DROP TABLE IF EXISTS "${name}"`);
    }
    db.exec("DELETE FROM schema_migrations");
    db.exec("PRAGMA foreign_keys = ON");
  }

  const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");
  const migrations = loadMigrations(migrationsDir);

  const appliedRows = db.prepare("SELECT id FROM schema_migrations").all();
  const appliedSet = new Set(appliedRows.map((row) => row.id));

  for (const migration of migrations) {
    if (appliedSet.has(migration.id)) {
      continue;
    }

    console.log(`Applying migration ${migration.id}`);
    db.exec("BEGIN");
    try {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (id) VALUES (?)").run(migration.id);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }

  console.log("Migrations complete.");
}

function main() {
  const reset = process.argv.includes("--reset");
  try {
    runMigrations({ reset });
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exitCode = 1;
  } finally {
    closeDb();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
