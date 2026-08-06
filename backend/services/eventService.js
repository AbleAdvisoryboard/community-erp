import { getDb } from "../db/connection.js";
import { writeAuditLog } from "../utils/audit.js";
import { generateToken } from "../utils/token.js";

function mapEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    startAt: row.start_at,
    endAt: row.end_at,
    timezone: row.timezone,
    venue: {
      name: row.venue_name,
      address: row.venue_address,
      city: row.venue_city,
      state: row.venue_state,
      postalCode: row.venue_postal_code,
      country: row.venue_country,
    },
    capacity: row.capacity,
    status: row.status,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    registrationsCount: Number(row.registrations_count ?? 0),
    registrationRevenue: Number(row.registration_revenue ?? 0),
    sponsorshipTotal: Number(row.sponsorship_total ?? 0),
    icalToken: row.ical_token,
  };
}

function baseEventSelect() {
  return `SELECT e.*,
    COALESCE((SELECT SUM(quantity) FROM event_registrations r WHERE r.event_id = e.id AND r.status != 'Cancelled'), 0) AS registrations_count,
    COALESCE((SELECT SUM(total_amount) FROM event_registrations r WHERE r.event_id = e.id AND r.status IN ('Pending','Confirmed','CheckedIn')), 0) AS registration_revenue,
    COALESCE((SELECT SUM(amount) FROM event_sponsors s WHERE s.event_id = e.id), 0) AS sponsorship_total
  FROM events e`;
}

function listSessions(eventId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, event_id, title, description, start_at, end_at, location, capacity, created_at, updated_at
       FROM event_sessions
       WHERE event_id = ?
       ORDER BY start_at`
    )
    .all(eventId)
    .map((row) => ({
      id: row.id,
      eventId: row.event_id,
      title: row.title,
      description: row.description,
      startAt: row.start_at,
      endAt: row.end_at,
      location: row.location,
      capacity: row.capacity,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
}

function listTickets(eventId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, event_id, name, type, price, currency_code, quantity_total, quantity_sold, sales_start_at, sales_end_at, created_at, updated_at
       FROM event_tickets
       WHERE event_id = ?
       ORDER BY price ASC, name`
    )
    .all(eventId)
    .map((row) => ({
      id: row.id,
      eventId: row.event_id,
      name: row.name,
      type: row.type,
      price: Number(row.price ?? 0),
      currencyCode: row.currency_code,
      quantityTotal: row.quantity_total,
      quantitySold: row.quantity_sold,
      salesStartAt: row.sales_start_at,
      salesEndAt: row.sales_end_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
}

function listSponsors(eventId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT s.id, s.event_id, s.contact_id, s.sponsor_name, s.sponsor_level, s.amount, s.currency_code, s.notes, s.created_at,
              printf('%s %s', c.first_name, c.last_name) AS contact_name
       FROM event_sponsors s
       LEFT JOIN contacts c ON c.id = s.contact_id
       WHERE s.event_id = ?
       ORDER BY s.amount DESC, s.sponsor_name`
    )
    .all(eventId)
    .map((row) => ({
      id: row.id,
      eventId: row.event_id,
      contactId: row.contact_id,
      contactName: row.contact_name ?? null,
      sponsorName: row.sponsor_name,
      sponsorLevel: row.sponsor_level,
      amount: Number(row.amount ?? 0),
      currencyCode: row.currency_code,
      notes: row.notes,
      createdAt: row.created_at,
    }));
}

function listRegistrations(eventId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT r.*,
              printf('%s %s', c.first_name, c.last_name) AS contact_name,
              t.name AS ticket_name,
              s.title AS session_title
       FROM event_registrations r
       LEFT JOIN contacts c ON c.id = r.contact_id
       LEFT JOIN event_tickets t ON t.id = r.ticket_id
       LEFT JOIN event_sessions s ON s.id = r.session_id
       WHERE r.event_id = ?
       ORDER BY r.registered_at DESC`
    )
    .all(eventId)
    .map((row) => ({
      id: row.id,
      eventId: row.event_id,
      contactId: row.contact_id,
      contactName: row.contact_name ?? null,
      ticketId: row.ticket_id,
      ticketName: row.ticket_name ?? null,
      sessionId: row.session_id,
      sessionTitle: row.session_title ?? null,
      guestName: row.guest_name,
      guestEmail: row.guest_email,
      guestPhone: row.guest_phone,
      quantity: row.quantity,
      status: row.status,
      totalAmount: Number(row.total_amount ?? 0),
      currencyCode: row.currency_code,
      discountCode: row.discount_code,
      paymentReference: row.payment_reference,
      registeredAt: row.registered_at,
      checkedInAt: row.checked_in_at,
      notes: row.notes,
    }));
}

export function listEvents({ status, upcomingOnly } = {}) {
  const db = getDb();
  const where = [];
  const params = {};
  if (status) {
    where.push("e.status = @status");
    params.status = status;
  }
  if (upcomingOnly) {
    where.push("datetime(e.start_at) >= datetime('now')");
  }
  const sql = `${baseEventSelect()}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY e.start_at`;
  return db.prepare(sql).all(params).map(mapEvent);
}

export function getEventById(eventId) {
  const db = getDb();
  const row = db
    .prepare(`${baseEventSelect()} WHERE e.id = ?`)
    .get(eventId);
  if (!row) {
    return null;
  }
  const event = mapEvent(row);
  return {
    ...event,
    sessions: listSessions(eventId),
    tickets: listTickets(eventId),
    sponsors: listSponsors(eventId),
    registrations: listRegistrations(eventId),
  };
}

export function createEvent(data, auditContext) {
  const db = getDb();
  const run = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO events (code, name, description, start_at, end_at, timezone, venue_name, venue_address, venue_city, venue_state, venue_postal_code, venue_country, capacity, status, created_by, updated_by, ical_token)
         VALUES (@code, @name, @description, @start_at, @end_at, @timezone, @venue_name, @venue_address, @venue_city, @venue_state, @venue_postal_code, @venue_country, @capacity, @status, @created_by, @updated_by, @ical_token)`
      )
      .run({
        code: data.code,
        name: data.name,
        description: data.description ?? null,
        start_at: data.startAt,
        end_at: data.endAt ?? null,
        timezone: data.timezone ?? "UTC",
        venue_name: data.venue?.name ?? null,
        venue_address: data.venue?.address ?? null,
        venue_city: data.venue?.city ?? null,
        venue_state: data.venue?.state ?? null,
        venue_postal_code: data.venue?.postalCode ?? null,
        venue_country: data.venue?.country ?? "US",
        capacity: data.capacity ?? null,
        status: data.status ?? "Draft",
        created_by: auditContext?.userId ?? null,
        updated_by: auditContext?.userId ?? null,
        ical_token: generateToken(),
      });
    const eventId = result.lastInsertRowid;

    if (Array.isArray(data.sessions)) {
      const stmt = db.prepare(
        `INSERT INTO event_sessions (event_id, title, description, start_at, end_at, location, capacity)
         VALUES (@event_id, @title, @description, @start_at, @end_at, @location, @capacity)`
      );
      for (const session of data.sessions) {
        stmt.run({
          event_id: eventId,
          title: session.title,
          description: session.description ?? null,
          start_at: session.startAt,
          end_at: session.endAt ?? null,
          location: session.location ?? null,
          capacity: session.capacity ?? null,
        });
      }
    }

    if (Array.isArray(data.tickets)) {
      const stmt = db.prepare(
        `INSERT INTO event_tickets (event_id, name, type, price, currency_code, quantity_total, quantity_sold, sales_start_at, sales_end_at)
         VALUES (@event_id, @name, @type, @price, @currency_code, @quantity_total, 0, @sales_start_at, @sales_end_at)`
      );
      for (const ticket of data.tickets) {
        stmt.run({
          event_id: eventId,
          name: ticket.name,
          type: ticket.type ?? "General",
          price: ticket.price ?? 0,
          currency_code: ticket.currencyCode ?? "USD",
          quantity_total: ticket.quantityTotal ?? 0,
          sales_start_at: ticket.salesStartAt ?? null,
          sales_end_at: ticket.salesEndAt ?? null,
        });
      }
    }

    if (Array.isArray(data.sponsors)) {
      const stmt = db.prepare(
        `INSERT INTO event_sponsors (event_id, contact_id, sponsor_name, sponsor_level, amount, currency_code, notes)
         VALUES (@event_id, @contact_id, @sponsor_name, @sponsor_level, @amount, @currency_code, @notes)`
      );
      for (const sponsor of data.sponsors) {
        stmt.run({
          event_id: eventId,
          contact_id: sponsor.contactId ?? null,
          sponsor_name: sponsor.sponsorName,
          sponsor_level: sponsor.sponsorLevel ?? null,
          amount: sponsor.amount ?? 0,
          currency_code: sponsor.currencyCode ?? "USD",
          notes: sponsor.notes ?? null,
        });
      }
    }

    return eventId;
  });

  const eventId = run();
  const event = getEventById(eventId);
  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "events",
    entityId: String(eventId),
    action: "create",
    after: event,
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });
  return event;
}

export function updateEvent(eventId, updates, auditContext) {
  const db = getDb();
  const existing = getEventById(eventId);
  if (!existing) {
    return null;
  }
  const mapping = {
    code: "code",
    name: "name",
    description: "description",
    startAt: "start_at",
    endAt: "end_at",
    timezone: "timezone",
    capacity: "capacity",
    status: "status",
  };
  const venueMapping = {
    name: "venue_name",
    address: "venue_address",
    city: "venue_city",
    state: "venue_state",
    postalCode: "venue_postal_code",
    country: "venue_country",
  };
  const sets = [];
  const params = { id: eventId };
  for (const [key, column] of Object.entries(mapping)) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      let value = updates[key];
      if (key === "startAt" || key === "endAt") {
        value = updates[key] ?? null;
      }
      sets.push(`${column} = @${column}`);
      params[column] = value ?? null;
    }
  }
  if (updates.venue) {
    for (const [key, column] of Object.entries(venueMapping)) {
      if (Object.prototype.hasOwnProperty.call(updates.venue, key)) {
        sets.push(`${column} = @${column}`);
        params[column] = updates.venue[key] ?? null;
      }
    }
  }
  if (!sets.length) {
    return existing;
  }
  sets.push("updated_by = @updated_by");
  params.updated_by = auditContext?.userId ?? null;
  db.prepare(`UPDATE events SET ${sets.join(', ')} WHERE id = @id`).run(params);
  const updated = getEventById(eventId);
  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "events",
    entityId: String(eventId),
    action: "update",
    before: existing,
    after: updated,
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });
  return updated;
}

export function listEventTickets(eventId) {
  return listTickets(eventId);
}

export function createEventTicket(eventId, data, auditContext) {
  const db = getDb();
  const event = db.prepare("SELECT id FROM events WHERE id = ?").get(eventId);
  if (!event) {
    throw new Error("Event not found");
  }
  const result = db
    .prepare(
      `INSERT INTO event_tickets (event_id, name, type, price, currency_code, quantity_total, quantity_sold, sales_start_at, sales_end_at)
       VALUES (@event_id, @name, @type, @price, @currency_code, @quantity_total, 0, @sales_start_at, @sales_end_at)`
    )
    .run({
      event_id: eventId,
      name: data.name,
      type: data.type ?? "General",
      price: data.price ?? 0,
      currency_code: data.currencyCode ?? "USD",
      quantity_total: data.quantityTotal ?? 0,
      sales_start_at: data.salesStartAt ?? null,
      sales_end_at: data.salesEndAt ?? null,
    });
  const ticketId = result.lastInsertRowid;
  const ticket = listTickets(eventId).find((row) => row.id === ticketId);
  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "event_tickets",
    entityId: String(ticketId),
    action: "create",
    after: ticket,
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });
  return ticket;
}

export function listEventRegistrations(eventId) {
  return listRegistrations(eventId);
}

export function createEventRegistration(eventId, data, auditContext) {
  const db = getDb();
  const event = db.prepare("SELECT id, capacity FROM events WHERE id = ?").get(eventId);
  if (!event) {
    throw new Error("Event not found");
  }
  let ticket = null;
  if (data.ticketId) {
    ticket = db
      .prepare("SELECT id, event_id, quantity_total, quantity_sold FROM event_tickets WHERE id = ?")
      .get(data.ticketId);
    if (!ticket || ticket.event_id !== eventId) {
      throw new Error("Ticket not found for this event");
    }
    const newSold = (ticket.quantity_sold ?? 0) + (data.quantity ?? 1);
    if (ticket.quantity_total && newSold > ticket.quantity_total) {
      throw new Error("Ticket inventory exhausted");
    }
  }

  const totalRegistered = db
    .prepare("SELECT COALESCE(SUM(quantity), 0) AS qty FROM event_registrations WHERE event_id = ? AND status != 'Cancelled'")
    .get(eventId)?.qty ?? 0;
  const newTotal = totalRegistered + (data.quantity ?? 1);
  if (event.capacity && newTotal > event.capacity) {
    throw new Error("Event capacity exceeded");
  }

  const run = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO event_registrations (event_id, contact_id, ticket_id, session_id, guest_name, guest_email, guest_phone, quantity, status, total_amount, currency_code, discount_code, payment_reference, registered_at, checked_in_at, notes)
         VALUES (@event_id, @contact_id, @ticket_id, @session_id, @guest_name, @guest_email, @guest_phone, @quantity, @status, @total_amount, @currency_code, @discount_code, @payment_reference, @registered_at, NULL, @notes)`
      )
      .run({
        event_id: eventId,
        contact_id: data.contactId ?? null,
        ticket_id: data.ticketId ?? null,
        session_id: data.sessionId ?? null,
        guest_name: data.guestName ?? null,
        guest_email: data.guestEmail ?? null,
        guest_phone: data.guestPhone ?? null,
        quantity: data.quantity ?? 1,
        status: data.status ?? "Confirmed",
        total_amount: data.totalAmount ?? 0,
        currency_code: data.currencyCode ?? "USD",
        discount_code: data.discountCode ?? null,
        payment_reference: data.paymentReference ?? null,
        registered_at: data.registeredAt ?? new Date().toISOString(),
        notes: data.notes ?? null,
      });
    const registrationId = result.lastInsertRowid;
    if (ticket) {
      db.prepare("UPDATE event_tickets SET quantity_sold = quantity_sold + @qty WHERE id = @ticket_id").run({
        qty: data.quantity ?? 1,
        ticket_id: ticket.id,
      });
    }
    return registrationId;
  });

  const registrationId = run();
  const registration = listRegistrations(eventId).find((row) => row.id === registrationId);
  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "event_registrations",
    entityId: String(registrationId),
    action: "create",
    after: registration,
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });
  return registration;
}

export function checkInRegistration(registrationId, auditContext) {
  const db = getDb();
  const registration = db
    .prepare(
      `SELECT r.*, e.start_at, e.name FROM event_registrations r
       INNER JOIN events e ON e.id = r.event_id
       WHERE r.id = ?`
    )
    .get(registrationId);
  if (!registration) {
    return null;
  }
  if (registration.status === "Cancelled") {
    throw new Error("Cannot check in a cancelled registration");
  }
  const updatedStatus = registration.status === "CheckedIn" ? "CheckedIn" : "CheckedIn";
  db.prepare(
    `UPDATE event_registrations SET status = @status, checked_in_at = @checked_in_at WHERE id = @id`
  ).run({
    id: registrationId,
    status: updatedStatus,
    checked_in_at: new Date().toISOString(),
  });
  const updated = db
    .prepare(
      `SELECT r.*, printf('%s %s', c.first_name, c.last_name) AS contact_name, t.name AS ticket_name
       FROM event_registrations r
       LEFT JOIN contacts c ON c.id = r.contact_id
       LEFT JOIN event_tickets t ON t.id = r.ticket_id
       WHERE r.id = ?`
    )
    .get(registrationId);
  const mapped = {
    id: updated.id,
    eventId: updated.event_id,
    contactId: updated.contact_id,
    contactName: updated.contact_name ?? null,
    ticketId: updated.ticket_id,
    ticketName: updated.ticket_name ?? null,
    quantity: updated.quantity,
    status: updated.status,
    checkedInAt: updated.checked_in_at,
  };
  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "event_registrations",
    entityId: String(registrationId),
    action: "update",
    before: {
      id: registration.id,
      status: registration.status,
      checkedInAt: registration.checked_in_at,
    },
    after: mapped,
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });
  return mapped;
}

export function listEventSponsors(eventId) {
  return listSponsors(eventId);
}

export function createEventSponsor(eventId, data, auditContext) {
  const db = getDb();
  const event = db.prepare("SELECT id FROM events WHERE id = ?").get(eventId);
  if (!event) {
    throw new Error("Event not found");
  }
  if (data.contactId) {
    const contact = db.prepare("SELECT id FROM contacts WHERE id = ?").get(data.contactId);
    if (!contact) {
      throw new Error("Contact not found");
    }
  }
  const result = db
    .prepare(
      `INSERT INTO event_sponsors (event_id, contact_id, sponsor_name, sponsor_level, amount, currency_code, notes)
       VALUES (@event_id, @contact_id, @sponsor_name, @sponsor_level, @amount, @currency_code, @notes)`
    )
    .run({
      event_id: eventId,
      contact_id: data.contactId ?? null,
      sponsor_name: data.sponsorName,
      sponsor_level: data.sponsorLevel ?? null,
      amount: data.amount ?? 0,
      currency_code: data.currencyCode ?? "USD",
      notes: data.notes ?? null,
    });
  const sponsorId = result.lastInsertRowid;
  const sponsor = listSponsors(eventId).find((row) => row.id === sponsorId);
  writeAuditLog({
    userId: auditContext?.userId ?? null,
    entity: "event_sponsors",
    entityId: String(sponsorId),
    action: "create",
    after: sponsor,
    ipAddress: auditContext?.ip,
    userAgent: auditContext?.userAgent,
  });
  return sponsor;
}
