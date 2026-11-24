/**
 * Total hours log method. Runs locally and on staging. Production stays on the read-only crawl.
 */
import { expect, test } from "@playwright/test";
import { deleteE2eEntries, loginAsAdmin, loginBearer } from "./helpers";

test.afterEach(async ({ request }) => {
  await deleteE2eEntries(request);
});

test("total hours saves a Total row without clock times", async ({ page }) => {
  const tenant = await loginAsAdmin(page);
  await page.goto("/log/own");
  await page.getByRole("tab", { name: "Manual" }).click();
  await expect(page.getByText("Add time manually")).toBeVisible();
  await page.getByRole("button", { name: "Total hours" }).click();
  await expect(page.getByLabel("Hours")).toBeVisible();
  await expect(page.getByLabel("Start")).toHaveCount(0);
  await expect(page.getByLabel("End")).toHaveCount(0);

  const notes = `e2e-total ${Date.now().toString(36)}`;
  await page.getByLabel("Notes").fill(notes);
  await page.getByLabel("Hours").fill("2:30");
  await page.getByRole("button", { name: "Save time" }).click();
  await expect(page.getByText("Time saved.")).toBeVisible();
  await page.getByRole("tab", { name: "Entries" }).click();
  await expect(page.getByText(notes, { exact: true })).toBeVisible();

  const session = await loginBearer(page.request);
  const today = new Date();
  const occurredOn = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const listed = await page.request.get(
    `/users/${session.user.id}/time-entries?tenantId=${tenant.id}&from=${occurredOn}&to=${occurredOn}&limit=100`,
    { headers: { authorization: `Bearer ${session.accessToken}` } },
  );
  expect(listed.ok(), await listed.text()).toBeTruthy();
  const matches = (
    (await listed.json()) as {
      items: {
        description: string | null;
        mode: string;
        durationMinutes: number | null;
        startedAt: string | null;
        endedAt: string | null;
      }[];
    }
  ).items.filter((item) => item.description === notes);
  expect(matches).toHaveLength(1);
  expect(matches[0].mode).toBe("Total");
  expect(matches[0].durationMinutes).toBe(150);
  expect(matches[0].startedAt).toBeNull();
  expect(matches[0].endedAt).toBeNull();

  await page.goto("/log/member");
  await expect(page.getByRole("button", { name: "Total hours" })).toBeVisible();
});
