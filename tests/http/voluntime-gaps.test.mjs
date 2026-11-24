import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { callApi, createJson, joinOrg, label, signUp, suite } from "./client.mjs";

describe("voluntime gaps", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.admin = await signUp("gapadmin");
    ctx.volunteer = await signUp("gapvol");
    ctx.coordinator = await signUp("gapcoord");
    ctx.org = await createJson(ctx.admin.accessToken, "/tenants", { name: label("Gap org") });
    ctx.groupA = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/tenants`, {
      name: label("Symphony"),
    });
    ctx.groupB = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/tenants`, {
      name: label("Theatre"),
    });
    ctx.category = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/task-categories`, {
      name: label("Gap category"),
    });
    ctx.project = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/projects`, {
      title: label("Gap project"),
      accessType: "Public",
    });
    await joinOrg(ctx.admin.accessToken, ctx.org.id, ctx.volunteer, { role: "VOLUNTEER" });
    await joinOrg(ctx.admin.accessToken, ctx.org.id, ctx.coordinator, { role: "VOLUNTEER", organizationIds: [ctx.groupA.id, ctx.groupB.id], managedOrganizationIds: [ctx.groupA.id, ctx.groupB.id] });
  });

  test("assigning two groups as Group manager combines report scope", async () => {
    await createJson(ctx.coordinator.accessToken, "/time/duration", {
      tenantId: ctx.org.id,
      organizationId: ctx.groupA.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      durationMinutes: 60,
      occurredOn: "2026-10-01",
    });
    await createJson(ctx.coordinator.accessToken, "/time/duration", {
      tenantId: ctx.org.id,
      organizationId: ctx.groupB.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      durationMinutes: 90,
      occurredOn: "2026-10-02",
    });
    const report = await callApi(`/tenants/${ctx.org.id}/report`, { token: ctx.coordinator.accessToken });
    assert.equal(report.status, 200, report.text);
    assert.ok(report.json.user.hours >= 2.5);
    const organizations = report.json.user.byOrganization.map((row) => row.id).sort();
    assert.ok(organizations.includes(ctx.groupA.id));
    assert.ok(organizations.includes(ctx.groupB.id));
  });

  test("access request for Group manager keeps org Volunteer and adds organization ADMIN", async () => {
    const created = await createJson(ctx.volunteer.accessToken, `/tenants/${ctx.org.id}/access-requests`, {
      requestedRole: "GROUP_MANAGER",
      requestedOrganizationIds: [ctx.groupA.id],
      message: "I can coordinate Symphony.",
    });
    assert.equal(created.requestedRole?.code, "GROUP_MANAGER");
    assert.deepEqual(created.requestedOrganizationIds, [ctx.groupA.id]);
    const decided = await callApi(`/tenants/${ctx.org.id}/access-requests/${created.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { status: "approved" },
    });
    assert.equal(decided.status, 200, decided.text);
    assert.equal(decided.json.status, "approved");
    const memberships = await callApi(`/tenants/${ctx.org.id}/memberships`, { token: ctx.admin.accessToken });
    const row = memberships.json.items.find((item) => item.userId === ctx.volunteer.user.id);
    assert.equal(row.role.code, "VOLUNTEER");
    assert.ok((row.managedOrganizationIds ?? []).includes(ctx.groupA.id));
  });

  test("username preview uses jsmith then jsmith1 when taken", async () => {
    const first = await callApi("/usernames/preview?firstName=John&lastName=Smith", { token: ctx.admin.accessToken });
    assert.equal(first.status, 200, first.text);
    assert.equal(first.json.base, "jsmith");
    if (first.json.username === "jsmith") {
      await signUp("takenjsmith", { username: "jsmith", firstName: "John", lastName: "Smith" });
    }
    const second = await callApi("/usernames/preview?firstName=John&lastName=Smith", { token: ctx.admin.accessToken });
    assert.equal(second.status, 200, second.text);
    assert.match(second.json.username, /^jsmith\d+$/);
    assert.equal(second.json.collided, true);
  });

  test("punch can start unclassified, then classify on clock-out", async () => {
    const open = await createJson(ctx.volunteer.accessToken, "/time/clock-in", {
      tenantId: ctx.org.id,
    });
    assert.equal(open.projectId, null);
    assert.equal(open.taskCategoryId, null);
    const closed = await callApi("/time/clock-out", {
      method: "POST",
      token: ctx.volunteer.accessToken,
      body: { projectId: ctx.project.id, taskCategoryId: ctx.category.id, organizationId: ctx.groupA.id },
    });
    assert.equal(closed.status, 200, closed.text);
    assert.equal(closed.json.projectId, ctx.project.id);
    assert.equal(closed.json.taskCategoryId, ctx.category.id);
  });

  test("unclassified punch appears in the report bucket and count", async () => {
    await createJson(ctx.volunteer.accessToken, "/time/clock-in", { tenantId: ctx.org.id });
    const closed = await callApi("/time/clock-out", { method: "POST", token: ctx.volunteer.accessToken, body: {} });
    assert.equal(closed.status, 200, closed.text);
    assert.equal(closed.json.projectId, null);
    const count = await callApi(`/tenants/${ctx.org.id}/unclassified-count`, { token: ctx.volunteer.accessToken });
    assert.equal(count.status, 200, count.text);
    assert.ok(count.json.count >= 1);
    await createJson(ctx.admin.accessToken, "/time/clock-in", { tenantId: ctx.org.id });
    const otherClosed = await callApi("/time/clock-out", { method: "POST", token: ctx.admin.accessToken, body: {} });
    assert.equal(otherClosed.status, 200, otherClosed.text);
    const privateCount = await callApi(`/tenants/${ctx.org.id}/unclassified-count`, { token: ctx.volunteer.accessToken });
    assert.equal(privateCount.status, 200, privateCount.text);
    assert.equal(privateCount.json.count, count.json.count);
    const report = await callApi(`/tenants/${ctx.org.id}/report`, { token: ctx.admin.accessToken });
    assert.ok(report.json.user.byProject.some((row) => row.id === "unclassified" && row.entries >= 1));
  });

  test("group manager lists owned needs and admin lists all", async () => {
    const otherGroup = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/tenants`, {
      name: label("Choir"),
    });
    const adminNeed = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/volunteer-needs`, {
      name: label("Choir need"),
      type: "Task",
      countNeeded: 1,
      organizationId: otherGroup.id,
    });
    const mine = await createJson(ctx.coordinator.accessToken, `/tenants/${ctx.org.id}/volunteer-needs`, {
      name: label("Symphony need"),
      type: "Task",
      countNeeded: 1,
      organizationId: ctx.groupA.id,
    });
    const listed = await callApi(`/tenants/${ctx.org.id}/volunteer-needs?limit=100`, {
      token: ctx.coordinator.accessToken,
    });
    assert.equal(listed.status, 200, listed.text);
    const ids = listed.json.items.map((item) => item.id);
    assert.ok(ids.includes(mine.id));
    assert.equal(ids.includes(adminNeed.id), false);
    const adminListed = await callApi(`/tenants/${ctx.org.id}/volunteer-needs?limit=100`, {
      token: ctx.admin.accessToken,
    });
    const adminIds = adminListed.json.items.map((item) => item.id);
    assert.ok(adminIds.includes(mine.id));
    assert.ok(adminIds.includes(adminNeed.id));
  });

  test("a group manager can list and create needs", async () => {
    const listed = await callApi(`/tenants/${ctx.org.id}/volunteer-needs`, { token: ctx.coordinator.accessToken });
    assert.equal(listed.status, 200, listed.text);
    const created = await createJson(ctx.coordinator.accessToken, `/tenants/${ctx.org.id}/volunteer-needs`, {
      name: label("Coordinator need"),
      description: "Help at rehearsal.",
      type: "Task",
      countNeeded: 2,
      allowPublic: false,
      requireVetting: false,
      organizationId: ctx.groupA.id,
      questions: { version: 1, items: [] },
    });
    assert.equal(created.organizationId, ctx.groupA.id);
  });

  test("import near-match Skip does not create a second user", async () => {
    const person = await signUp("gapskip");
    await joinOrg(ctx.admin.accessToken, ctx.org.id, person, { role: "VOLUNTEER" });
    const imported = await callApi(`/tenants/${ctx.org.id}/imports/people`, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: {
        rows: [
          {
            email: `alt-${person.email}`,
            firstName: person.firstName,
            lastName: person.lastName,
            _action: "skip",
          },
        ],
      },
    });
    assert.equal(imported.status, 200, imported.text);
    assert.equal(imported.json.created, 0);
    assert.equal(imported.json.skipped, 1);
  });
});
