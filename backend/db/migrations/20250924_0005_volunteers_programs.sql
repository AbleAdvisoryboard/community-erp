CREATE TABLE IF NOT EXISTS volunteers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL,
  skills TEXT,
  interests TEXT,
  background_check_status TEXT NOT NULL DEFAULT 'Pending' CHECK(background_check_status IN ('Pending','Approved','Expired')),
  available_json TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS volunteers_set_updated_at
AFTER UPDATE ON volunteers
FOR EACH ROW
BEGIN
  UPDATE volunteers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS volunteer_shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  volunteer_id INTEGER,
  title TEXT NOT NULL,
  role TEXT,
  location TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT,
  status TEXT NOT NULL DEFAULT 'Scheduled' CHECK(status IN ('Scheduled','Completed','Cancelled')),
  hours_expected REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (volunteer_id) REFERENCES volunteers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS volunteer_hours (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  volunteer_id INTEGER NOT NULL,
  shift_id INTEGER,
  service_date TEXT NOT NULL,
  hours REAL NOT NULL CHECK(hours >= 0),
  notes TEXT,
  approved_by INTEGER,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (volunteer_id) REFERENCES volunteers(id) ON DELETE CASCADE,
  FOREIGN KEY (shift_id) REFERENCES volunteer_shifts(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE VIEW IF NOT EXISTS v_volunteer_hours_summary AS
SELECT
  v.id AS volunteer_id,
  c.first_name || ' ' || c.last_name AS volunteer_name,
  SUM(h.hours) AS total_hours,
  SUM(CASE WHEN h.service_date >= date('now','start of month') THEN h.hours ELSE 0 END) AS hours_mtd,
  SUM(CASE WHEN strftime('%Y', h.service_date) = strftime('%Y','now') THEN h.hours ELSE 0 END) AS hours_ytd
FROM volunteers v
INNER JOIN contacts c ON c.id = v.contact_id
LEFT JOIN volunteer_hours h ON h.volunteer_id = v.id
GROUP BY v.id;

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth TEXT,
  pii_json TEXT,
  restricted INTEGER NOT NULL DEFAULT 0,
  consent_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS clients_set_updated_at
AFTER UPDATE ON clients
FOR EACH ROW
BEGIN
  UPDATE clients SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS program_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  program_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','OnHold','Closed')),
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  outcome_json TEXT,
  restricted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS program_cases_set_updated_at
AFTER UPDATE ON program_cases
FOR EACH ROW
BEGIN
  UPDATE program_cases SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS case_services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL,
  service_date TEXT NOT NULL,
  service_type TEXT NOT NULL,
  duration_minutes INTEGER,
  notes TEXT,
  staff_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES program_cases(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_volunteers_contact ON volunteers(contact_id);
CREATE INDEX IF NOT EXISTS idx_volunteer_hours_volunteer_date ON volunteer_hours(volunteer_id, service_date);
CREATE INDEX IF NOT EXISTS idx_program_cases_client ON program_cases(client_id);
CREATE INDEX IF NOT EXISTS idx_case_services_case ON case_services(case_id);
