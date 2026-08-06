import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import { getDb } from "../db/connection.js";
import { writeAuditLog } from "../utils/audit.js";
import { getUserById } from "../utils/users.js";
import { unlockManagedUser } from "./authSecurityService.js";

const PROFILE_KEYS = {
  companyName: "company_name",
  companyLogo: "company_logo",
  accessProfiles: "access_profiles",
};

const USER_ROLE_OPTIONS = {
  admin: "Admin",
  associate: "ReadOnly",
};

export const ACCESS_CATALOG = [
  {
    id: "donation_console",
    label: "Donation Console",
    href: "/html/fundraising.html",
    features: [{ id: "donations", label: "Donations" }, { id: "receipts", label: "Receipts" }],
  },
  {
    id: "crm",
    label: "Constituent Relationship Management",
    href: "/html/crm.html",
    features: [{ id: "accounts", label: "Accounts" }, { id: "contacts", label: "Contacts" }, { id: "activities", label: "Activities" }],
  },
  {
    id: "fundraising_management",
    label: "Fundraising Management",
    href: "/html/fundraising-admin.html",
    features: [{ id: "funds", label: "Funds" }, { id: "campaigns", label: "Campaigns" }, { id: "appeals", label: "Appeals" }],
  },
  {
    id: "volunteer_engagement",
    label: "Volunteer Engagement",
    href: "/html/volunteers.html",
    features: [{ id: "volunteers", label: "Volunteers" }, { id: "shifts", label: "Shifts" }, { id: "hours", label: "Hours" }],
  },
  {
    id: "events_ticketing",
    label: "Events & Ticketing",
    href: "/html/events.html",
    features: [{ id: "events", label: "Events" }, { id: "tickets", label: "Tickets" }, { id: "registrations", label: "Registrations" }],
  },
  {
    id: "calendar",
    label: "Calendar",
    href: "/html/calendar.html",
    features: [{ id: "calendar", label: "Calendar" }, { id: "feeds", label: "Feeds" }],
  },
  {
    id: "meeting_notes",
    label: "Meeting Notes",
    href: "/html/meeting-notes.html",
    features: [{ id: "notes", label: "Notes" }, { id: "whiteboard", label: "Whiteboard" }, { id: "map", label: "Map" }],
  },
  {
    id: "communications",
    label: "Communications Center",
    href: "/html/communications.html",
    features: [{ id: "compose", label: "Compose" }, { id: "templates", label: "Templates" }, { id: "history", label: "History" }],
  },
  {
    id: "inventory_assets",
    label: "Inventory & Assets",
    href: "/html/inventory.html",
    features: [{ id: "items", label: "Items" }, { id: "stock", label: "Stock" }, { id: "assets", label: "Assets" }],
  },
  {
    id: "financial_statements",
    label: "Financial Statements",
    href: "/html/financial-statements.html",
    features: [{ id: "statements", label: "Statements" }],
  },
  {
    id: "general_ledger",
    label: "General Ledger",
    href: "/html/finance.html",
    features: [{ id: "accounts", label: "Accounts" }, { id: "journals", label: "Journals" }, { id: "trial_balance", label: "Trial Balance" }],
  },
  {
    id: "bank_deposits",
    label: "Bank Deposits",
    href: "/html/bank.html",
    features: [{ id: "deposits", label: "Deposits" }],
  },
  {
    id: "accounts_receivable",
    label: "Accounts Receivable",
    href: "/html/ar.html",
    features: [{ id: "invoices", label: "Invoices" }, { id: "payments", label: "Payments" }],
  },
  {
    id: "accounts_payable",
    label: "Accounts Payable",
    href: "/html/ap.html",
    features: [{ id: "bills", label: "Bills" }, { id: "payments", label: "Payments" }],
  },
  {
    id: "reports",
    label: "Reports",
    href: "/html/reports.html",
    features: [{ id: "builder", label: "Builder" }, { id: "exports", label: "Exports" }],
  },
  {
    id: "settings",
    label: "Settings",
    href: "/html/settings.html",
    adminOnly: true,
    features: [{ id: "organization", label: "Organization Profile" }, { id: "people", label: "People" }],
  },
];

const ASSOCIATE_PRESETS = {
  associate_1: ["donation_console", "crm", "fundraising_management", "volunteer_engagement"],
  associate_2: [
    "donation_console",
    "crm",
    "fundraising_management",
    "volunteer_engagement",
    "events_ticketing",
    "calendar",
    "meeting_notes",
    "communications",
    "inventory_assets",
  ],
};

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
  ).run({ key, value });
}

function ensureUserAccessTable() {
  const db = getDb();
  db.exec(
    `CREATE TABLE IF NOT EXISTS user_access (
       user_id INTEGER PRIMARY KEY,
       access_json TEXT NOT NULL DEFAULT '{}',
       updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
     )`
  );
}

function normalizeAccessPayload(payload = {}) {
  const allowedSectionIds = new Set(ACCESS_CATALOG.map((section) => section.id));
  const result = { sections: {} };
  const sections = payload.sections && typeof payload.sections === "object" ? payload.sections : {};
  for (const [sectionId, sectionValue] of Object.entries(sections)) {
    if (!allowedSectionIds.has(sectionId)) continue;
    const catalogSection = ACCESS_CATALOG.find((section) => section.id === sectionId);
    const allowedFeatureIds = new Set((catalogSection?.features || []).map((feature) => feature.id));
    const featureValues = Array.isArray(sectionValue?.features) ? sectionValue.features : [];
    const features = featureValues.filter((featureId) => allowedFeatureIds.has(featureId));
    const enabled = Boolean(sectionValue?.enabled || features.length);
    if (enabled) {
      result.sections[sectionId] = {
        enabled: true,
        features: features.length ? features : [...allowedFeatureIds],
      };
    }
  }
  return result;
}

function buildPresetAccess(presetName = "associate_1") {
  const sectionIds = ASSOCIATE_PRESETS[presetName] || ASSOCIATE_PRESETS.associate_1;
  const sections = {};
  for (const sectionId of sectionIds) {
    const catalogSection = ACCESS_CATALOG.find((section) => section.id === sectionId);
    if (!catalogSection) continue;
    sections[sectionId] = {
      enabled: true,
      features: catalogSection.features.map((feature) => feature.id),
    };
  }
  return { sections };
}

function defaultAccessProfiles() {
  return [
    {
      id: "associate_1",
      name: "Associate 1",
      builtIn: true,
      access: buildPresetAccess("associate_1"),
    },
    {
      id: "associate_2",
      name: "Associate 2",
      builtIn: true,
      access: buildPresetAccess("associate_2"),
    },
  ];
}

function normalizeAccessProfile(profile = {}) {
  const id = String(profile.id || `access_${randomUUID()}`).trim();
  const name = String(profile.name || "Custom Access").trim().slice(0, 80);
  return {
    id,
    name: name || "Custom Access",
    builtIn: Boolean(profile.builtIn),
    access: normalizeAccessPayload(profile.access || {}),
  };
}

export function listAccessProfiles() {
  let saved = [];
  try {
    const parsed = JSON.parse(getSetting(PROFILE_KEYS.accessProfiles, "[]"));
    saved = Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    saved = [];
  }
  const merged = new Map(defaultAccessProfiles().map((profile) => [profile.id, profile]));
  for (const profile of saved) {
    const normalized = normalizeAccessProfile(profile);
    merged.set(normalized.id, {
      ...normalized,
      builtIn: Boolean(merged.get(normalized.id)?.builtIn || normalized.builtIn),
    });
  }
  return [...merged.values()];
}

export function saveAccessProfiles(payload, context) {
  const before = listAccessProfiles();
  const seen = new Set();
  const profiles = (payload.profiles || []).map(normalizeAccessProfile).filter((profile) => {
    if (seen.has(profile.id)) return false;
    seen.add(profile.id);
    return true;
  });
  setSetting(PROFILE_KEYS.accessProfiles, JSON.stringify(profiles));
  const after = listAccessProfiles();
  writeAuditLog({
    userId: context.userId ?? null,
    entity: "settings",
    entityId: "access-profiles",
    action: "update",
    before,
    after,
    ipAddress: context.ip,
    userAgent: context.userAgent,
  });
  return after;
}

function accessForProfile(profileId) {
  const profile = listAccessProfiles().find((item) => item.id === profileId);
  return profile?.access || buildPresetAccess("associate_1");
}

function setUserAccess(userId, access) {
  ensureUserAccessTable();
  const db = getDb();
  db.prepare(
    `INSERT INTO user_access (user_id, access_json)
     VALUES (@user_id, @access_json)
     ON CONFLICT(user_id) DO UPDATE SET access_json = excluded.access_json`
  ).run({
    user_id: userId,
    access_json: JSON.stringify(normalizeAccessPayload(access)),
  });
}

function userToDto(user) {
  const lockedUntil = user.lockedUntil || null;
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    isActive: Boolean(user.isActive),
    failedLoginCount: Number(user.failedLoginCount || 0),
    lockedUntil,
    isLocked: Boolean(lockedUntil && new Date(lockedUntil).getTime() > Date.now()),
    roles: user.roles || [],
    accessType: user.roles?.some((role) => role.name === "Admin") ? "admin" : "associate",
    access: user.access || {},
  };
}

function roleNameFromAccessType(accessType) {
  return USER_ROLE_OPTIONS[accessType] || USER_ROLE_OPTIONS.associate;
}

function assignSingleRole(userId, roleName) {
  const db = getDb();
  const role = db.prepare("SELECT id FROM roles WHERE name = ?").get(roleName);
  if (!role) {
    const error = new Error("Role is not available");
    error.status = 400;
    throw error;
  }
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM user_roles WHERE user_id = ?").run(userId);
    db.prepare("INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)").run(userId, role.id);
  });
  tx();
}

function countActiveAdminUsers() {
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
  return Number(row?.count || 0);
}

export function getPublicProfile() {
  return {
    companyName: getSetting(PROFILE_KEYS.companyName, ""),
    companyLogo: getSetting(PROFILE_KEYS.companyLogo, ""),
  };
}

export function updateOrganizationProfile(payload, context) {
  const next = {
    companyName: payload.companyName?.trim() || "",
    companyLogo: payload.companyLogo?.trim() || "",
  };
  const before = getPublicProfile();
  setSetting(PROFILE_KEYS.companyName, next.companyName);
  setSetting(PROFILE_KEYS.companyLogo, next.companyLogo);
  writeAuditLog({
    userId: context.userId ?? null,
    entity: "settings",
    entityId: "organization-profile",
    action: "update",
    before,
    after: next,
    ipAddress: context.ip,
    userAgent: context.userAgent,
  });
  return next;
}

export function listManagedUsers() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, email, display_name AS displayName, is_active AS isActive, last_login_at AS lastLoginAt, created_at AS createdAt
       FROM users
       ORDER BY display_name COLLATE NOCASE`
    )
    .all();
  const activeAdminCount = countActiveAdminUsers();
  return rows.map((row) => {
    const user = getUserById(row.id);
    const isAdmin = user.roles?.some((role) => role.name === "Admin");
    return {
      ...userToDto(user),
      lastLoginAt: row.lastLoginAt,
      createdAt: row.createdAt,
      canDelete: !(isAdmin && user.isActive && activeAdminCount <= 1),
    };
  });
}

export async function createManagedUser(payload, context) {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(?)").get(payload.email);
  if (existing) {
    const error = new Error("Email already exists");
    error.status = 409;
    throw error;
  }
  const passwordHash = await bcrypt.hash(payload.password, 10);
  const info = db
    .prepare(
      `INSERT INTO users (email, password_hash, display_name, is_active)
       VALUES (@email, @password_hash, @display_name, 1)`
    )
    .run({
      email: payload.email,
      password_hash: passwordHash,
      display_name: payload.displayName,
    });
  const roleName = roleNameFromAccessType(payload.accessType);
  assignSingleRole(info.lastInsertRowid, roleName);
  if (payload.accessType === "associate") {
    setUserAccess(info.lastInsertRowid, accessForProfile(payload.accessProfileId || payload.accessPreset || "associate_1"));
  }
  writeAuditLog({
    userId: context.userId ?? null,
    entity: "users",
    entityId: String(info.lastInsertRowid),
    action: "create",
    after: { email: payload.email, displayName: payload.displayName, accessType: payload.accessType },
    ipAddress: context.ip,
    userAgent: context.userAgent,
  });
  return userToDto(getUserById(info.lastInsertRowid));
}

export function updateManagedUserAccess(userId, payload, context) {
  const before = getUserById(userId);
  if (!before) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }
  const access = payload.profileId ? accessForProfile(payload.profileId) : payload.preset ? buildPresetAccess(payload.preset) : normalizeAccessPayload(payload.access || {});
  setUserAccess(userId, access);
  const after = getUserById(userId);
  writeAuditLog({
    userId: context.userId ?? null,
    entity: "users",
    entityId: String(userId),
    action: "update_access",
    before: { access: before.access || {} },
    after: { access: after.access || {} },
    ipAddress: context.ip,
    userAgent: context.userAgent,
  });
  return userToDto(after);
}

export async function updateManagedUser(userId, payload, context) {
  const db = getDb();
  const before = getUserById(userId);
  if (!before) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }
  const updates = {
    id: userId,
    display_name: payload.displayName ?? before.displayName,
    is_active: payload.isActive === undefined ? (before.isActive ? 1 : 0) : payload.isActive ? 1 : 0,
  };
  db.prepare(
    `UPDATE users
     SET display_name = @display_name,
         is_active = @is_active
     WHERE id = @id`
  ).run(updates);
  if (payload.password) {
    const passwordHash = await bcrypt.hash(payload.password, 10);
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
  }
  if (payload.accessType) {
    assignSingleRole(userId, roleNameFromAccessType(payload.accessType));
  }
  const after = getUserById(userId);
  writeAuditLog({
    userId: context.userId ?? null,
    entity: "users",
    entityId: String(userId),
    action: "update",
    before: userToDto(before),
    after: userToDto(after),
    ipAddress: context.ip,
    userAgent: context.userAgent,
  });
  return userToDto(after);
}

export function deleteManagedUser(userId, context) {
  if (Number(userId) === Number(context.userId)) {
    const error = new Error("You cannot delete your own signed-in user.");
    error.status = 400;
    throw error;
  }
  const db = getDb();
  const before = getUserById(userId);
  if (!before) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }
  if (before.roles?.some((role) => role.name === "Admin") && before.isActive && countActiveAdminUsers() <= 1) {
    const error = new Error("At least one administrator must remain.");
    error.status = 400;
    throw error;
  }
  const beforeDto = userToDto(before);
  const tx = db.transaction(() => {
    db.prepare("UPDATE audit_logs SET user_id = NULL WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  });
  tx();
  writeAuditLog({
    userId: context.userId ?? null,
    entity: "users",
    entityId: String(userId),
    action: "delete",
    before: beforeDto,
    ipAddress: context.ip,
    userAgent: context.userAgent,
  });
}

export function unlockUser(userId, context) {
  unlockManagedUser(userId, context);
  return userToDto(getUserById(userId));
}
