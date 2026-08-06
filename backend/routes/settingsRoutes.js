import { Router } from "express";
import { authenticate, optionalAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { csrfProtection } from "../middleware/csrf.js";
import { validateBody } from "../middleware/validate.js";
import {
  organizationProfileSchema,
  authSecuritySettingsSchema,
  financeControlsSchema,
  accessProfilesSchema,
  createManagedUserSchema,
  updateManagedUserSchema,
  updateManagedUserAccessSchema,
  handlePublicProfile,
  handleUpdateOrganizationProfile,
  handleListManagedUsers,
  handleCreateManagedUser,
  handleUpdateManagedUser,
  handleDeleteManagedUser,
  handleAccessCatalog,
  handleListAccessProfiles,
  handleSaveAccessProfiles,
  handleUpdateManagedUserAccess,
  handleAuthSecuritySettings,
  handleUpdateAuthSecuritySettings,
  handleFinanceControls,
  handleUpdateFinanceControls,
  handleUnlockManagedUser,
} from "../controllers/settingsController.js";

const router = Router();

router.get("/public", optionalAuth, handlePublicProfile);

router.use(authenticate);

router.put(
  "/organization",
  requirePermission("admin.manage_settings"),
  csrfProtection,
  validateBody(organizationProfileSchema),
  handleUpdateOrganizationProfile
);

router.get("/users", requirePermission("auth.manage_users"), handleListManagedUsers);
router.get("/auth-security", requirePermission("auth.manage_users"), handleAuthSecuritySettings);
router.put(
  "/auth-security",
  requirePermission("auth.manage_users"),
  csrfProtection,
  validateBody(authSecuritySettingsSchema),
  handleUpdateAuthSecuritySettings
);
router.get("/finance-controls", requirePermission("admin.manage_settings"), handleFinanceControls);
router.put(
  "/finance-controls",
  requirePermission("admin.manage_settings"),
  csrfProtection,
  validateBody(financeControlsSchema),
  handleUpdateFinanceControls
);
router.get("/access-catalog", requirePermission("auth.manage_users"), handleAccessCatalog);
router.get("/access-profiles", requirePermission("auth.manage_users"), handleListAccessProfiles);
router.put(
  "/access-profiles",
  requirePermission("auth.manage_users"),
  csrfProtection,
  validateBody(accessProfilesSchema),
  handleSaveAccessProfiles
);

router.post(
  "/users",
  requirePermission("auth.manage_users"),
  csrfProtection,
  validateBody(createManagedUserSchema),
  handleCreateManagedUser
);

router.patch(
  "/users/:id",
  requirePermission("auth.manage_users"),
  csrfProtection,
  validateBody(updateManagedUserSchema),
  handleUpdateManagedUser
);

router.put(
  "/users/:id/access",
  requirePermission("auth.manage_users"),
  csrfProtection,
  validateBody(updateManagedUserAccessSchema),
  handleUpdateManagedUserAccess
);

router.post(
  "/users/:id/unlock",
  requirePermission("auth.manage_users"),
  csrfProtection,
  handleUnlockManagedUser
);

router.delete(
  "/users/:id",
  requirePermission("auth.manage_users"),
  csrfProtection,
  handleDeleteManagedUser
);

export default router;
