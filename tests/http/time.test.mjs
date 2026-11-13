import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import {
  acceptInvite,
  assertDate,
  assertError,
  assertList,
  assertMoney,
  assertTimeEntry,
  callApi,
  createJson,
  inKind,
  label,
  missingId,
  remove,
  joinOrg,
  signUp,
  suite,
} from "./client.mjs";

describe("time entries", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.admin = await signUp("timeadmin");
    ctx.member = await signUp("timemember");
    ctx.outsider = await signUp("timeout");
    ctx.departmentAdmin = await signUp("timedept");
    ctx.org = await createJson(ctx.admin.accessToken, "/organizations", { name: label("Time org") });
    ctx.department = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/departments`, {
      name: label("Time department"),
    });
    ctx.tag = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/tags`, { name: label("Time tag") });
    ctx.category = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/task-categories`, {
      name: label("Time category"),
    });
    ctx.project = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/projects`, {
      title: label("Time project"),
      accessType: "Public",
    });
    ctx.departmentProject = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/projects`, {
      title: label("Department time project"),
      accessType: "Department",
      departmentId: ctx.department.id,
    });
    await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/invitations`, {
      email: ctx.member.email,
      role: "MEMBER",
    });
    await acceptInvite(ctx.member.accessToken, ctx.member.email);
    await createJson(ctx.admin.accessToken, `/departments/${ctx.department.id}/invitations`, {
      email: ctx.departmentAdmin.email,
      role: "ADMIN",
    });
    await acceptInvite(ctx.departmentAdmin.accessToken, ctx.departmentAdmin.email);
  });

  test("duration and total record a snapshot of the membership rate", async () => {
    const duration = await createJson(ctx.member.accessToken, "/time/duration", {
      organizationId: ctx.org.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      durationMinutes: 90,
      occurredOn: "2026-10-01",
      description: "Committee",
      tagIds: [ctx.tag.id],
      sourceRef: label("import"),
    });
    assertTimeEntry(duration, {
      userId: ctx.member.user.id,
      enteredByUserId: ctx.member.user.id,
      organizationId: ctx.org.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      mode: "Duration",
      durationMinutes: 90,
      inKindValue: inKind(90),
    });
    assert.equal(duration.startedAt, null);
    assert.equal(duration.endedAt, null);
    assert.equal(duration.occurredOn, "2026-10-01");
    assert.equal(duration.description, "Committee");
    assert.deepEqual(duration.tagIds, [ctx.tag.id]);
    const total = await createJson(ctx.member.accessToken, "/time/total", {
      organizationId: ctx.org.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      durationMinutes: 59940,
      occurredOn: "2026-09-01",
    });
    assert.equal(total.mode, "Total");
    assert.equal(total.durationMinutes, 59940);
    assertMoney(total.inKindValue, inKind(59940));
    const tooLong = await callApi("/time/duration", {
      method: "POST",
      token: ctx.member.accessToken,
      body: {
        organizationId: ctx.org.id,
        projectId: ctx.project.id,
        taskCategoryId: ctx.category.id,
        durationMinutes: 1441,
        occurredOn: "2026-10-02",
      },
    });
    const totalTooLong = await callApi("/time/total", {
      method: "POST",
      token: ctx.member.accessToken,
      body: {
        organizationId: ctx.org.id,
        projectId: ctx.project.id,
        taskCategoryId: ctx.category.id,
        durationMinutes: 59941,
        occurredOn: "2026-10-02",
      },
    });
    const fromDuration = await callApi("/time/duration", {
      method: "POST",
      token: ctx.member.accessToken,
      body: {
        organizationId: ctx.org.id,
        projectId: ctx.project.id,
        taskCategoryId: ctx.category.id,
        durationMinutes: 60,
        occurredOn: "2026-10-02",
        startedAt: "2026-10-02T15:00:00.000Z",
      },
    });
    const fromEnd = await callApi("/time/duration", {
      method: "POST",
      token: ctx.member.accessToken,
      body: {
        organizationId: ctx.org.id,
        projectId: ctx.project.id,
        taskCategoryId: ctx.category.id,
        occurredOn: "2026-10-02",
        startedAt: "2026-10-02T15:00:00.000Z",
        endedAt: "2026-10-02T17:00:00.000Z",
      },
    });
    const startOnly = await callApi("/time/duration", {
      method: "POST",
      token: ctx.member.accessToken,
      body: {
        organizationId: ctx.org.id,
        projectId: ctx.project.id,
        taskCategoryId: ctx.category.id,
        occurredOn: "2026-10-02",
        startedAt: "2026-10-02T15:00:00.000Z",
      },
    });
    assertError(tooLong, 400, "validation_error", "durationMinutes must be from 1 to 1440.");
    assertError(totalTooLong, 400, "validation_error", "durationMinutes must be from 1 to 59940.");
    assert.equal(fromDuration.status, 201);
    assert.equal(fromDuration.json.durationMinutes, 60);
    assert.equal(fromDuration.json.endedAt, "2026-10-02T16:00:00.000Z");
    assert.equal(fromEnd.status, 201);
    assert.equal(fromEnd.json.durationMinutes, 120);
    assert.equal(fromEnd.json.endedAt, "2026-10-02T17:00:00.000Z");
    assertError(startOnly, 400, "validation_error", "endedAt or durationMinutes is required.");
    const duplicate = await callApi(`/users/${ctx.member.user.id}/time-entries`, {
      method: "POST",
      token: ctx.member.accessToken,
      body: {
        mode: "Duration",
        organizationId: ctx.org.id,
        projectId: ctx.project.id,
        taskCategoryId: ctx.category.id,
        durationMinutes: 30,
        occurredOn: "2026-10-08",
        sourceRef: duration.sourceRef,
      },
    });
    assertError(duplicate, 409, "conflict");
  });

  test("list and get honor organization membership", async () => {
    const listed = await callApi(`/users/${ctx.member.user.id}/time-entries`, {
      token: ctx.admin.accessToken,
      query: { organizationId: ctx.org.id, from: "2026-10-01", to: "2026-10-01" },
    });
    assertList(listed.json);
    assert.ok(listed.json.items.every((item) => item.occurredOn === "2026-10-01"));
    assert.ok(listed.json.items.some((item) => item.mode === "Duration"));
    const entry = listed.json.items.find((item) => item.mode === "Duration");
    const fetched = await callApi(`/time-entries/${entry.id}`, { token: ctx.admin.accessToken });
    assert.equal(fetched.status, 200);
    assert.equal(fetched.json.id, entry.id);
    const outsider = await callApi(`/users/${ctx.member.user.id}/time-entries`, { token: ctx.outsider.accessToken });
    const missing = await callApi(`/time-entries/${missingId()}`, { token: ctx.member.accessToken });
    assertError(outsider, 403, "forbidden", "Forbidden.");
    assertError(missing, 404, "not_found", "Not found.");
    const unauthenticated = await callApi("/time/duration", { method: "POST", body: {} });
    assertError(unauthenticated, 401, "unauthorized", "Authentication is required.");
  });

  test("duration and total need a project and task category, and keep them", async () => {
    for (const [path, durationMinutes] of [
      ["/time/duration", 45],
      ["/time/total", 30],
    ]) {
      const refused = await callApi(path, {
        method: "POST",
        token: ctx.member.accessToken,
        body: { organizationId: ctx.org.id, durationMinutes, occurredOn: "2026-10-20" },
      });
      assertError(refused, 400, "validation_error", "Choose a project and a task category.");
    }
    const duration = await createJson(ctx.member.accessToken, "/time/duration", {
      organizationId: ctx.org.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      durationMinutes: 45,
      occurredOn: "2026-10-20",
      description: "Classified duration",
    });
    assert.equal(duration.mode, "Duration");
    assert.equal(duration.projectId, ctx.project.id);
    assert.equal(duration.taskCategoryId, ctx.category.id);
    assert.equal(duration.durationMinutes, 45);
    const cleared = await callApi(`/time-entries/${duration.id}`, {
      method: "PATCH",
      token: ctx.member.accessToken,
      body: { projectId: null, taskCategoryId: null },
    });
    assertError(cleared, 400, "validation_error", "Choose a project and a task category.");
  });

  test("a deactivated member can read but not change their own entries", async () => {
    const leaver = await signUp("timeleaver");
    const membership = await joinOrg(ctx.admin.accessToken, ctx.org.id, leaver, { role: "VOLUNTEER" });
    const entry = await createJson(leaver.accessToken, "/time/duration", {
      organizationId: ctx.org.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      durationMinutes: 30,
      occurredOn: "2026-10-22",
    });
    const deactivated = await callApi(`/organizations/${ctx.org.id}/memberships/${membership.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { isActive: false },
    });
    assert.equal(deactivated.status, 200, deactivated.text);
    const read = await callApi(`/time-entries/${entry.id}`, { token: leaver.accessToken });
    assert.equal(read.status, 200, read.text);
    const edited = await callApi(`/time-entries/${entry.id}`, {
      method: "PATCH",
      token: leaver.accessToken,
      body: { description: "after leaving" },
    });
    assertError(edited, 403, "forbidden", "Forbidden.");
    const deleted = await callApi(`/time-entries/${entry.id}`, { method: "DELETE", token: leaver.accessToken });
    assertError(deleted, 403, "forbidden", "Forbidden.");
  });

  test("admins can enter time for a member and members cannot enter it for someone else", async () => {
    const forbidden = await callApi(`/users/${ctx.admin.user.id}/time-entries`, {
      method: "POST",
      token: ctx.member.accessToken,
      body: {
        mode: "Total",
        organizationId: ctx.org.id,
        projectId: ctx.project.id,
        taskCategoryId: ctx.category.id,
        durationMinutes: 60,
        occurredOn: "2026-10-09",
      },
    });
    assertError(forbidden, 403, "forbidden", "Forbidden.");
    const created = await createJson(ctx.admin.accessToken, `/users/${ctx.member.user.id}/time-entries`, {
      mode: "Duration",
      organizationId: ctx.org.id,
      departmentId: ctx.department.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      durationMinutes: 60,
      occurredOn: "2026-10-09",
      startedAt: "2026-10-09T16:00:00.000Z",
      endedAt: "2026-10-09T17:00:00.000Z",
    });
    assertTimeEntry(created, {
      userId: ctx.member.user.id,
      enteredByUserId: ctx.admin.user.id,
      organizationId: ctx.org.id,
      departmentId: ctx.department.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      mode: "Duration",
      durationMinutes: 60,
      inKindValue: inKind(60),
    });
    const forDepartment = await createJson(
      ctx.departmentAdmin.accessToken,
      `/users/${ctx.member.user.id}/time-entries`,
      {
        mode: "Total",
        organizationId: ctx.org.id,
        departmentId: ctx.department.id,
        projectId: ctx.departmentProject.id,
        taskCategoryId: ctx.category.id,
        durationMinutes: 30,
        occurredOn: "2026-10-11",
      },
    );
    assert.equal(forDepartment.enteredByUserId, ctx.departmentAdmin.user.id);
    assert.equal(forDepartment.projectId, ctx.departmentProject.id);
    const wrongProject = await callApi(`/users/${ctx.member.user.id}/time-entries`, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: {
        mode: "Total",
        organizationId: ctx.org.id,
        projectId: ctx.departmentProject.id,
        taskCategoryId: ctx.category.id,
        durationMinutes: 30,
        occurredOn: "2026-10-11",
      },
    });
    assertError(wrongProject, 400, "validation_error", "departmentId must match this department project.");
  });

  test("clock in and clock out keep a single open punch", async () => {
    const open = await createJson(ctx.admin.accessToken, "/time/clock-in", {
      organizationId: ctx.org.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      description: "Open",
      tagIds: [ctx.tag.id],
    });
    assert.equal(open.mode, "Punch");
    assert.equal(open.userId, ctx.admin.user.id);
    assert.equal(open.endedAt, null);
    assert.equal(open.durationMinutes, null);
    assert.equal(open.inKindValue, null);
    assertDate(open.occurredOn);
    assert.equal(open.occurredOn, new Date(open.startedAt).toISOString().slice(0, 10));
    const again = await callApi("/time/clock-in", {
      method: "POST",
      token: ctx.admin.accessToken,
      body: {
        organizationId: ctx.org.id,
        projectId: ctx.project.id,
        taskCategoryId: ctx.category.id,
      },
    });
    assertError(again, 409, "conflict", "You already have an open punch.");
    const closed = await callApi("/time/clock-out", {
      method: "POST",
      token: ctx.admin.accessToken,
      body: { description: "Closed", tagIds: [ctx.tag.id] },
    });
    assert.equal(closed.status, 200);
    assert.equal(closed.json.mode, "Punch");
    assert.equal(closed.json.description, "Closed");
    assert.ok(closed.json.durationMinutes >= 1);
    assertMoney(closed.json.inKindValue, inKind(closed.json.durationMinutes));
    assert.deepEqual(closed.json.tagIds, [ctx.tag.id]);
    const none = await callApi("/time/clock-out", { method: "POST", token: ctx.admin.accessToken, body: {} });
    assertError(none, 409, "conflict", "No open punch.");
    const restarted = await createJson(ctx.admin.accessToken, "/time/clock-in", {
      organizationId: ctx.org.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      description: "Restart me",
    });
    const reset = await callApi("/time/clock-reset", { method: "POST", token: ctx.admin.accessToken, body: {} });
    assert.equal(reset.status, 200);
    assert.equal(reset.json.id, restarted.id);
    assert.equal(reset.json.endedAt, null);
    assert.equal(reset.json.durationMinutes, null);
    assert.ok(new Date(reset.json.startedAt).getTime() >= new Date(restarted.startedAt).getTime());
    const cancelled = await callApi("/time/clock-cancel", { method: "POST", token: ctx.admin.accessToken, body: {} });
    assert.equal(cancelled.status, 204);
    const afterCancel = await callApi("/time/clock-out", { method: "POST", token: ctx.admin.accessToken, body: {} });
    assertError(afterCancel, 409, "conflict", "No open punch.");
    const cancelMissing = await callApi("/time/clock-cancel", { method: "POST", token: ctx.admin.accessToken, body: {} });
    assertError(cancelMissing, 409, "conflict", "No open punch.");
    const times = await callApi(`/time-entries/${open.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { occurredOn: "2026-01-01" },
    });
    assertError(times, 400, "validation_error", "You cannot change punch times here.");
  });

  test("patch and delete a duration entry", async () => {
    const created = await createJson(ctx.member.accessToken, "/time/duration", {
      organizationId: ctx.org.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      durationMinutes: 60,
      occurredOn: "2026-10-12",
      description: "Draft",
    });
    const blocked = await callApi(`/time-entries/${created.id}`, {
      method: "PATCH",
      token: ctx.member.accessToken,
      body: { durationMinutes: 90 },
    });
    assertError(blocked, 400, "validation_error", "Time entries cannot be edited.");
    const enabled = await callApi(`/organizations/${ctx.org.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { preferences: { allowTimeEntryEditing: true } },
    });
    assert.equal(enabled.status, 200);
    const updated = await callApi(`/time-entries/${created.id}`, {
      method: "PATCH",
      token: ctx.member.accessToken,
      body: { description: "Final", durationMinutes: 120, occurredOn: "2026-10-13", tagIds: [] },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.json.description, "Final");
    assert.equal(updated.json.durationMinutes, 120);
    assert.equal(updated.json.occurredOn, "2026-10-13");
    assertMoney(updated.json.inKindValue, inKind(120));
    assert.deepEqual(updated.json.tagIds, []);
    const outsider = await callApi(`/time-entries/${created.id}`, {
      method: "DELETE",
      token: ctx.outsider.accessToken,
    });
    assertError(outsider, 403, "forbidden", "Forbidden.");
    await remove(ctx.member.accessToken, `/time-entries/${created.id}`);
    const missing = await callApi(`/time-entries/${created.id}`, { token: ctx.member.accessToken });
    assertError(missing, 404, "not_found", "Not found.");
  });

  test("an allowed punch can change its start and end", async () => {
    const enabled = await callApi(`/organizations/${ctx.org.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { preferences: { allowTimeEntryEditing: true } },
    });
    assert.equal(enabled.status, 200);
    const open = await createJson(ctx.admin.accessToken, "/time/clock-in", {
      organizationId: ctx.org.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
    });
    const updated = await callApi(`/time-entries/${open.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: {
        startedAt: "2026-10-14T15:00:00.000Z",
        endedAt: "2026-10-14T16:30:00.000Z",
      },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.json.startedAt, "2026-10-14T15:00:00.000Z");
    assert.equal(updated.json.endedAt, "2026-10-14T16:30:00.000Z");
    assert.equal(updated.json.durationMinutes, 90);
    assert.equal(updated.json.occurredOn, "2026-10-14");
    assertMoney(updated.json.inKindValue, inKind(90));
    const fromDuration = await callApi(`/time-entries/${open.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { durationMinutes: 30 },
    });
    assert.equal(fromDuration.status, 200);
    assert.equal(fromDuration.json.durationMinutes, 30);
    assert.equal(fromDuration.json.endedAt, "2026-10-14T15:30:00.000Z");
  });

  test("a batch records the same entry on each selected day", async () => {
    const shared = {
      mode: "Duration",
      organizationId: ctx.org.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      description: "Same shift",
      tagIds: [ctx.tag.id],
    };
    const created = await createJson(ctx.member.accessToken, "/time/batch", {
      ...shared,
      entries: [
        {
          occurredOn: "2026-10-18",
          durationMinutes: 60,
          startedAt: "2026-10-18T15:00:00.000Z",
          endedAt: "2026-10-18T16:00:00.000Z",
        },
        {
          occurredOn: "2026-10-19",
          durationMinutes: 60,
          startedAt: "2026-10-19T15:00:00.000Z",
          endedAt: "2026-10-19T16:00:00.000Z",
        },
      ],
    });
    assert.deepEqual(Object.keys(created).sort(), ["items"]);
    assert.equal(created.items.length, 2);
    for (const [index, day] of ["2026-10-18", "2026-10-19"].entries()) {
      assertTimeEntry(created.items[index], {
        userId: ctx.member.user.id,
        enteredByUserId: ctx.member.user.id,
        organizationId: ctx.org.id,
        projectId: ctx.project.id,
        taskCategoryId: ctx.category.id,
        mode: "Duration",
        durationMinutes: 60,
        inKindValue: inKind(60),
      });
      assert.equal(created.items[index].occurredOn, day);
      assert.equal(created.items[index].description, "Same shift");
      assert.deepEqual(created.items[index].tagIds, [ctx.tag.id]);
      assert.equal(created.items[index].sourceRef, null);
      assert.equal(created.items[index].startedAt, `${day}T15:00:00.000Z`);
      assert.equal(created.items[index].endedAt, `${day}T16:00:00.000Z`);
    }

    const duplicate = await callApi("/time/batch", {
      method: "POST",
      token: ctx.member.accessToken,
      body: {
        ...shared,
        entries: [
          { occurredOn: "2026-10-20", durationMinutes: 60 },
          { occurredOn: "2026-10-20", durationMinutes: 60 },
        ],
      },
    });
    const mismatch = await callApi("/time/batch", {
      method: "POST",
      token: ctx.member.accessToken,
      body: {
        ...shared,
        entries: [
          { occurredOn: "2026-10-20", durationMinutes: 60 },
          { occurredOn: "2026-10-21", durationMinutes: 30 },
        ],
      },
    });
    const sourced = await callApi("/time/batch", {
      method: "POST",
      token: ctx.member.accessToken,
      body: {
        ...shared,
        sourceRef: label("batch"),
        entries: [
          { occurredOn: "2026-10-20", durationMinutes: 60 },
          { occurredOn: "2026-10-21", durationMinutes: 60 },
        ],
      },
    });
    const empty = await callApi("/time/batch", {
      method: "POST",
      token: ctx.member.accessToken,
      body: { ...shared, entries: [] },
    });
    const tooMany = await callApi("/time/batch", {
      method: "POST",
      token: ctx.member.accessToken,
      body: {
        ...shared,
        entries: Array.from({ length: 32 }, (_, index) => ({
          occurredOn: `2026-09-${String(index + 1).padStart(2, "0")}`,
          durationMinutes: 60,
        })),
      },
    });
    const punch = await callApi("/time/batch", {
      method: "POST",
      token: ctx.member.accessToken,
      body: { ...shared, mode: "Punch", entries: [{ occurredOn: "2026-10-20", durationMinutes: 60 }] },
    });
    const listedBefore = await callApi(`/users/${ctx.member.user.id}/time-entries`, {
      token: ctx.member.accessToken,
      query: { organizationId: ctx.org.id, from: "2026-10-18", to: "2026-10-21" },
    });
    const partial = await callApi("/time/batch", {
      method: "POST",
      token: ctx.member.accessToken,
      body: {
        ...shared,
        entries: [
          {
            occurredOn: "2026-10-21",
            durationMinutes: 60,
            startedAt: "2026-10-21T15:00:00.000Z",
            endedAt: "2026-10-21T16:00:00.000Z",
          },
          {
            occurredOn: "2026-10-22",
            durationMinutes: 60,
            startedAt: "2026-10-22T16:00:00.000Z",
            endedAt: "2026-10-22T15:00:00.000Z",
          },
        ],
      },
    });
    const listedAfter = await callApi(`/users/${ctx.member.user.id}/time-entries`, {
      token: ctx.member.accessToken,
      query: { organizationId: ctx.org.id, from: "2026-10-18", to: "2026-10-22" },
    });
    assertError(duplicate, 400, "validation_error", "Each day can only be saved once.");
    assertError(mismatch, 400, "validation_error", "Each day must use the same duration.");
    assertError(sourced, 400, "validation_error", "sourceRef cannot be set when saving multiple days.");
    assertError(empty, 400, "validation_error", "entries must include at least one day.");
    assertError(tooMany, 400, "validation_error", "You can save up to 31 days at once.");
    assertError(punch, 400, "validation_error", "A batch can only save duration or total time.");
    assertError(partial, 400, "validation_error", "endedAt must be after startedAt.");
    assert.equal(
      listedAfter.json.items.filter((item) => item.description === "Same shift").length,
      listedBefore.json.items.filter((item) => item.description === "Same shift").length,
    );

    const unauthenticated = await callApi("/time/batch", { method: "POST", body: {} });
    assertError(unauthenticated, 401, "unauthorized", "Authentication is required.");
    const forbidden = await callApi(`/users/${ctx.admin.user.id}/time-entries/batch`, {
      method: "POST",
      token: ctx.member.accessToken,
      body: {
        ...shared,
        entries: [
          { occurredOn: "2026-10-23", durationMinutes: 45 },
          { occurredOn: "2026-10-24", durationMinutes: 45 },
        ],
      },
    });
    assertError(forbidden, 403, "forbidden", "Forbidden.");
    const forMember = await createJson(ctx.admin.accessToken, `/users/${ctx.member.user.id}/time-entries/batch`, {
      ...shared,
      description: "Admin batch",
      entries: [
        { occurredOn: "2026-10-23", durationMinutes: 45 },
        { occurredOn: "2026-10-24", durationMinutes: 45 },
      ],
    });
    assert.equal(forMember.items.length, 2);
    assert.equal(forMember.items[0].userId, ctx.member.user.id);
    assert.equal(forMember.items[0].enteredByUserId, ctx.admin.user.id);
    assert.equal(forMember.items[0].durationMinutes, 45);
    assert.equal(forMember.items[1].durationMinutes, 45);
    assert.equal(forMember.items[0].occurredOn, "2026-10-23");
    assert.equal(forMember.items[1].occurredOn, "2026-10-24");
    assert.equal(forMember.items[0].description, "Admin batch");
    assert.equal(forMember.items[1].description, "Admin batch");
  });
});
