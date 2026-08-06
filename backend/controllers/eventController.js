import Joi from "joi";
import {
  listEvents,
  getEventById,
  createEvent,
  updateEvent,
  listEventTickets,
  createEventTicket,
  listEventRegistrations,
  createEventRegistration,
  checkInRegistration,
  listEventSponsors,
  createEventSponsor,
} from "../services/eventService.js";

export const eventQuerySchema = Joi.object({
  status: Joi.string().valid("Draft", "Published", "Completed", "Cancelled", "Archived").optional(),
  upcoming: Joi.string().valid("true", "false").optional(),
});

const venueSchema = Joi.object({
  name: Joi.string().allow(null, ""),
  address: Joi.string().allow(null, ""),
  city: Joi.string().allow(null, ""),
  state: Joi.string().allow(null, ""),
  postalCode: Joi.string().allow(null, ""),
  country: Joi.string().length(2).uppercase().allow(null),
});

const sessionSchema = Joi.object({
  title: Joi.string().min(3).required(),
  description: Joi.string().allow(null, ""),
  startAt: Joi.string().isoDate().required(),
  endAt: Joi.string().isoDate().allow(null),
  location: Joi.string().allow(null, ""),
  capacity: Joi.number().integer().min(0).allow(null),
});

const ticketSchema = Joi.object({
  name: Joi.string().min(2).required(),
  type: Joi.string().valid("General", "VIP", "Student", "Sponsor", "Staff").default("General"),
  price: Joi.number().min(0).default(0),
  currencyCode: Joi.string().length(3).uppercase().default("USD"),
  quantityTotal: Joi.number().integer().min(0).default(0),
  salesStartAt: Joi.string().isoDate().allow(null),
  salesEndAt: Joi.string().isoDate().allow(null),
});

const sponsorSchema = Joi.object({
  contactId: Joi.number().integer().positive().allow(null),
  sponsorName: Joi.string().min(2).required(),
  sponsorLevel: Joi.string().allow(null, ""),
  amount: Joi.number().min(0).default(0),
  currencyCode: Joi.string().length(3).uppercase().default("USD"),
  notes: Joi.string().allow(null, ""),
});

const eventCreateSchema = Joi.object({
  code: Joi.string().trim().min(3).required(),
  name: Joi.string().trim().min(3).required(),
  description: Joi.string().allow(null, ""),
  startAt: Joi.string().isoDate().required(),
  endAt: Joi.string().isoDate().allow(null),
  timezone: Joi.string().trim().default("UTC"),
  venue: venueSchema.optional(),
  capacity: Joi.number().integer().min(0).allow(null),
  status: Joi.string().valid("Draft", "Published", "Completed", "Cancelled", "Archived").default("Draft"),
  sessions: Joi.array().items(sessionSchema).optional(),
  tickets: Joi.array().items(ticketSchema).optional(),
  sponsors: Joi.array().items(sponsorSchema).optional(),
});

const eventUpdateSchema = eventCreateSchema.fork(
  [
    "code",
    "name",
    "startAt",
  ],
  (schema) => schema.optional()
);

const registrationSchema = Joi.object({
  contactId: Joi.number().integer().positive().allow(null),
  ticketId: Joi.number().integer().positive().allow(null),
  sessionId: Joi.number().integer().positive().allow(null),
  guestName: Joi.string().allow(null, ""),
  guestEmail: Joi.string().email({ allowFullyQualified: false }).allow(null, ""),
  guestPhone: Joi.string().allow(null, ""),
  quantity: Joi.number().integer().min(1).default(1),
  status: Joi.string().valid("Pending", "Confirmed", "Cancelled", "CheckedIn", "NoShow").default("Confirmed"),
  totalAmount: Joi.number().min(0).default(0),
  currencyCode: Joi.string().length(3).uppercase().default("USD"),
  discountCode: Joi.string().allow(null, ""),
  paymentReference: Joi.string().allow(null, ""),
  registeredAt: Joi.string().isoDate().allow(null),
  notes: Joi.string().allow(null, ""),
});

export const eventTicketSchema = ticketSchema;
export const eventSponsorSchema = sponsorSchema;
export const eventRegistrationSchema = registrationSchema;
export const eventCreateBodySchema = eventCreateSchema;
export const eventUpdateBodySchema = eventUpdateSchema;

export function getEvents(req, res, next) {
  try {
    const upcomingOnly = req.query.upcoming === "true";
    const events = listEvents({
      status: req.query.status,
      upcomingOnly,
    });
    res.json({ data: events });
  } catch (error) {
    next(error);
  }
}

export function getEvent(req, res, next) {
  try {
    const eventId = Number(req.params.id);
    const event = getEventById(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }
    res.json({ data: event });
  } catch (error) {
    next(error);
  }
}

export function postEvent(req, res, next) {
  try {
    const created = createEvent(req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json({ data: created });
  } catch (error) {
    if (error.message?.includes("UNIQUE")) {
      return res.status(409).json({ message: "Event code must be unique" });
    }
    next(error);
  }
}

export function patchEvent(req, res, next) {
  try {
    const eventId = Number(req.params.id);
    const updated = updateEvent(eventId, req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    if (!updated) {
      return res.status(404).json({ message: "Event not found" });
    }
    res.json({ data: updated });
  } catch (error) {
    next(error);
  }
}

export function getTickets(req, res, next) {
  try {
    const eventId = Number(req.params.id);
    const tickets = listEventTickets(eventId);
    res.json({ data: tickets });
  } catch (error) {
    next(error);
  }
}

export function postTicket(req, res, next) {
  try {
    const eventId = Number(req.params.id);
    const ticket = createEventTicket(eventId, req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json({ data: ticket });
  } catch (error) {
    if (error.message === "Event not found") {
      return res.status(404).json({ message: error.message });
    }
    next(error);
  }
}

export function getRegistrations(req, res, next) {
  try {
    const eventId = Number(req.params.id);
    const registrations = listEventRegistrations(eventId);
    res.json({ data: registrations });
  } catch (error) {
    next(error);
  }
}

export function postRegistration(req, res, next) {
  try {
    const eventId = Number(req.params.id);
    const registration = createEventRegistration(eventId, req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json({ data: registration });
  } catch (error) {
    if (error.message && ["Event not found", "Ticket not found for this event", "Ticket inventory exhausted", "Event capacity exceeded"].includes(error.message)) {
      return res.status(400).json({ message: error.message });
    }
    next(error);
  }
}

export function postRegistrationCheckIn(req, res, next) {
  try {
    const registrationId = Number(req.params.registrationId);
    const updated = checkInRegistration(registrationId, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    if (!updated) {
      return res.status(404).json({ message: "Registration not found" });
    }
    res.json({ data: updated });
  } catch (error) {
    if (error.message === "Cannot check in a cancelled registration") {
      return res.status(400).json({ message: error.message });
    }
    next(error);
  }
}

export function getSponsors(req, res, next) {
  try {
    const eventId = Number(req.params.id);
    const sponsors = listEventSponsors(eventId);
    res.json({ data: sponsors });
  } catch (error) {
    next(error);
  }
}

export function postSponsor(req, res, next) {
  try {
    const eventId = Number(req.params.id);
    const sponsor = createEventSponsor(eventId, req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    res.status(201).json({ data: sponsor });
  } catch (error) {
    if (error.message && ["Event not found", "Contact not found"].includes(error.message)) {
      return res.status(400).json({ message: error.message });
    }
    next(error);
  }
}
