import { Router } from 'express';
import { getEventCalendarByToken, getVolunteerCalendarByToken } from '../services/calendarService.js';

const router = Router();

function normalizeToken(value) {
  if (!value) return value;
  return value.toLowerCase().replace(/\.ics$/i, '');
}

router.get('/events/:token', (req, res) => {
  const token = normalizeToken(req.params.token);
  const payload = getEventCalendarByToken(token);
  if (!payload) {
    return res.status(404).json({ message: 'Event feed not found' });
  }
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${payload.filename}"`);
  return res.send(payload.ics);
});

router.get('/volunteers/:token', (req, res) => {
  const token = normalizeToken(req.params.token);
  const payload = getVolunteerCalendarByToken(token);
  if (!payload) {
    return res.status(404).json({ message: 'Volunteer feed not found' });
  }
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${payload.filename}"`);
  return res.send(payload.ics);
});

export default router;
