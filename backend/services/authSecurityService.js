import { getDb } from "../db/connection.js";
import { writeAuditLog } from "../utils/audit.js";

const SECURITY_KEYS = {
  accessTimeoutMinutes: "auth.access_timeout_minutes",
  failedLoginLimit: "auth.failed_login_limit",
  lockoutMinutes: "auth.lockout_minutes",
};

const DEFAULT_SECURITY_SETTINGS = {
  accessTimeoutMinutes: 15,
  failedLoginLimit: 5,
  lockoutMinutes: 30,
};

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function getSetting(key, fallback = "") {
  const db = getDb();
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
  return row?.value ?? fallback;
}

function setSetting(key, value) {
  const db = getDb();
  db.prepare(
    `INSERT INTO app_settings (key, value)
     VALUES (@key, @value)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run({ key, value: String(value) });
}

export function ensureAuthSecuritySchema() {
  const db = getDb();
  const columns = db.prepare("PRAGMA table_info('users')").all().map((row) => row.name);
  if (!columns.includes("failed_login_count")) {
    db.exec("ALTER TABLE users ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!columns.includes("locked_until")) {
    db.exec("ALTER TABLE users ADD COLUMN locked_until TEXT");
  }
}

export function getAuthSecuritySettings() {
  return {
    accessTimeoutMinutes: clampNumber(
      getSetting(SECURITY_KEYS.accessTimeoutMinutes, DEFAULT_SECURITY_SETTINGS.accessTimeoutMinutes),
      DEFAULT_SECURITY_SETTINGS.accessTimeoutMinutes,
      5,
      720
    ),
    failedLoginLimit: clampNumber(
      getSetting(SECURITY_KEYS.failedLoginLimit, DEFAULT_SECURITY_SETTINGS.failedLoginLimit),
      DEFAULT_SECURITY_SETTINGS.failedLoginLimit,
      3,
      20
    ),
    lockoutMinutes: clampNumber(
      getSetting(SECURITY_KEYS.lockoutMinutes, DEFAULT_SECURITY_SETTINGS.lockoutMinutes),
      DEFAULT_SECURITY_SETTINGS.lockoutMinutes,
      5,
      1440
    ),
  };
}

export function updateAuthSecuritySettings(payload, context) {
  const before = getAuthSecuritySettings();
  const next = {
    accessTimeoutMinutes: clampNumber(payload.accessTimeoutMinutes, before.accessTimeoutMinutes, 5, 720),
    failedLoginLimit: clampNumber(payload.failedLoginLimit, before.failedLoginLimit, 3, 20),
    lockoutMinutes: clampNumber(payload.lockoutMinutes, before.lockoutMinutes, 5, 1440),
  };
  setSetting(SECURITY_KEYS.accessTimeoutMinutes, next.accessTimeoutMinutes);
  setSetting(SECURITY_KEYS.failedLoginLimit, next.failedLoginLimit);
  setSetting(SECURITY_KEYS.lockoutMinutes, next.lockoutMinutes);
  writeAuditLog({
    userId: context.userId ?? null,
    entity: "settings",
    entityId: "auth-security",
    action: "update",
    before,
    after: next,
    ipAddress: context.ip,
    userAgent: context.userAgent,
  });
  return next;
}

export function getAccessTokenTimeoutMinutes() {
  return getAuthSecuritySettings().accessTimeoutMinutes;
}

export function getAccessTokenTimeoutMs() {
  return getAccessTokenTimeoutMinutes() * 60 * 1000;
}

export function isUserLocked(user) {
  if (!user?.lockedUntil) return false;
  return new Date(user.lockedUntil).getTime() > Date.now();
}

export function clearLoginLock(userId) {
  ensureAuthSecuritySchema();
  const db = getDb();
  db.prepare("UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?").run(userId);
}

export function recordFailedLogin(user, context = {}) {
  if (!user?.id) return null;
  if (user.roles?.some((role) => role.name === "Admin")) return null;
  ensureAuthSecuritySchema();
  const settings = getAuthSecuritySettings();
  const failedCount = Number(user.failedLoginCount || 0) + 1;
  const shouldLock = failedCount >= settings.failedLoginLimit;
  const lockedUntil = shouldLock
    ? new Date(Date.now() + settings.lockoutMinutes * 60 * 1000).toISOString()
    : null;
  const db = getDb();
  db.prepare("UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?").run(
    shouldLock ? 0 : failedCount,
    lockedUntil,
    user.id
  );
  if (shouldLock) {
    writeAuditLog({
      userId: user.id,
      entity: "auth",
      entityId: String(user.id),
      action: "lockout",
      after: { email: user.email, lockedUntil },
      ipAddress: context.ip,
      userAgent: context.userAgent,
    });
  }
  return { failedCount, lockedUntil };
}

export function unlockManagedUser(userId, context) {
  ensureAuthSecuritySchema();
  const db = getDb();
  const before = db
    .prepare("SELECT id, email, failed_login_count AS failedLoginCount, locked_until AS lockedUntil FROM users WHERE id = ?")
    .get(userId);
  if (!before) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }
  db.prepare("UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?").run(userId);
  writeAuditLog({
    userId: context.userId ?? null,
    entity: "users",
    entityId: String(userId),
    action: "unlock",
    before,
    after: { email: before.email, failedLoginCount: 0, lockedUntil: null },
    ipAddress: context.ip,
    userAgent: context.userAgent,
  });
}
