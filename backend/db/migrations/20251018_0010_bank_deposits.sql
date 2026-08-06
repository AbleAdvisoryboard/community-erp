-- Bank deposits and undeposited payments support

-- Add deposit_batch_id to invoice_payments if missing
ALTER TABLE invoice_payments ADD COLUMN deposit_batch_id INTEGER;

-- Bank deposit header
CREATE TABLE IF NOT EXISTS bank_deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_account_id INTEGER NOT NULL,
  deposit_date TEXT NOT NULL,
  total_amount REAL NOT NULL,
  memo TEXT,
  journal_id INTEGER,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (journal_id) REFERENCES journals(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Deposit lines (currently supports AR invoice payments only)
CREATE TABLE IF NOT EXISTS bank_deposit_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deposit_id INTEGER NOT NULL,
  payment_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  FOREIGN KEY (deposit_id) REFERENCES bank_deposits(id) ON DELETE CASCADE,
  FOREIGN KEY (payment_id) REFERENCES invoice_payments(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_bank_deposit_lines_deposit ON bank_deposit_lines(deposit_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_deposit ON invoice_payments(deposit_batch_id);

