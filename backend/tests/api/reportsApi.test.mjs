import request from "supertest";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { useTestDatabase } from "../utils/db.js";

let dbHandle;
let agent;
let csrfToken;

beforeAll(async () => {
  dbHandle = useTestDatabase({ seed: true });
  const app = createApp({ loadEnv: false, runMigrations: false });
  agent = request.agent(app);

  const response = await agent
    .post("/api/v1/auth/login")
    .send({ email: "admin@example.com", password: "Passw0rd!" });

  expect(response.status).toBe(200);
  csrfToken = response.body.csrfToken;
  expect(csrfToken).toBeTruthy();
});

afterAll(() => {
  dbHandle?.cleanup();
});

describe("auth API", () => {
  it("rejects invalid credentials", async () => {
    const res = await request(createApp({ loadEnv: false, runMigrations: false }))
      .post("/api/v1/auth/login")
      .send({ email: "admin@example.com", password: "WrongPass" });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid/i);
  });

  it("returns current user once authenticated", async () => {
    const res = await agent.get("/api/v1/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("admin@example.com");
    expect(Array.isArray(res.body.user.permissions)).toBe(true);
  });
});

describe("reports API", () => {
  it("requires authentication", async () => {
    const res = await request(createApp({ loadEnv: false, runMigrations: false }))
      .get("/api/v1/reports");
    expect(res.status).toBe(401);
  });

  it("lists datasets for an authenticated user", async () => {
    const res = await agent.get("/api/v1/reports/datasets");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some((dataset) => dataset.key === "fundraising_donations")).toBe(true);
  });

  it("runs a report via POST and returns data", async () => {
    const reports = await agent.get("/api/v1/reports");
    expect(reports.status).toBe(200);
    const donationReport = reports.body.data.find((item) => item.slug === "donations-monthly-detail");
    expect(donationReport).toBeDefined();

    const runRes = await agent
      .post(`/api/v1/reports/${donationReport.id}/run`)
      .set("x-csrf-token", csrfToken)
      .send({
        filters: {
          payment_method: "ACH",
          date_range: { preset: null, from: "2025-01-01", to: "2025-12-31" },
        },
        limit: 10,
      });

    expect(runRes.status).toBe(200);
    expect(Array.isArray(runRes.body.data)).toBe(true);
    expect(runRes.body.data.length).toBeGreaterThan(0);
    expect(runRes.body.data.every((row) => row.payment_method === "ACH")).toBe(true);
  });

  it("exports a report document for Word and LibreOffice", async () => {
    const reports = await agent.get("/api/v1/reports");
    expect(reports.status).toBe(200);
    const donationReport = reports.body.data.find((item) => item.slug === "donations-monthly-detail");
    expect(donationReport).toBeDefined();

    const exportRes = await agent
      .post(`/api/v1/reports/${donationReport.id}/run`)
      .set("x-csrf-token", csrfToken)
      .send({ format: "doc", limit: 5 });

    expect(exportRes.status).toBe(200);
    expect(exportRes.headers["content-type"]).toContain("application/msword");
    expect(exportRes.headers["content-disposition"]).toContain(".doc");
    expect(exportRes.text).toContain("<table>");
  });
});
