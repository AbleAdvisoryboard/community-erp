-- Posting rules and Accounts Receivable scaffolding

-- Basic app settings key/value
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

INSERT OR IGNORE INTO app_settings (key, value) VALUES
 ('donations_auto_post_gl', '1');

-- Ensure default GL accounts exist
-- 1000 Cash, 1010 Undeposited Funds, 1100 Accounts Receivable, 4000 Contributions Revenue
INSERT OR IGNORE INTO gl_accounts (code, name, type, parent_id, description, is_active)
VALUES
 ('1000','Cash','Asset',NULL,'Default cash account',1),
 ('1010','Undeposited Funds','Asset',NULL,'Undeposited funds / clearing',1),
 ('1100','Accounts Receivable','Asset',NULL,'Trade receivables',1),
 ('4000','Contributions Revenue','Revenue',NULL,'Donations and contributions',1);

-- Map Fund -> Revenue GL Account
CREATE TABLE IF NOT EXISTS fund_gl_mappings (
  fund_id INTEGER PRIMARY KEY,
  revenue_gl_account_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE CASCADE,
  FOREIGN KEY (revenue_gl_account_id) REFERENCES gl_accounts(id) ON DELETE RESTRICT
);

CREATE TRIGGER IF NOT EXISTS fund_gl_mappings_set_updated_at
AFTER UPDATE ON fund_gl_mappings
FOR EACH ROW BEGIN
  UPDATE fund_gl_mappings SET updated_at = CURRENT_TIMESTAMP WHERE fund_id = NEW.fund_id;
END;

-- Map Payment Method -> Cash GL Account
CREATE TABLE IF NOT EXISTS payment_method_gl_mappings (
  method TEXT PRIMARY KEY,
  cash_gl_account_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cash_gl_account_id) REFERENCES gl_accounts(id) ON DELETE RESTRICT
);

CREATE TRIGGER IF NOT EXISTS payment_method_gl_mappings_set_updated_at
AFTER UPDATE ON payment_method_gl_mappings
FOR EACH ROW BEGIN
  UPDATE payment_method_gl_mappings SET updated_at = CURRENT_TIMESTAMP WHERE method = NEW.method;
END;

-- Seed default mappings using 1010 for Cash/Check/Offline and 1000 for ACH/CreditCard/Online
INSERT OR IGNORE INTO payment_method_gl_mappings (method, cash_gl_account_id)
SELECT 'Cash', ga.id FROM gl_accounts ga WHERE ga.code = '1010';
INSERT OR IGNORE INTO payment_method_gl_mappings (method, cash_gl_account_id)
SELECT 'Check', ga.id FROM gl_accounts ga WHERE ga.code = '1010';
INSERT OR IGNORE INTO payment_method_gl_mappings (method, cash_gl_account_id)
SELECT 'Offline', ga.id FROM gl_accounts ga WHERE ga.code = '1010';
INSERT OR IGNORE INTO payment_method_gl_mappings (method, cash_gl_account_id)
SELECT 'ACH', ga.id FROM gl_accounts ga WHERE ga.code = '1000';
INSERT OR IGNORE INTO payment_method_gl_mappings (method, cash_gl_account_id)
SELECT 'CreditCard', ga.id FROM gl_accounts ga WHERE ga.code = '1000';
INSERT OR IGNORE INTO payment_method_gl_mappings (method, cash_gl_account_id)
SELECT 'Online', ga.id FROM gl_accounts ga WHERE ga.code = '1000';

-- For all existing funds, default to 4000 Contributions Revenue
INSERT OR IGNORE INTO fund_gl_mappings (fund_id, revenue_gl_account_id)
SELECT f.id, ga.id
  FROM funds f
 CROSS JOIN gl_accounts ga
 WHERE ga.code = '4000';

-- Accounts Receivable tables
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER,
  contact_id INTEGER,
  invoice_no TEXT NOT NULL UNIQUE,
  invoice_date TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'Posted', -- Draft, Sent, Posted, Paid, Void
  currency_code TEXT NOT NULL DEFAULT 'USD',
  fx_rate REAL NOT NULL DEFAULT 1,
  memo TEXT,
  total_amount REAL NOT NULL DEFAULT 0,
  balance_amount REAL NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  posted_at TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  item_id INTEGER,
  description TEXT,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL,
  revenue_gl_account_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE SET NULL,
  FOREIGN KEY (revenue_gl_account_id) REFERENCES gl_accounts(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS invoice_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  received_at TEXT NOT NULL,
  amount REAL NOT NULL,
  method TEXT,
  reference TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id);

-- AR Aging View
CREATE VIEW IF NOT EXISTS v_ar_aging AS
SELECT
  i.id AS invoice_id,
  i.invoice_no,
  i.account_id,
  i.contact_id,
  i.invoice_date,
  i.due_date,
  i.currency_code,
  i.balance_amount,
  CASE WHEN i.balance_amount <= 0 THEN 0
       WHEN julianday('now') - julianday(COALESCE(i.due_date, i.invoice_date)) <= 30 THEN i.balance_amount
       ELSE 0 END AS bucket_0_30,
  CASE WHEN i.balance_amount > 0 AND julianday('now') - julianday(COALESCE(i.due_date, i.invoice_date)) BETWEEN 31 AND 60 THEN i.balance_amount ELSE 0 END AS bucket_31_60,
  CASE WHEN i.balance_amount > 0 AND julianday('now') - julianday(COALESCE(i.due_date, i.invoice_date)) BETWEEN 61 AND 90 THEN i.balance_amount ELSE 0 END AS bucket_61_90,
  CASE WHEN i.balance_amount > 0 AND julianday('now') - julianday(COALESCE(i.due_date, i.invoice_date)) > 90 THEN i.balance_amount ELSE 0 END AS bucket_90_plus
FROM invoices i
WHERE i.status IN ('Posted','Paid');

