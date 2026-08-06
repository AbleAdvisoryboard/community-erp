import { Router } from "express";
import Joi from "joi";
import {
  getCategories,
  postCategory,
  deleteCategoryController,
  getItemTypes,
  postItemType,
  deleteItemTypeController,
  getItems,
  postItem,
  patchItem,
  getStock,
  postStockAdjust,
  patchStock,
  getLowStock,
  getAssets,
  postAsset,
  patchAsset,
  postAssetMaintenance,
} from "../controllers/inventoryController.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { csrfProtection } from "../middleware/csrf.js";
import { validateBody } from "../middleware/validate.js";

const router = Router();

const categorySchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  description: Joi.string().allow("", null),
});

const itemTypeSchema = Joi.object({
  name: Joi.string().trim().min(2).max(50).required(),
});

const itemSchema = Joi.object({
  sku: Joi.string().max(50).required(),
  name: Joi.string().min(2).required(),
  type: Joi.string().trim().min(2).max(50).required(),
  categoryId: Joi.number().integer().positive().allow(null),
  uom: Joi.string().max(20).optional(),
  costMethod: Joi.string().valid("Standard", "FIFO", "LIFO").optional(),
  standardCost: Joi.number().min(0).optional(),
  isActive: Joi.boolean().optional(),
  notes: Joi.string().allow("", null),
  initialStock: Joi.array()
    .items(
      Joi.object({
        location: Joi.string().required(),
        bin: Joi.string().allow("", null),
        qtyOnHand: Joi.number().optional(),
        minQty: Joi.number().min(0).optional(),
        maxQty: Joi.number().min(0).allow(null).optional(),
      })
    )
    .optional(),
});

const itemUpdateSchema = itemSchema.fork(["sku", "name", "type"], (schema) => schema.optional());

const stockAdjustSchema = Joi.object({
  itemId: Joi.number().integer().positive().required(),
  location: Joi.string().required(),
  bin: Joi.string().allow("", null),
  qtyDelta: Joi.number().required(),
  qtyAllocated: Joi.number().optional(),
  qtyOnOrder: Joi.number().optional(),
  minQty: Joi.number().min(0).optional(),
  maxQty: Joi.number().min(0).allow(null).optional(),
  reason: Joi.string().allow("", null),
});

const stockUpdateSchema = Joi.object({
  location: Joi.string().trim().required(),
  bin: Joi.string().allow("", null),
  minQty: Joi.number().min(0).required(),
  maxQty: Joi.number().min(0).allow(null).optional(),
});

const assetSchema = Joi.object({
  itemId: Joi.number().integer().positive().required(),
  assetTag: Joi.string().allow("", null),
  serialNumber: Joi.string().allow("", null),
  location: Joi.string().allow("", null),
  custodianContactId: Joi.number().integer().positive().allow(null),
  status: Joi.string().valid("InUse", "InStock", "InRepair", "Disposed", "Reserved", "InService").optional(),
  acquiredAt: Joi.string().isoDate().allow(null),
  warrantyExpiresAt: Joi.string().isoDate().allow(null),
  notes: Joi.string().allow("", null),
});

const assetUpdateSchema = assetSchema.fork(["itemId"], (schema) => schema.optional());

const maintenanceSchema = Joi.object({
  performedAt: Joi.string().isoDate().optional(),
  performedBy: Joi.string().allow("", null),
  notes: Joi.string().allow("", null),
  cost: Joi.number().min(0).optional(),
});

router.use(authenticate);

router.get(
  "/categories",
  requirePermission("inventory.read"),
  getCategories
);

router.post(
  "/categories",
  requirePermission("inventory.write"),
  csrfProtection,
  validateBody(categorySchema),
  postCategory
);

router.delete(
  "/categories/:id",
  requirePermission("inventory.write"),
  csrfProtection,
  deleteCategoryController
);

router.get(
  "/types",
  requirePermission("inventory.read"),
  getItemTypes
);

router.post(
  "/types",
  requirePermission("inventory.write"),
  csrfProtection,
  validateBody(itemTypeSchema),
  postItemType
);

router.delete(
  "/types/:name",
  requirePermission("inventory.write"),
  csrfProtection,
  deleteItemTypeController
);

router.get(
  "/items",
  requirePermission("inventory.read"),
  getItems
);

router.post(
  "/items",
  requirePermission("inventory.write"),
  csrfProtection,
  validateBody(itemSchema),
  postItem
);

router.patch(
  "/items/:id",
  requirePermission("inventory.write"),
  csrfProtection,
  validateBody(itemUpdateSchema),
  patchItem
);

router.get(
  "/stock",
  requirePermission("inventory.read"),
  getStock
);

router.post(
  "/stock/adjust",
  requirePermission("inventory.write"),
  csrfProtection,
  validateBody(stockAdjustSchema),
  postStockAdjust
);

router.patch(
  "/stock/:id",
  requirePermission("inventory.write"),
  csrfProtection,
  validateBody(stockUpdateSchema),
  patchStock
);

router.get(
  "/stock/low",
  requirePermission("inventory.read"),
  getLowStock
);

router.get(
  "/assets",
  requirePermission("inventory.read"),
  getAssets
);

router.post(
  "/assets",
  requirePermission("inventory.write"),
  csrfProtection,
  validateBody(assetSchema),
  postAsset
);

router.patch(
  "/assets/:id",
  requirePermission("inventory.write"),
  csrfProtection,
  validateBody(assetUpdateSchema),
  patchAsset
);

router.post(
  "/assets/:id/maintenance",
  requirePermission("inventory.write"),
  csrfProtection,
  validateBody(maintenanceSchema),
  postAssetMaintenance
);

export default router;
