import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import {
  acceptInvite,
  assertError,
  assertList,
  assertSession,
  assertMoney,
  assertNamed,
  callApi,
  createJson,
  inKind,
  label,
  missingId,
  remove,
  signUp,
  suite,
} from "./client.mjs";

async function invite(adminToken, path, person, role = "MEMBER") {
  await createJson(adminToken, path, { email: person.email, role });
  return acceptInvite(person.accessToken, person.email);
}

async function catalog(token, tenantId) {
  const category = await createJson(token, `/tenants/${tenantId}/task-categories`, {
    name: label("Category"),
  });
  const project = await createJson(token, `/tenants/${tenantId}/projects`, {
    title: label("Project"),
    accessType: "Public",
  });
  return { category, project };
}

async function membershipOf(token, tenantId, userId) {
  const listed = await callApi(`/tenants/${tenantId}/memberships`, {
    token,
    query: { limit: 100 },
  });
  return listed.json.items.find((item) => item.userId === userId);
}

describe("hardening / time entry read scope", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.worker = await signUp("scopeworker");
    ctx.peer = await signUp("scopepeer");
    ctx.orgA = await createJson(ctx.worker.accessToken, "/tenants", { name: label("Scope A") });
    ctx.orgB = await createJson(ctx.worker.accessToken, "/tenants", { name: label("Scope B") });
    ctx.a = await catalog(ctx.worker.accessToken, ctx.orgA.id);
    ctx.b = await catalog(ctx.worker.accessToken, ctx.orgB.id);
    await invite(ctx.worker.accessToken, `/tenants/${ctx.orgA.id}/invitations`, ctx.peer);
    for (const [org, items] of [[ctx.orgA, ctx.a], [ctx.orgB, ctx.b]]) {
      await createJson(ctx.worker.accessToken, "/time/total", {
        tenantId: org.id,
        projectId: items.project.id,
        taskCategoryId: items.category.id,
        durationMinutes: 60,
        occurredOn: "2026-10-03",
      });
    }
  });

  test("a co-member only sees entries in tenants they share", async () => {
    const listed = await callApi(`/users/${ctx.worker.user.id}/time-entries`, { token: ctx.peer.accessToken });
    assert.equal(listed.status, 200);
    assertList(listed.json);
    assert.ok(listed.json.items.length > 0);
    assert.ok(listed.json.items.every((item) => item.tenantId === ctx.orgA.id));
    const own = await callApi(`/users/${ctx.worker.user.id}/time-entries`, { token: ctx.worker.accessToken });
    assert.ok(own.json.items.some((item) => item.tenantId === ctx.orgB.id));
  });

  test("filtering by an tenant the caller does not share is forbidden", async () => {
    const response = await callApi(`/users/${ctx.worker.user.id}/time-entries`, {
      token: ctx.peer.accessToken,
      query: { tenantId: ctx.orgB.id },
    });
    assertError(response, 403, "forbidden", "Forbidden.");
  });

  test("an empty query filter is ignored", async () => {
    const response = await callApi(`/users/${ctx.worker.user.id}/time-entries`, {
      token: ctx.worker.accessToken,
      query: { tenantId: "", from: "" },
    });
    assert.equal(response.status, 200);
  });
});

describe("hardening / profile privacy", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.admin = await signUp("privadmin");
    ctx.target = await signUp("privtarget", { phone: "801-555-0199" });
    ctx.peer = await signUp("privpeer");
    ctx.org = await createJson(ctx.admin.accessToken, "/tenants", { name: label("Privacy org") });
    await invite(ctx.admin.accessToken, `/tenants/${ctx.org.id}/invitations`, ctx.target);
    await invite(ctx.admin.accessToken, `/tenants/${ctx.org.id}/invitations`, ctx.peer);
    await callApi("/users/me", {
      method: "PATCH",
      token: ctx.target.accessToken,
      body: { zipCode: "84101", notes: "Allergic to bees" },
    });
  });

  test("a co-member does not see phone, zipCode, or notes", async () => {
    const response = await callApi(`/users/${ctx.target.user.id}`, { token: ctx.peer.accessToken });
    assert.equal(response.status, 200);
    assert.equal(response.json.profile.phone, null);
    assert.equal(response.json.profile.zipCode, null);
    assert.equal(response.json.profile.notes, null);
    assert.equal(response.json.profile.firstName, "Ada");
  });

  test("the user and an tenant admin see them", async () => {
    for (const token of [ctx.target.accessToken, ctx.admin.accessToken]) {
      const response = await callApi(`/users/${ctx.target.user.id}`, { token });
      assert.equal(response.status, 200);
      assert.equal(response.json.profile.phone, "801-555-0199");
      assert.equal(response.json.profile.zipCode, "84101");
      assert.equal(response.json.profile.notes, "Allergic to bees");
    }
  });
});

describe("hardening / private projects and logging", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.admin = await signUp("privprojadmin");
    ctx.member = await signUp("privprojmember");
    ctx.editor = await signUp("privprojeditor");
    ctx.org = await createJson(ctx.admin.accessToken, "/tenants", { name: label("Private log org") });
    ctx.items = await catalog(ctx.admin.accessToken, ctx.org.id);
    await invite(ctx.admin.accessToken, `/tenants/${ctx.org.id}/invitations`, ctx.member);
    await invite(ctx.admin.accessToken, `/tenants/${ctx.org.id}/invitations`, ctx.editor);
    ctx.private = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/projects`, {
      title: label("Private project"),
      accessType: "Private",
      editorIds: [ctx.editor.user.id],
    });
    ctx.tenant = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/tenants`, {
      name: label("Hidden organization"),
    });
    ctx.tenantProject = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/projects`, {
      title: label("Organization only"),
      accessType: "Organization",
      organizationId: ctx.tenant.id,
    });
  });

  function body(projectId) {
    return {
      tenantId: ctx.org.id,
      projectId,
      taskCategoryId: ctx.items.category.id,
      durationMinutes: 30,
      occurredOn: "2026-10-04",
    };
  }

  test("a member cannot log time on a private project they cannot see", async () => {
    const response = await callApi("/time/total", {
      method: "POST",
      token: ctx.member.accessToken,
      body: body(ctx.private.id),
    });
    assertError(response, 403, "forbidden", "Forbidden.");
  });

  test("an editor and an admin entering for a member can", async () => {
    await createJson(ctx.editor.accessToken, "/time/total", body(ctx.private.id));
    await createJson(ctx.admin.accessToken, `/users/${ctx.member.user.id}/time-entries`, {
      ...body(ctx.private.id),
      mode: "Total",
    });
  });

  test("a member without organization memberships does not list organization projects", async () => {
    const listed = await callApi(`/tenants/${ctx.org.id}/projects`, {
      token: ctx.member.accessToken,
      query: { limit: 100 },
    });
    assert.equal(listed.status, 200);
    assert.equal(listed.json.items.some((item) => item.id === ctx.tenantProject.id), false);
    assert.equal(listed.json.items.some((item) => item.id === ctx.private.id), false);
  });

  test("tags are checked only after the caller may write", async () => {
    const outsider = await signUp("privprojout");
    const response = await callApi("/time/clock-in", {
      method: "POST",
      token: outsider.accessToken,
      body: {
        tenantId: ctx.org.id,
        projectId: ctx.items.project.id,
        taskCategoryId: ctx.items.category.id,
        tagIds: [missingId()],
      },
    });
    assertError(response, 403, "forbidden", "Forbidden.");
  });
});

describe("hardening / moving an entry between tenants", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.worker = await signUp("moveworker");
    ctx.orgA = await createJson(ctx.worker.accessToken, "/tenants", { name: label("Move A") });
    ctx.orgB = await createJson(ctx.worker.accessToken, "/tenants", { name: label("Move B") });
    ctx.a = await catalog(ctx.worker.accessToken, ctx.orgA.id);
    ctx.b = await catalog(ctx.worker.accessToken, ctx.orgB.id);
    ctx.tag = await createJson(ctx.worker.accessToken, `/tenants/${ctx.orgA.id}/tags`, { name: label("A tag") });
    await callApi(`/tenants/${ctx.orgB.id}`, {
      method: "PATCH",
      token: ctx.worker.accessToken,
      body: { volunteerHourlyRate: 40 },
    });
    ctx.entry = await createJson(ctx.worker.accessToken, "/time/duration", {
      tenantId: ctx.orgA.id,
      projectId: ctx.a.project.id,
      taskCategoryId: ctx.a.category.id,
      durationMinutes: 60,
      occurredOn: "2026-10-05",
      tagIds: [ctx.tag.id],
    });
  });

  test("existing tags must belong to the new tenant", async () => {
    const response = await callApi(`/time-entries/${ctx.entry.id}`, {
      method: "PATCH",
      token: ctx.worker.accessToken,
      body: { tenantId: ctx.orgB.id, projectId: ctx.b.project.id, taskCategoryId: ctx.b.category.id },
    });
    assertError(response, 400, "validation_error", "A tag does not belong to this tenant.");
  });

  test("the rate and in-kind value follow the new tenant", async () => {
    assertMoney(ctx.entry.hourlyRate, 35.47);
    const response = await callApi(`/time-entries/${ctx.entry.id}`, {
      method: "PATCH",
      token: ctx.worker.accessToken,
      body: {
        tenantId: ctx.orgB.id,
        projectId: ctx.b.project.id,
        taskCategoryId: ctx.b.category.id,
        tagIds: [],
      },
    });
    assert.equal(response.status, 200);
    assert.equal(response.json.tenantId, ctx.orgB.id);
    assertMoney(response.json.hourlyRate, 40);
    assertMoney(response.json.inKindValue, inKind(60, 40));
    assert.deepEqual(response.json.tagIds, []);
  });
});

describe("hardening / invitations, sessions, and admins", suite, () => {
  test("inviting to a missing tenant is not found", async () => {
    const person = await signUp("invmissing");
    const response = await callApi(`/tenants/${missingId()}/invitations`, {
      method: "POST",
      token: person.accessToken,
      body: { email: "someone@example.com", role: "MEMBER" },
    });
    assertError(response, 404, "not_found", "Not found.");
  });

  test("concurrent refresh uses inside the overlap window stay signed in", async () => {
    const person = await signUp("refreshrace");
    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        callApi("/auth/refresh", { method: "POST", body: { refreshToken: person.refreshToken } }),
      ),
    );
    assert.equal(
      responses.filter((response) => response.status === 200).length,
      responses.length,
      responses.map((response) => response.status).join(","),
    );
    for (const response of responses) {
      assertSession(response.json, person);
      assert.notEqual(response.json.refreshToken, person.refreshToken);
    }
  });

  test("concurrent demotions never remove every tenant admin", async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const first = await signUp("racefirst");
      const second = await signUp("racesecond");
      const org = await createJson(first.accessToken, "/tenants", { name: label("Race org") });
      await invite(first.accessToken, `/tenants/${org.id}/invitations`, second, "ADMIN");
      const firstMembership = await membershipOf(first.accessToken, org.id, first.user.id);
      const secondMembership = await membershipOf(first.accessToken, org.id, second.user.id);
      const results = await Promise.all([
        callApi(`/tenants/${org.id}/memberships/${secondMembership.id}`, {
          method: "PATCH",
          token: first.accessToken,
          body: { role: "MEMBER" },
        }),
        callApi(`/tenants/${org.id}/memberships/${firstMembership.id}`, {
          method: "PATCH",
          token: second.accessToken,
          body: { role: "MEMBER" },
        }),
      ]);
      const statuses = results.map((result) => result.status).sort();
      assert.ok(
        statuses.every((status) => status === 200 || status === 403 || status === 409),
        statuses.join(","),
      );
      const remaining = await callApi(`/tenants/${org.id}/memberships`, { token: first.accessToken });
      assert.ok(remaining.json.items.some((item) => item.role.code === "ADMIN"), "an admin must remain");
    }
  });
});

describe("hardening / inactive members", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.admin = await signUp("inactiveadmin");
    ctx.member = await signUp("inactivemember");
    ctx.org = await createJson(ctx.admin.accessToken, "/tenants", { name: label("Inactive org") });
    await invite(ctx.admin.accessToken, `/tenants/${ctx.org.id}/invitations`, ctx.member);
    ctx.membership = await membershipOf(ctx.admin.accessToken, ctx.org.id, ctx.member.user.id);
    const deactivated = await callApi(`/tenants/${ctx.org.id}/memberships/${ctx.membership.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { isActive: false },
    });
    assert.equal(deactivated.status, 200);
  });

  test("an inactive member cannot read the tenant", async () => {
    const org = await callApi(`/tenants/${ctx.org.id}`, { token: ctx.member.accessToken });
    const organizations = await callApi(`/tenants/${ctx.org.id}/tenants`, { token: ctx.member.accessToken });
    assertError(org, 403, "forbidden", "Forbidden.");
    assertError(organizations, 403, "forbidden", "Forbidden.");
  });

  test("an inactive member can still leave", async () => {
    await remove(ctx.member.accessToken, `/tenants/${ctx.org.id}/memberships/${ctx.membership.id}`);
  });
});

describe("hardening / responses and errors", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.admin = await signUp("respadmin");
    ctx.org = await createJson(ctx.admin.accessToken, "/tenants", { name: label("Response org") });
    ctx.items = await catalog(ctx.admin.accessToken, ctx.org.id);
  });

  test("a duplicate sourceRef names the field", async () => {
    const sourceRef = label("import");
    const entry = {
      tenantId: ctx.org.id,
      projectId: ctx.items.project.id,
      taskCategoryId: ctx.items.category.id,
      durationMinutes: 15,
      occurredOn: "2026-10-06",
      sourceRef,
    };
    await createJson(ctx.admin.accessToken, "/time/duration", entry);
    const duplicate = await callApi("/time/duration", { method: "POST", token: ctx.admin.accessToken, body: entry });
    assertError(duplicate, 409, "conflict", "That sourceRef is already in use.");
  });

  test("an invalid theme leaves the tenant unchanged", async () => {
    const response = await callApi(`/tenants/${ctx.org.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { name: label("Should not stick"), preferences: { allowTimeEntryEditing: "yes" } },
    });
    assertError(response, 400, "validation_error");
    const fetched = await callApi(`/tenants/${ctx.org.id}`, { token: ctx.admin.accessToken });
    assert.equal(fetched.json.name, ctx.org.name);
  });

  test("organizations and tags return only their documented fields", async () => {
    const organization = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/tenants`, {
      name: "Shape dept",
    });
    const tag = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/tags`, { name: "Shape tag" });
    assertNamed(organization, { tenantId: ctx.org.id, name: "Shape dept" });
    assertNamed(tag, { tenantId: ctx.org.id, name: "Shape tag", isArchived: false });
    const organizations = await callApi(`/tenants/${ctx.org.id}/tenants`, { token: ctx.admin.accessToken });
    const tags = await callApi(`/tenants/${ctx.org.id}/tags`, { token: ctx.admin.accessToken });
    assertNamed(organizations.json.items[0], { tenantId: ctx.org.id, name: "Shape dept" });
    assertNamed(tags.json.items[0], { tenantId: ctx.org.id, name: "Shape tag", isArchived: false });
    const renamed = await callApi(`/tenants/${organization.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { name: "Shape dept 2" },
    });
    assertNamed(renamed.json, { tenantId: ctx.org.id, name: "Shape dept 2" });
    const fetched = await callApi(`/tenants/${organization.id}`, { token: ctx.admin.accessToken });
    assertNamed(fetched.json, { tenantId: ctx.org.id, name: "Shape dept 2" });
  });

  test("csv neutralizes formulas and uses a fixed format", async () => {
    await createJson(ctx.admin.accessToken, "/time/duration", {
      tenantId: ctx.org.id,
      projectId: ctx.items.project.id,
      taskCategoryId: ctx.items.category.id,
      durationMinutes: 30,
      occurredOn: "2026-10-07",
      description: "=HYPERLINK(\"http://evil.example\")",
    });
    await createJson(ctx.admin.accessToken, "/time/duration", {
      tenantId: ctx.org.id,
      projectId: ctx.items.project.id,
      taskCategoryId: ctx.items.category.id,
      durationMinutes: 30,
      occurredOn: "2026-10-08",
      description: "line one\rline two",
    });
    const response = await callApi(`/tenants/${ctx.org.id}/time-entries.csv`, {
      token: ctx.admin.accessToken,
      query: { from: "2026-10-07", to: "2026-10-08" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/csv; charset=utf-8");
    assert.equal(response.text.endsWith("\n"), false);
    assert.equal(response.text.includes("\r\n"), false);
    const lines = response.text.split("\n");
    assert.equal(lines.length, 3);
    assert.ok(lines[1].endsWith(",\"'=HYPERLINK(\"\"http://evil.example\"\")\","), lines[1]);
    assert.ok(lines[2].endsWith(",\"line one\rline two\","), lines[2]);
  });
});
