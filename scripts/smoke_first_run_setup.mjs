import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// eslint-disable-next-line n/no-unpublished-import
import request from "supertest";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "community-erp-setup-"));
process.env.DB_PATH = path.join(tmpDir, "app.db");
process.env.JWT_SECRET = "setup-smoke-access-secret";
process.env.REFRESH_TOKEN_SECRET = "setup-smoke-refresh-secret";
process.env.SECURE_COOKIES = "false";
delete process.env.COOKIE_DOMAIN;

const { createApp } = await import("../backend/app.js");
const { closeDb } = await import("../backend/db/connection.js");

try {
  const app = createApp({ loadEnv: false, runMigrations: true, initializeDb: true });
  const before = await request(app).get("/api/v1/setup/status");
  if (before.body.data?.setupRequired !== true) {
    throw new Error("Expected setup to be required for a fresh database.");
  }

  const invalidEmail = await request(app).post("/api/v1/setup").send({
    organizationName: "Quick Start Org",
    organizationLogo: "",
    adminName: "First Admin",
    adminEmail: "first@example",
    adminPassword: "FirstPassw0rd!",
  });
  if (invalidEmail.status !== 422 || !invalidEmail.body.details?.join(" ").includes("complete admin email")) {
    throw new Error("Expected setup to return a clear invalid email message.");
  }

  const setup = await request(app).post("/api/v1/setup").send({
    organizationName: "Quick Start Org",
    organizationLogo: "",
    adminName: "First Admin",
    adminEmail: "first@example.org",
    adminPassword: "FirstPassw0rd!",
  });
  if (setup.status !== 201) {
    throw new Error(`Setup failed with ${setup.status}.`);
  }

  const login = await request(app).post("/api/v1/auth/login").send({
    email: "first@example.org",
    password: "FirstPassw0rd!",
  });
  if (login.status !== 200) {
    throw new Error(`Admin login failed with ${login.status}.`);
  }

  console.log("First-run setup smoke passed.");
} finally {
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
