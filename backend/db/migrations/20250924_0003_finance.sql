CREATE TABLE IF NOT EXISTS gl_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('Asset','Liability','Equity','Revenue','Expense')),
  parent_id INTEGER,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES gl_accounts(id) ON DELETE SET NULL
);

CREATE TRIGGER IF NOT EXISTS gl_accounts_set_updated_at
AFTER UPDATE ON gl_accounts
FOR EACH ROW
BEGIN
  UPDATE gl_accounts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS journals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_no TEXT NOT NULL UNIQUE,
  journal_date TEXT NOT NULL,
  memo TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  posted_at TEXT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  journal_id INTEGER NOT NULL,
  gl_account_id INTEGER NOT NULL,
  fund_id INTEGER,
  amount REAL NOT NULL CHECK(amount >= 0),
  drcr TEXT NOT NULL CHECK(drcr IN ('D','C')),
  memo TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (journal_id) REFERENCES journals(id) ON DELETE CASCADE,
  FOREIGN KEY (gl_account_id) REFERENCES gl_accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_journal ON journal_lines(journal_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines(gl_account_id);

CREATE VIEW IF NOT EXISTS v_trial_balance AS
SELECT
  ga.id AS account_id,
  ga.code AS account_code,
  ga.name AS account_name,
  ga.type AS account_type,
  SUM(CASE WHEN jl.drcr = 'D' THEN jl.amount ELSE 0 END) AS total_debits,
  SUM(CASE WHEN jl.drcr = 'C' THEN jl.amount ELSE 0 END) AS total_credits,
  SUM(CASE WHEN jl.drcr = 'D' THEN jl.amount ELSE -jl.amount END) AS balance
FROM gl_accounts ga
LEFT JOIN journal_lines jl ON jl.gl_account_id = ga.id
LEFT JOIN journals j ON j.id = jl.journal_id
GROUP BY ga.id;
