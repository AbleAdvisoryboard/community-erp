import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

let dbInstance;
let currentPath;

function resolveDbPath() {
  const custom = process.env.DB_PATH;
  if (custom && custom.trim().length > 0) {
    return path.resolve(custom);
  }
  return path.join(process.cwd(), "data", "app.db");
}

function ensureDatabase(dbPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function getDb() {
  const targetPath = resolveDbPath();
  if (dbInstance) {
    if (currentPath === targetPath) {
      return dbInstance;
    }
    dbInstance.close();
    dbInstance = null;
  }

  ensureDatabase(targetPath);

  dbInstance = new Database(targetPath);
  dbInstance.pragma("journal_mode = WAL");
  dbInstance.pragma("foreign_keys = ON");
  currentPath = targetPath;

  return dbInstance;
}

export function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    currentPath = undefined;
  }
}

export function getDbPath() {
  if (currentPath) {
    return currentPath;
  }
  return resolveDbPath();
}
