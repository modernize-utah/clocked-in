/**
 * Spreadsheet vs app gaps (do not "fix" the product in this suite):
 * - Spreadsheet Summary by volunteer does not match byPerson / log hours; it matches byVolunteer
 *   (Participant Hours are omitted from volunteer hours but still counted in in-kind).
 * - UI hours round to 2 decimals (formatNumber / formatCurrency); JSON keeps 5.
 * - Blank group, CASWJ, and the casWJ typo fold into the org bucket, not a organization named CASWJ.
 * - The unnamed 25h row is an entry but not a unique volunteer.
 * - Seeded volunteer passwords are random; only jbaddley is a known login.
 * - Group sessions are unused; people totals stay separate from collective.
 * - Log time lives at /log/own, /log/member, and /log/group. /log redirects to /log/own.
 * - Real names live in the local seed DB; do not run this suite against production.
 */
import { expect, test } from "@playwright/test";
import {
  expectedCaswjReport,
  hoursCell,
  loadCaswjWorkbook,
  type ExpectedCaswjReport,
} from "../../scripts/caswj-workbook";
import { formatCurrency, formatNumber } from "../../src/lib/format";
import {
  cardNamed,
  cardTitle,
  deleteE2eEntries,
  expectGroups,
  extraNotes,
  getCsv,
  getReport,
  loginAsAdmin,
  openReports,
  parseCsv,
  selectReportsTab,
} from "./helpers";

test.describe.configure({ mode: "serial" });

const volunteerLogHeader = [
  "Date",
  "Project / Event",
  "Volunteer",
  "Group / Tenant",
  "Task Category",
  "Entry Method",
  "Start Time",
  "End Time",
  "Manual Duration",
  "Hours",
  "Rate Type",
  "Hourly Rate",
  "In-Kind Value",
  "Tags",
  "Entered By",
  "Date Entered",
  "Hour Attribution",
  "Notes",
  "Volunteer ID",
];

let expected: ExpectedCaswjReport;
let memberNumber = new Map<string, string>();

test.beforeAll(async () => {
  const workbook = await loadCaswjWorkbook();
  expected = expectedCaswjReport(workbook);
  memberNumber = new Map(
    [...workbook.people.values()].map((person) => [person.displayName.toLowerCase(), person.memberNumber]),
  );
});

test.beforeEach(async ({ request }) => {
  await deleteE2eEntries(request);
});

test.afterEach(async ({ request }) => {
  await deleteE2eEntries(request);
});

test("report JSON matches the seed mapping", async ({ page }) => {
  const tenant = await openReports(page);
  const report = await getReport(page.request, tenant.id);
  expect(expected.entries).toBe(249);
  expect(report.user.hours).toBe(expected.hours);
  expect(report.user.volunteers).toBe(expected.volunteers);
  expect(report.user.entries).toBe(expected.entries);
  expect(report.user.inKind).toBeCloseTo(expected.inKind, 2);
  expectGroups(report.user.byOrganization, expected.byOrganization, { volunteers: true, id: "organization" });
  expectGroups(report.user.byCategory, expected.byCategory, { volunteers: true });
  expectGroups(report.user.byPerson, expected.byPerson);
  expectGroups(report.user.byVolunteer, expected.byVolunteer);
  expectGroups(report.user.byProject, expected.byProject, { volunteers: true });
  expectGroups(report.user.byMonth ?? [], expected.byMonth, { id: "month" });
  expect(report.collective.hours).toBe(0);
  expect(report.collective.inKind).toBe(0);
  expect(report.collective.entries).toBe(0);
  expect(report.collective.byOrganization).toEqual([]);
  expect(report.collective.byCategory).toEqual([]);
  expect(report.collective.byProject).toEqual([]);

  const nearZero = expected.byVolunteer.filter((row) => row.hours === 0);
  for (const row of nearZero) {
    expect(report.user.byVolunteer.find((item) => item.label === row.label)?.hours).toBe(0);
  }
});

test("Summary tab shows seed totals, labels, and volunteer hours", async ({ page }) => {
  await openReports(page);
  await expect(page.getByRole("button", { name: "Choose report" })).toHaveText("Summary");
  await expect(page.getByText("Total volunteer hours", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(formatNumber(expected.hours), { exact: true }).first()).toBeVisible();
  await expect(page.getByText(formatCurrency(expected.inKind), { exact: true }).first()).toBeVisible();
  await expect(page.getByText(String(expected.volunteers), { exact: true }).first()).toBeVisible();
  await expect(page.getByText(String(expected.entries), { exact: true }).first()).toBeVisible();
  await expect(cardTitle(page, "Hours by organization")).toBeVisible();
  await expect(cardTitle(page, "Hours by task category")).toBeVisible();
  await expect(cardTitle(page, "Hours by volunteer")).toBeVisible();
  await expect(cardTitle(page, "Hours by project")).toBeVisible();
  await expect(cardTitle(page, "Hours by month")).toBeVisible();
  await expect(cardTitle(page, "In-kind by month")).toBeVisible();

  const alex = expected.byVolunteer.find((row) => /^alex\b/i.test(row.label));
  if (alex) {
    expect(alex.hours).toBe(0);
  }
});

test("People tab tables match seed rollups by label", async ({ page }) => {
  await openReports(page);
  await selectReportsTab(page, "People");
  await expect(cardTitle(page, "By person")).toBeVisible();
  await expectTable(page, "By project", expected.byProject, true);
  await expectTable(page, "By person", expected.byPerson, false);
  await expectTable(page, "By organization", expected.byOrganization, true);
  await expectTable(page, "By task category", expected.byCategory, true);
});

test("Group sessions tab is empty for the seed", async ({ page }) => {
  await openReports(page);
  await selectReportsTab(page, "Group sessions");
  await expect(page.getByText("Hours", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("0", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("$0.00").first()).toBeVisible();
  await expect(page.getByText("No hours in this period.").first()).toBeVisible();
});

test("Volunteer Log CSV matches labeled columns and 249 seed rows", async ({ page }) => {
  const tenant = await openReports(page);
  const csv = parseCsv(await getCsv(page.request, tenant.id, "log"));
  expect(csv[0]).toEqual(volunteerLogHeader);
  const rows = csv.slice(1);
  expect(rows).toHaveLength(expected.entries);
  for (const row of rows) {
    expect(row[5]).toBe("Total Hours");
    expect(row[10]).toBe(Number(row[11]) === 0 ? "" : "Utah Volunteer Rate");
    expect(row[16]).toBe("");
    const volunteer = row[2];
    if (!volunteer) {
      expect(row[18]).toBe("");
      continue;
    }

    expect(row[18]).toBe(memberNumber.get(volunteer.toLowerCase()) ?? "");
  }
});

test("Summary CSV KPIs and tables follow report rollups including byVolunteer", async ({ page }) => {
  const tenant = await openReports(page);
  const csv = parseCsv(await getCsv(page.request, tenant.id, "summary"));
  expect(csv[0]).toEqual(["Total Volunteer Hours", hoursCell(Math.round(expected.hours * 60))]);
  expect(csv[1]).toEqual(["Total In-Kind Value", expected.inKind.toFixed(2)]);
  expect(csv[2]).toEqual(["Unique Volunteers", String(expected.volunteers)]);
  expect(csv[3]).toEqual(["Total Entries", String(expected.entries)]);
  expectSummaryTable(csv, "Tenant", "Volunteer Hours", expected.byOrganization);
  expectSummaryTable(csv, "Task Category", "Volunteer Hours", expected.byCategory);
  expectSummaryTable(csv, "Month", "Volunteer Hours", expected.byMonth);
  expectSummaryTable(csv, "Volunteer", "Total Hours", expected.byVolunteer);
  expectSummaryTable(csv, "Project / Event", "Volunteer Hours", expected.byProject);
});

test("log form can add an e2e- Duration row that cleanup removes", async ({ page }) => {
  const tenant = await loginAsAdmin(page);
  const before = await getReport(page.request, tenant.id);
  expect(before.user.entries).toBe(expected.entries);
  await page.goto("/log/own");
  await expect(page.getByRole("heading", { name: "Log time", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Log Own Time" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("tab", { name: "Manual" }).click();
  await expect(page.getByText("Add time manually").filter({ visible: true })).toBeVisible();
  await page.getByRole("link", { name: "Log Member Time" }).click();
  await expect(page).toHaveURL(/\/log\/member$/);
  await expect(page.getByText("Add time for a member").filter({ visible: true })).toBeVisible();
  await page.getByRole("link", { name: "Log Group Time" }).click();
  await expect(page).toHaveURL(/\/log\/group$/);
  await expect(page.getByText("Record a session").filter({ visible: true })).toBeVisible();
  await page.getByRole("link", { name: "Log Own Time" }).click();
  await expect(page).toHaveURL(/\/log\/own$/);
  await page.getByRole("tab", { name: "Manual" }).click();
  const notes = page.getByLabel("Notes").filter({ visible: true });
  const save = page.getByRole("button", { name: "Save time" }).filter({ visible: true });
  await page.getByLabel("Duration", { exact: true }).filter({ visible: true }).fill("1:00");
  await expect(save).toBeEnabled();
  await notes.fill(extraNotes);
  await save.click();
  await expect(page.getByText("Time saved.")).toBeVisible();
  await page.getByRole("tab", { name: "Entries" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: extraNotes })).toBeVisible();
  await expect
    .poll(async () => (await getReport(page.request, tenant.id)).user.entries)
    .toBe(expected.entries + 1);
  const after = await getReport(page.request, tenant.id);
  expect(after.user.hours).toBeGreaterThan(before.user.hours);
});

async function expectTable(
  page: Parameters<typeof openReports>[0],
  title: string,
  rows: typeof expected.byPerson,
  showVolunteers: boolean,
) {
  const card = cardNamed(page, title);
  await expect(card.locator("[data-slot='card-title']", { hasText: title })).toBeVisible();
  const showType = title.startsWith("By project");
  await expect(card.getByRole("columnheader", { name: "Type" })).toHaveCount(showType ? 1 : 0);
  for (const row of rows) {
    const line = card.getByRole("row").filter({ hasText: row.label });
    await expect(line.first()).toBeVisible();
    await expect(line.first()).toContainText(formatNumber(row.hours));
    await expect(line.first()).toContainText(formatCurrency(row.inKind));
    if (showVolunteers) {
      await expect(line.first()).toContainText(String(row.volunteers));
    }
  }
}

function expectSummaryTable(
  csv: string[][],
  title: string,
  hoursHeader: string,
  rows: { label: string; hours: number; inKind: number }[],
) {
  const start = csv.findIndex((row) => row[0] === title && row[1] === hoursHeader && row[2] === "In-Kind Value");
  expect(start, `${title} table`).toBeGreaterThan(-1);
  const body = csv.slice(start + 1, start + 1 + rows.length);
  expect(body).toEqual(
    rows.map((row) => [row.label, hoursCell(Math.round(row.hours * 60)), row.inKind.toFixed(2)]),
  );
}

