import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/connection.js";
import { getUserByEmail, getUserById, updateLastLogin, listRoles } from "../utils/users.js";
import { writeAuditLog } from "../utils/audit.js";
import { setAuthCookies, clearAuthCookies, authCookies } from "../middleware/auth.js";
import {
  createRefreshToken,
  findRefreshToken,
  purgeExpiredTokens,
  revokeRefreshToken,
} from "../utils/tokens.js";
import { issueCsrfToken } from "../utils/csrf.js";
import {
  clearLoginLock,
  getAccessTokenTimeoutMinutes,
  isUserLocked,
  recordFailedLogin,
} from "../services/authSecurityService.js";

function jwtSecrets() {
  const access = process.env.JWT_SECRET;
  const refresh = process.env.REFRESH_TOKEN_SECRET;
  if (!access || !refresh) {
    throw new Error("JWT secrets not configured");
  }
  return { access, refresh };
}

function buildAccessTokenPayload(user) {
  return {
    sub: user.id,
    email: user.email,
    roles: user.roles?.map((role) => role.name) || [],
    jti: randomUUID(),
  };
}

function issueTokens(user) {
  const secrets = jwtSecrets();
  const accessToken = jwt.sign(buildAccessTokenPayload(user), secrets.access, {
    expiresIn: `${getAccessTokenTimeoutMinutes()}m`,
  });
  const refreshToken = createRefreshToken(user.id);
  return { accessToken, refreshToken };
}

export async function login(req, res) {
  purgeExpiredTokens();
  const { email, password } = req.body;
  const user = getUserByEmail(email);
  if (!user || !user.isActive) {
    return res.status(401).json({ message: "Invalid credentials" });
  }
  if (isUserLocked(user)) {
    return res.status(423).json({
      message: `This account is locked until ${new Date(user.lockedUntil).toLocaleString()}. Ask someone with user access to unblock it.`,
      lockedUntil: user.lockedUntil,
    });
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const failed = recordFailedLogin(user, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    if (failed?.lockedUntil) {
      return res.status(423).json({
        message: `Too many attempts. This account is locked until ${new Date(failed.lockedUntil).toLocaleString()}.`,
        lockedUntil: failed.lockedUntil,
      });
    }
    return res.status(401).json({ message: "Invalid credentials" });
  }

  clearLoginLock(user.id);
  updateLastLogin(user.id);
  const tokens = issueTokens(user);
  setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
  const csrfToken = issueCsrfToken(user.id);

  writeAuditLog({
    userId: user.id,
    entity: "auth",
    entityId: String(user.id),
    action: "login",
    after: { email: user.email },
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  });

  return res.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: user.roles,
      permissions: user.permissions,
      access: user.access || {},
    },
    csrfToken,
  });
}

export function logout(req, res) {
  if (req.user) {
    const refreshToken = req.cookies?.[authCookies.refresh];
    revokeRefreshToken(refreshToken, req.user.id);
    writeAuditLog({
      userId: req.user.id,
      entity: "auth",
      entityId: String(req.user.id),
      action: "logout",
      before: { email: req.user.email },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
  }
  clearAuthCookies(res);
  return res.status(204).send();
}

export function me(req, res) {
  const user = req.user || null;
  // Ensure a CSRF token is available for authenticated sessions
  if (user) {
    try {
      const csrfToken = issueCsrfToken(user.id);
      res.set("x-csrf-token", csrfToken);
    } catch (_err) {
      // If CSRF issuance fails, continue; POSTs will still be blocked safely
    }
  }
  res.json({ user });
}

export function refresh(req, res) {
  const refreshToken = req.cookies?.[authCookies.refresh];
  if (!refreshToken) {
    return res.status(401).json({ message: "Missing refresh token" });
  }
  const stored = findRefreshToken(refreshToken);
  if (!stored) {
    return res.status(401).json({ message: "Invalid refresh token" });
  }
  const user = getUserById(stored.userId);
  if (!user || new Date(stored.expiresAt) < new Date()) {
    return res.status(401).json({ message: "Refresh token expired" });
  }
  const tokens = issueTokens(user);
  setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
  const csrfToken = issueCsrfToken(user.id);
  return res.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: user.roles,
      permissions: user.permissions,
      access: user.access || {},
    },
    csrfToken,
  });
}

export async function register(req, res) {
  const { email, password, displayName, roleNames } = req.body;
  const db = getDb();
  const existing = getUserByEmail(email);
  if (existing) {
    return res.status(409).json({ message: "Email already in use" });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const insertUser = db.prepare(
    `INSERT INTO users (email, password_hash, display_name, is_active)
     VALUES (@email, @password_hash, @display_name, 1)`
  );
  const result = insertUser.run({
    email,
    password_hash: passwordHash,
    display_name: displayName,
  });
  const userId = result.lastInsertRowid;

  const roles = listRoles();
  const roleMap = new Map(roles.map((role) => [role.name, role.id]));
  const assignRole = db.prepare(
    "INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)"
  );
  for (const roleName of roleNames) {
    const roleId = roleMap.get(roleName);
    if (roleId) {
      assignRole.run(userId, roleId);
    }
  }

  writeAuditLog({
    userId: req.user?.id || null,
    entity: "users",
    entityId: String(userId),
    action: "create",
    after: { email, displayName, roleNames },
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  });

  const newUser = getUserById(userId);
  return res.status(201).json({
    user: {
      id: newUser.id,
      email: newUser.email,
      displayName: newUser.displayName,
      roles: newUser.roles,
      permissions: newUser.permissions,
      access: newUser.access || {},
    },
  });
}
