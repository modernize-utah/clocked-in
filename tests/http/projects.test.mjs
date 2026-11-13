import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import {
  acceptInvite,
  assertError,
  assertList,
  assertProject,
  callApi,
  createJson,
  label,
  missingId,
  remove,
  signUp,
  suite,
} from "./client.mjs";

describe("projects", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.admin = await signUp("projadmin");
    ctx.member = await signUp("projmember");
    ctx.outsider = await signUp("projout");
    ctx.org = await createJson(ctx.admin.accessToken, "/organizations", { name: label("Project org") });
    ctx.department = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/departments`, {
      name: label("Project department"),
    });
    const projectLead = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/roles`, {
      name: "Project lead",
      scope: "organization",
      permissions: ["log_own_time", "view_reports", "export_reports", "create_projects"],
    });
    await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/invitations`, {
      email: ctx.member.email,
      role: projectLead.code,
    });
    await acceptInvite(ctx.member.accessToken, ctx.member.email);
    ctx.title = label("Public project");
    ctx.project = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/projects`, {
      title: ctx.title,
      accessType: "Public",
      description: "Shared work",
    });
  });

  test("create and list a public project", async () => {
    assertProject(ctx.project, {
      organizationId: ctx.org.id,
      ownerUserId: ctx.admin.user.id,
      title: ctx.title,
      accessType: "Public",
    });
    assert.equal(ctx.project.description, "Shared work");
    assert.equal(ctx.project.startDate, null);
    assert.equal(ctx.project.endDate, null);
    assert.deepEqual(ctx.project.editorIds, []);
    const listed = await callApi(`/organizations/${ctx.org.id}/projects`, { token: ctx.member.accessToken });
    assertList(listed.json);
    assert.ok(listed.json.items.some((item) => item.id === ctx.project.id));
    const unauthenticated = await callApi(`/organizations/${ctx.org.id}/projects`);
    assertError(unauthenticated, 401, "unauthorized", "Authentication is required.");
  });

  test("get hides a private project until the caller is an editor", async () => {
    const title = label("Private project");
    const project = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/projects`, {
      title,
      accessType: "Private",
    });
    const hidden = await callApi(`/projects/${project.id}`, { token: ctx.member.accessToken });
    assertError(hidden, 403, "forbidden", "Forbidden.");
    const listed = await callApi(`/organizations/${ctx.org.id}/projects`, { token: ctx.member.accessToken });
    assert.equal(listed.json.items.some((item) => item.id === project.id), false);
    const updated = await callApi(`/projects/${project.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { editorIds: [ctx.member.user.id] },
    });
    assert.equal(updated.status, 200);
    assert.deepEqual(updated.json.editorIds, [ctx.member.user.id]);
    const visible = await callApi(`/projects/${project.id}`, { token: ctx.member.accessToken });
    assert.equal(visible.status, 200);
    assert.equal(visible.json.id, project.id);
    const outsider = await callApi(`/projects/${project.id}`, { token: ctx.outsider.accessToken });
    const missing = await callApi(`/projects/${missingId()}`, { token: ctx.admin.accessToken });
    assertError(outsider, 403, "forbidden", "Forbidden.");
    assertError(missing, 404, "not_found", "Not found.");
  });

  test("department projects require that department", async () => {
    const missingDepartment = await callApi(`/organizations/${ctx.org.id}/projects`, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: { title: label("Department project"), accessType: "Department" },
    });
    const withDepartment = await callApi(`/organizations/${ctx.org.id}/projects`, {
      method: "POST",
      token: ctx.member.accessToken,
      body: { title: label("Member department"), accessType: "Public", departmentId: ctx.department.id },
    });
    const dates = await callApi(`/organizations/${ctx.org.id}/projects`, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: {
        title: label("Dated project"),
        accessType: "Public",
        startDate: "2026-10-10",
        endDate: "2026-10-01",
      },
    });
    assertError(missingDepartment, 400, "validation_error", "departmentId is required when accessType is Department.");
    assertError(withDepartment, 400, "validation_error", "departmentId must be empty when accessType is Public or Private.");
    assertError(dates, 400, "validation_error", "endDate must be on or after startDate.");

    const title = label("Department project");
    const project = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/projects`, {
      title,
      accessType: "Department",
      departmentId: ctx.department.id,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
    });
    assert.equal(project.departmentId, ctx.department.id);
    assert.equal(project.startDate, "2026-10-01");
    assert.equal(project.endDate, "2026-10-31");
    const duplicate = await callApi(`/organizations/${ctx.org.id}/projects`, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: { title: title.toUpperCase(), accessType: "Public" },
    });
    assertError(duplicate, 409, "conflict", "That value is already in use.");
  });

  test("patch and delete follow project access", async () => {
    const title = label("Editable project");
    const project = await createJson(ctx.member.accessToken, `/organizations/${ctx.org.id}/projects`, {
      title,
      accessType: "Private",
    });
    const empty = await callApi(`/projects/${project.id}`, {
      method: "PATCH",
      token: ctx.member.accessToken,
      body: {},
    });
    assertError(empty, 400, "validation_error", "Provide at least one field to update.");
    const renamed = label("Renamed project");
    const updated = await callApi(`/projects/${project.id}`, {
      method: "PATCH",
      token: ctx.member.accessToken,
      body: { title: renamed, isActive: false },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.json.title, renamed);
    assert.equal(updated.json.isActive, false);
    const stranger = await callApi(`/projects/${project.id}`, {
      method: "PATCH",
      token: ctx.outsider.accessToken,
      body: { title: label("Stolen") },
    });
    assertError(stranger, 403, "forbidden", "Forbidden.");
    await remove(ctx.member.accessToken, `/projects/${project.id}`);
    const missing = await callApi(`/projects/${project.id}`, { token: ctx.admin.accessToken });
    assertError(missing, 404, "not_found", "Not found.");
  });

  test("delete fails while time entries remain", async () => {
    const project = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/projects`, {
      title: label("Busy project"),
      accessType: "Public",
    });
    const category = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/task-categories`, {
      name: label("Category"),
    });
    await createJson(ctx.admin.accessToken, "/time/duration", {
      organizationId: ctx.org.id,
      projectId: project.id,
      taskCategoryId: category.id,
      durationMinutes: 45,
      occurredOn: "2026-10-05",
    });
    const blocked = await callApi(`/projects/${project.id}`, { method: "DELETE", token: ctx.admin.accessToken });
    assertError(blocked, 409, "conflict", "Delete the time entries first.");
  });
});
