import { getDb } from "../db/connection.js";
import { writeAuditLog } from "../utils/audit.js";

function mapAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    displayName: row.display_name,
    status: row.status,
    primaryContactId: row.primary_contact_id,
    phone: row.phone,
    email: row.email,
    website: row.website,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapContact(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    firstName: row.first_name,
    lastName: row.last_name,
    preferredName: row.preferred_name,
    email: row.email,
    phone: row.phone,
    mobile: row.mobile,
    isPrimary: !!row.is_primary,
    doNotContact: !!row.do_not_contact,
    accountName: row.account_name ?? null,
    tags: row.tags ? JSON.parse(row.tags) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeTags(tags = []) {
  return [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))];
}

function syncContactTags(contactId, tags) {
  const db = getDb();
  const normalized = normalizeTags(tags);
  const insertTag = db.prepare("INSERT OR IGNORE INTO contact_tags (name) VALUES (?)");
  const findTag = db.prepare("SELECT id FROM contact_tags WHERE name = ?");
  const insertLink = db.prepare(
    "INSERT OR IGNORE INTO contact_tag_links (contact_id, tag_id) VALUES (?, ?)"
  );
  const existingLinksStmt = db.prepare(
    "SELECT tag_id FROM contact_tag_links WHERE contact_id = ?"
  );
  const deleteLink = db.prepare(
    "DELETE FROM contact_tag_links WHERE contact_id = ? AND tag_id = ?"
  );

  const existingLinks = new Set(
    existingLinksStmt.all(contactId).map((row) => row.tag_id)
  );

  const desiredIds = new Set();
  for (const tag of normalized) {
    insertTag.run(tag);
    const tagRow = findTag.get(tag);
    if (tagRow) {
      desiredIds.add(tagRow.id);
      insertLink.run(contactId, tagRow.id);
    }
  }

  for (const tagId of existingLinks) {
    if (!desiredIds.has(tagId)) {
      deleteLink.run(contactId, tagId);
    }
  }

  return Array.from(desiredIds);
}

export function listAccounts({ search, limit = 25, offset = 0, includeInactive = false } = {}) {
  const db = getDb();
  const where = [];
  const params = { limit, offset };

  if (!includeInactive) {
    where.push("status != 'Inactive'");
  }

  if (search) {
    where.push("(name LIKE @search OR display_name LIKE @search)");
    params.search = `%${search}%`;
  }

  const sql = `SELECT * FROM accounts ${
    where.length ? `WHERE ${where.join(" AND ")}` : ""
  } ORDER BY updated_at DESC LIMIT @limit OFFSET @offset`;

  return db.prepare(sql).all(params).map(mapAccount);
}

export function createAccount({
  type,
  name,
  displayName,
  status = "Active",
  primaryContactId = null,
  phone,
  email,
  website,
  notes,
  addresses = [],
}, auditContext) {
  const db = getDb();
  const insertAccount = db.prepare(
    `INSERT INTO accounts (type, name, display_name, status, primary_contact_id, phone, email, website, notes)
     VALUES (@type, @name, @display_name, @status, @primary_contact_id, @phone, @email, @website, @notes)`
  );
  const insertAddress = db.prepare(
    `INSERT INTO account_addresses (account_id, type, line1, line2, city, region, postal_code, country, is_primary)
     VALUES (@account_id, @type, @line1, @line2, @city, @region, @postal_code, @country, @is_primary)`
  );

  const run = db.transaction(() => {
    const result = insertAccount.run({
      type,
      name,
      display_name: displayName ?? null,
      status,
      primary_contact_id: primaryContactId,
      phone: phone ?? null,
      email: email ?? null,
      website: website ?? null,
      notes: notes ?? null,
    });
    const accountId = result.lastInsertRowid;

    for (const address of addresses) {
      insertAddress.run({
        account_id: accountId,
        type: address.type ?? "Primary",
        line1: address.line1,
        line2: address.line2 ?? null,
        city: address.city,
        region: address.region ?? null,
        postal_code: address.postalCode ?? null,
        country: address.country ?? "US",
        is_primary: address.isPrimary ? 1 : 0,
      });
    }

    return accountId;
  });

  const accountId = run();
  const created = db
    .prepare("SELECT * FROM accounts WHERE id = ?")
    .get(accountId);

  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "accounts",
    entityId: String(accountId),
    action: "create",
    after: mapAccount(created),
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });

  return mapAccount(created);
}

export function updateAccount(accountId, updates, auditContext) {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM accounts WHERE id = ?")
    .get(accountId);
  if (!existing) {
    return null;
  }

  const fields = [];
  const params = { id: accountId };
  const allowed = {
    type: "type",
    name: "name",
    displayName: "display_name",
    status: "status",
    primaryContactId: "primary_contact_id",
    phone: "phone",
    email: "email",
    website: "website",
    notes: "notes",
  };

  for (const [key, column] of Object.entries(allowed)) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      fields.push(`${column} = @${column}`);
      params[column] = updates[key] ?? null;
    }
  }

  if (fields.length) {
    db.prepare(
      `UPDATE accounts SET ${fields.join(", ")} WHERE id = @id`
    ).run(params);
  }

  const updated = db
    .prepare("SELECT * FROM accounts WHERE id = ?")
    .get(accountId);

  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "accounts",
    entityId: String(accountId),
    action: "update",
    before: mapAccount(existing),
    after: mapAccount(updated),
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });

  return mapAccount(updated);
}

export function deleteAccount(accountId, auditContext) {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM accounts WHERE id = ?").get(accountId);
  if (!existing) return null;

  db.prepare("UPDATE accounts SET status = 'Inactive' WHERE id = ?").run(accountId);
  const updated = db.prepare("SELECT * FROM accounts WHERE id = ?").get(accountId);

  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "accounts",
    entityId: String(accountId),
    action: "delete",
    before: mapAccount(existing),
    after: mapAccount(updated),
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });

  return mapAccount(updated);
}

export function searchContacts({
  query,
  accountId,
  tag,
  isPrimary,
  limit,
  offset = 0,
} = {}) {
  const db = getDb();
  const joins = [];
  const conditions = ["c.deleted_at IS NULL"];

  if (accountId) {
    conditions.push("c.account_id = @accountId");
  }

  if (tag) {
    joins.push(
      "INNER JOIN contact_tag_links ctl ON ctl.contact_id = c.id INNER JOIN contact_tags ct ON ct.id = ctl.tag_id"
    );
    conditions.push("ct.name = @tag");
  }

  if (typeof isPrimary === 'boolean') {
    conditions.push("c.is_primary = @isPrimary");
  }

  conditions.push(`(
    @q IS NULL
    OR LOWER(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) LIKE '%' || LOWER(@q) || '%'
    OR LOWER(COALESCE(c.email, '')) LIKE '%' || LOWER(@q) || '%'
    OR REPLACE(COALESCE(c.phone, ''), '-', '') LIKE '%' || REPLACE(COALESCE(@q, ''), '-', '') || '%'
    OR REPLACE(COALESCE(c.mobile, ''), '-', '') LIKE '%' || REPLACE(COALESCE(@q, ''), '-', '') || '%'
  )`);

  const normalizedLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : null;
  const normalizedOffset = Number.isFinite(Number(offset)) && Number(offset) >= 0 ? Number(offset) : 0;
  const params = {
    q: query ? query.trim() : null,
    limit: normalizedLimit,
    offset: normalizedOffset,
  };

  if (accountId) {
    params.accountId = accountId;
  }

  if (tag) {
    params.tag = tag;
  }

  if (typeof isPrimary === 'boolean') {
    params.isPrimary = isPrimary ? 1 : 0;
  }

  const sql = `SELECT c.*, a.name AS account_name,
    COALESCE(json_group_array(DISTINCT ct2.name) FILTER (WHERE ct2.name IS NOT NULL), '[]') AS tags
    FROM contacts c
    LEFT JOIN accounts a ON a.id = c.account_id
    LEFT JOIN contact_tag_links ctl2 ON ctl2.contact_id = c.id
    LEFT JOIN contact_tags ct2 ON ct2.id = ctl2.tag_id
    ${joins.join(" ")}
    WHERE ${conditions.join(" AND ")}
    GROUP BY c.id
    ORDER BY c.updated_at DESC
    LIMIT COALESCE(@limit, 5) OFFSET @offset`;

  return db.prepare(sql).all(params).map(mapContact);
}

export function listContactTags() {
  const db = getDb();
  const rows = db.prepare("SELECT id, name FROM contact_tags ORDER BY LOWER(name) ASC").all();
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

export function createContactTag(name, auditContext) {
  const db = getDb();
  const trimmed = String(name || "").trim();
  if (!trimmed) {
    const err = new Error("Tag name is required");
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  // Insert or fetch existing
  const insert = db.prepare("INSERT OR IGNORE INTO contact_tags (name) VALUES (?)");
  insert.run(trimmed);
  const row = db.prepare("SELECT id, name FROM contact_tags WHERE name = ?").get(trimmed);

  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "contact_tags",
    entityId: String(row.id),
    action: "create",
    after: { id: row.id, name: row.name },
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });

  return { id: row.id, name: row.name };
}

export function deleteContactTag(tagId, auditContext) {
  const db = getDb();
  const existing = db.prepare("SELECT id, name FROM contact_tags WHERE id = ?").get(tagId);
  if (!existing) return null;

  db.prepare("DELETE FROM contact_tags WHERE id = ?").run(tagId);

  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "contact_tags",
    entityId: String(tagId),
    action: "delete",
    before: existing,
    after: { id: tagId, deleted: true },
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });

  return { id: tagId, name: existing.name };
}

function enforceContactDuplicateGuard({ email, phone, mobile }) {
  if (!email && !phone && !mobile) {
    return;
  }
  const db = getDb();
  const params = {};
  const conditions = [];
  if (email) {
    conditions.push("email = @email");
    params.email = email;
  }
  if (phone) {
    conditions.push("phone = @phone");
    params.phone = phone;
  }
  if (mobile) {
    conditions.push("mobile = @mobile");
    params.mobile = mobile;
  }
  const sql = `SELECT id, first_name, last_name, email FROM contacts WHERE deleted_at IS NULL AND (${conditions.join(
    " OR "
  )}) LIMIT 1`;
  const existing = db.prepare(sql).get(params);
  if (existing) {
    let detail = "";
    // Prefer to show which field actually collided, based on what was provided
    if (email && existing.email === email) {
      detail = `email ${existing.email}`;
    } else if (phone) {
      detail = `phone ${phone}`;
    } else if (mobile) {
      detail = `mobile ${mobile}`;
    } else if (existing.email) {
      detail = `email ${existing.email}`;
    } else {
      detail = `ID ${existing.id}`;
    }
    const error = new Error(`Contact already exists with ${detail}`);
    error.code = "DUPLICATE_CONTACT";
    throw error;
  }
}

export function createContact(data, auditContext) {
  const db = getDb();
  enforceContactDuplicateGuard(data);

  const insertContact = db.prepare(
    `INSERT INTO contacts (account_id, first_name, last_name, preferred_name, email, phone, mobile, is_primary, do_not_contact)
     VALUES (@account_id, @first_name, @last_name, @preferred_name, @email, @phone, @mobile, @is_primary, @do_not_contact)`
  );
  const updatePrimaryStmt = db.prepare(
    "UPDATE accounts SET primary_contact_id = @contactId WHERE id = @accountId"
  );
  const deleteOtherPrimary = db.prepare(
    "UPDATE contacts SET is_primary = 0 WHERE account_id = @accountId AND id != @contactId"
  );

  const run = db.transaction(() => {
    const result = insertContact.run({
      account_id: data.accountId ?? null,
      first_name: data.firstName,
      last_name: data.lastName,
      preferred_name: data.preferredName ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      mobile: data.mobile ?? null,
      is_primary: data.isPrimary ? 1 : 0,
      do_not_contact: data.doNotContact ? 1 : 0,
    });
    const contactId = result.lastInsertRowid;

    if (data.tags?.length) {
      syncContactTags(contactId, data.tags);
    }

    if (data.accountId && data.isPrimary) {
      deleteOtherPrimary.run({ accountId: data.accountId, contactId });
      updatePrimaryStmt.run({ accountId: data.accountId, contactId });
    }

    return contactId;
  });

  const contactId = run();
  const created = db.prepare(
    `SELECT c.*, a.name AS account_name,
            COALESCE(json_group_array(DISTINCT ct.name) FILTER (WHERE ct.name IS NOT NULL), '[]') AS tags
       FROM contacts c
       LEFT JOIN accounts a ON a.id = c.account_id
       LEFT JOIN contact_tag_links ctl ON ctl.contact_id = c.id
       LEFT JOIN contact_tags ct ON ct.id = ctl.tag_id
      WHERE c.id = ?
      GROUP BY c.id`
  ).get(contactId);

  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "contacts",
    entityId: String(contactId),
    action: "create",
    after: mapContact(created),
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });

  return mapContact(created);
}

export function updateContact(contactId, updates, auditContext) {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM contacts WHERE id = ?").get(contactId);
  if (!existing) {
    return null;
  }
  if (updates.email && updates.email !== existing.email) {
    enforceContactDuplicateGuard({ email: updates.email });
  }
  if (updates.phone && updates.phone !== existing.phone) {
    enforceContactDuplicateGuard({ phone: updates.phone });
  }
  if (updates.mobile && updates.mobile !== existing.mobile) {
    enforceContactDuplicateGuard({ mobile: updates.mobile });
  }

  const fields = [];
  const params = { id: contactId };
  const mapping = {
    accountId: "account_id",
    firstName: "first_name",
    lastName: "last_name",
    preferredName: "preferred_name",
    email: "email",
    phone: "phone",
    mobile: "mobile",
    isPrimary: "is_primary",
    doNotContact: "do_not_contact",
  };

  for (const [key, column] of Object.entries(mapping)) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      fields.push(`${column} = @${column}`);
      params[column] = updates[key] == null
        ? null
        : key === "isPrimary" || key === "doNotContact"
        ? updates[key] ? 1 : 0
        : updates[key];
    }
  }

  const run = db.transaction(() => {
    if (fields.length) {
      db.prepare(`UPDATE contacts SET ${fields.join(", ")} WHERE id = @id`).run(params);
    }
    if (Array.isArray(updates.tags)) {
      syncContactTags(contactId, updates.tags);
    }
    if (updates.accountId && updates.isPrimary) {
      db.prepare(
        "UPDATE contacts SET is_primary = 0 WHERE account_id = @accountId AND id != @contactId"
      ).run({ accountId: updates.accountId, contactId });
      db.prepare(
        "UPDATE accounts SET primary_contact_id = @contactId WHERE id = @accountId"
      ).run({ accountId: updates.accountId, contactId });
    }
  });

  run();

  const updated = db.prepare(
    `SELECT c.*, a.name AS account_name,
            COALESCE(json_group_array(DISTINCT ct.name) FILTER (WHERE ct.name IS NOT NULL), '[]') AS tags
       FROM contacts c
       LEFT JOIN accounts a ON a.id = c.account_id
       LEFT JOIN contact_tag_links ctl ON ctl.contact_id = c.id
       LEFT JOIN contact_tags ct ON ct.id = ctl.tag_id
      WHERE c.id = ?
      GROUP BY c.id`
  ).get(contactId);

  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "contacts",
    entityId: String(contactId),
    action: "update",
    before: mapContact({ ...existing, tags: "[]" }),
    after: mapContact(updated),
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });

  return mapContact(updated);
}

export function deleteContact(contactId, auditContext) {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM contacts WHERE id = ? AND deleted_at IS NULL").get(contactId);
  if (!existing) {
    return null;
  }

  const run = db.transaction(() => {
    db.prepare("UPDATE contacts SET deleted_at = DATETIME('now') WHERE id = ?").run(contactId);
    db.prepare("UPDATE accounts SET primary_contact_id = NULL WHERE primary_contact_id = ?").run(contactId);
    db.prepare("UPDATE volunteers SET is_active = 0 WHERE contact_id = ?").run(contactId);
  });

  run();

  const deleted = db.prepare("SELECT * FROM contacts WHERE id = ?").get(contactId);
  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "contacts",
    entityId: String(contactId),
    action: "delete",
    before: mapContact({ ...existing, tags: "[]" }),
    after: { id: contactId, deletedAt: deleted.deleted_at },
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });

  return { id: contactId, deletedAt: deleted.deleted_at };
}

export function createActivity(data, auditContext) {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO activities (account_id, contact_id, subject, notes, activity_type, due_at, completed_at, created_by)
     VALUES (@account_id, @contact_id, @subject, @notes, @activity_type, @due_at, @completed_at, @created_by)`
  );
  const result = insert.run({
    account_id: data.accountId ?? null,
    contact_id: data.contactId ?? null,
    subject: data.subject,
    notes: data.notes ?? null,
    activity_type: data.activityType ?? "Note",
    due_at: data.dueAt ?? null,
    completed_at: data.completedAt ?? null,
    created_by: auditContext?.userId ?? null,
  });
  const activity = db.prepare("SELECT * FROM activities WHERE id = ?").get(result.lastInsertRowid);

  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "activities",
    entityId: String(activity.id),
    action: "create",
    after: activity,
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });

  return activity;
}
