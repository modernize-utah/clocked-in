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

describe("organizations", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.admin = await signUp("deptadmin");
    ctx.member = await signUp("deptmember");
    ctx.outsider = await signUp("deptout");
    ctx.org = await createJson(ctx.admin.accessToken, "/tenants", { name: label("Dept org") });
    await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/invitations`, {
      email: ctx.member.email,
      role: "MEMBER",
    });
    await acceptInvite(ctx.member.accessToken, ctx.member.email);
    ctx.name = label("Organization");
    ctx.tenant = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/tenants`, {
      name: ctx.name,
    });
  });

  test("create and list organizations for the tenant", async () => {
    assertNamed(ctx.tenant, { tenantId: ctx.org.id, name: ctx.name });
    const listed = await callApi(`/tenants/${ctx.org.id}/tenants`, { token: ctx.member.accessToken });
    assertList(listed.json);
    assert.ok(listed.json.items.some((item) => item.id === ctx.tenant.id));
    const unauthenticated = await callApi(`/tenants/${ctx.org.id}/tenants`);
    assertError(unauthenticated, 401, "unauthorized", "Authentication is required.");
  });

  test("get requires tenant membership", async () => {
    const response = await callApi(`/tenants/${ctx.tenant.id}`, { token: ctx.member.accessToken });
    assert.equal(response.status, 200);
    assertNamed(response.json, { tenantId: ctx.org.id, name: ctx.name });
    const outsider = await callApi(`/tenants/${ctx.tenant.id}`, { token: ctx.outsider.accessToken });
    const missing = await callApi(`/tenants/${missingId()}`, { token: ctx.admin.accessToken });
    assertError(outsider, 403, "forbidden", "Forbidden.");
    assertError(missing, 404, "not_found", "Not found.");
  });

  test("patch and create require an tenant admin", async () => {
    const forbidden = await callApi(`/tenants/${ctx.org.id}/tenants`, {
      method: "POST",
      token: ctx.member.accessToken,
      body: { name: label("Nope") },
    });
    const blank = await callApi(`/tenants/${ctx.org.id}/tenants`, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: { name: "   " },
    });
    assertError(forbidden, 403, "forbidden", "Forbidden.");
    assertError(blank, 400, "validation_error", "name is required.");
    const renamed = label("Renamed organization");
    const updated = await callApi(`/tenants/${ctx.tenant.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { name: renamed },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.json.name, renamed);
    const duplicate = await callApi(`/tenants/${ctx.org.id}/tenants`, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: { name: renamed.toUpperCase() },
    });
    assertError(duplicate, 409, "conflict", "That value is already in use.");
  });

  test("returns organizations, projects, categories, tags, and rates together", async () => {
    const unauthenticated = await callApi(`/tenants/${ctx.org.id}/lookups`);
    assertError(unauthenticated, 401, "unauthorized", "Authentication is required.");
    const outsider = await callApi(`/tenants/${ctx.org.id}/lookups`, { token: ctx.outsider.accessToken });
    assertError(outsider, 403, "forbidden", "Forbidden.");
    const listed = await callApi(`/tenants/${ctx.org.id}/lookups`, { token: ctx.member.accessToken });
    assert.equal(listed.status, 200);
    assert.ok(listed.json.organizations.some((item) => item.id === ctx.tenant.id));
    for (const key of ["projects", "categories", "tags", "hourlyRates"]) {
      assert.ok(Array.isArray(listed.json[key]), key);
    }
  });

  test("delete fails while time entries remain", async () => {
    const organization = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/tenants`, {
      name: label("Busy organization"),
    });
    const category = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/task-categories`, {
      name: label("Category"),
    });
    const project = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/projects`, {
      title: label("Project"),
      accessType: "Public",
    });
    await createJson(ctx.admin.accessToken, "/time/duration", {
      tenantId: ctx.org.id,
      organizationId: organization.id,
      projectId: project.id,
      taskCategoryId: category.id,
      durationMinutes: 15,
      occurredOn: "2026-10-03",
    });
    const blocked = await callApi(`/tenants/${organization.id}`, {
      method: "DELETE",
      token: ctx.admin.accessToken,
    });
    assertError(blocked, 409, "conflict", "Delete the time entries first.");
    const spare = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/tenants`, {
      name: label("Spare organization"),
    });
    await remove(ctx.admin.accessToken, `/tenants/${spare.id}`);
    const missing = await callApi(`/tenants/${spare.id}`, { token: ctx.admin.accessToken });
    assertError(missing, 404, "not_found", "Not found.");
  });
});
