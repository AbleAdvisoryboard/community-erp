import { beforeAll, afterAll, describe, expect, it } from "vitest";

import { getDb } from "../../db/connection.js";
import { getUserByEmail } from "../../utils/users.js";
import {
  listReports,
  runReport,
} from "../../services/reportService.js";
import { useTestDatabase } from "../utils/db.js";

let dbHandle;
let adminUser;

beforeAll(() => {
  dbHandle = useTestDatabase({ seed: true });
  adminUser = getUserByEmail("admin@example.com");
});

afterAll(() => {
  dbHandle?.cleanup();
});

function createUserWithRoles(email, displayName, roleNames = []) {
  const db = getDb();
  db.prepare("DELETE FROM users WHERE email = ?").run(email);
  const insert = db.prepare(
    "INSERT INTO users (email, password_hash, display_name, is_active) VALUES (@email, @password_hash, @display_name, 1)"
  );
  const { lastInsertRowid } = insert.run({ email, password_hash: "test-hash", display_name: displayName });
  for (const roleName of roleNames) {
    const role = db.prepare("SELECT id FROM roles WHERE name = ?").get(roleName);
    if (role) {
      db.prepare("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)").run(lastInsertRowid, role.id);
    }
  }
  return getUserByEmail(email);
}

describe("report service", () => {
  it("lists reports available to an admin", () => {
    const reports = listReports(adminUser);
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.some((report) => report.slug === "donations-monthly-detail")).toBe(true);
  });

  it("filters reports based on role assignments", () => {
    const volunteerUser = createUserWithRoles(
      "volunteer@example.com",
      "Volunteer Analyst",
      ["VolunteerMgr"]
    );
    const reports = listReports(volunteerUser);
    const slugs = reports.map((report) => report.slug);
    expect(slugs).toContain("volunteer-hours-summary");
    expect(slugs).not.toContain("finance-journal-detail");
  });

  it("runs a saved report and applies filters", () => {
    const reports = listReports(adminUser);
    const donationsReport = reports.find((report) => report.slug === "donations-monthly-detail");
    expect(donationsReport).toBeDefined();

    const result = runReport(donationsReport.id, {
      filters: {
        payment_method: "ACH",
        date_range: { preset: null, from: "2025-09-01", to: "2025-09-30" },
      },
      limit: 25,
    }, {
      user: adminUser,
      userId: adminUser?.id,
      ip: "127.0.0.1",
      userAgent: "vitest",
    });

    expect(result.format).toBe("json");
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.meta.rowCount).toBe(result.rows.length);
    expect(result.columns.map((column) => column.id)).toContain("payment_method");
    expect(result.rows.every((row) => row.payment_method === "ACH")).toBe(true);
  });

  it("exports a saved report as a Word-compatible document", () => {
    const reports = listReports(adminUser);
    const donationsReport = reports.find((report) => report.slug === "donations-monthly-detail");
    expect(donationsReport).toBeDefined();

    const result = runReport(donationsReport.id, { format: "doc", limit: 5 }, {
      user: adminUser,
      userId: adminUser?.id,
      ip: "127.0.0.1",
      userAgent: "vitest",
    });

    expect(result.format).toBe("doc");
    expect(result.filename).toMatch(/\.doc$/);
    expect(result.html).toContain("<table>");
    expect(result.html).toContain("Monthly Donation Detail");
  });
});
