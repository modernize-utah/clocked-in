import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import {
  acceptInvite,
  assertError,
  assertList,
  assertMoney,
  callApi,
  createJson,
  inKind,
  label,
  signUp,
  suite,
} from "./client.mjs";

describe("handwritten classification and paid time", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.admin = await signUp("payadmin", { firstName: "Ada", lastName: "Admin" });
    ctx.staff = await signUp("paystaff", { firstName: "Sam", lastName: "Staff" });
    ctx.paid = await signUp("payperson", { firstName: "Paid", lastName: "Staffer" });
    ctx.volunteer = await signUp("payvol", { firstName: "Vera", lastName: "Volunteer" });
    ctx.org = await createJson(ctx.admin.accessToken, "/tenants", { name: label("Payroll org") });
    ctx.category = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/task-categories`, {
      name: label("Grant category"),
    });
    ctx.project = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/projects`, {
      title: label("Grant project"),
      accessType: "Public",
    });
    for (const person of [ctx.staff, ctx.paid]) {
      await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/invitations`, {
        email: person.email,
        role: "MEMBER",
      });
      await acceptInvite(person.accessToken, person.email);
    }
    await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/invitations`, {
      email: ctx.volunteer.email,
      role: "VOLUNTEER",
    });
    await acceptInvite(ctx.volunteer.accessToken, ctx.volunteer.email);
    const rates = await callApi(`/tenants/${ctx.org.id}/hourly-rates`, { token: ctx.admin.accessToken });
    assertList(rates.json);
    ctx.defaultRate = rates.json.items.find((item) => item.isDefault);
    ctx.paidRate = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/hourly-rates`, {
      type: "Paid",
      name: "Hourly pay",
      perHourRate: 20,
    });
  });

  test("duration and total require a project and a task category", async () => {
    const missingProject = await callApi("/time/total", {
      method: "POST",
      token: ctx.admin.accessToken,
      body: {
        tenantId: ctx.org.id,
        taskCategoryId: ctx.category.id,
        durationMinutes: 60,
        occurredOn: "2026-11-01",
      },
    });
    const missingCategory = await callApi("/time/duration", {
      method: "POST",
      token: ctx.admin.accessToken,
      body: {
        tenantId: ctx.org.id,
        projectId: ctx.project.id,
        durationMinutes: 30,
        occurredOn: "2026-11-01",
      },
    });
    assertError(missingProject, 400, "validation_error", "Choose a project and a task category.");
    assertError(missingCategory, 400, "validation_error", "Choose a project and a task category.");

    const total = await createJson(ctx.admin.accessToken, "/time/total", {
      tenantId: ctx.org.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      durationMinutes: 90,
      occurredOn: "2026-11-01",
    });
    assert.equal(total.mode, "Total");
    assert.equal(total.projectId, ctx.project.id);
    assert.equal(total.taskCategoryId, ctx.category.id);
    assert.equal(total.durationMinutes, 90);

    const clockIn = await createJson(ctx.volunteer.accessToken, "/time/clock-in", {
      tenantId: ctx.org.id,
    });
    assert.equal(clockIn.mode, "Punch");
    assert.equal(clockIn.projectId, null);
    assert.equal(clockIn.taskCategoryId, null);
    const clockOut = await createJson(ctx.volunteer.accessToken, "/time/clock-out", {}, 200);
    assert.equal(clockOut.projectId, null);
    assert.equal(clockOut.endedAt === null, false);
  });

  test("paid hours are gross pay and stay out of the grant packet", async () => {
    const memberships = await callApi(`/tenants/${ctx.org.id}/memberships`, { token: ctx.admin.accessToken });
    const paidMembership = memberships.json.items.find((item) => item.userId === ctx.paid.user.id);
    const missingRate = await callApi(`/tenants/${ctx.org.id}/memberships/${paidMembership.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { rateType: "Paid" },
    });
    assertError(missingRate, 400, "validation_error", "professionalBillingRate is required when rateType is Paid.");
    const updated = await callApi(`/tenants/${ctx.org.id}/memberships/${paidMembership.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { rateType: "Paid", professionalBillingRate: 20 },
    });
    assert.equal(updated.status, 200, updated.text);
    assert.equal(updated.json.rateType, "Paid");

    const wrongRate = await callApi("/time/total", {
      method: "POST",
      token: ctx.paid.accessToken,
      body: {
        tenantId: ctx.org.id,
        projectId: ctx.project.id,
        taskCategoryId: ctx.category.id,
        durationMinutes: 60,
        occurredOn: "2026-11-02",
        hourlyRateId: ctx.defaultRate.id,
      },
    });
    assertError(wrongRate, 400, "validation_error", "Choose a paid hourly rate.");

    const entry = await createJson(ctx.paid.accessToken, "/time/total", {
      tenantId: ctx.org.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      durationMinutes: 60,
      occurredOn: "2026-11-02",
    });
    assert.equal(entry.hourlyRateId, ctx.paidRate.id);
    assertMoney(entry.hourlyRate, 20);
    assertMoney(entry.inKindValue, 0);

    const volunteerEntry = await createJson(ctx.volunteer.accessToken, "/time/duration", {
      tenantId: ctx.org.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      durationMinutes: 60,
      occurredOn: "2026-11-02",
      hourlyRateId: ctx.paidRate.id,
    });
    assert.equal(volunteerEntry.hourlyRateId, ctx.defaultRate.id);
    assertMoney(volunteerEntry.hourlyRate, 35.47);
    assertMoney(volunteerEntry.inKindValue, inKind(60));

    const report = await callApi(`/tenants/${ctx.org.id}/report`, {
      token: ctx.admin.accessToken,
      query: { from: "2026-11-02", to: "2026-11-02" },
    });
    assert.equal(report.status, 200, report.text);
    assertMoney(report.json.user.hours, 1);
    assert.equal(report.json.staff.hours, 0);

    const summary = await callApi(`/tenants/${ctx.org.id}/summary.csv`, {
      token: ctx.admin.accessToken,
      query: { from: "2026-11-02", to: "2026-11-02" },
    });
    const log = await callApi(`/tenants/${ctx.org.id}/time-entries.csv`, {
      token: ctx.admin.accessToken,
      query: { from: "2026-11-02", to: "2026-11-02" },
    });
    assert.equal(summary.status, 200, summary.text);
    assert.equal(log.status, 200, log.text);
    assert.equal(summary.text.includes("Paid Staffer"), false);
    assert.equal(log.text.includes("Paid Staffer"), false);
    assert.equal(summary.text.includes("Vera Volunteer"), true);

    const denied = await callApi(`/tenants/${ctx.org.id}/payroll`, {
      token: ctx.staff.accessToken,
      query: { from: "2026-11-02", to: "2026-11-02" },
    });
    assertError(denied, 403, "forbidden", "Forbidden.");

    const payroll = await callApi(`/tenants/${ctx.org.id}/payroll`, {
      token: ctx.admin.accessToken,
      query: { from: "2026-11-02", to: "2026-11-02" },
    });
    assert.equal(payroll.status, 200, payroll.text);
    assertMoney(payroll.json.hours, 1);
    assertMoney(payroll.json.grossPay, 20);
    assert.equal(payroll.json.people, 1);
    assert.equal(payroll.json.rows.length, 1);
    assert.equal(payroll.json.rows[0].person, "Paid Staffer");
    assertMoney(payroll.json.rows[0].payRate, 20);
    assertMoney(payroll.json.rows[0].grossPay, 20);

    const csv = await callApi(`/tenants/${ctx.org.id}/payroll.csv`, {
      token: ctx.admin.accessToken,
      query: { from: "2026-11-02", to: "2026-11-02" },
    });
    assert.equal(csv.status, 200, csv.text);
    assert.match(csv.text, /Paid Staffer/);
    assert.match(csv.text, /20\.00/);
  });
});
