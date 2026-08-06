import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { getDb } from "../db/connection.js";

const REFRESH_TTL_DAYS = 7;

function expiresAt(days = REFRESH_TTL_DAYS) {
  const expires = new Date();
  expires.setDate(expires.getDate() + days);
  return expires.toISOString();
}

export function createRefreshToken(userId) {
  const token = crypto.randomBytes(48).toString("base64url");
  const hash = bcrypt.hashSync(token, 10);
  const db = getDb();
  db.prepare(
    `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`
  ).run(userId, hash, expiresAt());
  return token;
}

export function revokeRefreshToken(token, userId) {
  if (!token || !userId) return;
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, token FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NULL`
    )
    .all(userId);
  for (const row of rows) {
    if (bcrypt.compareSync(token, row.token)) {
      db.prepare("UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?").run(
        row.id
      );
    }
  }
}

export function findRefreshToken(token) {
  if (!token) return null;
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, user_id AS userId, token, expires_at AS expiresAt
       FROM refresh_tokens
       WHERE revoked_at IS NULL`
    )
    .all();
  for (const row of rows) {
    if (bcrypt.compareSync(token, row.token)) {
      return row;
    }
  }
  return null;
}

export function purgeExpiredTokens() {
  const db = getDb();
  db.prepare("DELETE FROM refresh_tokens WHERE datetime(expires_at) < datetime('now')").run();
}
