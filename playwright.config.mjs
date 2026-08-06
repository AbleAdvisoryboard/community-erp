import { defineConfig } from "@playwright/test";

const PORT = process.env.PLAYWRIGHT_PORT || "3100";
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "playwright/tests",
  timeout: 60000,
  expect: {
    timeout: 5000,
  },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    headless: true,
    trace: "retain-on-failure",
  },
  globalSetup: "./playwright/setup/globalSetup.mjs",
  webServer: {
    command: "npm run test:web",
    url: `${baseURL}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      PORT,
      NODE_ENV: "test",
      JWT_SECRET: process.env.JWT_SECRET || "playwright-jwt-secret",
      REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET || "playwright-refresh-secret",
      CSRF_SECRET: process.env.CSRF_SECRET || "playwright-csrf-secret",
    },
  },
});
