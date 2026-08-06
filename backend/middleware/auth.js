import jwt from "jsonwebtoken";
import { getUserById } from "../utils/users.js";
import { getAccessTokenTimeoutMs } from "../services/authSecurityService.js";

const ACCESS_COOKIE = "erp_access_token";
const REFRESH_COOKIE = "erp_refresh_token";

function getSecrets() {
  const access = process.env.JWT_SECRET;
  const refresh = process.env.REFRESH_TOKEN_SECRET;
  if (!access || !refresh) {
    throw new Error("JWT secrets are not configured");
  }
  return { access, refresh };
}

export function extractToken(req) {
  if (req.cookies?.[ACCESS_COOKIE]) {
    return req.cookies[ACCESS_COOKIE];
  }
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return null;
}

async function hydrateUser(decoded) {
  const user = getUserById(decoded.sub);
  if (!user || !user.isActive) {
    return null;
  }
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    roles: user.roles,
    permissions: user.permissions,
    access: user.access || {},
  };
}

function handleAuthError(res) {
  res.status(401).json({ message: "Authentication required" });
}

export async function authenticate(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      return handleAuthError(res);
    }
    const { access } = getSecrets();
    const decoded = jwt.verify(token, access);
    const user = await hydrateUser(decoded);
    if (!user) {
      return handleAuthError(res);
    }
    req.user = user;
    return next();
  } catch (err) {
    return handleAuthError(res);
  }
}

export async function optionalAuth(req, _res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      return next();
    }
    const { access } = getSecrets();
    const decoded = jwt.verify(token, access);
    const user = await hydrateUser(decoded);
    if (user) {
      req.user = user;
    }
  } catch (err) {
    // ignore failures in optional mode
  }
  return next();
}

export function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, cookieSettings(false));
  res.clearCookie(REFRESH_COOKIE, cookieSettings(false));
}

export function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie(ACCESS_COOKIE, accessToken, cookieSettings());
  res.cookie(REFRESH_COOKIE, refreshToken, cookieSettings(true));
}

function cookieSettings(longLived = false) {
  const secureCookies = String(process.env.SECURE_COOKIES || "false").toLowerCase() === "true";
  const domain = process.env.COOKIE_DOMAIN || undefined;
  const common = {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies,
    domain,
    path: "/",
  };
  if (longLived) {
    return { ...common, maxAge: 1000 * 60 * 60 * 24 * 7 };
  }
  return { ...common, maxAge: getAccessTokenTimeoutMs() };
}

export const authCookies = {
  access: ACCESS_COOKIE,
  refresh: REFRESH_COOKIE,
};
