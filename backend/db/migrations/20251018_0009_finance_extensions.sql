-- Finance extensions: classes, periods, bank accounts, campaign GL map, funds compatibility

-- Classes (departments/programs)
CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

-- Accounting periods
CREATE TABLE IF NOT EXISTS periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  start_date TEXT NOT NULL,
  end_date TEXT,
  is_closed INTEGER NOT NULL DEFAULT 0
);

-- Add class_id to journal_lines if missing
ALTER TABLE journal_lines ADD COLUMN class_id INTEGER;

-- Add compatibility columns to journals if missing
ALTER TABLE journals ADD COLUMN number TEXT;
ALTER TABLE journals ADD COLUMN period TEXT;
ALTER TABLE journals ADD COLUMN is_posted INTEGER DEFAULT 0;

-- Bank accounts linked to GL
CREATE TABLE IF NOT EXISTS bank_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  gl_account_id INTEGER NOT NULL,
  last_reconciled_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (gl_account_id) REFERENCES gl_accounts(id) ON DELETE RESTRICT
);

CREATE TRIGGER IF NOT EXISTS bank_accounts_set_updated_at
AFTER UPDATE ON bank_accounts
FOR EACH ROW BEGIN
  UPDATE bank_accounts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Campaign/Fund -> GL mapping for donations
CREATE TABLE IF NOT EXISTS campaign_gl_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER,
  fund_id INTEGER,
  revenue_gl_id INTEGER,
  cash_gl_id INTEGER,
  pledges_gl_id INTEGER,
  restrictions_gl_id INTEGER,
  UNIQUE(campaign_id, fund_id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE CASCADE,
  FOREIGN KEY (revenue_gl_id) REFERENCES gl_accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (cash_gl_id) REFERENCES gl_accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (pledges_gl_id) REFERENCES gl_accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (restrictions_gl_id) REFERENCES gl_accounts(id) ON DELETE SET NULL
);

-- Extend funds with type column to align with GL
ALTER TABLE funds ADD COLUMN type TEXT;
UPDATE funds SET type =
  CASE restriction
    WHEN 'Unrestricted' THEN 'Unrestricted'
    WHEN 'TempRestricted' THEN 'TempRestricted'
    WHEN 'PermRestricted' THEN 'Restricted'
    ELSE 'Unrestricted'
  END
WHERE type IS NULL;

-- Seed Funds if empty
INSERT OR IGNORE INTO funds (name, code, description, restriction, is_active, type)
VALUES
 ('Unrestricted', 'UNR', 'General unrestricted fund', 'Unrestricted', 1, 'Unrestricted'),
 ('Temporarily Restricted', 'TR', 'Temporarily restricted net assets', 'TempRestricted', 1, 'TempRestricted'),
 ('Restricted', 'R', 'Permanently restricted net assets', 'PermRestricted', 1, 'Restricted');

-- Seed basic Chart of Accounts (commonly used)
INSERT OR IGNORE INTO gl_accounts (code, name, type, is_active) VALUES
 ('1200','Pledges Receivable','Asset',1),
 ('2100','Deferred Revenue','Liability',1),
 ('3000','Net Assets','Equity',1),
 ('3100','Net Assets Without Donor Restrictions','Equity',1),
 ('3200','Net Assets With Donor Restrictions','Equity',1),
 ('4100','Program Service Revenue','Revenue',1),
 ('4200','Grants and Contributions','Revenue',1),
 ('5000','Cost of Goods Sold','Expense',1),
 ('6100','Salaries and Wages','Expense',1),
 ('6200','Benefits','Expense',1),
 ('6300','Rent','Expense',1);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_journal_lines_fund ON journal_lines(fund_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account_fund ON journal_lines(gl_account_id, fund_id);
CREATE INDEX IF NOT EXISTS idx_invoices_account ON invoices(account_id);
CREATE INDEX IF NOT EXISTS idx_bills_vendor ON bills(vendor_account_id);

-- Seed default bank account linked to Cash (1000)
INSERT OR IGNORE INTO bank_accounts (id, name, gl_account_id)
SELECT 1, 'Operating Checking', ga.id FROM gl_accounts ga WHERE ga.code = '1000';
