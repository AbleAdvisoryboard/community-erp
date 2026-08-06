import { buildVolunteerCalendar, buildEventCalendar, buildUpcomingEventsCalendar } from "../services/calendarService.js";

function sendCalendar(res, payload) {
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  if (payload?.fileName) {
    res.setHeader('Content-Disposition', `attachment; filename="${payload.fileName}"`);
  }
  res.send(payload?.ics || '');
}

export function getVolunteerCalendar(req, res, next) {
  try {
    const volunteerId = Number(req.params.volunteerId);
    if (Number.isNaN(volunteerId)) {
      return res.status(400).json({ message: 'Volunteer ID must be numeric' });
    }
    const calendar = buildVolunteerCalendar(volunteerId);
    if (!calendar) {
      return res.status(404).json({ message: 'Volunteer not found' });
    }
    sendCalendar(res, calendar);
  } catch (error) {
    next(error);
  }
}

export function getEventCalendar(req, res, next) {
  try {
    const eventId = Number(req.params.eventId);
    if (Number.isNaN(eventId)) {
      return res.status(400).json({ message: 'Event ID must be numeric' });
    }
    const calendar = buildEventCalendar(eventId);
    if (!calendar) {
      return res.status(404).json({ message: 'Event not found' });
    }
    sendCalendar(res, calendar);
  } catch (error) {
    next(error);
  }
}

export function getUpcomingEventsCalendar(_req, res, next) {
  try {
    const calendar = buildUpcomingEventsCalendar();
    sendCalendar(res, calendar);
  } catch (error) {
    next(error);
  }
}
