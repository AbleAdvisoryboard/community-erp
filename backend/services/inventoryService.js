import { getDb } from "../db/connection.js";
import { getJlInsert } from "../utils/journalLines.js";
import { writeAuditLog } from "../utils/audit.js";

const INVENTORY_ASSET_ACCOUNT = {
  code: "1300",
  name: "Inventory",
  type: "Asset",
  isCurrentAsset: true,
  fsCategory: "balance.asset.inventories",
};
const INVENTORY_ADJUSTMENT_OFFSET_ACCOUNT = {
  code: "3205",
  name: "Inventory Adjustment Offset",
  type: "Equity",
  fsCategory: "balance.equity.net_assets",
};
const INVENTORY_EXPENSE_ACCOUNT = {
  code: "5000",
  name: "Cost of Goods Sold",
  type: "Expense",
  fsCategory: "activities.exp.operational.other",
};

function tableColumns(db, tableName) {
  return new Set(db.prepare(`PRAGMA table_info('${tableName}')`).all().map((row) => row.name));
}

function ensureGlAccount(db, account) {
  const columns = tableColumns(db, "gl_accounts");
  const existing = db.prepare("SELECT * FROM gl_accounts WHERE code = ?").get(account.code);
  if (existing?.id) {
    const updates = [];
    const params = { id: existing.id };
    if (columns.has("fs_category") && account.fsCategory && !existing.fs_category) {
      updates.push("fs_category = @fs_category");
      params.fs_category = account.fsCategory;
    }
    if (columns.has("is_current_asset") && account.isCurrentAsset && !existing.is_current_asset) {
      updates.push("is_current_asset = 1");
    }
    if (updates.length) {
      db.prepare(`UPDATE gl_accounts SET ${updates.join(", ")} WHERE id = @id`).run(params);
    }
    return existing.id;
  }

  const insertColumns = ["code", "name", "type", "is_active"];
  const values = {
    code: account.code,
    name: account.name,
    type: account.type,
    is_active: 1,
  };
  if (columns.has("is_current_asset")) {
    insertColumns.push("is_current_asset");
    values.is_current_asset = account.isCurrentAsset ? 1 : 0;
  }
  if (columns.has("fs_category")) {
    insertColumns.push("fs_category");
    values.fs_category = account.fsCategory ?? null;
  }
  const placeholders = insertColumns.map((column) => `@${column}`).join(", ");
  return db
    .prepare(`INSERT INTO gl_accounts (${insertColumns.join(", ")}) VALUES (${placeholders})`)
    .run(values).lastInsertRowid;
}

function nextInventoryJournalNumber(db) {
  return db
    .prepare("SELECT printf('INV-%s-%04d', strftime('%Y', 'now'), COALESCE(MAX(id),0)+1) AS number FROM journals")
    .get().number;
}

function createPostedInventoryJournal(db, { amount, item, qtyDelta, adjustmentId, location, bin, reason, userId }) {
  const journalColumns = tableColumns(db, "journals");
  const number = nextInventoryJournalNumber(db);
  const memo = reason || `Inventory adjustment ${item.sku}`;
  const journalDate = new Date().toISOString().slice(0, 10);
  const journalValues = {
    entry_no: number,
    journal_date: journalDate,
    memo,
    created_by: userId ?? null,
    posted_at: new Date().toISOString(),
    number,
    is_posted: 1,
  };
  const journalInsertColumns = ["entry_no", "journal_date", "memo", "created_by", "posted_at"];
  if (journalColumns.has("number")) journalInsertColumns.push("number");
  if (journalColumns.has("is_posted")) journalInsertColumns.push("is_posted");
  const journalId = db
    .prepare(`INSERT INTO journals (${journalInsertColumns.join(", ")}) VALUES (${journalInsertColumns.map((column) => `@${column}`).join(", ")})`)
    .run(journalValues).lastInsertRowid;

  const inventoryAccountId = ensureGlAccount(db, INVENTORY_ASSET_ACCOUNT);
  const offsetAccountId = qtyDelta > 0
    ? ensureGlAccount(db, INVENTORY_ADJUSTMENT_OFFSET_ACCOUNT)
    : ensureGlAccount(db, INVENTORY_EXPENSE_ACCOUNT);
  const { stmt: insertLine, cols } = getJlInsert(db);
  const lineMemo = `${item.sku} ${location}${bin ? ` / ${bin}` : ""}`;
  const baseLine = {
    journal_id: journalId,
    amount,
    fund_id: null,
    class_id: null,
    campaign_id: null,
    memo: lineMemo,
    source_table: "inventory_adjustments",
    source_id: adjustmentId,
    source_line: null,
  };
  const lines = qtyDelta > 0
    ? [
        { ...baseLine, gl_account_id: inventoryAccountId, drcr: "D" },
        { ...baseLine, gl_account_id: offsetAccountId, drcr: "C" },
      ]
    : [
        { ...baseLine, gl_account_id: offsetAccountId, drcr: "D" },
        { ...baseLine, gl_account_id: inventoryAccountId, drcr: "C" },
      ];
  for (const line of lines) {
    insertLine.run(cols.map((column) => line[column]));
  }
  return { journalId, journalNumber: number };
}


export function listCategories() {
  const db = getDb();
  return db.prepare("SELECT id, name, description FROM item_categories ORDER BY name").all();
}

export function createCategory(data) {
  const db = getDb();
  const result = db
    .prepare("INSERT INTO item_categories (name, description) VALUES (@name, @description)")
    .run({
      name: data.name,
      description: data.description ?? null,
    });
  return db
    .prepare("SELECT id, name, description FROM item_categories WHERE id = ?")
    .get(result.lastInsertRowid);
}

export function deleteCategory(categoryId) {
  const db = getDb();
  const existing = db.prepare("SELECT id, name, description FROM item_categories WHERE id = ?").get(categoryId);
  if (!existing) return null;
  db.prepare("DELETE FROM item_categories WHERE id = ?").run(categoryId);
  return existing;
}

export function listItemTypes() {
  const db = getDb();
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'inventory_item_types'")
    .get();
  if (!tableExists) {
    return [{ name: "Consumable" }, { name: "Equipment" }];
  }
  return db.prepare("SELECT name FROM inventory_item_types ORDER BY name").all();
}

export function createItemType(data) {
  const db = getDb();
  db.prepare("INSERT INTO inventory_item_types (name) VALUES (@name)").run({
    name: data.name,
  });
  return db.prepare("SELECT name FROM inventory_item_types WHERE name = ?").get(data.name);
}

export function deleteItemType(name) {
  const db = getDb();
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'inventory_item_types'")
    .get();
  if (!tableExists) return null;
  const existing = db.prepare("SELECT name FROM inventory_item_types WHERE name = ?").get(name);
  if (!existing) return null;
  db.prepare("DELETE FROM inventory_item_types WHERE name = ?").run(name);
  return existing;
}

function mapItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    type: row.type,
    categoryId: row.category_id,
    categoryName: row.category_name ?? null,
    uom: row.uom,
    costMethod: row.cost_method,
    standardCost: row.standard_cost,
    isActive: !!row.is_active,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listItems({ search, type, includeInactive = false } = {}) {
  const db = getDb();
  const where = [];
  const params = {};
  if (search) {
    where.push("(i.name LIKE @search OR i.sku LIKE @search OR i.type LIKE @search OR c.name LIKE @search)");
    params.search = `%${search}%`;
  }
  if (type) {
    where.push("i.type = @type");
    params.type = type;
  }
  if (!includeInactive) {
    where.push("i.is_active = 1");
  }
  const sql = `SELECT i.*, c.name AS category_name
    FROM inventory_items i
    LEFT JOIN item_categories c ON c.id = i.category_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY i.name`;
  return db.prepare(sql).all(params).map(mapItem);
}

export function createItem(data, auditContext) {
  const db = getDb();
  const categoryId = data.categoryId ?? null;
  const typeTableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'inventory_item_types'")
    .get();
  if (typeTableExists) {
    db.prepare("INSERT OR IGNORE INTO inventory_item_types (name) VALUES (?)").run(data.type);
  }
  const insert = db.prepare(
    `INSERT INTO inventory_items (sku, name, type, category_id, uom, cost_method, standard_cost, is_active, notes)
     VALUES (@sku, @name, @type, @category_id, @uom, @cost_method, @standard_cost, @is_active, @notes)`
  );
  const result = insert.run({
    sku: data.sku,
    name: data.name,
    type: data.type,
    category_id: categoryId,
    uom: data.uom ?? "each",
    cost_method: data.costMethod ?? "Standard",
    standard_cost: data.standardCost ?? 0,
    is_active: data.isActive === false ? 0 : 1,
    notes: data.notes ?? null,
  });
  const itemId = result.lastInsertRowid;

  if (Array.isArray(data.initialStock)) {
    for (const entry of data.initialStock) {
      upsertStock(
        {
          itemId,
          location: entry.location,
          bin: entry.bin ?? null,
          qtyDelta: entry.qtyOnHand ?? 0,
          minQty: entry.minQty ?? 0,
          maxQty: entry.maxQty ?? null,
          reason: "Initial load",
        },
        auditContext,
        { skipAudit: true }
      );
    }
  }

  const created = db
    .prepare(
      `SELECT i.*, c.name AS category_name FROM inventory_items i
       LEFT JOIN item_categories c ON c.id = i.category_id WHERE i.id = ?`
    )
    .get(itemId);

  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "inventory_items",
    entityId: String(itemId),
    action: "create",
    after: mapItem(created),
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });

  return mapItem(created);
}

export function updateItem(itemId, updates, auditContext) {
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT i.*, c.name AS category_name FROM inventory_items i
       LEFT JOIN item_categories c ON c.id = i.category_id WHERE i.id = ?`
    )
    .get(itemId);
  if (!existing) {
    return null;
  }

  const mapping = {
    sku: "sku",
    name: "name",
    type: "type",
    categoryId: "category_id",
    uom: "uom",
    costMethod: "cost_method",
    standardCost: "standard_cost",
    isActive: "is_active",
    notes: "notes",
  };
  const params = { id: itemId };
  const sets = [];
  if (Object.prototype.hasOwnProperty.call(updates, "type")) {
    const typeTableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'inventory_item_types'")
      .get();
    if (typeTableExists) {
      db.prepare("INSERT OR IGNORE INTO inventory_item_types (name) VALUES (?)").run(updates.type);
    }
  }
  for (const [key, column] of Object.entries(mapping)) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      let value = updates[key];
      if (key === "isActive") {
        value = updates[key] ? 1 : 0;
      }
      sets.push(`${column} = @${column}`);
      params[column] = value ?? null;
    }
  }
  if (sets.length) {
    db.prepare(`UPDATE inventory_items SET ${sets.join(", ")} WHERE id = @id`).run(params);
  }
  const updated = db
    .prepare(
      `SELECT i.*, c.name AS category_name FROM inventory_items i
       LEFT JOIN item_categories c ON c.id = i.category_id WHERE i.id = ?`
    )
    .get(itemId);

  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "inventory_items",
    entityId: String(itemId),
    action: "update",
    before: mapItem(existing),
    after: mapItem(updated),
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });

  return mapItem(updated);
}

function mapStock(row) {
  const qtyOnHand = row.qty_on_hand ?? 0;
  const qtyAllocated = (row.qty_allocated ?? 0) + (row.asset_allocated ?? 0);
  return {
    id: row.id,
    itemId: row.item_id,
    sku: row.sku,
    itemName: row.item_name,
    location: row.location,
    bin: row.bin,
    qtyOnHand,
    qtyAllocated,
    qtyAvailable: Math.max(0, qtyOnHand - qtyAllocated),
    qtyOnOrder: row.qty_on_order,
    minQty: row.min_qty,
    maxQty: row.max_qty,
    uom: row.uom,
    updatedAt: row.updated_at,
  };
}

export function listStock({ itemId } = {}) {
  const db = getDb();
  const params = {};
  let sql = `SELECT s.*, i.sku, i.name AS item_name, i.uom,
      (
        SELECT COUNT(*)
          FROM asset_registry a
         WHERE a.item_id = s.item_id
           AND a.custodian_contact_id IS NOT NULL
           AND a.status IN ('InUse', 'InService')
           AND (
             COALESCE(a.location, '') = COALESCE(s.location, '')
             OR (SELECT COUNT(*) FROM inventory_stock item_stock WHERE item_stock.item_id = s.item_id) = 1
           )
      ) AS asset_allocated
    FROM inventory_stock s
    INNER JOIN inventory_items i ON i.id = s.item_id`;
  if (itemId) {
    sql += " WHERE s.item_id = @itemId";
    params.itemId = itemId;
  }
  sql += " ORDER BY i.name, s.location";
  return db.prepare(sql).all(params).map(mapStock);
}

export function updateStockPosition(stockId, updates, auditContext) {
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT s.*, i.sku, i.name AS item_name, i.uom
         FROM inventory_stock s
         INNER JOIN inventory_items i ON i.id = s.item_id
        WHERE s.id = ?`
    )
    .get(stockId);
  if (!existing) {
    return null;
  }

  const mapping = {
    location: "location",
    bin: "bin",
    minQty: "min_qty",
    maxQty: "max_qty",
  };
  const params = { id: stockId };
  const sets = [];
  for (const [key, column] of Object.entries(mapping)) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      sets.push(`${column} = @${column}`);
      params[column] = updates[key] ?? null;
    }
  }
  if (sets.length) {
    db.prepare(`UPDATE inventory_stock SET ${sets.join(", ")} WHERE id = @id`).run(params);
  }

  const updated = db
    .prepare(
      `SELECT s.*, i.sku, i.name AS item_name, i.uom
         FROM inventory_stock s
         INNER JOIN inventory_items i ON i.id = s.item_id
        WHERE s.id = ?`
    )
    .get(stockId);

  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "inventory_stock",
    entityId: String(stockId),
    action: "update",
    before: mapStock(existing),
    after: mapStock(updated),
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });

  return mapStock(updated);
}

export function listLowStock() {
  const db = getDb();
  return db.prepare("SELECT * FROM v_inventory_low_stock ORDER BY name, location").all();
}

export function upsertStock(data, auditContext, { skipAudit = false } = {}) {
  const db = getDb();
  const { itemId, location } = data;
  const bin = data.bin ?? null;
  const qtyDelta = Number(data.qtyDelta ?? 0);
  if (!itemId || !location) {
    throw new Error("itemId and location are required for stock adjustments");
  }
  if (!Number.isFinite(qtyDelta)) {
    throw new Error("qtyDelta must be numeric");
  }

  const run = db.transaction(() => {
    const item = db.prepare("SELECT id, sku, name, standard_cost FROM inventory_items WHERE id = ?").get(itemId);
    if (!item) {
      throw new Error("Inventory item not found");
    }
    const existing = db
      .prepare(
        `SELECT * FROM inventory_stock WHERE item_id = ? AND location = ? AND IFNULL(bin, '') = IFNULL(?, '')`
      )
      .get(itemId, location, bin);

    if (existing) {
      const newQty = (existing.qty_on_hand ?? 0) + qtyDelta;
      if (newQty < 0) {
        throw new Error("Stock removal cannot exceed quantity on hand");
      }
      db.prepare(
        `UPDATE inventory_stock
           SET qty_on_hand = @qty_on_hand,
               qty_allocated = @qty_allocated,
               qty_on_order = @qty_on_order,
               min_qty = @min_qty,
               max_qty = @max_qty
         WHERE id = @id`
      ).run({
        id: existing.id,
        qty_on_hand: newQty,
        qty_allocated: data.qtyAllocated ?? existing.qty_allocated,
        qty_on_order: data.qtyOnOrder ?? existing.qty_on_order,
        min_qty: data.minQty ?? existing.min_qty,
        max_qty: data.maxQty ?? existing.max_qty,
      });
    } else {
      if (qtyDelta < 0) {
        throw new Error("Cannot remove stock from a new location/bin");
      }
      db.prepare(
        `INSERT INTO inventory_stock (item_id, location, bin, qty_on_hand, qty_allocated, qty_on_order, min_qty, max_qty)
         VALUES (@item_id, @location, @bin, @qty_on_hand, @qty_allocated, @qty_on_order, @min_qty, @max_qty)`
      ).run({
        item_id: itemId,
        location,
        bin,
        qty_on_hand: qtyDelta,
        qty_allocated: data.qtyAllocated ?? 0,
        qty_on_order: data.qtyOnOrder ?? 0,
        min_qty: data.minQty ?? 0,
        max_qty: data.maxQty ?? null,
      });
    }

    const adjustmentResult = db.prepare(
      `INSERT INTO inventory_adjustments (item_id, location, bin, qty_delta, reason, created_by)
       VALUES (@item_id, @location, @bin, @qty_delta, @reason, @created_by)`
    ).run({
      item_id: itemId,
      location,
      bin,
      qty_delta: qtyDelta,
      reason: data.reason ?? null,
      created_by: auditContext?.userId ?? null,
    });

    const stockValue = Math.abs(qtyDelta) * Number(item.standard_cost || 0);
    if (stockValue > 0) {
      return createPostedInventoryJournal(db, {
        amount: stockValue,
        item,
        qtyDelta,
        adjustmentId: adjustmentResult.lastInsertRowid,
        location,
        bin,
        reason: data.reason ?? null,
        userId: auditContext?.userId ?? null,
      });
    }
    return { journalId: null, journalNumber: null };
  });

  const posting = run();

  if (!skipAudit) {
    const stockRow = db
      .prepare(
        `SELECT s.*, i.sku, i.name AS item_name, i.uom, 0 AS asset_allocated
           FROM inventory_stock s
           INNER JOIN inventory_items i ON i.id = s.item_id
          WHERE s.item_id = ? AND s.location = ? AND IFNULL(s.bin, '') = IFNULL(?, '')`
      )
      .get(itemId, location, bin);
    writeAuditLog({
      userId: auditContext?.userId ?? null,
      entity: "inventory_stock",
      entityId: `${itemId}:${location}:${bin ?? ''}`,
      action: "adjust",
      after: mapStock(stockRow),
      ipAddress: auditContext?.ip,
      userAgent: auditContext?.userAgent,
    });
  }
  return posting;
}

function mapAsset(row) {
  return {
    id: row.id,
    itemId: row.item_id,
    itemName: row.item_name,
    sku: row.sku,
    assetTag: row.asset_tag,
    serialNumber: row.serial_number,
    location: row.location,
    custodianContactId: row.custodian_contact_id,
    custodianName: row.custodian_name || null,
    status: row.status,
    acquiredAt: row.acquired_at,
    warrantyExpiresAt: row.warranty_expires_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function resolveAssetStockPosition(db, { itemId, location }) {
  const rows = db
    .prepare(
      `SELECT location, bin
         FROM inventory_stock
        WHERE item_id = ?
          AND (? IS NULL OR location = ?)
        ORDER BY location, bin`
    )
    .all(itemId, location || null, location || null);
  if (rows.length === 1) {
    return rows[0];
  }
  if (!rows.length) {
    throw new Error("No stock position found for this asset");
  }
  throw new Error("Asset disposal needs a specific stock location/bin");
}

function disposeAssetFromStock(db, asset, auditContext) {
  const stockPosition = resolveAssetStockPosition(db, {
    itemId: asset.item_id,
    location: asset.location,
  });
  return upsertStock({
    itemId: asset.item_id,
    location: stockPosition.location,
    bin: stockPosition.bin ?? null,
    qtyDelta: -1,
    reason: `Asset disposed${asset.asset_tag ? `: ${asset.asset_tag}` : ""}`,
  }, auditContext);
}

export function listAssets({ status } = {}) {
  const db = getDb();
  const params = {};
  let sql = `SELECT a.*, i.name AS item_name, i.sku,
    TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) AS custodian_name
    FROM asset_registry a
    INNER JOIN inventory_items i ON i.id = a.item_id
    LEFT JOIN contacts c ON c.id = a.custodian_contact_id`;
  if (status) {
    sql += " WHERE a.status = @status";
    params.status = status;
  }
  sql += " ORDER BY a.asset_tag";
  return db.prepare(sql).all(params).map(mapAsset);
}

export function createAsset(data, auditContext) {
  const db = getDb();
  const status = data.status ?? (data.custodianContactId ? "InUse" : "InStock");
  if (status === "Disposed") {
    disposeAssetFromStock(db, {
      item_id: data.itemId,
      location: data.location ?? null,
      asset_tag: data.assetTag ?? null,
    }, auditContext);
  }
  const insert = db.prepare(
    `INSERT INTO asset_registry (item_id, asset_tag, serial_number, location, custodian_contact_id, status, acquired_at, warranty_expires_at, notes)
     VALUES (@item_id, @asset_tag, @serial_number, @location, @custodian_contact_id, @status, @acquired_at, @warranty_expires_at, @notes)`
  );
  const result = insert.run({
    item_id: data.itemId,
    asset_tag: data.assetTag ?? null,
    serial_number: data.serialNumber ?? null,
    location: data.location ?? null,
    custodian_contact_id: data.custodianContactId ?? null,
    status,
    acquired_at: data.acquiredAt ?? null,
    warranty_expires_at: data.warrantyExpiresAt ?? null,
    notes: data.notes ?? null,
  });
  const asset = db
    .prepare(
      `SELECT a.*, i.name AS item_name, i.sku,
              TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) AS custodian_name
         FROM asset_registry a
         INNER JOIN inventory_items i ON i.id = a.item_id
         LEFT JOIN contacts c ON c.id = a.custodian_contact_id
        WHERE a.id = ?`
    )
    .get(result.lastInsertRowid);

  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "asset_registry",
    entityId: String(asset.id),
    action: "create",
    after: mapAsset(asset),
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });

  return mapAsset(asset);
}

export function updateAsset(assetId, updates, auditContext) {
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT a.*, i.name AS item_name, i.sku,
              TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) AS custodian_name
         FROM asset_registry a
         INNER JOIN inventory_items i ON i.id = a.item_id
         LEFT JOIN contacts c ON c.id = a.custodian_contact_id
        WHERE a.id = ?`
    )
    .get(assetId);
  if (!existing) {
    return null;
  }

  const mapping = {
    itemId: "item_id",
    assetTag: "asset_tag",
    serialNumber: "serial_number",
    location: "location",
    custodianContactId: "custodian_contact_id",
    status: "status",
    acquiredAt: "acquired_at",
    warrantyExpiresAt: "warranty_expires_at",
    notes: "notes",
  };
  const params = { id: assetId };
  const sets = [];
  const normalizedUpdates = { ...updates };
  if (
    Object.prototype.hasOwnProperty.call(normalizedUpdates, "custodianContactId")
    && !Object.prototype.hasOwnProperty.call(normalizedUpdates, "status")
  ) {
    normalizedUpdates.status = normalizedUpdates.custodianContactId ? "InUse" : "InStock";
  }
  const nextStatus = Object.prototype.hasOwnProperty.call(normalizedUpdates, "status")
    ? normalizedUpdates.status
    : existing.status;
  const shouldDispose = nextStatus === "Disposed" && existing.status !== "Disposed";
  if (shouldDispose) {
    disposeAssetFromStock(db, {
      ...existing,
      item_id: normalizedUpdates.itemId ?? existing.item_id,
      location: Object.prototype.hasOwnProperty.call(normalizedUpdates, "location")
        ? normalizedUpdates.location
        : existing.location,
    }, auditContext);
    if (!Object.prototype.hasOwnProperty.call(normalizedUpdates, "custodianContactId")) {
      normalizedUpdates.custodianContactId = null;
    }
  }
  for (const [key, column] of Object.entries(mapping)) {
    if (Object.prototype.hasOwnProperty.call(normalizedUpdates, key)) {
      sets.push(`${column} = @${column}`);
      params[column] = normalizedUpdates[key] ?? null;
    }
  }
  if (sets.length) {
    db.prepare(`UPDATE asset_registry SET ${sets.join(", ")} WHERE id = @id`).run(params);
  }

  const updated = db
    .prepare(
      `SELECT a.*, i.name AS item_name, i.sku,
              TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) AS custodian_name
         FROM asset_registry a
         INNER JOIN inventory_items i ON i.id = a.item_id
         LEFT JOIN contacts c ON c.id = a.custodian_contact_id
        WHERE a.id = ?`
    )
    .get(assetId);

  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "asset_registry",
    entityId: String(assetId),
    action: "update",
    before: mapAsset(existing),
    after: mapAsset(updated),
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });

  return mapAsset(updated);
}

export function addMaintenanceLog(assetId, data, auditContext) {
  const db = getDb();
  const asset = db.prepare("SELECT id FROM asset_registry WHERE id = ?").get(assetId);
  if (!asset) {
    return null;
  }
  const insert = db.prepare(
    `INSERT INTO asset_maintenance_logs (asset_id, performed_at, performed_by, notes, cost)
     VALUES (@asset_id, @performed_at, @performed_by, @notes, @cost)`
  );
  const result = insert.run({
    asset_id: assetId,
    performed_at: data.performedAt ?? new Date().toISOString(),
    performed_by: data.performedBy ?? null,
    notes: data.notes ?? null,
    cost: data.cost ?? 0,
  });
  const log = db
    .prepare("SELECT * FROM asset_maintenance_logs WHERE id = ?")
    .get(result.lastInsertRowid);
  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "asset_maintenance_logs",
    entityId: String(log.id),
    action: "create",
    after: log,
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });
  return log;
}

export function listMaintenanceLogs(assetId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM asset_maintenance_logs WHERE asset_id = ? ORDER BY performed_at DESC`
    )
    .all(assetId);
}
