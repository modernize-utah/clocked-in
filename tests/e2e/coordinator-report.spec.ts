/**
 * Coordinator scoped report. Local named seed only.
 */
import { expect, test } from "@playwright/test";
import {
  createOrgPerson,
  deleteE2eEntries,
  deleteMembershipByEmail,
  loginAs,
  loginBearer,
  makeCoordinator,
} from "./helpers";

const stamp = Date.now().toString(36);
const coordinator = {
  firstName: "E2e",
  lastName: "Coordinator",
  email: `e2e.coord+${stamp}@example.com`,
  username: `e2ecoord${stamp}`,
  password: "coord-pass-99",
};
const member = {
  firstName: "E2e",
  lastName: "Grouped",
  email: `e2e.grouped+${stamp}@example.com`,
  username: `e2egrp${stamp}`,
  password: "grouped-pass-99",
};

test.afterEach(async ({ request }) => {
  await deleteE2eEntries(request);
});

test.afterAll(async ({ request }) => {
  await deleteMembershipByEmail(request, coordinator.email);
  await deleteMembershipByEmail(request, member.email);
});

test("coordinator logs for a group member and sees only that group on Reports", async ({ page, request }) => {
  const session = await loginBearer(request);
  const headers = { authorization: `Bearer ${session.accessToken}` };
  const created = await createOrgPerson(request, coordinator);
  const lookups = await request.get(`/tenants/${created.tenant.id}/lookups`, { headers });
  expect(lookups.ok(), await lookups.text()).toBeTruthy();
  const catalog = (await lookups.json()) as { organizations: { id: string; name: string }[] };
  const organization = catalog.organizations.find((item) => item.name === "Visual Arts Society") ?? catalog.organizations[0];
  expect(organization, "organization").toBeTruthy();
  const assigned = await request.patch(`/tenants/${created.tenant.id}/memberships/${created.membership.id}`, {
    headers, data: { organizationIds: [organization.id] },
  });
  expect(assigned.ok(), await assigned.text()).toBeTruthy();
  await makeCoordinator(request, created.membership.userId, organization.id);
  await createOrgPerson(request, { ...member, organizationIds: [organization.id] });

  await loginAs(page, coordinator.username, coordinator.password);
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByText("Group manager")).toBeVisible();
  await page.goto("/log/member");
  await expect(page.getByText("Add time for a member").filter({ visible: true })).toBeVisible();
  await page.getByRole("combobox", { name: /person/i }).click();
  await page.getByRole("option", { name: "E2e Grouped" }).click();
  await page.getByRole("button", { name: "Total hours" }).click();
  await page.getByLabel("Hours", { exact: true }).filter({ visible: true }).fill("1:00");
  await page.getByLabel("Notes", { exact: true }).filter({ visible: true }).fill(`e2e-coord ${stamp}`);
  await page.getByRole("button", { name: "Save time" }).click();
  await expect(page.getByText("Time saved.")).toBeVisible();

  await page.goto("/reports");
  await expect(page).toHaveURL(/\/reports\/[^/]+/);
  await expect(page.getByRole("button", { name: "Choose report" })).toBeVisible();
  await page.getByRole("button", { name: "Choose report" }).click();
  await expect(page.getByRole("menuitem", { name: "Summary" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText(organization.name, { exact: true }).first()).toBeVisible();
  const other = catalog.organizations.find((item) => item.id !== organization.id);
  if (other) {
    await expect(page.getByText(other.name, { exact: true })).toHaveCount(0);
  }
});
