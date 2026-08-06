import { test, expect } from "@playwright/test";

test("admin can log in and reach reports", async ({ page }) => {
  await page.goto("/html/index.html");
  const loginForm = page.locator("#login-form");
  await loginForm.waitFor({ state: "visible" });

  await page.fill("input[name='email']", "admin@example.com");
  await page.fill("input[name='password']", "Passw0rd!");
  await page.click("#login-form button[type='submit']");

  const userBadge = page.locator("#user-display");
  await expect(userBadge).toContainText("Seeded Administrator", { timeout: 10000 });

  await page.goto("/html/reports.html");
  const reportsHeading = page.locator("h1.page-title");
  await expect(reportsHeading).toHaveText(/Reports & Dashboards/i);

  const savedReports = page.locator("#saved-reports-list li");
  await expect(savedReports.first()).toBeVisible();
});
