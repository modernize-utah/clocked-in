/**
 * Multi-day time entry. Runs locally and on staging. Production stays on the read-only crawl.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { deleteE2eEntries, loginAsAdmin, loginBearer, sessionTenant } from "./helpers";

test.afterEach(async ({ request }) => {
  await deleteE2eEntries(request);
  await deleteRecentE2eEntries(request);
});

async function deleteRecentE2eEntries(request: APIRequestContext) {
  const session = await loginBearer(request);
  const tenant = await sessionTenant(request, session.accessToken);
  const today = new Date();
  const from = localDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 3));
  const headers = { authorization: `Bearer ${session.accessToken}` };
  const listed = await request.get(
    `/users/${session.user.id}/time-entries?tenantId=${tenant.id}&from=${from}&to=${localDate(today)}&limit=100`,
    { headers },
  );
  expect(listed.ok(), await listed.text()).toBeTruthy();
  const body = (await listed.json()) as { items: { id: string; description: string | null }[] };
  for (const entry of body.items) {
    if (!(entry.description ?? "").startsWith("e2e-")) continue;
    const deleted = await request.delete(`/time-entries/${entry.id}`, { headers });
    expect(deleted.ok(), await deleted.text()).toBeTruthy();
  }
}

function localDate(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

test("adding days saves the same entry once per day", async ({ page }) => {
  const tenant = await loginAsAdmin(page);
  await page.goto("/log/own");
  await page.getByRole("tab", { name: "Manual" }).click();
  await expect(page.getByText("Add time manually")).toBeVisible();

  const extraDay = page.getByRole("textbox", { name: "Additional day 2", exact: true });
  await page.getByRole("button", { name: "Add day", exact: true }).click();
  await expect(extraDay).toBeVisible();
  await page.getByRole("button", { name: "Remove additional day 2", exact: true }).click();
  await expect(extraDay).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save time" })).toBeVisible();

  await page.getByRole("button", { name: "Add day", exact: true }).click();
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const todayValue = localDate(today);
  const yesterdayValue = localDate(yesterday);
  await expect(page.getByRole("textbox", { name: "Date", exact: true })).toHaveValue(todayValue);
  await expect(extraDay).toHaveValue(yesterdayValue);

  const notes = `e2e-multi-day ${Date.now().toString(36)}`;
  await page.getByLabel("Notes").fill(notes);
  const save = page.getByRole("button", { name: "Save 2 days" });
  await expect(save).toBeEnabled();
  await extraDay.fill(todayValue);
  await save.click();
  await expect(page.getByText("Each day can only be saved once.")).toBeVisible();
  await expect(page.getByText("Time saved for 2 days.")).toHaveCount(0);

  await extraDay.fill(yesterdayValue);
  await save.click();
  await expect(page.getByText("Time saved for 2 days.")).toBeVisible();
  await expect(page.getByLabel("Notes")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Save time" })).toBeVisible();
  await page.getByRole("tab", { name: "Entries" }).click();
  await expect(page.getByText(notes, { exact: true })).toHaveCount(2);

  await page.goto(`/entries?from=${yesterdayValue}&to=${todayValue}`);
  await expect(page.getByText(notes, { exact: true })).toHaveCount(2);

  const session = await loginBearer(page.request);
  const listed = await page.request.get(
    `/users/${session.user.id}/time-entries?tenantId=${tenant.id}&from=${yesterdayValue}&to=${todayValue}&limit=100`,
    { headers: { authorization: `Bearer ${session.accessToken}` } },
  );
  expect(listed.ok(), await listed.text()).toBeTruthy();
  const matches = (
    (await listed.json()) as {
      items: {
        description: string | null;
        occurredOn: string;
        durationMinutes: number;
        projectId: string;
        taskCategoryId: string;
        organizationId: string | null;
        startedAt: string | null;
        endedAt: string | null;
      }[];
    }
  ).items.filter((item) => item.description === notes);
  expect(matches.map((item) => item.occurredOn).sort()).toEqual([yesterdayValue, todayValue].sort());
  expect(new Set(matches.map((item) => item.durationMinutes)).size).toBe(1);
  expect(new Set(matches.map((item) => item.projectId)).size).toBe(1);
  expect(new Set(matches.map((item) => item.taskCategoryId)).size).toBe(1);
  expect(new Set(matches.map((item) => item.organizationId)).size).toBe(1);
  expect(matches.every((item) => item.startedAt && item.endedAt)).toBeTruthy();

  await page.goto("/log/member");
  await expect(page.getByRole("button", { name: "Add day" })).toBeVisible();
});
