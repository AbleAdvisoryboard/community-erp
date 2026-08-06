import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getDb } from "../../db/connection.js";
import {
  buildVolunteerCalendar,
  buildEventCalendar,
  buildUpcomingEventsCalendar,
} from "../../services/calendarService.js";
import { useTestDatabase } from "../utils/db.js";

let dbHandle;

beforeAll(() => {
  dbHandle = useTestDatabase({ seed: true });
});

afterAll(() => {
  dbHandle?.cleanup();
});

describe("calendar service", () => {
  it("generates a volunteer ICS feed", () => {
    const db = getDb();
    const volunteer = db
      .prepare(
        `SELECT v.id, printf('%s %s', c.first_name, c.last_name) AS name
           FROM volunteers v
           INNER JOIN contacts c ON c.id = v.contact_id
          LIMIT 1`
      )
      .get();
    expect(volunteer).toBeTruthy();
    const result = buildVolunteerCalendar(volunteer.id);
    expect(result).toBeTruthy();
    expect(result.ics).toContain("BEGIN:VCALENDAR");
    expect(result.ics).toContain("UID:");
    expect(result.fileName).toContain("shifts");
  });

  it("generates an event ICS feed", () => {
    const db = getDb();
    const event = db.prepare("SELECT id FROM events LIMIT 1").get();
    expect(event).toBeTruthy();
    const result = buildEventCalendar(event.id);
    expect(result).toBeTruthy();
    expect(result.ics).toContain("BEGIN:VEVENT");
  });

  it("produces an upcoming events feed", () => {
    const result = buildUpcomingEventsCalendar();
    expect(result).toBeTruthy();
    expect(result.ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
  });
});
