import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { csrfProtection } from "../middleware/csrf.js";
import { validateBody } from "../middleware/validate.js";
import {
  getVolunteers,
  postVolunteer,
  patchVolunteer,
  getShifts,
  postShift,
  postVolunteerHours,
  getVolunteerHoursSummary,
  volunteerSchema,
  volunteerUpdateSchema,
  shiftSchema,
  hoursSchema,
  getVolunteerVocab,
  postVolunteerVocab,
  deleteVolunteerVocabHandler,
} from "../controllers/volunteerController.js";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  requirePermission("volunteers.read"),
  getVolunteers
);

router.post(
  "/",
  requirePermission("volunteers.write"),
  csrfProtection,
  validateBody(volunteerSchema),
  postVolunteer
);

router.patch(
  "/:id",
  requirePermission("volunteers.write"),
  csrfProtection,
  validateBody(volunteerUpdateSchema),
  patchVolunteer
);

router.get(
  "/shifts",
  requirePermission("volunteers.read"),
  getShifts
);

router.post(
  "/shifts",
  requirePermission("volunteers.write"),
  csrfProtection,
  validateBody(shiftSchema),
  postShift
);

router.get(
  "/hours/summary",
  requirePermission("volunteers.read"),
  getVolunteerHoursSummary
);

router.post(
  "/hours",
  requirePermission("volunteers.write"),
  csrfProtection,
  validateBody(hoursSchema),
  postVolunteerHours
);


// Vocabulary endpoints
router.get(
  "/vocab",
  requirePermission("volunteers.read"),
  getVolunteerVocab
);

router.post(
  "/vocab",
  requirePermission("volunteers.write"),
  csrfProtection,
  postVolunteerVocab
);

router.delete(
  "/vocab",
  requirePermission("volunteers.write"),
  csrfProtection,
  deleteVolunteerVocabHandler
);
export default router;


