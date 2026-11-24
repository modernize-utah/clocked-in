import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { assertError, callApi, createJson, label, missingId, signUp, suite } from "./client.mjs";

describe("formats / reports and csv", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.admin = await signUp("formatadmin");
    ctx.org = await createJson(ctx.admin.accessToken, "/tenants", { name: label("Format org") });
    const patched = await callApi(`/tenants/${ctx.org.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { volunteerHourlyRate: 40 },
    });
    assert.equal(patched.status, 200);
    ctx.project = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/projects`, {
      title: label("Format project"),
      accessType: "Public",
    });
    ctx.category = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/task-categories`, {
      name: label("Format category"),
    });
    ctx.lower = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/tags`, { name: label("beta") });
    ctx.upper = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/tags`, { name: label("Alpha") });
  });

  test("csv rows use fixed number, time, and tag formats", async () => {
    await createJson(ctx.admin.accessToken, "/time/duration", {
      tenantId: ctx.org.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      startedAt: "2026-09-01T10:00:00Z",
      endedAt: "2026-09-01T10:20:00Z",
      durationMinutes: 20,
      occurredOn: "2026-09-01",
      description: "Plain",
      tagIds: [ctx.lower.id, ctx.upper.id],
    });
    await createJson(ctx.admin.accessToken, "/time/total", {
      tenantId: ctx.org.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      durationMinutes: 90,
      occurredOn: "2026-09-02",
    });
    const response = await callApi(`/tenants/${ctx.org.id}/time-entries.csv`, {
      token: ctx.admin.accessToken,
      query: { from: "2026-09-01", to: "2026-09-02" },
    });
    assert.equal(response.status, 200);
    const lines = response.text.split("\n");
    assert.equal(lines.length, 3);
    const stamp = /,Ada Lovelace,\d{1,2}\/\d{1,2}\/\d{4},/;
    const duration = lines[1].replace(stamp, ",Ada Lovelace,STAMP,");
    const total = lines[2].replace(stamp, ",Ada Lovelace,STAMP,");
    const fixed = `${ctx.project.title},Ada Lovelace,${ctx.org.name},${ctx.category.name}`;
    assert.equal(
      duration,
      `9/1/2026,${fixed},Start / End Time,10:00 AM,10:20 AM,0:20,0.33333,Volunteer,40.00,13.33,"${ctx.upper.name}, ${ctx.lower.name}",Ada Lovelace,STAMP,,Plain,`,
    );
    assert.equal(total, `9/2/2026,${fixed},Total Hours,,,1:30,1.5,Volunteer,40.00,60.00,,Ada Lovelace,STAMP,,,`);
  });

  test("collective minutes round half up and in-kind is exact", async () => {
    const entry = await createJson(ctx.admin.accessToken, "/collective-time-entries", {
      tenantId: ctx.org.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      startedAt: "2026-09-03T10:00:00Z",
      endedAt: "2026-09-03T10:00:30Z",
      participantCount: 3,
    });
    assert.equal(entry.inKindValue, 1);
    const response = await callApi(`/tenants/${ctx.org.id}/report`, {
      token: ctx.admin.accessToken,
      query: { from: "2026-09-03", to: "2026-09-03" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.json.collective.hours, 0.01667);
    assert.equal(response.json.collective.inKind, 1);
    assert.deepEqual(response.json.collective.byProject, [
      {
        id: ctx.project.id,
        label: ctx.project.title,
        hours: 0.01667,
        volunteers: 0,
        entries: 1,
        inKind: 1,
        projectType: "Project",
      },
    ]);
  });

  test("groups with equal hours sort by label using code units", async () => {
    const apple = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/task-categories`, {
      name: label("apple"),
    });
    const banana = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/task-categories`, {
      name: label("Banana"),
    });
    for (const category of [apple, banana]) {
      await createJson(ctx.admin.accessToken, "/time/total", {
        tenantId: ctx.org.id,
        projectId: ctx.project.id,
        taskCategoryId: category.id,
        durationMinutes: 60,
        occurredOn: "2026-09-04",
      });
    }
    const response = await callApi(`/tenants/${ctx.org.id}/report`, {
      token: ctx.admin.accessToken,
      query: { from: "2026-09-04", to: "2026-09-04" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(
      response.json.user.byCategory.map((bucket) => bucket.id),
      [banana.id, apple.id],
    );
    assert.deepEqual(response.json.user.byCategory[0], {
      id: banana.id,
      label: banana.name,
      hours: 1,
      volunteers: 1,
      entries: 1,
      inKind: 40,
    });
  });
});

describe("formats / request handling order", suite, () => {
  test("a bad query is rejected before the access check", async () => {
    const owner = await signUp("orderowner");
    const outsider = await signUp("orderout");
    const org = await createJson(owner.accessToken, "/tenants", { name: label("Order org") });
    const forbidden = await callApi(`/tenants/${org.id}/projects`, {
      token: outsider.accessToken,
      query: { limit: 0 },
    });
    const missing = await callApi(`/tenants/${missingId()}/tags`, {
      token: outsider.accessToken,
      query: { offset: -1 },
    });
    const report = await callApi(`/tenants/${org.id}/report`, {
      token: outsider.accessToken,
      query: { userId: "nope" },
    });
    assertError(forbidden, 400, "validation_error", "limit must be from 1 to 100.");
    assertError(missing, 400, "validation_error", "offset must be zero or greater.");
    assertError(report, 400, "validation_error", "userId must be an id.");
  });
});
