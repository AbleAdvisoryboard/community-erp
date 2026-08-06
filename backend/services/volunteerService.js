import { getDb } from "../db/connection.js";
import { writeAuditLog } from "../utils/audit.js";
import { generateToken } from "../utils/token.js";

function mapVolunteer(row) {
  if (!row) return null;
  return {
    id: row.id,
    contactId: row.contact_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    skills: row.skills ? row.skills.split(',').map((s) => s.trim()).filter(Boolean) : [],
    interests: row.interests ? row.interests.split(',').map((s) => s.trim()).filter(Boolean) : [],
    backgroundCheckStatus: row.background_check_status,
    availability: row.available_json ? JSON.parse(row.available_json) : null,
    notes: row.notes,
    isActive: !!row.is_active,
    icalToken: row.ical_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listVolunteers({ activeOnly = true, search } = {}) {
  const db = getDb();
  let sql = `SELECT v.*, c.email, c.phone,
    printf('%s %s', c.first_name, c.last_name) AS name
    FROM volunteers v
    INNER JOIN contacts c ON c.id = v.contact_id`;
  const params = {};
  const conditions = [];
  if (activeOnly) {
    conditions.push('v.is_active = 1');
  }
  if (search) {
    conditions.push('(c.first_name LIKE @search OR c.last_name LIKE @search OR c.email LIKE @search)');
    params.search = `%${search}%`;
  }
  if (conditions.length) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY name';
  return db.prepare(sql).all(params).map(mapVolunteer);
}

export function createVolunteer(data, auditContext) {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO volunteers (contact_id, skills, interests, background_check_status, available_json, notes, is_active, ical_token)
     VALUES (@contact_id, @skills, @interests, @background_check_status, @available_json, @notes, @is_active, @ical_token)`
  );
  const result = insert.run({
    contact_id: data.contactId,
    skills: data.skills?.length ? data.skills.join(', ') : null,
    interests: data.interests?.length ? data.interests.join(', ') : null,
    background_check_status: data.backgroundCheckStatus ?? 'Pending',
    available_json: data.availability ? JSON.stringify(data.availability) : null,
    notes: data.notes ?? null,
    is_active: data.isActive === false ? 0 : 1,
    ical_token: generateToken(),
  });
  const volunteer = db
    .prepare(
      `SELECT v.*, c.email, c.phone,
        printf('%s %s', c.first_name, c.last_name) AS name
       FROM volunteers v
       INNER JOIN contacts c ON c.id = v.contact_id
       WHERE v.id = ?`
    )
    .get(result.lastInsertRowid);
  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "volunteers",
    entityId: String(volunteer.id),
    action: "create",
    after: mapVolunteer(volunteer),
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });
  return mapVolunteer(volunteer);
}

export function updateVolunteer(volunteerId, updates, auditContext) {
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT v.*, c.email, c.phone,
        printf('%s %s', c.first_name, c.last_name) AS name
       FROM volunteers v
       INNER JOIN contacts c ON c.id = v.contact_id
       WHERE v.id = ?`
    )
    .get(volunteerId);
  if (!existing) {
    return null;
  }
  const mapping = {
    backgroundCheckStatus: 'background_check_status',
    notes: 'notes',
    isActive: 'is_active',
  };
  const fields = [];
  const params = { id: volunteerId };
  for (const [key, column] of Object.entries(mapping)) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      let value = updates[key];
      if (key === 'isActive') {
        value = value ? 1 : 0;
      }
      fields.push(`${column} = @${column}`);
      params[column] = value ?? null;
    }
  }
  if (Array.isArray(updates.skills)) {
    fields.push('skills = @skills');
    params.skills = updates.skills.join(', ');
  }
  if (Array.isArray(updates.interests)) {
    fields.push('interests = @interests');
    params.interests = updates.interests.join(', ');
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'availability')) {
    fields.push('available_json = @available_json');
    params.available_json = updates.availability ? JSON.stringify(updates.availability) : null;
  }
  if (fields.length) {
    db.prepare(`UPDATE volunteers SET ${fields.join(', ')} WHERE id = @id`).run(params);
  }
  const updated = db
    .prepare(
      `SELECT v.*, c.email, c.phone,
        printf('%s %s', c.first_name, c.last_name) AS name
       FROM volunteers v
       INNER JOIN contacts c ON c.id = v.contact_id
       WHERE v.id = ?`
    )
    .get(volunteerId);
  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "volunteers",
    entityId: String(volunteerId),
    action: "update",
    before: mapVolunteer(existing),
    after: mapVolunteer(updated),
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });
  return mapVolunteer(updated);
}

function mapShift(row) {
  return {
    id: row.id,
    volunteerId: row.volunteer_id,
    volunteerName: row.volunteer_name,
    title: row.title,
    role: row.role,
    location: row.location,
    startAt: row.start_at,
    endAt: row.end_at,
    status: row.status,
    hoursExpected: row.hours_expected,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export function listShifts({ volunteerId } = {}) {
  const db = getDb();
  const params = {};
  let sql = `SELECT s.*, printf('%s %s', c.first_name, c.last_name) AS volunteer_name
    FROM volunteer_shifts s
    LEFT JOIN volunteers v ON v.id = s.volunteer_id
    LEFT JOIN contacts c ON c.id = v.contact_id`;
  if (volunteerId) {
    sql += " WHERE s.volunteer_id = @volunteerId";
    params.volunteerId = volunteerId;
  }
  sql += " ORDER BY s.start_at DESC";
  return db.prepare(sql).all(params).map(mapShift);
}

export function createShift(data, auditContext) {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO volunteer_shifts (volunteer_id, title, role, location, start_at, end_at, status, hours_expected, notes)
     VALUES (@volunteer_id, @title, @role, @location, @start_at, @end_at, @status, @hours_expected, @notes)`
  );
  const result = insert.run({
    volunteer_id: data.volunteerId ?? null,
    title: data.title,
    role: data.role ?? null,
    location: data.location ?? null,
    start_at: data.startAt,
    end_at: data.endAt ?? null,
    status: data.status ?? 'Scheduled',
    hours_expected: data.hoursExpected ?? null,
    notes: data.notes ?? null,
  });
  const shift = db
    .prepare(
      `SELECT s.*, printf('%s %s', c.first_name, c.last_name) AS volunteer_name
       FROM volunteer_shifts s
       LEFT JOIN volunteers v ON v.id = s.volunteer_id
       LEFT JOIN contacts c ON c.id = v.contact_id
       WHERE s.id = ?`
    )
    .get(result.lastInsertRowid);
  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "volunteer_shifts",
    entityId: String(shift.id),
    action: "create",
    after: shift,
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });
  return mapShift(shift);
}

export function recordHours(data, auditContext) {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO volunteer_hours (volunteer_id, shift_id, service_date, hours, notes, approved_by, approved_at)
     VALUES (@volunteer_id, @shift_id, @service_date, @hours, @notes, @approved_by, @approved_at)`
  );
  const result = insert.run({
    volunteer_id: data.volunteerId,
    shift_id: data.shiftId ?? null,
    service_date: data.serviceDate ?? new Date().toISOString().slice(0, 10),
    hours: data.hours,
    notes: data.notes ?? null,
    approved_by: data.approvedBy ?? null,
    approved_at: data.approvedAt ?? null,
  });
  const log = db
    .prepare(
      `SELECT h.*, printf('%s %s', c.first_name, c.last_name) AS volunteer_name
       FROM volunteer_hours h
       INNER JOIN volunteers v ON v.id = h.volunteer_id
       INNER JOIN contacts c ON c.id = v.contact_id
       WHERE h.id = ?`
    )
    .get(result.lastInsertRowid);
  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "volunteer_hours",
    entityId: String(log.id),
    action: "create",
    after: log,
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });
  return log;
}

export function listHoursSummary() {
  const db = getDb();
  return db.prepare("SELECT * FROM v_volunteer_hours_summary ORDER BY volunteer_name").all();
}

// Vocabulary management (skills/interests)
export function listVolunteerVocab({ type } = {}) {
  const db = getDb();
  if (type === 'skill' || type === 'interest') {
    return db
      .prepare("SELECT id, type, name FROM volunteer_vocab WHERE type = ? ORDER BY LOWER(name) ASC")
      .all(type);
  }
  return db.prepare("SELECT id, type, name FROM volunteer_vocab ORDER BY type, LOWER(name) ASC").all();
}

export function createVolunteerVocab({ type, name }) {
  const db = getDb();
  const trimmed = String(name || '').trim();
  const kind = type === 'interest' ? 'interest' : 'skill';
  if (!trimmed) {
    const err = new Error('Name is required');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  db.prepare("INSERT OR IGNORE INTO volunteer_vocab (type, name) VALUES (?, ?)").run(kind, trimmed);
  const row = db
    .prepare("SELECT id, type, name FROM volunteer_vocab WHERE type = ? AND name = ?")
    .get(kind, trimmed);
  return row;
}

export function deleteVolunteerVocab({ type, names = [] }) {
  const db = getDb();
  const kind = type === 'interest' ? 'interest' : 'skill';
  const items = Array.from(new Set((names || []).map((n) => String(n).trim()).filter(Boolean)));
  if (!items.length) return 0;
  const del = db.prepare("DELETE FROM volunteer_vocab WHERE type = ? AND name = ?");
  let count = 0;
  const tx = db.transaction(() => {
    for (const n of items) {
      const res = del.run(kind, n);
      count += res.changes || 0;
    }
  });
  tx();
  return count;
}
