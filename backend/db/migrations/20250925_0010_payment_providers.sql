CREATE TABLE IF NOT EXISTS payment_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  donation_id INTEGER,
  provider TEXT NOT NULL,
  provider_reference TEXT,
  status TEXT NOT NULL,
  amount REAL NOT NULL CHECK(amount >= 0),
  currency_code TEXT NOT NULL,
  raw_response TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (donation_id) REFERENCES donations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_donation ON payment_transactions(donation_id);
