import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { csrfProtection } from "../middleware/csrf.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import {
  eventQuerySchema,
  eventCreateBodySchema,
  eventUpdateBodySchema,
  eventTicketSchema,
  eventRegistrationSchema,
  eventSponsorSchema,
  getEvents,
  getEvent,
  postEvent,
  patchEvent,
  getTickets,
  postTicket,
  getRegistrations,
  postRegistration,
  postRegistrationCheckIn,
  getSponsors,
  postSponsor,
} from "../controllers/eventController.js";

const router = Router();

router.use(authenticate);

router.get(
  "/",
  requirePermission("events.read"),
  validateQuery(eventQuerySchema),
  getEvents
);

router.post(
  "/",
  requirePermission("events.write"),
  csrfProtection,
  validateBody(eventCreateBodySchema),
  postEvent
);

router.get(
  "/:id",
  requirePermission("events.read"),
  getEvent
);

router.patch(
  "/:id",
  requirePermission("events.write"),
  csrfProtection,
  validateBody(eventUpdateBodySchema),
  patchEvent
);

router.get(
  "/:id/tickets",
  requirePermission("events.read"),
  getTickets
);

router.post(
  "/:id/tickets",
  requirePermission("events.write"),
  csrfProtection,
  validateBody(eventTicketSchema),
  postTicket
);

router.get(
  "/:id/registrations",
  requirePermission("events.read"),
  getRegistrations
);

router.post(
  "/:id/registrations",
  requirePermission("events.write"),
  csrfProtection,
  validateBody(eventRegistrationSchema),
  postRegistration
);

router.post(
  "/registrations/:registrationId/check-in",
  requirePermission("events.write"),
  csrfProtection,
  postRegistrationCheckIn
);

router.get(
  "/:id/sponsors",
  requirePermission("events.read"),
  getSponsors
);

router.post(
  "/:id/sponsors",
  requirePermission("events.write"),
  csrfProtection,
  validateBody(eventSponsorSchema),
  postSponsor
);

export default router;
