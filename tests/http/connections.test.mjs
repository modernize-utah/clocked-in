import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { assertError, assertList, callApi, createJson, joinOrg, identity, label, signUp, suite } from "./client.mjs";

describe("member connections", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.admin = await signUp("connadmin");
    ctx.volunteer = await signUp("connvol");
    ctx.other = await signUp("connother");
    ctx.member = await signUp("connmember");
    ctx.org = await createJson(ctx.admin.accessToken, "/organizations", { name: label("Connection org") });
    ctx.category = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/task-categories`, {
      name: label("Category"),
    });
    ctx.project = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/projects`, {
      title: label("Project"),
      accessType: "Public",
    });
    ctx.professional = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/hourly-rates`, {
      type: "Professional",
      name: label("Professional"),
      perHourRate: 80,
    });
    for (const person of [ctx.volunteer, ctx.other]) {
      await joinOrg(ctx.admin.accessToken, ctx.org.id, person, { role: "VOLUNTEER" });
    }
    await joinOrg(ctx.admin.accessToken, ctx.org.id, ctx.member, { role: "MEMBER" });
    const rates = await callApi(`/organizations/${ctx.org.id}/hourly-rates`, { token: ctx.admin.accessToken });
    ctx.defaultRate = rates.json.items.find((item) => item.isDefault);
  });

  test("volunteers cannot add people until the organization allows it", async () => {
    assert.equal(ctx.org.preferences.allowVolunteersToAddVolunteers, false);
    const person = identity("blocked");
    const denied = await callApi(`/organizations/${ctx.org.id}/memberships`, {
      method: "POST",
      token: ctx.volunteer.accessToken,
      body: {
        email: person.email,
        username: person.username,
        password: person.password,
        firstName: "Blocked",
        lastName: "Volunteer",
        role: "VOLUNTEER",
        relationship: "Child",
      },
    });
    assertError(denied, 403, "forbidden", "Forbidden.");

    const enabled = await callApi(`/organizations/${ctx.org.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { preferences: { allowTimeEntryEditing: false, allowVolunteersToAddVolunteers: true } },
    });
    assert.equal(enabled.status, 200);
    assert.equal(enabled.json.preferences.allowVolunteersToAddVolunteers, true);
  });

  test("a volunteer can add only a volunteer and stores the relationship", async () => {
    const staff = identity("stafftry");
    const rejected = await callApi(`/organizations/${ctx.org.id}/memberships`, {
      method: "POST",
      token: ctx.volunteer.accessToken,
      body: {
        email: staff.email,
        username: staff.username,
        password: staff.password,
        firstName: "Staff",
        lastName: "Try",
        role: "MEMBER",
        relationship: "Friend",
      },
    });
    assertError(rejected, 400, "validation_error", "Volunteers can only add volunteers.");

    const person = identity("addedvol");
    const created = await createJson(ctx.volunteer.accessToken, `/organizations/${ctx.org.id}/memberships`, {
      email: person.email,
      username: person.username,
      password: person.password,
      firstName: "Added",
      lastName: "Volunteer",
      role: "VOLUNTEER",
      relationship: "Child",
    });
    assert.equal(created.role.code, "VOLUNTEER");
    ctx.added = created;

    const listed = await callApi(`/organizations/${ctx.org.id}/connections`, { token: ctx.volunteer.accessToken });
    assert.equal(listed.status, 200);
    assertList(listed.json);
    assert.equal(listed.json.items.length, 1);
    const connection = listed.json.items[0];
    assert.equal(connection.userAId < connection.userBId, true);
    const stored = connection.userAId === ctx.volunteer.user.id ? "Child" : "Parent";
    assert.equal(connection.relationship, stored);
    assert.ok([connection.userAId, connection.userBId].includes(ctx.volunteer.user.id));
    assert.ok([connection.userAId, connection.userBId].includes(created.userId));
    ctx.addedConnection = connection;

    const hidden = await callApi(`/organizations/${ctx.org.id}/connections`, { token: ctx.member.accessToken });
    assert.equal(hidden.status, 200);
    assert.equal(hidden.json.items.length, 0);
  });

  test("a volunteer can log time for a connection and not for anyone else", async () => {
    const entry = await createJson(ctx.volunteer.accessToken, `/users/${ctx.added.userId}/time-entries`, {
      mode: "Duration",
      organizationId: ctx.org.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      durationMinutes: 60,
      occurredOn: "2026-10-20",
      hourlyRateId: ctx.professional.id,
    });
    assert.equal(entry.userId, ctx.added.userId);
    assert.equal(entry.enteredByUserId, ctx.volunteer.user.id);
    assert.equal(entry.hourlyRateId, ctx.defaultRate.id);

    const denied = await callApi(`/users/${ctx.member.user.id}/time-entries`, {
      method: "POST",
      token: ctx.volunteer.accessToken,
      body: {
        mode: "Duration",
        organizationId: ctx.org.id,
        projectId: ctx.project.id,
        taskCategoryId: ctx.category.id,
        durationMinutes: 30,
        occurredOn: "2026-10-20",
      },
    });
    assertError(denied, 403, "forbidden", "Forbidden.");
  });

  test("admins connect existing members and removing the connection removes write access", async () => {
    const created = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/connections`, {
      userId: ctx.volunteer.user.id,
      connectedUserId: ctx.other.user.id,
      relationship: "Spouse",
    });
    assert.equal(created.relationship, "Spouse");
    const forVolunteer = await createJson(ctx.other.accessToken, `/users/${ctx.volunteer.user.id}/time-entries`, {
      mode: "Total",
      organizationId: ctx.org.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      durationMinutes: 90,
      occurredOn: "2026-10-21",
    });
    assert.equal(forVolunteer.userId, ctx.volunteer.user.id);
    assert.equal(forVolunteer.enteredByUserId, ctx.other.user.id);
    assert.equal(forVolunteer.hourlyRateId, ctx.defaultRate.id);

    const removed = await callApi(`/organizations/${ctx.org.id}/connections/${created.id}`, {
      method: "DELETE",
      token: ctx.admin.accessToken,
    });
    assert.equal(removed.status, 204);
    const after = await callApi(`/users/${ctx.volunteer.user.id}/time-entries`, {
      method: "POST",
      token: ctx.other.accessToken,
      body: {
        mode: "Total",
        organizationId: ctx.org.id,
        projectId: ctx.project.id,
        taskCategoryId: ctx.category.id,
        durationMinutes: 30,
        occurredOn: "2026-10-22",
      },
    });
    assertError(after, 403, "forbidden", "Forbidden.");
  });
});
