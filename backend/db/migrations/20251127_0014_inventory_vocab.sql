CREATE TABLE IF NOT EXISTS inventory_item_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO inventory_item_types (name)
SELECT DISTINCT type FROM inventory_items WHERE type IS NOT NULL AND TRIM(type) <> '';

INSERT OR IGNORE INTO inventory_item_types (name) VALUES ('Consumable');
INSERT OR IGNORE INTO inventory_item_types (name) VALUES ('Equipment');

PRAGMA defer_foreign_keys = ON;

DROP TRIGGER IF EXISTS inventory_items_set_updated_at;
DROP VIEW IF EXISTS v_inventory_low_stock;

CREATE TABLE inventory_items_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
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

INSERT INTO inventory_items_v2 (
  id,
  sku,
  name,
  type,
  category_id,
  uom,
  cost_method,
  standard_cost,
  is_active,
  notes,
  created_at,
  updated_at
)
SELECT
  id,
  sku,
  name,
  type,
  category_id,
  uom,
  cost_method,
  standard_cost,
  is_active,
  notes,
  created_at,
  updated_at
FROM inventory_items;

DROP TABLE inventory_items;
ALTER TABLE inventory_items_v2 RENAME TO inventory_items;

CREATE TRIGGER IF NOT EXISTS inventory_items_set_updated_at
AFTER UPDATE ON inventory_items
FOR EACH ROW
BEGIN
  UPDATE inventory_items SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

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
