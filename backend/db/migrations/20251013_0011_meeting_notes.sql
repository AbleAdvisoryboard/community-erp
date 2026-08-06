-- Meeting Notes tables
CREATE TABLE IF NOT EXISTS meeting_notes (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  content_html TEXT NOT NULL DEFAULT '',
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meeting_note_changes (
  id INTEGER PRIMARY KEY,
  note_id INTEGER NOT NULL REFERENCES meeting_notes(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  summary TEXT,
  content_html TEXT NOT NULL DEFAULT '',
  changed_by INTEGER,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_meeting_note_changes_note_id ON meeting_note_changes(note_id);

