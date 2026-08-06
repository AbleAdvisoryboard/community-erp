import {
  listItems,
  createItem,
  updateItem,
  listStock,
  listLowStock,
  upsertStock,
  updateStockPosition,
  listAssets,
  createAsset,
  updateAsset,
  addMaintenanceLog,
  listMaintenanceLogs,
  listCategories,
  createCategory,
  deleteCategory,
  listItemTypes,
  createItemType,
  deleteItemType,
} from "../services/inventoryService.js";


export function getCategories(_req, res, next) {
  try {
    const categories = listCategories();
    res.json({ data: categories });
  } catch (error) {
    next(error);
  }
}

export function postCategory(req, res, next) {
  try {
    const category = createCategory(req.body);
    res.status(201).json({ data: category });
  } catch (error) {
    if (error.message?.includes("UNIQUE")) {
      return res.status(409).json({ message: "Category name must be unique" });
    }
    next(error);
  }
}

export function deleteCategoryController(req, res, next) {
  try {
    const category = deleteCategory(Number(req.params.id));
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    res.json({ data: category });
  } catch (error) {
    next(error);
  }
}

export function getItemTypes(_req, res, next) {
  try {
    const types = listItemTypes();
    res.json({ data: types });
  } catch (error) {
    next(error);
  }
}

export function postItemType(req, res, next) {
  try {
    const type = createItemType(req.body);
    res.status(201).json({ data: type });
  } catch (error) {
    if (error.message?.includes("UNIQUE")) {
      return res.status(409).json({ message: "Type name must be unique" });
    }
    next(error);
  }
}

export function deleteItemTypeController(req, res, next) {
  try {
    const type = deleteItemType(String(req.params.name || ""));
    if (!type) {
      return res.status(404).json({ message: "Type not found" });
    }
    res.json({ data: type });
  } catch (error) {
    next(error);
  }
}

export function getItems(req, res, next) {
  try {
    const { search, type, includeInactive } = req.query;
    const items = listItems({
      search,
      type,
      includeInactive: includeInactive === "true",
    });
    res.json({ data: items });
  } catch (error) {
    next(error);
  }
}

export function postItem(req, res, next) {
  try {
    const item = createItem(req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json({ data: item });
  } catch (error) {
    if (error.message?.includes("UNIQUE")) {
      return res.status(409).json({ message: "SKU must be unique" });
    }
    next(error);
  }
}

export function patchItem(req, res, next) {
  try {
    const itemId = Number(req.params.id);
    const updated = updateItem(itemId, req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    if (!updated) {
      return res.status(404).json({ message: "Item not found" });
    }
    res.json({ data: updated });
  } catch (error) {
    if (error.message?.includes("UNIQUE")) {
      return res.status(409).json({ message: "SKU must be unique" });
    }
    next(error);
  }
}

export function getStock(req, res, next) {
  try {
    const { itemId } = req.query;
    const stock = listStock({ itemId: itemId ? Number(itemId) : undefined });
    res.json({ data: stock });
  } catch (error) {
    next(error);
  }
}

export function postStockAdjust(req, res, _next) {
  try {
    const result = upsertStock(req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json({ data: result });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

export function patchStock(req, res, next) {
  try {
    const stockId = Number(req.params.id);
    const updated = updateStockPosition(stockId, req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    if (!updated) {
      return res.status(404).json({ message: "Stock position not found" });
    }
    res.json({ data: updated });
  } catch (error) {
    if (error.message?.includes("UNIQUE")) {
      return res.status(409).json({ message: "That item already has stock at this location and bin" });
    }
    next(error);
  }
}

export function getLowStock(_req, res, next) {
  try {
    const results = listLowStock();
    res.json({ data: results });
  } catch (error) {
    next(error);
  }
}

export function getAssets(req, res, next) {
  try {
    const assets = listAssets({ status: req.query.status });
    const response = assets.map((asset) => ({
      ...asset,
      maintenanceLogs: listMaintenanceLogs(asset.id),
    }));
    res.json({ data: response });
  } catch (error) {
    next(error);
  }
}

export function postAsset(req, res, next) {
  try {
    const asset = createAsset(req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json({ data: asset });
  } catch (error) {
    if (error.message?.includes("UNIQUE")) {
      return res.status(409).json({ message: "Asset tag must be unique" });
    }
    next(error);
  }
}

export function patchAsset(req, res, next) {
  try {
    const assetId = Number(req.params.id);
    const asset = updateAsset(assetId, req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    if (!asset) {
      return res.status(404).json({ message: "Asset not found" });
    }
    res.json({ data: asset });
  } catch (error) {
    if (error.message?.includes("UNIQUE")) {
      return res.status(409).json({ message: "Asset tag must be unique" });
    }
    next(error);
  }
}

export function postAssetMaintenance(req, res, next) {
  try {
    const assetId = Number(req.params.id);
    const log = addMaintenanceLog(assetId, req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    if (!log) {
      return res.status(404).json({ message: "Asset not found" });
    }
    res.status(201).json({ data: log });
  } catch (error) {
    next(error);
  }
}
