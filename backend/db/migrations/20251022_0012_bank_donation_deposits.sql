-- Support including Donations in bank deposits (additive)

-- Mark donations included in a deposit batch
ALTER TABLE donations ADD COLUMN deposit_batch_id INTEGER;

-- Deposit lines for donations
CREATE TABLE IF NOT EXISTS bank_deposit_donation_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deposit_id INTEGER NOT NULL,
  donation_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  FOREIGN KEY (deposit_id) REFERENCES bank_deposits(id) ON DELETE CASCADE,
  FOREIGN KEY (donation_id) REFERENCES donations(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_bank_deposit_donation_lines_deposit ON bank_deposit_donation_lines(deposit_id);
CREATE INDEX IF NOT EXISTS idx_donations_deposit ON donations(deposit_batch_id);

