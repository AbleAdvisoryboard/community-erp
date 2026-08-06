import request from "supertest";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { createApp } from "../../app.js";
import { useTestDatabase } from "../utils/db.js";

describe("CRM contacts API", () => {
  let dbHandle;
  let agent;
  let csrfToken;

  beforeAll(async () => {
    dbHandle = useTestDatabase({ seed: true });
    const app = createApp({ loadEnv: false, runMigrations: false });
    agent = request.agent(app);

    const loginResponse = await agent
      .post("/api/v1/auth/login")
      .send({ email: "admin@example.com", password: "Passw0rd!" });

    expect(loginResponse.status).toBe(200);
    csrfToken = loginResponse.body.csrfToken;
    expect(csrfToken).toBeTruthy();
  });

  afterAll(() => {
    dbHandle?.cleanup();
  });

  it("creates a contact and finds it via q+limit search", async () => {
    const uniqueEmail = `uat-${randomUUID()}@example.org`;

    const createResponse = await agent
      .post("/api/v1/crm/contacts")
      .set("x-csrf-token", csrfToken)
      .send({
        firstName: "UAT",
        lastName: "Contact",
        email: uniqueEmail,
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body?.data?.id).toBeTruthy();

    const searchResponse = await agent
      .get("/api/v1/crm/contacts")
      .query({ q: uniqueEmail, limit: 5 });

    expect(searchResponse.status).toBe(200);
    const matches = searchResponse.body?.data ?? [];
    expect(Array.isArray(matches)).toBe(true);
    expect(matches.some((row) => row.email === uniqueEmail)).toBe(true);
  });

  it("soft deletes a contact and hides it from search", async () => {
    const uniqueEmail = `delete-${randomUUID()}@example.org`;

    const createResponse = await agent
      .post("/api/v1/crm/contacts")
      .set("x-csrf-token", csrfToken)
      .send({
        firstName: "Delete",
        lastName: "Contact",
        email: uniqueEmail,
      });

    expect(createResponse.status).toBe(201);
    const contactId = createResponse.body?.data?.id;
    expect(contactId).toBeTruthy();

    const deleteResponse = await agent
      .delete(`/api/v1/crm/contacts/${contactId}`)
      .set("x-csrf-token", csrfToken);

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body?.data?.id).toBe(contactId);
    expect(deleteResponse.body?.data?.deletedAt).toBeTruthy();

    const searchResponse = await agent
      .get("/api/v1/crm/contacts")
      .query({ q: uniqueEmail, limit: 5 });

    expect(searchResponse.status).toBe(200);
    const matches = searchResponse.body?.data ?? [];
    expect(matches.some((row) => row.email === uniqueEmail)).toBe(false);
  });
});
