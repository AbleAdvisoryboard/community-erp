import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runMigrations } from "../../db/migrate.js";
import { getDb, closeDb } from "../../db/connection.js";
import { seedAll } from "../../db/seeds/seed_all.js";

const TEMP_PREFIX = "nonprofits-tests-";

function createTempDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  return {
    root,
    file: path.join(root, "test.db"),
  };
}

export function useTestDatabase({ seed = true } = {}) {
  const { root, file: dbFile } = createTempDatabase();

  process.env.DB_PATH = dbFile;
  process.env.SQLITE_DB_PATH = dbFile;

  runMigrations();
  getDb();

  if (seed) {
    seedAll({ log: false });
  }

  return {
    cleanup() {
      closeDb?.();
      try {
        fs.rmSync(root, { recursive: true, force: true });
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }
      }
    },
    dbPath: dbFile,
  };
}
