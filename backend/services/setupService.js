import bcrypt from "bcrypt";
import { getDb } from "../db/connection.js";
import { seedAccessCore } from "../db/accessCore.js";
import { writeAuditLog } from "../utils/audit.js";

function setSetting(db, key, value) {
  db.prepare(
    `INSERT INTO app_settings (key, value)
     VALUES (@key, @value)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run({ key, value });
}

export function hasActiveAdmin() {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT u.id) AS count
       FROM users u
       INNER JOIN user_roles ur ON ur.user_id = u.id
       INNER JOIN roles r ON r.id = ur.role_id
       WHERE r.name = 'Admin' AND u.is_active = 1`
    )
    .get();
  return Number(row?.count || 0) > 0;
}

export function getSetupStatus() {
  return {
    setupRequired: !hasActiveAdmin(),
  };
}

export async function completeFirstRunSetup(payload, context = {}) {
  const db = getDb();
  if (hasActiveAdmin()) {
    const error = new Error("Setup is already complete.");
    error.status = 403;
    throw error;
  }

  const organizationName = String(payload.organizationName || "").trim();
  const organizationLogo = String(payload.organizationLogo || "").trim();
  const adminName = String(payload.adminName || "").trim();
  const adminEmail = String(payload.adminEmail || "").trim().toLowerCase();
  const passwordHash = await bcrypt.hash(payload.adminPassword, 10);

  const tx = db.transaction(() => {
    seedAccessCore(db);
    setSetting(db, "company_name", organizationName);
    setSetting(db, "company_logo", organizationLogo);

    const userResult = db
      .prepare(
        `INSERT INTO users (email, password_hash, display_name, is_active)
         VALUES (@email, @password_hash, @display_name, 1)`
      )
      .run({
        email: adminEmail,
        password_hash: passwordHash,
        display_name: adminName,
      });
    const role = db.prepare("SELECT id FROM roles WHERE name = 'Admin'").get();
    db.prepare("INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)").run(
      userResult.lastInsertRowid,
      role.id
    );

    writeAuditLog({
      userId: userResult.lastInsertRowid,
      entity: "setup",
      entityId: "first-run",
      action: "complete",
      after: { organizationName, adminEmail },
      ipAddress: context.ip,
      userAgent: context.userAgent,
    });
  });

  tx();
  return getSetupStatus();
}
