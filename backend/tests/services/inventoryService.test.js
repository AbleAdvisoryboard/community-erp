import { afterAll, describe, expect, it } from "vitest";
import { useTestDatabase } from "../utils/db.js";
import { getDb } from "../../db/connection.js";
import { getBalanceSheetClassified, getNonprofitStatement } from "../../services/financeService.js";
import {
  createCategory,
  createAsset,
  createItem,
  createItemType,
  listAssets,
  listItems,
  listItemTypes,
  listLowStock,
  listStock,
  updateAsset,
  updateItem,
  updateStockPosition,
  upsertStock,
} from "../../services/inventoryService.js";

describe("inventory service", () => {
  const { cleanup } = useTestDatabase({ seed: false });

  afterAll(() => {
    cleanup();
  });

  it("preserves reorder levels when stock is adjusted", () => {
    const item = createItem({
      sku: "INV-TEST-001",
      name: "Inventory Test Item",
      type: "Consumable",
      uom: "each",
      standardCost: 10,
      initialStock: [
        {
          location: "Main Warehouse",
          qtyOnHand: 8,
          minQty: 10,
          maxQty: 50,
        },
      ],
    });

    expect(listLowStock()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          item_id: item.id,
          min_qty: 10,
          qty_needed: 2,
        }),
      ])
    );

    const posting = upsertStock({
      itemId: item.id,
      location: "Main Warehouse",
      qtyDelta: 5,
      reason: "Cycle count",
    });
    expect(posting.journalId).toBeTruthy();

    const stock = listStock({ itemId: item.id })[0];
    expect(stock).toMatchObject({
      qtyOnHand: 13,
      qtyAvailable: 13,
      minQty: 10,
      maxQty: 50,
    });
    expect(listLowStock()).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ item_id: item.id })])
    );

    const adjustmentCount = getDb()
      .prepare("SELECT COUNT(*) AS count FROM inventory_adjustments WHERE item_id = ?")
      .get(item.id).count;
    expect(adjustmentCount).toBe(2);

    const sourceLines = getDb()
      .prepare("SELECT COUNT(*) AS count FROM journal_lines WHERE source_table = 'inventory_adjustments'")
      .get().count;
    expect(sourceLines).toBe(4);

    const today = new Date().toISOString().slice(0, 10);
    const balanceSheet = getBalanceSheetClassified({ asOf: today });
    expect(balanceSheet.currentAssets.inventories).toBe(130);

    const statement = getNonprofitStatement({ asOf: today });
    expect(statement.revenuesOfSupport.inventoryRevenue).toBe(0);
    expect(statement.expenses.totalExpenses).toBe(0);
  });

  it("posts stock removals as expense and prevents removing more than on hand", () => {
    const item = createItem({
      sku: "INV-REMOVE-001",
      name: "Removal Test Item",
      type: "Consumable",
      uom: "each",
      standardCost: 5,
      initialStock: [
        {
          location: "Main Warehouse",
          qtyOnHand: 10,
          minQty: 0,
        },
      ],
    });

    upsertStock({
      itemId: item.id,
      location: "Main Warehouse",
      qtyDelta: -3,
      reason: "Program use",
    });

    expect(listStock({ itemId: item.id })[0].qtyOnHand).toBe(7);

    const today = new Date().toISOString().slice(0, 10);
    const statement = getNonprofitStatement({ asOf: today });
    expect(statement.revenuesOfSupport.inventoryRevenue).toBe(0);
    expect(statement.expenses.totalExpenses).toBe(15);

    expect(() => upsertStock({
      itemId: item.id,
      location: "Main Warehouse",
      qtyDelta: -8,
      reason: "Too much",
    })).toThrow("Stock removal cannot exceed quantity on hand");
  });

  it("finds items by category name when searching inventory", () => {
    const categoryId = getDb()
      .prepare("INSERT INTO item_categories (name, description) VALUES (?, ?)")
      .run("Program Supplies", "Items used by program teams").lastInsertRowid;

    const item = createItem({
      sku: "INV-CAT-001",
      name: "Workshop Markers",
      type: "Consumable",
      categoryId,
      uom: "box",
      standardCost: 4,
    });

    expect(listItems({ search: "Program Supplies" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: item.id,
          categoryName: "Program Supplies",
        }),
      ])
    );
  });

  it("supports user-created inventory categories and item types", () => {
    const category = createCategory({ name: "Clinic Supplies" });
    const type = createItemType({ name: "Medical Supply" });

    const item = createItem({
      sku: "INV-TYPE-001",
      name: "First Aid Kit",
      type: type.name,
      categoryId: category.id,
      uom: "kit",
      standardCost: 25,
    });

    expect(listItemTypes()).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Medical Supply" })])
    );
    expect(listItems({ type: "Medical Supply" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: item.id,
          type: "Medical Supply",
          categoryName: "Clinic Supplies",
        }),
      ])
    );
    expect(listItems({ search: "Medical Supply" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: item.id,
          type: "Medical Supply",
        }),
      ])
    );
  });

  it("updates item identity fields and stock position setup fields", () => {
    const category = createCategory({ name: "Pantry Supplies" });
    const item = createItem({
      sku: "INV-EDIT-001",
      name: "Shelf Stable Meals",
      type: "Consumable",
      categoryId: category.id,
      uom: "case",
      initialStock: [
        {
          location: "Old Room",
          bin: "B1",
          qtyOnHand: 3,
          minQty: 2,
        },
      ],
    });

    const updatedItem = updateItem(item.id, {
      sku: "INV-EDIT-002",
      name: "Emergency Meals",
      type: "Food",
      categoryId: category.id,
      uom: "box",
    });
    expect(updatedItem).toMatchObject({
      sku: "INV-EDIT-002",
      name: "Emergency Meals",
      type: "Food",
      uom: "box",
    });

    const stock = listStock({ itemId: item.id })[0];
    const updatedStock = updateStockPosition(stock.id, {
      location: "Pantry",
      bin: "P2",
      minQty: 5,
      maxQty: 20,
    });
    expect(updatedStock).toMatchObject({
      location: "Pantry",
      bin: "P2",
      minQty: 5,
      maxQty: 20,
    });
    expect(listLowStock()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          item_id: item.id,
          location: "Pantry",
          bin: "P2",
          qty_needed: 2,
        }),
      ])
    );
  });

  it("tracks asset custodians and supports unassigning assets", () => {
    const contactId = getDb()
      .prepare("INSERT INTO contacts (first_name, last_name, email) VALUES (?, ?, ?)")
      .run("Jordan", "Lee", "jordan.lee@example.org").lastInsertRowid;
    const item = createItem({
      sku: "INV-ASSET-001",
      name: "Program Laptop",
      type: "Equipment",
      uom: "each",
      standardCost: 100,
      initialStock: [
        {
          location: "Tech Closet",
          qtyOnHand: 10,
          minQty: 0,
        },
      ],
    });
    const asset = createAsset({
      itemId: item.id,
      assetTag: "LAP-001",
      location: "Tech Closet",
      custodianContactId: contactId,
      status: "InUse",
    });
    createAsset({
      itemId: item.id,
      assetTag: "LAP-002",
      location: "Tech Closet",
      custodianContactId: contactId,
      status: "InUse",
    });

    expect(asset).toMatchObject({
      assetTag: "LAP-001",
      custodianContactId: contactId,
      custodianName: "Jordan Lee",
      status: "InUse",
    });
    expect(listStock({ itemId: item.id })[0]).toMatchObject({
      qtyOnHand: 10,
      qtyAllocated: 2,
      qtyAvailable: 8,
    });

    const unassigned = updateAsset(asset.id, { custodianContactId: null, status: "InStock" });
    expect(unassigned).toMatchObject({
      custodianContactId: null,
      custodianName: null,
      status: "InStock",
    });
    expect(listStock({ itemId: item.id })[0]).toMatchObject({
      qtyOnHand: 10,
      qtyAllocated: 1,
      qtyAvailable: 9,
    });
    const today = new Date().toISOString().slice(0, 10);
    const balanceBeforeDisposal = getBalanceSheetClassified({ asOf: today });
    const statementBeforeDisposal = getNonprofitStatement({ asOf: today });
    const disposed = updateAsset(asset.id, { custodianContactId: null, status: "Disposed" });
    expect(disposed).toMatchObject({
      custodianContactId: null,
      status: "Disposed",
    });
    expect(listStock({ itemId: item.id })[0]).toMatchObject({
      qtyOnHand: 9,
      qtyAllocated: 1,
      qtyAvailable: 8,
    });
    const balanceAfterDisposal = getBalanceSheetClassified({ asOf: today });
    const statementAfterDisposal = getNonprofitStatement({ asOf: today });
    expect(balanceAfterDisposal.currentAssets.inventories).toBe(balanceBeforeDisposal.currentAssets.inventories - 100);
    expect(statementAfterDisposal.expenses.totalExpenses).toBe(statementBeforeDisposal.expenses.totalExpenses + 100);
    expect(listAssets()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: asset.id,
          custodianContactId: null,
          custodianName: null,
          status: "Disposed",
        }),
      ])
    );
  });
});
