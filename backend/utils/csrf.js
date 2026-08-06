import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { getDb } from "../db/connection.js";

const CSRF_TTL_HOURS = 24;

function expiresAt(hours = CSRF_TTL_HOURS) {
  const expires = new Date();
  expires.setHours(expires.getHours() + hours);
  return expires.toISOString();
}

export function issueCsrfToken(userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const hash = bcrypt.hashSync(token, 10);
  const db = getDb();
  db.prepare(
    `INSERT INTO csrf_tokens (user_id, token, expires_at) VALUES (?, ?, ?)`
  ).run(userId, hash, expiresAt());
  return token;
}

export function validateCsrfToken(userId, token) {
  if (!token) return false;
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, token, expires_at AS expiresAt
       FROM csrf_tokens
       WHERE user_id = ?
         AND datetime(expires_at) > datetime('now')`
    )
    .all(userId);

  for (const row of rows) {
    if (bcrypt.compareSync(token, row.token)) {
      return true;
    }
  }
  return false;
}

export function pruneCsrfTokens() {
  const db = getDb();
  db.prepare("DELETE FROM csrf_tokens WHERE datetime(expires_at) <= datetime('now')").run();
}
