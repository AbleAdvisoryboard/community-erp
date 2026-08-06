ALTER TABLE users ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TEXT;

INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('auth.access_timeout_minutes', '15'),
  ('auth.failed_login_limit', '5'),
  ('auth.lockout_minutes', '30');
