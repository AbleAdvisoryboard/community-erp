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

  const login = await agent
    .post("/api/v1/auth/login")
    .send({ email: "admin@example.com", password: "Passw0rd!" });

  expect(login.status).toBe(200);
  csrfToken = login.body.csrfToken;
});

afterAll(() => {
  dbHandle?.cleanup();
});

describe("settings API", () => {
  it("updates organization profile and exposes the public brand", async () => {
    const save = await agent
      .put("/api/v1/settings/organization")
      .set("x-csrf-token", csrfToken)
      .send({
        companyName: "Neighborhood Helpers",
        companyLogo: "https://example.org/logo.png",
      });

    expect(save.status).toBe(200);
    expect(save.body.data.companyName).toBe("Neighborhood Helpers");

    const profile = await agent.get("/api/v1/settings/public");
    expect(profile.status).toBe(200);
    expect(profile.body.data.companyName).toBe("Neighborhood Helpers");
    expect(profile.body.data.companyLogo).toBe("https://example.org/logo.png");
  });

  it("creates and deletes an associate user", async () => {
    const profiles = await agent.get("/api/v1/settings/access-profiles");
    expect(profiles.status).toBe(200);
    expect(profiles.body.data.map((profile) => profile.name)).toContain("Associate 1");

    const customProfiles = await agent
      .put("/api/v1/settings/access-profiles")
      .set("x-csrf-token", csrfToken)
      .send({
        profiles: [
          ...profiles.body.data,
          {
            id: "volunteer_only",
            name: "Volunteer Only",
            access: {
              sections: {
                volunteer_engagement: {
                  enabled: true,
                  features: ["volunteers"],
                },
              },
            },
          },
        ],
      });

    expect(customProfiles.status).toBe(200);
    expect(customProfiles.body.data.find((profile) => profile.id === "volunteer_only").access.sections.volunteer_engagement.features).toEqual(["volunteers"]);

    const create = await agent
      .post("/api/v1/settings/users")
      .set("x-csrf-token", csrfToken)
      .send({
        displayName: "Associate Reviewer",
        email: "associate.reviewer@example.org",
        password: "GuestPass1!",
        accessType: "associate",
        accessProfileId: "volunteer_only",
      });

    expect(create.status).toBe(201);
    expect(create.body.data.accessType).toBe("associate");
    expect(create.body.data.roles.map((role) => role.name)).toContain("ReadOnly");
    expect(create.body.data.access.sections.volunteer_engagement.features).toEqual(["volunteers"]);

    const accessUpdate = await agent
      .put(`/api/v1/settings/users/${create.body.data.id}/access`)
      .set("x-csrf-token", csrfToken)
      .send({
        access: {
          sections: {
            volunteer_engagement: {
              enabled: true,
              features: ["volunteers"],
            },
          },
        },
      });

    expect(accessUpdate.status).toBe(200);
    expect(accessUpdate.body.data.access.sections.volunteer_engagement.features).toEqual(["volunteers"]);

    const deleteResponse = await agent
      .delete(`/api/v1/settings/users/${create.body.data.id}`)
      .set("x-csrf-token", csrfToken)
      .send();

    expect(deleteResponse.status).toBe(204);
  });

  it("marks the only active administrator as not deletable", async () => {
    const users = await agent.get("/api/v1/settings/users");
    expect(users.status).toBe(200);
    const admin = users.body.data.find((user) => user.email === "admin@example.com");
    expect(admin).toBeTruthy();
    expect(admin.accessType).toBe("admin");
    expect(admin.canDelete).toBe(false);
  });
});
