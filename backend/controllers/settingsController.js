import Joi from "joi";
import {
  getPublicProfile,
  updateOrganizationProfile,
  listManagedUsers,
  createManagedUser,
  updateManagedUser,
  deleteManagedUser,
  updateManagedUserAccess,
  unlockUser,
  listAccessProfiles,
  saveAccessProfiles,
  ACCESS_CATALOG,
} from "../services/settingsService.js";
import {
  getAuthSecuritySettings,
  updateAuthSecuritySettings,
} from "../services/authSecurityService.js";
import {
  getFinanceControls,
  updateFinanceControls,
} from "../services/financeControlsService.js";

export const organizationProfileSchema = Joi.object({
  companyName: Joi.string().trim().allow("").max(120),
  companyLogo: Joi.string().allow("").max(1500000),
});

export const authSecuritySettingsSchema = Joi.object({
  accessTimeoutMinutes: Joi.number().integer().min(5).max(720).required(),
  failedLoginLimit: Joi.number().integer().min(3).max(20).required(),
  lockoutMinutes: Joi.number().integer().min(5).max(1440).required(),
});

export const financeControlsSchema = Joi.object({
  manualJournalApproval: Joi.boolean().required(),
  manualJournalApprover: Joi.string().trim().allow("").max(120),
  bankDepositApproval: Joi.boolean().required(),
  bankDepositApprover: Joi.string().trim().allow("").max(120),
  billApproval: Joi.boolean().required(),
  billApprover: Joi.string().trim().allow("").max(120),
  paymentApproval: Joi.boolean().required(),
  paymentApprover: Joi.string().trim().allow("").max(120),
});

export const createManagedUserSchema = Joi.object({
  email: Joi.string().email().required(),
  displayName: Joi.string().trim().min(2).max(120).required(),
  password: Joi.string()
    .min(10)
    .regex(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/)
    .message("Password must contain upper, lower, number, and symbol")
    .required(),
  accessType: Joi.string().valid("admin", "associate").required(),
  accessPreset: Joi.string().valid("associate_1", "associate_2").optional(),
  accessProfileId: Joi.string().trim().max(120).optional(),
});

export const updateManagedUserSchema = Joi.object({
  displayName: Joi.string().trim().min(2).max(120),
  isActive: Joi.boolean(),
  password: Joi.string()
    .allow("")
    .min(10)
    .regex(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/)
    .message("Password must contain upper, lower, number, and symbol"),
  accessType: Joi.string().valid("admin", "associate"),
}).min(1);

export const updateManagedUserAccessSchema = Joi.object({
  preset: Joi.string().valid("associate_1", "associate_2"),
  profileId: Joi.string().trim().max(120),
  access: Joi.object({
    sections: Joi.object().pattern(
      Joi.string(),
      Joi.object({
        enabled: Joi.boolean(),
        features: Joi.array().items(Joi.string()).default([]),
      })
    ),
  }),
}).or("preset", "profileId", "access");

export const accessProfilesSchema = Joi.object({
  profiles: Joi.array()
    .items(
      Joi.object({
        id: Joi.string().trim().max(120),
        name: Joi.string().trim().min(1).max(80).required(),
        builtIn: Joi.boolean(),
        access: Joi.object({
          sections: Joi.object().pattern(
            Joi.string(),
            Joi.object({
              enabled: Joi.boolean(),
              features: Joi.array().items(Joi.string()).default([]),
            })
          ),
        }).required(),
      })
    )
    .required(),
});

export function handlePublicProfile(_req, res, next) {
  try {
    res.json({ data: getPublicProfile() });
  } catch (error) {
    next(error);
  }
}

export function handleUpdateOrganizationProfile(req, res, next) {
  try {
    const data = updateOrganizationProfile(req.body, {
      userId: req.user?.id ?? null,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export function handleListManagedUsers(_req, res, next) {
  try {
    res.json({ data: listManagedUsers() });
  } catch (error) {
    next(error);
  }
}

export function handleAuthSecuritySettings(_req, res, next) {
  try {
    res.json({ data: getAuthSecuritySettings() });
  } catch (error) {
    next(error);
  }
}

export function handleUpdateAuthSecuritySettings(req, res, next) {
  try {
    const data = updateAuthSecuritySettings(req.body, {
      userId: req.user?.id ?? null,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export function handleFinanceControls(_req, res, next) {
  try {
    res.json({ data: getFinanceControls() });
  } catch (error) {
    next(error);
  }
}

export function handleUpdateFinanceControls(req, res, next) {
  try {
    const data = updateFinanceControls(req.body, {
      userId: req.user?.id ?? null,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export async function handleCreateManagedUser(req, res, next) {
  try {
    const data = await createManagedUser(req.body, {
      userId: req.user?.id ?? null,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
}

export async function handleUpdateManagedUser(req, res, next) {
  try {
    const data = await updateManagedUser(Number(req.params.id), req.body, {
      userId: req.user?.id ?? null,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export function handleAccessCatalog(_req, res, next) {
  try {
    res.json({ data: ACCESS_CATALOG });
  } catch (error) {
    next(error);
  }
}

export function handleListAccessProfiles(_req, res, next) {
  try {
    res.json({ data: listAccessProfiles() });
  } catch (error) {
    next(error);
  }
}

export function handleSaveAccessProfiles(req, res, next) {
  try {
    const data = saveAccessProfiles(req.body, {
      userId: req.user?.id ?? null,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export function handleUpdateManagedUserAccess(req, res, next) {
  try {
    const data = updateManagedUserAccess(Number(req.params.id), req.body, {
      userId: req.user?.id ?? null,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export function handleUnlockManagedUser(req, res, next) {
  try {
    const data = unlockUser(Number(req.params.id), {
      userId: req.user?.id ?? null,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export function handleDeleteManagedUser(req, res, next) {
  try {
    deleteManagedUser(Number(req.params.id), {
      userId: req.user?.id ?? null,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
