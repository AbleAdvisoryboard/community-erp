import { getDb } from "../db/connection.js";

function loadRoles(userId, db) {
  const rows = db
    .prepare(
      `SELECT r.id, r.name
       FROM roles r
       INNER JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = ?`
    )
    .all(userId);
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

function loadPermissions(userId, db) {
  const rows = db
    .prepare(
      `SELECT DISTINCT p.name
       FROM permissions p
       INNER JOIN role_permissions rp ON rp.permission_id = p.id
       INNER JOIN user_roles ur ON ur.role_id = rp.role_id
       WHERE ur.user_id = ?`
    )
    .all(userId);
  return rows.map((row) => row.name);
}

function ensureUserAccessTable(db) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS user_access (
       user_id INTEGER PRIMARY KEY,
       access_json TEXT NOT NULL DEFAULT '{}',
       updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
     )`
  );
}

function loadAccess(userId, db) {
  ensureUserAccessTable(db);
  const row = db.prepare("SELECT access_json FROM user_access WHERE user_id = ?").get(userId);
  if (!row?.access_json) return {};
  try {
    return JSON.parse(row.access_json);
  } catch (_error) {
    return {};
  }
}

export function getUserByEmail(email) {
  const db = getDb();
  const user = db
    .prepare(
      `SELECT id, email, password_hash AS passwordHash, display_name AS displayName, is_active AS isActive
              , failed_login_count AS failedLoginCount, locked_until AS lockedUntil
       FROM users WHERE LOWER(email) = LOWER(?)`
    )
    .get(email);
  if (!user) {
    return null;
  }
  user.roles = loadRoles(user.id, db);
  user.permissions = loadPermissions(user.id, db);
  user.access = loadAccess(user.id, db);
  return user;
}

export function getUserById(id) {
  const db = getDb();
  const user = db
    .prepare(
      `SELECT id, email, password_hash AS passwordHash, display_name AS displayName, is_active AS isActive
              , failed_login_count AS failedLoginCount, locked_until AS lockedUntil
       FROM users WHERE id = ?`
    )
    .get(id);
  if (!user) {
    return null;
  }
  user.roles = loadRoles(user.id, db);
  user.permissions = loadPermissions(user.id, db);
  user.access = loadAccess(user.id, db);
  return user;
}

export function updateLastLogin(userId) {
  const db = getDb();
  db.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?").run(userId);
}

export function listRoles() {
  const db = getDb();
  return db.prepare("SELECT id, name FROM roles ORDER BY name").all();
}
