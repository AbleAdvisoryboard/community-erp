import { afterAll } from "vitest";
import { closeDb } from "../../db/connection.js";

process.env.NODE_ENV = "test";
process.env.TZ = process.env.TZ || "UTC";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
process.env.REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || "test-refresh-secret";
process.env.CSRF_SECRET = process.env.CSRF_SECRET || "test-csrf-secret";

afterAll(() => {
  closeDb();
});
