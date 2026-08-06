CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  venue_name TEXT,
  venue_address TEXT,
  venue_city TEXT,
  venue_state TEXT,
  venue_postal_code TEXT,
  venue_country TEXT DEFAULT 'US',
  capacity INTEGER CHECK(capacity IS NULL OR capacity >= 0),
  status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Published','Completed','Cancelled','Archived')),
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TRIGGER IF NOT EXISTS events_set_updated_at
AFTER UPDATE ON events
FOR EACH ROW
BEGIN
  UPDATE events SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS event_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT,
  location TEXT,
  capacity INTEGER CHECK(capacity IS NULL OR capacity >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS event_sessions_set_updated_at
AFTER UPDATE ON event_sessions
FOR EACH ROW
BEGIN
  UPDATE event_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS event_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'General' CHECK(type IN ('General','VIP','Student','Sponsor','Staff')),
  price REAL NOT NULL DEFAULT 0 CHECK(price >= 0),
  currency_code TEXT NOT NULL DEFAULT 'USD',
  quantity_total INTEGER NOT NULL DEFAULT 0 CHECK(quantity_total >= 0),
  quantity_sold INTEGER NOT NULL DEFAULT 0 CHECK(quantity_sold >= 0),
  sales_start_at TEXT,
  sales_end_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_tickets_name ON event_tickets(event_id, name);

CREATE TRIGGER IF NOT EXISTS event_tickets_set_updated_at
AFTER UPDATE ON event_tickets
FOR EACH ROW
BEGIN
  UPDATE event_tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS event_discounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL CHECK(discount_type IN ('Amount','Percent')),
  amount_value REAL DEFAULT 0 CHECK(amount_value >= 0),
  percent_value REAL DEFAULT 0 CHECK(percent_value >= 0 AND percent_value <= 100),
  max_uses INTEGER CHECK(max_uses IS NULL OR max_uses >= 0),
  uses INTEGER NOT NULL DEFAULT 0 CHECK(uses >= 0),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_discounts_code ON event_discounts(event_id, code);

CREATE TABLE IF NOT EXISTS event_sponsors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  contact_id INTEGER,
  sponsor_name TEXT NOT NULL,
  sponsor_level TEXT,
  amount REAL DEFAULT 0 CHECK(amount >= 0),
  currency_code TEXT NOT NULL DEFAULT 'USD',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_event_sponsors_event ON event_sponsors(event_id);

CREATE TABLE IF NOT EXISTS event_registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  contact_id INTEGER,
  ticket_id INTEGER,
  session_id INTEGER,
  guest_name TEXT,
  guest_email TEXT,
  guest_phone TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Confirmed','Cancelled','CheckedIn','NoShow')),
  total_amount REAL NOT NULL DEFAULT 0 CHECK(total_amount >= 0),
  currency_code TEXT NOT NULL DEFAULT 'USD',
  discount_code TEXT,
  payment_reference TEXT,
  registered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checked_in_at TEXT,
  notes TEXT,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (ticket_id) REFERENCES event_tickets(id) ON DELETE SET NULL,
  FOREIGN KEY (session_id) REFERENCES event_sessions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_event_registrations_event ON event_registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_registrations_contact ON event_registrations(contact_id);

CREATE TABLE IF NOT EXISTS message_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  channel TEXT NOT NULL CHECK(channel IN ('Email','SMS')),
  subject TEXT,
  body_html TEXT,
  body_text TEXT,
  variables_json TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TRIGGER IF NOT EXISTS message_templates_set_updated_at
AFTER UPDATE ON message_templates
FOR EACH ROW
BEGIN
  UPDATE message_templates SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER,
  channel TEXT NOT NULL CHECK(channel IN ('Email','SMS')),
  subject TEXT,
  body_html TEXT,
  body_text TEXT,
  audience_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Queued','Sending','Sent','Failed','Cancelled')),
  scheduled_at TEXT,
  sent_at TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (template_id) REFERENCES message_templates(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TRIGGER IF NOT EXISTS messages_set_updated_at
AFTER UPDATE ON messages
FOR EACH ROW
BEGIN
  UPDATE messages SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS message_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  contact_id INTEGER,
  channel TEXT NOT NULL CHECK(channel IN ('Email','SMS')),
  address TEXT,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Sent','Delivered','Bounced','Failed')),
  provider_response TEXT,
  sent_at TEXT,
  delivered_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_message_deliveries_message ON message_deliveries(message_id);
CREATE INDEX IF NOT EXISTS idx_message_deliveries_contact ON message_deliveries(contact_id);
