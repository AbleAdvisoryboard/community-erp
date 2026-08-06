PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS asset_registry_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  asset_tag TEXT UNIQUE,
  serial_number TEXT,
  location TEXT,
  custodian_contact_id INTEGER,
  status TEXT NOT NULL DEFAULT 'InStock' CHECK(status IN ('InUse','InStock','InRepair','Disposed','Reserved','InService')),
  acquired_at TEXT,
  warranty_expires_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
  FOREIGN KEY (custodian_contact_id) REFERENCES contacts(id) ON DELETE SET NULL
);

INSERT INTO asset_registry_new (
  id,
  item_id,
  asset_tag,
  serial_number,
  location,
  custodian_contact_id,
  status,
  acquired_at,
  warranty_expires_at,
  notes,
  created_at,
  updated_at
)
SELECT
  id,
  item_id,
  asset_tag,
  serial_number,
  location,
  custodian_contact_id,
  CASE
    WHEN status = 'InService' AND custodian_contact_id IS NOT NULL THEN 'InUse'
    WHEN status = 'InService' THEN 'InStock'
    WHEN status = 'Reserved' AND custodian_contact_id IS NULL THEN 'InStock'
    ELSE status
  END,
  acquired_at,
  warranty_expires_at,
  notes,
  created_at,
  updated_at
FROM asset_registry;

DROP TABLE asset_registry;
ALTER TABLE asset_registry_new RENAME TO asset_registry;

CREATE TRIGGER IF NOT EXISTS asset_registry_set_updated_at
AFTER UPDATE ON asset_registry
FOR EACH ROW
BEGIN
  UPDATE asset_registry SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

PRAGMA foreign_keys = ON;
