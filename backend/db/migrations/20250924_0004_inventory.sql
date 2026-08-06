CREATE TABLE IF NOT EXISTS item_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('Consumable','Equipment')),
  category_id INTEGER,
  uom TEXT NOT NULL DEFAULT 'each',
  cost_method TEXT NOT NULL DEFAULT 'Standard' CHECK(cost_method IN ('Standard','FIFO','LIFO')),
  standard_cost REAL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES item_categories(id) ON DELETE SET NULL
);

CREATE TRIGGER IF NOT EXISTS inventory_items_set_updated_at
AFTER UPDATE ON inventory_items
FOR EACH ROW
BEGIN
  UPDATE inventory_items SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS inventory_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  location TEXT NOT NULL,
  bin TEXT,
  qty_on_hand REAL NOT NULL DEFAULT 0,
  qty_allocated REAL NOT NULL DEFAULT 0,
  qty_on_order REAL NOT NULL DEFAULT 0,
  min_qty REAL NOT NULL DEFAULT 0,
  max_qty REAL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_stock_item_location ON inventory_stock(item_id, location, COALESCE(bin, ''));

CREATE TRIGGER IF NOT EXISTS inventory_stock_set_updated_at
AFTER UPDATE ON inventory_stock
FOR EACH ROW
BEGIN
  UPDATE inventory_stock SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS asset_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  asset_tag TEXT UNIQUE,
  serial_number TEXT,
  location TEXT,
  custodian_contact_id INTEGER,
  status TEXT NOT NULL DEFAULT 'InService' CHECK(status IN ('InService','InRepair','Disposed','Reserved')),
  acquired_at TEXT,
  warranty_expires_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
  FOREIGN KEY (custodian_contact_id) REFERENCES contacts(id) ON DELETE SET NULL
);

CREATE TRIGGER IF NOT EXISTS asset_registry_set_updated_at
AFTER UPDATE ON asset_registry
FOR EACH ROW
BEGIN
  UPDATE asset_registry SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS asset_maintenance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id INTEGER NOT NULL,
  performed_at TEXT NOT NULL,
  performed_by TEXT,
  notes TEXT,
  cost REAL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (asset_id) REFERENCES asset_registry(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  location TEXT NOT NULL,
  bin TEXT,
  qty_delta REAL NOT NULL,
  reason TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE VIEW IF NOT EXISTS v_inventory_low_stock AS
SELECT
  i.id AS item_id,
  i.sku,
  i.name,
  s.location,
  s.bin,
  s.qty_on_hand,
  s.min_qty,
  i.uom,
  MAX(0, s.min_qty - s.qty_on_hand) AS qty_needed
FROM inventory_stock s
INNER JOIN inventory_items i ON i.id = s.item_id
WHERE s.qty_on_hand < s.min_qty;
