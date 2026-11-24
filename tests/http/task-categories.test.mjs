import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import {
  acceptInvite,
  assertError,
  assertList,
  assertNamed,
  callApi,
  createJson,
  label,
  missingId,
  remove,
  signUp,
  suite,
} from "./client.mjs";

describe("task categories", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.admin = await signUp("catadmin");
    ctx.member = await signUp("catmember");
    ctx.org = await createJson(ctx.admin.accessToken, "/tenants", { name: label("Category org") });
    await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/invitations`, {
      email: ctx.member.email,
      role: "MEMBER",
    });
    await acceptInvite(ctx.member.accessToken, ctx.member.email);
    ctx.name = label("Category");
    ctx.category = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/task-categories`, {
      name: ctx.name,
    });
  });

  test("create and list task categories", async () => {
    assertNamed(ctx.category, { tenantId: ctx.org.id, name: ctx.name });
    const listed = await callApi(`/tenants/${ctx.org.id}/task-categories`, { token: ctx.member.accessToken });
    assertList(listed.json);
    assert.ok(listed.json.items.some((item) => item.id === ctx.category.id));
    const unauthenticated = await callApi(`/tenants/${ctx.org.id}/task-categories`);
    assertError(unauthenticated, 401, "unauthorized", "Authentication is required.");
  });

  test("patch requires an tenant admin", async () => {
    const forbidden = await callApi(`/task-categories/${ctx.category.id}`, {
      method: "PATCH",
      token: ctx.member.accessToken,
      body: { name: label("Nope") },
    });
    assertError(forbidden, 403, "forbidden", "Forbidden.");
    const renamed = label("Renamed category");
    const updated = await callApi(`/task-categories/${ctx.category.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { name: renamed },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.json.name, renamed);
    const duplicate = await callApi(`/tenants/${ctx.org.id}/task-categories`, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: { name: renamed },
    });
    assertError(duplicate, 409, "conflict", "That value is already in use.");
    const missing = await callApi(`/task-categories/${missingId()}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { name: label("Missing") },
    });
    assertError(missing, 404, "not_found", "Not found.");
  });

  test("delete fails while time entries remain", async () => {
    const category = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/task-categories`, {
      name: label("Busy category"),
    });
    const project = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/projects`, {
      title: label("Project"),
      accessType: "Public",
    });
    await createJson(ctx.admin.accessToken, "/time/total", {
      tenantId: ctx.org.id,
      projectId: project.id,
      taskCategoryId: category.id,
      durationMinutes: 120,
      occurredOn: "2026-10-04",
    });
    const blocked = await callApi(`/task-categories/${category.id}`, {
      method: "DELETE",
      token: ctx.admin.accessToken,
    });
    assertError(blocked, 409, "conflict", "Delete the time entries first.");
    const spare = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/task-categories`, {
      name: label("Spare category"),
    });
    await remove(ctx.admin.accessToken, `/task-categories/${spare.id}`);
    const missing = await callApi(`/task-categories/${spare.id}`, {
      method: "DELETE",
      token: ctx.admin.accessToken,
    });
    assertError(missing, 404, "not_found", "Not found.");
  });
});
