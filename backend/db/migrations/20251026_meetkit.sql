PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS meetkit_pages (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meetkit_notes (
  date_iso TEXT PRIMARY KEY,
  blocks_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meetkit_backlinks (
  page_slug TEXT NOT NULL,
  date_iso TEXT NOT NULL,
  block_id TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  PRIMARY KEY (page_slug, date_iso, block_id),
  FOREIGN KEY (page_slug) REFERENCES meetkit_pages(slug) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meetkit_whiteboard (
  id INTEGER PRIMARY KEY CHECK (id=1),
  strokes_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meetkit_map_pins (
  id TEXT PRIMARY KEY,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Optional FTS for search
CREATE VIRTUAL TABLE IF NOT EXISTS meetkit_notes_fts USING fts5(
  date_iso, content, content='',
  tokenize='porter'
);

-- Seeds
INSERT OR IGNORE INTO meetkit_pages(slug,title) VALUES ('Clients/Ashley','Clients/Ashley');
INSERT OR IGNORE INTO meetkit_whiteboard(id,strokes_json) VALUES (1,'[]');

