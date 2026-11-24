/**
 * Admin opens External systems settings and sees authority + sync fields.
 * Local seed only — skipped in prod.
 */
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe.configure({ mode: "serial" });

test("admin can open external systems settings", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/settings/external");

  await expect(page.getByRole("heading", { name: "Authentication authority" })).toBeVisible();
  await expect(page.getByLabel("Authentication authority URL")).toBeVisible();
  await expect(page.getByRole("heading", { name: "People and roles" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tenant and groups" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save external systems" })).toBeVisible();
});
