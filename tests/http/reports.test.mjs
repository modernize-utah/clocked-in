import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import {
  acceptInvite,
  assertError,
  assertMoney,
  callApi,
  createJson,
  label,
  signUp,
  suite,
} from "./client.mjs";

describe("reports", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.admin = await signUp("reportadmin");
    ctx.member = await signUp("reportmember");
    ctx.outsider = await signUp("reportout");
    ctx.org = await createJson(ctx.admin.accessToken, "/tenants", { name: label("Report org") });
    ctx.tenant = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/tenants`, {
      name: label("Report organization"),
    });
    ctx.category = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/task-categories`, {
      name: label("Report category"),
    });
    ctx.project = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/projects`, {
      title: label("Report project"),
      accessType: "Public",
    });
    ctx.tag = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/tags`, { name: label("Report tag") });
    await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/invitations`, {
      email: ctx.member.email,
      role: "MEMBER",
    });
    await acceptInvite(ctx.member.accessToken, ctx.member.email);
  });

  test("report separates user totals from collective totals", async () => {
    const empty = await callApi(`/tenants/${ctx.org.id}/report`, { token: ctx.member.accessToken });
    assert.equal(empty.status, 200);
    assert.equal(empty.json.user.hours, 0);
    assert.equal(empty.json.user.entries, 0);
    assert.equal(empty.json.user.volunteers, 0);
    assert.equal(empty.json.user.inKind, 0);
    assert.deepEqual(empty.json.user.byPerson, []);
    assert.deepEqual(empty.json.user.byVolunteer, []);
    assert.deepEqual(empty.json.user.byMonth, []);
    assert.equal(empty.json.staff.hours, 0);
    assert.equal(empty.json.staff.entries, 0);
    assert.equal(empty.json.collective.hours, 0);
    assert.equal(empty.json.collective.entries, 0);
    assert.equal(empty.json.collective.byPerson, undefined);

    await createJson(ctx.member.accessToken, "/time/duration", {
      tenantId: ctx.org.id,
      organizationId: ctx.tenant.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      durationMinutes: 90,
      occurredOn: "2026-10-01",
      description: "Notes",
      tagIds: [ctx.tag.id],
    });
    await createJson(ctx.admin.accessToken, "/collective-time-entries", {
      tenantId: ctx.org.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      startedAt: "2026-10-01T12:00:00.000Z",
      endedAt: "2026-10-01T14:00:00.000Z",
      participantCount: 1,
    });
    const response = await callApi(`/tenants/${ctx.org.id}/report`, {
      token: ctx.member.accessToken,
      query: { from: "2026-10-01", to: "2026-10-31", userId: ctx.member.user.id },
    });
    assert.equal(response.status, 200);
    assert.equal(response.json.user.hours, 1.5);
    assert.equal(response.json.user.entries, 1);
    assert.equal(response.json.user.volunteers, 1);
    assertMoney(response.json.user.inKind, 53.21);
    assert.equal(response.json.user.byPerson[0].label, "Ada Lovelace");
    assert.equal(response.json.user.byOrganization[0].label, ctx.tenant.name);
    assert.equal(response.json.user.byProject[0].label, ctx.project.title);
    assert.equal(response.json.user.byProject[0].projectType, "Project");
    assert.equal(response.json.user.byCategory[0].id, ctx.category.id);
    assert.equal(response.json.user.byVolunteer[0].label, "Ada Lovelace");
    assert.equal(response.json.user.byVolunteer[0].hours, 1.5);
    assert.equal(response.json.user.byMonth[0].label, "October");
    assert.equal(response.json.user.byMonth[0].hours, 1.5);
    assert.equal(response.json.collective.entries, 1);
    assert.equal(response.json.collective.hours, 2);
    assertMoney(response.json.collective.inKind, 70.94);
    assert.equal(response.json.collective.byProject[0].label, ctx.project.title);
    assert.equal(response.json.collective.byProject[0].projectType, "Project");
    const outsider = await callApi(`/tenants/${ctx.org.id}/report`, { token: ctx.outsider.accessToken });
    const badDate = await callApi(`/tenants/${ctx.org.id}/report`, {
      token: ctx.member.accessToken,
      query: { from: "October" },
    });
    const unauthenticated = await callApi(`/tenants/${ctx.org.id}/report`);
    assertError(outsider, 403, "forbidden", "Forbidden.");
    assertError(badDate, 400, "validation_error", "from must be a date.");
    assertError(unauthenticated, 401, "unauthorized", "Authentication is required.");
  });

  test("csv exports the filtered user log", async () => {
    const response = await callApi(`/tenants/${ctx.org.id}/time-entries.csv`, {
      token: ctx.member.accessToken,
      query: { projectId: ctx.project.id },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/csv/);
    const lines = response.text.trim().split(/\r?\n/);
    assert.equal(
      lines[0],
      "Date,Project,Volunteer,Organization / Tenant,Task category,Entry Method,Start Time,End Time,Manual Duration,Hours,Rate Type,Hourly Rate,In-Kind Value,Tags,Entered By,Date Entered,Hour Attribution,Notes,Volunteer ID",
    );
    const row = lines.find((line) => line.startsWith("10/1/2026,"));
    assert.ok(row, response.text);
    assert.match(row, new RegExp(escapeRegExp(ctx.project.title)));
    assert.match(row, /Ada Lovelace/);
    assert.match(row, /Duration/);
    assert.match(row, /,1:30,/);
    assert.match(row, /,1\.5,/);
    assert.match(row, /Volunteer/);
    assert.match(row, /35\.47/);
    assert.match(row, /53\.21/);
    assert.match(row, new RegExp(escapeRegExp(ctx.tag.name)));
    assert.match(row, /Notes/);
    const outsider = await callApi(`/tenants/${ctx.org.id}/time-entries.csv`, { token: ctx.outsider.accessToken });
    assertError(outsider, 403, "forbidden", "Forbidden.");
  });

  test("summary csv stacks the workbook tables", async () => {
    const response = await callApi(`/tenants/${ctx.org.id}/summary.csv`, {
      token: ctx.admin.accessToken,
      query: { from: "2026-10-01", to: "2026-10-31" },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/csv/);
    assert.match(response.text, /Total Volunteer Hours,1\.5/);
    assert.match(response.text, /Total In-Kind Value,53\.21/);
    assert.match(response.text, /Unique Volunteers,1/);
    assert.match(response.text, /Total Entries,1/);
    assert.match(response.text, /Tenant,Volunteer Hours,In-Kind Value/);
    assert.match(response.text, /Task category,Volunteer Hours,In-Kind Value/);
    assert.match(response.text, /Month,Volunteer Hours,In-Kind Value/);
    assert.match(response.text, /Volunteer,Total Hours,In-Kind Value/);
    assert.match(response.text, /Project,Volunteer Hours,In-Kind Value/);
    assert.match(response.text, /October,1\.5,53\.21/);
    const outsider = await callApi(`/tenants/${ctx.org.id}/summary.csv`, { token: ctx.outsider.accessToken });
    assertError(outsider, 403, "forbidden", "Forbidden.");
  });

  test("professional hours stay out of volunteer KPIs", async () => {
    const professional = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/hourly-rates`, {
      type: "Professional",
      name: label("Counsel rate"),
      perHourRate: 90,
    });
    await createJson(ctx.admin.accessToken, "/time/duration", {
      tenantId: ctx.org.id,
      userId: ctx.member.user.id,
      organizationId: ctx.tenant.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      durationMinutes: 60,
      occurredOn: "2026-10-02",
      hourlyRateId: professional.id,
    });
    const response = await callApi(`/tenants/${ctx.org.id}/report`, {
      token: ctx.admin.accessToken,
      query: { from: "2026-10-01", to: "2026-10-31" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.json.user.hours, 1.5);
    assert.equal(response.json.user.entries, 1);
    assert.equal(response.json.staff.hours, 1);
    assert.equal(response.json.staff.entries, 1);
    assertMoney(response.json.staff.inKind, 90);
  });

  test("a organization admin only sees that organization in reports", async () => {
    const coordinator = await signUp("reportcoord");
    await createJson(ctx.admin.accessToken, `/tenants/${ctx.tenant.id}/invitations`, {
      email: coordinator.email,
      role: "ADMIN",
    });
    await acceptInvite(coordinator.accessToken, coordinator.email);
    const scoped = await callApi(`/tenants/${ctx.org.id}/report`, { token: coordinator.accessToken });
    assert.equal(scoped.status, 200);
    assert.equal(scoped.json.user.hours, 1.5);
    assert.equal(scoped.json.user.entries, 1);
    assert.equal(scoped.json.collective.entries, 0);
    const other = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/tenants`, {
      name: label("Other report organization"),
    });
    const forbiddenDept = await callApi(`/tenants/${ctx.org.id}/report`, {
      token: coordinator.accessToken,
      query: { organizationId: other.id },
    });
    assertError(forbiddenDept, 403, "forbidden", "Forbidden.");
  });

  test("view csv exports the current report breakdown", async () => {
    const response = await callApi(`/tenants/${ctx.org.id}/view.csv`, {
      token: ctx.admin.accessToken,
      query: { from: "2026-10-01", to: "2026-10-31" },
    });
    assert.equal(response.status, 200, response.text);
    assert.match(response.headers.get("content-type") ?? "", /^text\/csv/);
    assert.match(response.text, /Label,Hours,In-kind/);
    assert.match(response.text, new RegExp(escapeRegExp(ctx.project.title)));
  });

  test("comma-separated organization ids return the union", async () => {
    const first = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/tenants`, {
      name: label("Union organization A"),
    });
    const second = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/tenants`, {
      name: label("Union organization B"),
    });
    for (const [organization, minutes] of [
      [first, 60],
      [second, 30],
    ]) {
      await createJson(ctx.admin.accessToken, "/time/duration", {
        tenantId: ctx.org.id,
        userId: ctx.member.user.id,
        organizationId: organization.id,
        projectId: ctx.project.id,
        taskCategoryId: ctx.category.id,
        durationMinutes: minutes,
        occurredOn: "2027-03-02",
      });
    }
    const hours = async (organizationId) => {
      const response = await callApi(`/tenants/${ctx.org.id}/report`, {
        token: ctx.admin.accessToken,
        query: { from: "2027-03-01", to: "2027-03-31", organizationId },
      });
      assert.equal(response.status, 200, response.text);
      return response.json.user.hours;
    };
    assert.equal(await hours(first.id), 1);
    assert.equal(await hours(second.id), 0.5);
    assert.equal(await hours(`${first.id},${second.id}`), 1.5);
    const invalid = await callApi(`/tenants/${ctx.org.id}/report`, {
      token: ctx.admin.accessToken,
      query: { organizationId: `${first.id},nope` },
    });
    assertError(invalid, 400, "validation_error", "organizationId must be an id.");
  });
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
