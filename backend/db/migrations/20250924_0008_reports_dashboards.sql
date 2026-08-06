CREATE TABLE IF NOT EXISTS report_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  dataset TEXT NOT NULL,
  columns_json TEXT NOT NULL,
  filters_json TEXT,
  sort_json TEXT,
  options_json TEXT,
  permission_code TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TRIGGER IF NOT EXISTS report_definitions_set_updated_at
AFTER UPDATE ON report_definitions
FOR EACH ROW
BEGIN
  UPDATE report_definitions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS report_roles (
  report_id INTEGER NOT NULL,
  role_name TEXT NOT NULL,
  filters_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (report_id, role_name),
  FOREIGN KEY (report_id) REFERENCES report_definitions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS report_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  columns_json TEXT,
  filters_json TEXT,
  sort_json TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES report_definitions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (report_id, user_id, name)
);

CREATE TRIGGER IF NOT EXISTS report_views_set_updated_at
AFTER UPDATE ON report_views
FOR EACH ROW
BEGIN
  UPDATE report_views SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS report_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL,
  user_id INTEGER,
  format TEXT NOT NULL DEFAULT 'json',
  filters_hash TEXT,
  filters_json TEXT,
  row_count INTEGER,
  duration_ms INTEGER,
  output_path TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES report_definitions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_report_runs_report ON report_runs(report_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dashboard_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  dataset TEXT NOT NULL,
  query_json TEXT NOT NULL,
  permission_code TEXT,
  config_json TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TRIGGER IF NOT EXISTS dashboard_cards_set_updated_at
AFTER UPDATE ON dashboard_cards
FOR EACH ROW
BEGIN
  UPDATE dashboard_cards SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS dashboard_card_roles (
  card_id INTEGER NOT NULL,
  role_name TEXT NOT NULL,
  filters_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (card_id, role_name),
  FOREIGN KEY (card_id) REFERENCES dashboard_cards(id) ON DELETE CASCADE
);

