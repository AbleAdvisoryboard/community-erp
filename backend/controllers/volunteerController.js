import Joi from "joi";
import {
  listVolunteers,
  createVolunteer,
  updateVolunteer,
  listShifts,
  createShift,
  recordHours,
  listHoursSummary,
  listVolunteerVocab,
  createVolunteerVocab,
  deleteVolunteerVocab,
} from "../services/volunteerService.js";

const volunteerSchema = Joi.object({
  contactId: Joi.number().integer().positive().required(),
  skills: Joi.array().items(Joi.string().trim()).optional(),
  interests: Joi.array().items(Joi.string().trim()).optional(),
  backgroundCheckStatus: Joi.string().valid("Pending", "Approved", "Expired").optional(),
  availability: Joi.object().optional(),
  notes: Joi.string().allow("", null),
  isActive: Joi.boolean().optional(),
});

const volunteerUpdateSchema = volunteerSchema.fork(['contactId'], (schema) => schema.optional());

const shiftSchema = Joi.object({
  volunteerId: Joi.number().integer().positive().allow(null),
  title: Joi.string().min(2).required(),
  role: Joi.string().allow("", null),
  location: Joi.string().allow("", null),
  startAt: Joi.string().isoDate().required(),
  endAt: Joi.string().isoDate().allow(null),
  status: Joi.string().valid("Scheduled", "Completed", "Cancelled").optional(),
  hoursExpected: Joi.number().min(0).allow(null),
  notes: Joi.string().allow("", null),
});

const hoursSchema = Joi.object({
  volunteerId: Joi.number().integer().positive().required(),
  shiftId: Joi.number().integer().positive().allow(null),
  serviceDate: Joi.string().isoDate().optional(),
  hours: Joi.number().positive().required(),
  notes: Joi.string().allow("", null),
  approvedBy: Joi.number().integer().positive().allow(null),
  approvedAt: Joi.string().isoDate().allow(null),
});

export function getVolunteers(req, res, next) {
  try {
    const volunteers = listVolunteers({ activeOnly: req.query.includeInactive !== 'true' ? true : false });
    res.json({ data: volunteers });
  } catch (error) {
    next(error);
  }
}

export function postVolunteer(req, res, next) {
  try {
    const volunteer = createVolunteer(req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.status(201).json({ data: volunteer });
  } catch (error) {
    next(error);
  }
}

export function patchVolunteer(req, res, next) {
  try {
    const volunteerId = Number(req.params.id);
    const volunteer = updateVolunteer(volunteerId, req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!volunteer) {
      return res.status(404).json({ message: 'Volunteer not found' });
    }
    res.json({ data: volunteer });
  } catch (error) {
    next(error);
  }
}

export function getShifts(req, res, next) {
  try {
    const shifts = listShifts({ volunteerId: req.query.volunteerId ? Number(req.query.volunteerId) : undefined });
    res.json({ data: shifts });
  } catch (error) {
    next(error);
  }
}

export function postShift(req, res, next) {
  try {
    const shift = createShift(req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.status(201).json({ data: shift });
  } catch (error) {
    next(error);
  }
}

export function postVolunteerHours(req, res, _next) {
  try {
    const log = recordHours(req.body, {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.status(201).json({ data: log });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}


// Vocab handlers
export function getVolunteerVocab(req, res, next) {
  try {
    const { type } = req.query;
    const data = listVolunteerVocab({ type });
    res.json({ data });
  } catch (error) {
    next(error);
  }
}

export function postVolunteerVocab(req, res, next) {
  try {
    const { type, name } = req.body || {};
    const row = createVolunteerVocab({ type, name });
    res.status(201).json({ data: row });
  } catch (error) {
    if (error.code === 'VALIDATION_ERROR') {
      return res.status(400).json({ message: error.message });
    }
    next(error);
  }
}

export function deleteVolunteerVocabHandler(req, res, next) {
  try {
    const { type, names } = req.body || {};
    const deleted = deleteVolunteerVocab({ type, names });
    res.json({ data: { deleted } });
  } catch (error) {
    next(error);
  }
}export function getVolunteerHoursSummary(_req, res, next) {
  try {
    const rows = listHoursSummary();
    res.json({ data: rows });
  } catch (error) {
    next(error);
  }
}

export const validateVolunteerBody = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({ message: error.details.map((d) => d.message).join(', ') });
  }
  req.body = value;
  next();
};

export const validateShiftBody = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({ message: error.details.map((d) => d.message).join(', ') });
  }
  req.body = value;
  next();
};

export const validateHoursBody = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({ message: error.details.map((d) => d.message).join(', ') });
  }
  req.body = value;
  next();
};

export { volunteerSchema, volunteerUpdateSchema, shiftSchema, hoursSchema };




