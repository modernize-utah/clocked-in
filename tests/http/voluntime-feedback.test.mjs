import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import {
  assertError,
  assertList,
  callApi,
  createJson,
  grantSuperAdmin,
  identity,
  label,
  logIn,
  queryDatabase,
  signUp,
  suite,
  joinOrg,
} from "./client.mjs";

describe("voluntime feedback", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.admin = await signUp("vtfadmin");
    ctx.volunteer = await signUp("vtfvol");
    ctx.org = await createJson(ctx.admin.accessToken, "/organizations", { name: label("VTF org") });
    await joinOrg(ctx.admin.accessToken, ctx.org.id, ctx.volunteer, { role: "VOLUNTEER" });
  });

  test("lists system roles and creates a custom role", async () => {
    const listed = await callApi(`/organizations/${ctx.org.id}/roles`, { token: ctx.admin.accessToken });
    assert.equal(listed.status, 200, listed.text);
    assertList(listed.json);
    assert.ok(listed.json.items.some((role) => role.code === "ADMIN" && role.isSystem));
    const created = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/roles`, {
      name: "Event lead",
      permissions: ["log_own_time", "create_needs", "create_projects"],
    });
    assert.equal(created.code, "EVENT_LEAD");
    assert.ok(created.permissions.includes("create_needs"));
    ctx.role = created;
  });

  test("only a SuperAdmin can update a system role", async () => {
    const listed = await callApi(`/organizations/${ctx.org.id}/roles`, { token: ctx.admin.accessToken });
    const volunteer = listed.json.items.find((role) => role.code === "VOLUNTEER" && role.isSystem);
    assert.ok(volunteer);
    const denied = await callApi(`/organizations/${ctx.org.id}/roles/${volunteer.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { name: "Helper", scope: "self", permissions: volunteer.permissions },
    });
    assertError(denied, 403, "forbidden", "Forbidden.");
    const actor = await signUp("vtfsuper");
    await grantSuperAdmin(actor.user.id);
    const superAdmin = { ...actor, ...(await logIn(actor.username, actor.password)) };
    try {
      const updated = await callApi(`/organizations/${ctx.org.id}/roles/${volunteer.id}`, {
        method: "PATCH",
        token: superAdmin.accessToken,
        body: { name: "Helper", scope: "assigned_groups", permissions: ["log_own_time", "view_reports"] },
      });
      assert.equal(updated.status, 200, updated.text);
      assert.equal(updated.json.name, "Helper");
      assert.equal(updated.json.scope, "assigned_groups");
      assert.deepEqual([...updated.json.permissions].sort(), ["log_own_time", "view_reports"]);
    } finally {
      const restored = await callApi(`/organizations/${ctx.org.id}/roles/${volunteer.id}`, {
        method: "PATCH",
        token: superAdmin.accessToken,
        body: { name: volunteer.name, scope: volunteer.scope, permissions: volunteer.permissions },
      });
      assert.equal(restored.status, 200, restored.text);
      assert.equal(restored.json.name, volunteer.name);
      assert.equal(restored.json.scope, volunteer.scope);
    }
  });

  test("invite stores reserved name and username", async () => {
    const person = identity("vtfinvite");
    const created = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/invitations`, {
      email: person.email,
      role: "VOLUNTEER",
      firstName: "Pat",
      lastName: "Rivera",
    });
    assert.equal(created.firstName, "Pat");
    assert.equal(created.lastName, "Rivera");
    assert.equal(created.username, "privera");
  });

  test("volunteer can request access and an admin can approve it", async () => {
    const created = await createJson(ctx.volunteer.accessToken, `/organizations/${ctx.org.id}/access-requests`, {
      message: "I can help manage a group.",
      requestedRole: "ADMIN",
    });
    assert.equal(created.status, "pending");
    const listed = await callApi(`/organizations/${ctx.org.id}/access-requests`, { token: ctx.admin.accessToken });
    assert.ok(listed.json.items.some((item) => item.id === created.id));
    const decided = await callApi(`/organizations/${ctx.org.id}/access-requests/${created.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { status: "approved" },
    });
    assert.equal(decided.status, 200, decided.text);
    assert.equal(decided.json.status, "approved");
  });

  test("an access request cannot grant another organization's departments", async () => {
    const attacker = await signUp("vtfcross");
    const victimGroup = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/departments`, {
      name: label("Victim group"),
    });
    const ownOrg = await createJson(attacker.accessToken, "/organizations", { name: label("Attacker org") });
    const refused = await callApi(`/organizations/${ownOrg.id}/access-requests`, {
      method: "POST",
      token: attacker.accessToken,
      body: { requestedDepartmentIds: [victimGroup.id] },
    });
    assertError(refused, 400, "validation_error", "requestedDepartmentIds must be departments of this organization.");

    const planted = await queryDatabase(
      `INSERT INTO "AccessRequest" ("id", "organizationId", "userId", "requestedDepartmentIds", "status")
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::jsonb, 'pending') RETURNING "id"`,
      [ownOrg.id, attacker.user.id, JSON.stringify([victimGroup.id])],
    );
    const approved = await callApi(`/organizations/${ownOrg.id}/access-requests/${planted.rows[0].id}`, {
      method: "PATCH",
      token: attacker.accessToken,
      body: { status: "approved" },
    });
    assert.equal(approved.status, 200, approved.text);
    const members = await callApi(`/departments/${victimGroup.id}/memberships`, { token: ctx.admin.accessToken });
    assert.equal(members.json.items.some((item) => item.userId === attacker.user.id), false);
  });

  test("archives a project and keeps it out of placement lookups", async () => {
    const project = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/projects`, {
      title: label("Archive me"),
      accessType: "Public",
    });
    const archived = await callApi(`/projects/${project.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { isActive: false },
    });
    assert.equal(archived.status, 200, archived.text);
    assert.equal(archived.json.isActive, false);
    const listed = await callApi(`/organizations/${ctx.org.id}/projects`, { token: ctx.volunteer.accessToken });
    assert.equal(listed.json.items.some((item) => item.id === project.id), false);
  });

  test("group-scoped role submits a need that stays private until approved", async () => {
    const manager = await signUp("vtfmgr");
    await joinOrg(ctx.admin.accessToken, ctx.org.id, manager, { role: ctx.role.code });
    const need = await createJson(manager.accessToken, `/organizations/${ctx.org.id}/volunteer-needs`, {
      name: label("Pending need"),
      type: "Task",
      countNeeded: 2,
      allowPublic: true,
    });
    assert.equal(need.status, "pending_approval");
    const hidden = await callApi(`/volunteer-needs/public/${need.publicToken}`);
    assertError(hidden, 404, "not_found");
    const published = await callApi(`/volunteer-needs/${need.id}/decision`, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: { status: "published" },
    });
    assert.equal(published.status, 200, published.text);
    assert.equal(published.json.status, "published");
    const open = await callApi(`/volunteer-needs/public/${need.publicToken}`);
    assert.equal(open.status, 200, open.text);
    ctx.need = published.json;
  });

  test("public openings lists published needs for a slug", async () => {
    const slug = `vtf-${Date.now().toString(36)}`;
    const updated = await callApi(`/organizations/${ctx.org.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { publicSlug: slug },
    });
    assert.equal(updated.status, 200, updated.text);
    assert.equal(updated.json.publicSlug, slug);
    const catalog = await callApi(`/public/openings/${slug}`);
    assert.equal(catalog.status, 200, catalog.text);
    assert.ok(catalog.json.items.some((item) => item.id === ctx.need.id));
  });
});
