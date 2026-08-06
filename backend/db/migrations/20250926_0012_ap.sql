-- Accounts Payable scaffolding and default accounts

-- Default GL accounts if not present
INSERT OR IGNORE INTO gl_accounts (code, name, type, is_active)
VALUES ('2000','Accounts Payable','Liability',1);

INSERT OR IGNORE INTO gl_accounts (code, name, type, is_active)
VALUES ('6000','Operating Expense','Expense',1);

-- AP tables
CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_account_id INTEGER,
  bill_no TEXT NOT NULL UNIQUE,
  bill_date TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'Posted', -- Draft, Posted, Paid, Void
  currency_code TEXT NOT NULL DEFAULT 'USD',
  fx_rate REAL NOT NULL DEFAULT 1,
  memo TEXT,
  total_amount REAL NOT NULL DEFAULT 0,
  balance_amount REAL NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  posted_at TEXT,
  FOREIGN KEY (vendor_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS bill_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL,
  description TEXT,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL,
  expense_gl_account_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE,
  FOREIGN KEY (expense_gl_account_id) REFERENCES gl_accounts(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS bill_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL,
  paid_at TEXT NOT NULL,
  amount REAL NOT NULL,
  method TEXT,
  reference TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE VIEW IF NOT EXISTS v_ap_aging AS
SELECT
  b.id AS bill_id,
  b.bill_no,
  b.vendor_account_id,
  b.bill_date,
  b.due_date,
  b.currency_code,
  b.balance_amount,
  CASE WHEN b.balance_amount <= 0 THEN 0
       WHEN julianday('now') - julianday(COALESCE(b.due_date, b.bill_date)) <= 30 THEN b.balance_amount
       ELSE 0 END AS bucket_0_30,
  CASE WHEN b.balance_amount > 0 AND julianday('now') - julianday(COALESCE(b.due_date, b.bill_date)) BETWEEN 31 AND 60 THEN b.balance_amount ELSE 0 END AS bucket_31_60,
  CASE WHEN b.balance_amount > 0 AND julianday('now') - julianday(COALESCE(b.due_date, b.bill_date)) BETWEEN 61 AND 90 THEN b.balance_amount ELSE 0 END AS bucket_61_90,
  CASE WHEN b.balance_amount > 0 AND julianday('now') - julianday(COALESCE(b.due_date, b.bill_date)) > 90 THEN b.balance_amount ELSE 0 END AS bucket_90_plus
FROM bills b
WHERE b.status IN ('Posted','Paid');

