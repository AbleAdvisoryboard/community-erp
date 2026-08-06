CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('Household','Organization')),
  name TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Inactive','Prospect')),
  primary_contact_id INTEGER,
  phone TEXT,
  email TEXT,
  website TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS accounts_set_updated_at
AFTER UPDATE ON accounts
FOR EACH ROW
BEGIN
  UPDATE accounts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS account_addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'Primary' CHECK(type IN ('Primary','Billing','Shipping','Other')),
  line1 TEXT NOT NULL,
  line2 TEXT,
  city TEXT NOT NULL,
  region TEXT,
  postal_code TEXT,
  country TEXT NOT NULL DEFAULT 'US',
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_account_addresses_account ON account_addresses(account_id);

CREATE TRIGGER IF NOT EXISTS account_addresses_set_updated_at
AFTER UPDATE ON account_addresses
FOR EACH ROW
BEGIN
  UPDATE account_addresses SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  preferred_name TEXT,
  email TEXT,
  phone TEXT,
  mobile TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  do_not_contact INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_contacts_account ON contacts(account_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);

CREATE TRIGGER IF NOT EXISTS contacts_set_updated_at
AFTER UPDATE ON contacts
FOR EACH ROW
BEGIN
  UPDATE contacts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS contact_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS contact_tag_links (
  contact_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (contact_id, tag_id),
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES contact_tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL,
  related_contact_id INTEGER NOT NULL,
  relationship_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  FOREIGN KEY (related_contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_relationship_unique ON relationships(contact_id, related_contact_id, relationship_type);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER,
  contact_id INTEGER,
  subject TEXT NOT NULL,
  notes TEXT,
  activity_type TEXT NOT NULL DEFAULT 'Note',
  due_at TEXT,
  completed_at TEXT,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_activities_account ON activities(account_id);
CREATE INDEX IF NOT EXISTS idx_activities_contact ON activities(contact_id);

CREATE TABLE IF NOT EXISTS funds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  restriction TEXT NOT NULL DEFAULT 'Unrestricted' CHECK(restriction IN ('Unrestricted','TempRestricted','PermRestricted')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS funds_set_updated_at
AFTER UPDATE ON funds
FOR EACH ROW
BEGIN
  UPDATE funds SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  goal_amount REAL,
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Draft','Active','Completed','Archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS campaigns_set_updated_at
AFTER UPDATE ON campaigns
FOR EACH ROW
BEGIN
  UPDATE campaigns SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS appeals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  goal_amount REAL,
  start_date TEXT,
  end_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_appeals_campaign ON appeals(campaign_id);

CREATE TRIGGER IF NOT EXISTS appeals_set_updated_at
AFTER UPDATE ON appeals
FOR EACH ROW
BEGIN
  UPDATE appeals SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS designations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS donations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER,
  contact_id INTEGER,
  fund_id INTEGER,
  campaign_id INTEGER,
  appeal_id INTEGER,
  designation_id INTEGER,
  amount REAL NOT NULL CHECK(amount >= 0),
  currency_code TEXT NOT NULL DEFAULT 'USD',
  fx_rate REAL NOT NULL DEFAULT 1.0,
  donated_at TEXT NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'Offline',
  is_recurring INTEGER NOT NULL DEFAULT 0,
  receipt_id INTEGER,
  status TEXT NOT NULL DEFAULT 'Posted' CHECK(status IN ('Pending','Posted','Refunded','Failed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE SET NULL,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL,
  FOREIGN KEY (appeal_id) REFERENCES appeals(id) ON DELETE SET NULL,
  FOREIGN KEY (designation_id) REFERENCES designations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_donations_contact ON donations(contact_id);
CREATE INDEX IF NOT EXISTS idx_donations_account ON donations(account_id);
CREATE INDEX IF NOT EXISTS idx_donations_campaign ON donations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_donations_fund ON donations(fund_id);

CREATE TRIGGER IF NOT EXISTS donations_set_updated_at
AFTER UPDATE ON donations
FOR EACH ROW
BEGIN
  UPDATE donations SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS donation_soft_credits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  donation_id INTEGER NOT NULL,
  contact_id INTEGER NOT NULL,
  amount REAL NOT NULL CHECK(amount >= 0),
  FOREIGN KEY (donation_id) REFERENCES donations(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pledges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER,
  contact_id INTEGER,
  fund_id INTEGER,
  campaign_id INTEGER,
  total_amount REAL NOT NULL CHECK(total_amount >= 0),
  frequency TEXT NOT NULL CHECK(frequency IN ('OneTime','Monthly','Quarterly','Annually','Custom')),
  start_date TEXT NOT NULL,
  end_date TEXT,
  reminder_day INTEGER,
  status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Completed','Cancelled','OnHold')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE SET NULL,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
);

CREATE TRIGGER IF NOT EXISTS pledges_set_updated_at
AFTER UPDATE ON pledges
FOR EACH ROW
BEGIN
  UPDATE pledges SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS pledge_installments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pledge_id INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  amount_due REAL NOT NULL CHECK(amount_due >= 0),
  amount_paid REAL NOT NULL DEFAULT 0 CHECK(amount_paid >= 0),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Paid','PartiallyPaid','Overdue')),
  FOREIGN KEY (pledge_id) REFERENCES pledges(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_installments_pledge ON pledge_installments(pledge_id);

CREATE TABLE IF NOT EXISTS donation_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_no TEXT NOT NULL UNIQUE,
  donation_id INTEGER,
  contact_id INTEGER,
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivered_at TEXT,
  delivery_method TEXT NOT NULL DEFAULT 'Email',
  template_name TEXT,
  metadata_json TEXT,
  FOREIGN KEY (donation_id) REFERENCES donations(id) ON DELETE SET NULL,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_receipts_contact ON donation_receipts(contact_id);



