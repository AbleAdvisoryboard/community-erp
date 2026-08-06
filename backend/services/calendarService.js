import { getDb } from '../db/connection.js';
import { buildICS } from '../utils/ics.js';

function formatLocation({ name, address, city, state, postalCode, country }) {
  const parts = [name, address, [city, state].filter(Boolean).join(', '), postalCode, country];
  return parts.filter(Boolean).join(' ');
}

export function getVolunteerCalendarByToken(token) {
  const db = getDb();
  const volunteer = db
    .prepare(`
      SELECT v.id, v.ical_token, c.first_name, c.last_name, c.email, c.phone
      FROM volunteers v
      INNER JOIN contacts c ON c.id = v.contact_id
      WHERE v.ical_token = ?
    `)
    .get(token);
  if (!volunteer) {
    return null;
  }

  const shifts = db
    .prepare(`
      SELECT id, title, role, location, start_at, end_at, status, notes
      FROM volunteer_shifts
      WHERE volunteer_id = ? AND status != 'Cancelled'
      ORDER BY start_at
    `)
    .all(volunteer.id);

  const events = shifts
    .filter((shift) => shift.start_at)
    .map((shift) => {
      const descriptionLines = [
        shift.role ? `Role: ${shift.role}` : null,
        shift.notes ? `Notes: ${shift.notes}` : null,
      ].filter(Boolean);

      return {
        uid: `volunteer-shift-${shift.id}@community-erp`,
        start: shift.start_at,
        end: shift.end_at ?? null,
        summary: shift.title ?? 'Volunteer Shift',
        description: descriptionLines.length ? descriptionLines.join('\n') : null,
        location: shift.location || null,
      };
    });

  const calendarNameParts = [volunteer.first_name, volunteer.last_name].filter(Boolean);
  const calendarName = calendarNameParts.length ? calendarNameParts.join(' ') : 'Volunteer Shifts';
  const description = volunteer.email
    ? `Volunteer calendar for ${volunteer.email}`
    : 'Volunteer shift calendar';
  const volunteerNameForFile = (volunteer.first_name || 'volunteer').trim().toLowerCase().replace(/\s+/g, '-') || 'volunteer';

  return {
    filename: `${volunteerNameForFile}-shifts.ics`,
    ics: buildICS({
      name: `${calendarName} - Shifts`,
      description,
      timezone: 'UTC',
      events,
    }),
  };
}

export function buildVolunteerCalendar(volunteerId) {
  const db = getDb();
  const row = db.prepare("SELECT ical_token FROM volunteers WHERE id = ?").get(volunteerId);
  if (!row?.ical_token) return null;
  const payload = getVolunteerCalendarByToken(row.ical_token);
  if (!payload) return null;
  return { ...payload, fileName: payload.filename };
}

export function getEventCalendarByToken(token) {
  const db = getDb();
  const event = db
    .prepare(`
      SELECT * FROM events WHERE ical_token = ?
    `)
    .get(token);
  if (!event) {
    return null;
  }

  const sessions = db
    .prepare(`
      SELECT id, title, description, start_at, end_at, location, capacity
      FROM event_sessions
      WHERE event_id = ?
      ORDER BY start_at
    `)
    .all(event.id);

  const calendarEvents = [];
  if (event.start_at) {
    calendarEvents.push({
      uid: `event-${event.id}@community-erp`,
      start: event.start_at,
      end: event.end_at ?? null,
      summary: event.name ?? 'Event',
      description: event.description ?? null,
      location: formatLocation({
        name: event.venue_name,
        address: event.venue_address,
        city: event.venue_city,
        state: event.venue_state,
        postalCode: event.venue_postal_code,
        country: event.venue_country,
      }) || null,
    });
  }

  for (const session of sessions) {
    if (!session.start_at) continue;
    calendarEvents.push({
      uid: `event-session-${session.id}@community-erp`,
      start: session.start_at,
      end: session.end_at ?? null,
      summary: session.title || event.name || 'Event Session',
      description: session.description ?? null,
      location:
        session.location ||
        formatLocation({
          name: event.venue_name,
          address: event.venue_address,
          city: event.venue_city,
          state: event.venue_state,
          postalCode: event.venue_postal_code,
          country: event.venue_country,
        }) || null,
    });
  }

  const eventCodeForFile = (event.code || event.name || 'event').toString().trim().toLowerCase().replace(/\s+/g, '-') || 'event';

  return {
    filename: `${eventCodeForFile}-schedule.ics`,
    ics: buildICS({
      name: event.name ? `${event.name} Schedule` : 'Event Schedule',
      description: event.description ?? 'Event schedule',
      timezone: event.timezone || 'UTC',
      events: calendarEvents,
    }),
  };
}

export function buildEventCalendar(eventId) {
  const db = getDb();
  const row = db.prepare("SELECT ical_token FROM events WHERE id = ?").get(eventId);
  if (!row?.ical_token) return null;
  const payload = getEventCalendarByToken(row.ical_token);
  if (!payload) return null;
  return { ...payload, fileName: payload.filename };
}

export function buildUpcomingEventsCalendar() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, name, description, start_at, end_at, timezone,
              venue_name, venue_address, venue_city, venue_state, venue_postal_code, venue_country
         FROM events
        WHERE start_at IS NOT NULL
          AND start_at >= datetime('now', '-1 day')
        ORDER BY start_at
        LIMIT 100`
    )
    .all();

  const events = rows.map((event) => ({
    uid: `upcoming-event-${event.id}@community-erp`,
    start: event.start_at,
    end: event.end_at ?? null,
    summary: event.name ?? 'Event',
    description: event.description ?? null,
    location: formatLocation({
      name: event.venue_name,
      address: event.venue_address,
      city: event.venue_city,
      state: event.venue_state,
      postalCode: event.venue_postal_code,
      country: event.venue_country,
    }) || null,
  }));

  return {
    filename: 'upcoming-events.ics',
    fileName: 'upcoming-events.ics',
    ics: buildICS({
      name: 'Upcoming Events',
      description: 'Community ERP upcoming events',
      timezone: rows[0]?.timezone || 'UTC',
      events,
    }),
  };
}
