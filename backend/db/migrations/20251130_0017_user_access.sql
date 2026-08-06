CREATE TABLE IF NOT EXISTS user_access (
  user_id INTEGER PRIMARY KEY,
  access_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS user_access_set_updated_at
AFTER UPDATE ON user_access
FOR EACH ROW
BEGIN
  UPDATE user_access SET updated_at = CURRENT_TIMESTAMP WHERE user_id = NEW.user_id;
END;
