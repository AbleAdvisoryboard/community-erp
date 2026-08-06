import { mkdtempSync, rmSync, existsSync, copyFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..");

const originalDbPath = process.env.DB_PATH || path.join(projectRoot, "data", "app.db");

if (!existsSync(originalDbPath)) {
  throw new Error(`Database not found at ${originalDbPath}. Run 'npm run db:migrate && npm run db:seed' first.`);
}

const tempDir = mkdtempSync(path.join(os.tmpdir(), "erp-upgrade-"));
const tempDbPath = path.join(tempDir, "app.db");
copyFileSync(originalDbPath, tempDbPath);
process.env.DB_PATH = tempDbPath;

const { runMigrations } = await import("../backend/db/migrate.js");
const { runBackfills, closeBackfillDb } = await import("../backend/db/backfill/runBackfills.js");
const { getDb, closeDb } = await import("../backend/db/connection.js");

let verificationError = null;
try {
  runMigrations();
  runBackfills({ log: false });
  const db = getDb();
  const reportCount = db.prepare("SELECT COUNT(*) as count FROM report_definitions").get().count;
  const cardCount = db.prepare("SELECT COUNT(*) as count FROM dashboard_cards").get().count;
  const backfillCount = db.prepare("SELECT COUNT(*) as count FROM backfill_history").get().count;
  console.log("Migrations and backfills completed successfully on snapshot DB.");
  console.log(`Reports: ${reportCount}, Dashboard cards: ${cardCount}, Applied backfills: ${backfillCount}`);
  closeDb();
  closeBackfillDb();
} catch (error) {
  verificationError = error;
  console.error("Upgrade verification failed:", error);
} finally {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch (cleanupError) {
    console.warn("Failed to clean temporary directory", cleanupError);
  }
}

if (verificationError) {
  throw verificationError;
}
