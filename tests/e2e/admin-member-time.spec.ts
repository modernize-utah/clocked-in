/**
 * Admin logs member time; Volunteer Log Entered By is not the volunteer.
 * Local named seed only.
 */
import { expect, test } from "@playwright/test";
import {
  createOrgPerson,
  deleteE2eEntries,
  deleteMembershipByEmail,
  loginAs,
  loginAsAdmin,
  loginBearer,
  parseCsv,
} from "./helpers";

const stamp = Date.now().toString(36);
const person = {
  firstName: "E2e",
  lastName: "Memberlog",
  email: `e2e.memberlog+${stamp}@example.com`,
  username: `e2emlog${stamp}`,
  password: "member-pass-99",
};

test.afterEach(async ({ request }) => {
  await deleteE2eEntries(request);
});

test.afterAll(async ({ request }) => {
  await deleteMembershipByEmail(request, person.email);
});

test("admin logs member time and Entered By is not the volunteer", async ({ page, request }) => {
  const created = await createOrgPerson(request, person);
  await loginAsAdmin(page);
  await page.goto("/log/member");
  await expect(page.getByText("Add time for a member").filter({ visible: true })).toBeVisible();
  await page.getByRole("combobox", { name: /person/i }).click();
  await page.getByRole("option", { name: "E2e Memberlog" }).click();
  await page.getByRole("button", { name: "Total hours" }).click();
  await page.getByLabel("Hours", { exact: true }).filter({ visible: true }).fill("1:30");
  await page.getByLabel("Notes", { exact: true }).filter({ visible: true }).fill(`e2e-member-log ${stamp}`);
  await page.getByRole("button", { name: "Save time" }).click();
  await expect(page.getByText("Time saved.")).toBeVisible();

  await loginAs(page, person.username, person.password);
  await page.goto("/log/own");
  await page.getByRole("tab", { name: "Entries" }).click();
  await expect(page.getByText(`e2e-member-log ${stamp}`).filter({ visible: true })).toBeVisible();
  await expect(page.getByText("entered by an admin")).toBeVisible();

  const session = await loginBearer(request);
  const csv = await page.request.get(`/tenants/${created.tenant.id}/time-entries.csv`, {
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  expect(csv.ok(), await csv.text()).toBeTruthy();
  const rows = parseCsv(await csv.text());
  const row = rows.find((item) => item.some((cell) => cell.includes(`e2e-member-log ${stamp}`)));
  expect(row, "csv row").toBeTruthy();
  expect(row?.[2]).toBe("E2e Memberlog");
  expect(row?.[14]).toBe("Jason Baddley");
  expect(row?.[14]).not.toBe(row?.[2]);
});
