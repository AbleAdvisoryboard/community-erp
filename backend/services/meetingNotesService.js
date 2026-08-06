import { getDb } from "../db/connection.js";
import { writeAuditLog } from "../utils/audit.js";

function mapNote(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    contentHtml: row.content_html || "",
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listNotes({ query } = {}) {
  const db = getDb();
  const q = (query || "").trim();
  if (q) {
    const like = `%${q}%`;
    return db
      .prepare(
        `SELECT * FROM meeting_notes
         WHERE title LIKE @like OR content_html LIKE @like
         ORDER BY updated_at DESC`
      )
      .all({ like })
      .map(mapNote);
  }
  return db
    .prepare(`SELECT * FROM meeting_notes ORDER BY updated_at DESC`)
    .all()
    .map(mapNote);
}

export function getNote(noteId) {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM meeting_notes WHERE id = ?`).get(noteId);
  return mapNote(row);
}

export function createNote({ title, contentHtml }, auditContext) {
  const db = getDb();
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO meeting_notes (title, content_html, created_by, updated_by, created_at, updated_at)
     VALUES (@title, @content_html, @created_by, @updated_by, @created_at, @updated_at)`
  );
  const info = insert.run({
    title: title?.trim() || "Untitled",
    content_html: contentHtml || "",
    created_by: auditContext?.userId ?? null,
    updated_by: auditContext?.userId ?? null,
    created_at: now,
    updated_at: now,
  });
  const id = info.lastInsertRowid;
  // Initial change log at version 1
  db.prepare(
    `INSERT INTO meeting_note_changes (note_id, version, summary, content_html, changed_by, changed_at)
     VALUES (@note_id, @version, @summary, @content_html, @changed_by, @changed_at)`
  ).run({
    note_id: id,
    version: 1,
    summary: "Created",
    content_html: contentHtml || "",
    changed_by: auditContext?.userId ?? null,
    changed_at: now,
  });
  const created = getNote(id);
  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "meeting_notes",
    entityId: String(id),
    action: "create",
    before: null,
    after: created,
    ipAddress: auditContext?.ip ?? null,
    userAgent: auditContext?.userAgent ?? null,
  });
  return created;
}

export function updateNote(noteId, { title, contentHtml, summary }, auditContext) {
  const db = getDb();
  const before = getNote(noteId);
  if (!before) return null;
  const now = new Date().toISOString();
  const update = db.prepare(
    `UPDATE meeting_notes SET
      title = COALESCE(@title, title),
      content_html = COALESCE(@content_html, content_html),
      updated_by = @updated_by,
      updated_at = @updated_at
     WHERE id = @id`
  );
  update.run({
    id: noteId,
    title: title === undefined ? null : (title?.trim() || "Untitled"),
    content_html: contentHtml === undefined ? null : (contentHtml || ""),
    updated_by: auditContext?.userId ?? null,
    updated_at: now,
  });

  // Next version number
  const last = db
    .prepare(`SELECT COALESCE(MAX(version), 0) as v FROM meeting_note_changes WHERE note_id = ?`)
    .get(noteId);
  const nextVersion = (last?.v || 0) + 1;
  db.prepare(
    `INSERT INTO meeting_note_changes (note_id, version, summary, content_html, changed_by, changed_at)
     VALUES (@note_id, @version, @summary, @content_html, @changed_by, @changed_at)`
  ).run({
    note_id: noteId,
    version: nextVersion,
    summary: (summary?.trim() || "Edited"),
    content_html: contentHtml ?? before.contentHtml ?? "",
    changed_by: auditContext?.userId ?? null,
    changed_at: now,
  });

  const after = getNote(noteId);
  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "meeting_notes",
    entityId: String(noteId),
    action: "update",
    before,
    after,
    ipAddress: auditContext?.ip ?? null,
    userAgent: auditContext?.userAgent ?? null,
  });
  return after;
}

export function deleteNote(noteId, auditContext) {
  const db = getDb();
  const before = getNote(noteId);
  if (!before) return false;
  db.prepare(`DELETE FROM meeting_notes WHERE id = ?`).run(noteId);
  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "meeting_notes",
    entityId: String(noteId),
    action: "delete",
    before,
    after: null,
    ipAddress: auditContext?.ip ?? null,
    userAgent: auditContext?.userAgent ?? null,
  });
  return true;
}

export function listNoteChanges(noteId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM meeting_note_changes
       WHERE note_id = ?
       ORDER BY version DESC`
    )
    .all(noteId)
    .map((row) => ({
      id: row.id,
      version: row.version,
      summary: row.summary,
      contentHtml: row.content_html || "",
      changedBy: row.changed_by,
      changedAt: row.changed_at,
    }));
}

