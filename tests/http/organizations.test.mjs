import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import {
  acceptInvite,
  assertError,
  assertList,
  assertMoney,
  assertOrganization,
  callApi,
  defaultEntityLabels,
  defaultPreferences,
  themeBody,
  createJson,
  grantSuperAdmin,
  label,
  logIn,
  missingId,
  identity,
  remove,
  signUp,
  suite,
  waitForEmails,
} from "./client.mjs";

describe("organizations", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.admin = await signUp("orgadmin");
    ctx.member = await signUp("orgmember");
    ctx.outsider = await signUp("orgout");
    ctx.name = label("Organization");
    ctx.org = await createJson(ctx.admin.accessToken, "/organizations", { name: ctx.name, ignored: true });
    await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/invitations`, {
      email: ctx.member.email,
      role: "MEMBER",
    });
    await acceptInvite(ctx.member.accessToken, ctx.member.email);
  });

  test("create returns the organization and makes the caller an admin", async () => {
    assertOrganization(ctx.org, ctx.name);
    const memberships = await callApi(`/organizations/${ctx.org.id}/memberships`, { token: ctx.admin.accessToken });
    assert.equal(memberships.status, 200);
    const admin = memberships.json.items.find((item) => item.userId === ctx.admin.user.id);
    assert.equal(admin.role.code, "ADMIN");
    assert.equal(admin.rateType, "Volunteer");
    assert.equal(admin.isActive, true);
    assert.equal(admin.departmentId, null);
  });

  test("list returns only the caller's organizations unless they are a SuperAdmin", async () => {
    const other = await signUp("orgother");
    const otherOrg = await createJson(other.accessToken, "/organizations", { name: label("Other org") });
    const listed = await callApi("/organizations", { token: ctx.admin.accessToken });
    assertList(listed.json);
    assert.ok(listed.json.items.some((item) => item.id === ctx.org.id));
    assert.equal(
      listed.json.items.some((item) => item.id === otherOrg.id),
      false,
    );
    const unauthenticated = await callApi("/organizations");
    assertError(unauthenticated, 401, "unauthorized", "Authentication is required.");
    await grantSuperAdmin(ctx.admin.user.id);
    ctx.admin = { ...ctx.admin, ...(await logIn(ctx.admin.username, ctx.admin.password)) };
    let found = false;
    for (let offset = 0; !found; offset += 100) {
      const all = await callApi("/organizations", { token: ctx.admin.accessToken, query: { limit: 100, offset } });
      assertList(all.json, { limit: 100, offset });
      assert.ok(all.json.items.length > 0, "the organization was not listed");
      found = all.json.items.some((item) => item.id === otherOrg.id);
    }
  });

  test("get requires membership", async () => {
    const response = await callApi(`/organizations/${ctx.org.id}`, { token: ctx.member.accessToken });
    assert.equal(response.status, 200);
    assert.equal(response.json.id, ctx.org.id);
    const outsider = await callApi(`/organizations/${ctx.org.id}`, { token: ctx.outsider.accessToken });
    const missing = await callApi(`/organizations/${missingId()}`, { token: ctx.admin.accessToken });
    assertError(outsider, 403, "forbidden", "Forbidden.");
    assertError(missing, 404, "not_found", "Not found.");
  });

  test("patch updates rates, labels, and theme, and members cannot patch", async () => {
    const forbidden = await callApi(`/organizations/${ctx.org.id}`, {
      method: "PATCH",
      token: ctx.member.accessToken,
      body: { name: label("Nope") },
    });
    const empty = await callApi(`/organizations/${ctx.org.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: {},
    });
    const rate = await callApi(`/organizations/${ctx.org.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { volunteerHourlyRate: 0 },
    });
    assertError(forbidden, 403, "forbidden", "Forbidden.");
    assertError(empty, 400, "validation_error", "Provide at least one field to update.");
    assertError(rate, 400, "validation_error", "volunteerHourlyRate must be greater than zero.");

    const name = label("Renamed org");
    const labels = {
      organization: "Org",
      project: "Project / Event",
      department: "Group",
      taskCategory: "Task Category",
    };
    const createdTheme = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/themes`, themeBody());
    const categoricalPalette = ["#001836", "#D4AC59", "#4EBFAE", "#FF5E9F", "#738091", "#EAD6AC"];
    const savedTheme = await callApi(`/organizations/${ctx.org.id}/themes/${createdTheme.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: themeBody({ name: createdTheme.name, categoricalPalette, chartColor: "#D4AC59" }),
    });
    assert.equal(savedTheme.status, 200);
    assert.deepEqual(savedTheme.json.categoricalPalette, categoricalPalette);
    assert.equal(savedTheme.json.chartColor, "#D4AC59");
    assert.equal(createdTheme.chartColor, "#112233");
    const updated = await callApi(`/organizations/${ctx.org.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: {
        name,
        volunteerHourlyRate: 40,
        defaultRateType: "Professional",
        themeId: createdTheme.id,
        wordmarkUrl: "https://example.com/wordmark.svg",
        wordmarkOnLightUrl: "https://example.com/wordmark-on-light.svg",
        preferences: { allowTimeEntryEditing: false, entityLabels: labels },
      },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.json.name, name);
    assertMoney(updated.json.volunteerHourlyRate, 40);
    assert.equal(updated.json.defaultRateType, "Professional");
    assert.equal(updated.json.themeId, createdTheme.id);
    assert.equal(updated.json.theme.name, createdTheme.name);
    assert.equal(updated.json.wordmarkUrl, "https://example.com/wordmark.svg");
    assert.equal(updated.json.wordmarkOnLightUrl, "https://example.com/wordmark-on-light.svg");
    assert.deepEqual(updated.json.preferences, {
      allowTimeEntryEditing: false,
      allowVolunteersToAddVolunteers: false,
      entityLabels: labels,
      feedbackNotifyUserIds: [],
      emailSettings: defaultPreferences().emailSettings,
    });

    const globals = await callApi(`/organizations/${ctx.org.id}/themes`, { token: ctx.member.accessToken });
    assert.equal(globals.status, 200);
    assert.ok(globals.json.items.some((theme) => theme.organizationId === null && theme.name === "VolunTime"));
    const globalEdit = await callApi(
      `/organizations/${ctx.org.id}/themes/${globals.json.items.find((theme) => theme.organizationId === null).id}`,
      {
        method: "PATCH",
        token: ctx.admin.accessToken,
        body: themeBody({ name: "Nope" }),
      },
    );
    assertError(globalEdit, 404, "not_found", "Not found.");

    const badPreference = await callApi(`/organizations/${ctx.org.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { preferences: { allowTimeEntryEditing: "yes" } },
    });
    assertError(badPreference, 400, "validation_error", "allowTimeEntryEditing must be a boolean.");
    const editing = await callApi(`/organizations/${ctx.org.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { preferences: { allowTimeEntryEditing: true } },
    });
    assert.equal(editing.status, 200);
    assert.equal(editing.json.preferences.allowTimeEntryEditing, true);
    assert.deepEqual(editing.json.preferences.entityLabels, defaultEntityLabels);
    const locked = await callApi(`/organizations/${ctx.org.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { preferences: { allowTimeEntryEditing: false, entityLabels: labels } },
    });
    assert.equal(locked.status, 200);
    assert.equal(locked.json.preferences.allowTimeEntryEditing, false);
    assert.deepEqual(locked.json.preferences.entityLabels, labels);

    const reset = await callApi(`/organizations/${ctx.org.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { defaultRateType: "Volunteer", volunteerHourlyRate: 35.47 },
    });
    assert.equal(reset.status, 200);
    assert.equal(reset.json.defaultRateType, "Volunteer");
    assert.deepEqual(reset.json.preferences, defaultPreferences({ entityLabels: labels }));
  });

  test("delete fails while time entries remain and succeeds after they are gone", async () => {
    const org = await createJson(ctx.admin.accessToken, "/organizations", { name: label("Doomed org") });
    const category = await createJson(ctx.admin.accessToken, `/organizations/${org.id}/task-categories`, {
      name: label("Category"),
    });
    const project = await createJson(ctx.admin.accessToken, `/organizations/${org.id}/projects`, {
      title: label("Project"),
      accessType: "Public",
    });
    await createJson(ctx.admin.accessToken, "/time/duration", {
      organizationId: org.id,
      projectId: project.id,
      taskCategoryId: category.id,
      durationMinutes: 30,
      occurredOn: "2026-10-02",
    });
    const blocked = await callApi(`/organizations/${org.id}`, { method: "DELETE", token: ctx.admin.accessToken });
    assertError(blocked, 409, "conflict", "Delete the time entries first.");
    const entries = await callApi(`/users/${ctx.admin.user.id}/time-entries`, {
      token: ctx.admin.accessToken,
      query: { organizationId: org.id },
    });
    await remove(ctx.admin.accessToken, `/time-entries/${entries.json.items[0].id}`);
    await remove(ctx.admin.accessToken, `/organizations/${org.id}`);
    const missing = await callApi(`/organizations/${org.id}`, { token: ctx.admin.accessToken });
    assertError(missing, 404, "not_found", "Not found.");
  });

  test("validates organization slug and pins requests with x-voluntime-tenant", async () => {
    const slugA = `org-${Date.now().toString(36)}-a`;
    const slugB = `org-${Date.now().toString(36)}-b`;
    const orgA = await createJson(ctx.admin.accessToken, "/organizations", { name: label("Tenant A") });
    const orgB = await createJson(ctx.admin.accessToken, "/organizations", { name: label("Tenant B") });

    for (const reserved of ["www", "staging", "admin", "api"]) {
      const res = await callApi(`/organizations/${orgA.id}`, {
        method: "PATCH",
        token: ctx.admin.accessToken,
        body: { slug: reserved },
      });
      assertError(res, 400, "validation_error", "slug is reserved.");
    }

    for (const malformed of ["-bad", "bad-", "bad_slug", "bad.slug", "a".repeat(64)]) {
      const res = await callApi(`/organizations/${orgA.id}`, {
        method: "PATCH",
        token: ctx.admin.accessToken,
        body: { slug: malformed },
      });
      assertError(
        res,
        400,
        "validation_error",
        "slug must be 1 to 63 lowercase letters, digits, or hyphens, and cannot start or end with a hyphen.",
      );
    }

    const launched = await callApi(`/organizations/${orgA.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { slug: slugA.toUpperCase() },
    });
    assert.equal(launched.status, 200, launched.text);
    assert.equal(launched.json.slug, slugA);

    const duplicate = await callApi(`/organizations/${orgB.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { slug: slugA },
    });
    assertError(duplicate, 409, "conflict", "That value is already in use.");

    const launchedB = await callApi(`/organizations/${orgB.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { slug: slugB },
    });
    assert.equal(launchedB.status, 200, launchedB.text);
    assert.equal(launchedB.json.slug, slugB);

    const listedPinned = await callApi("/organizations", {
      token: ctx.admin.accessToken,
      tenant: slugA,
    });
    assert.equal(listedPinned.status, 200, listedPinned.text);
    assert.deepEqual(
      listedPinned.json.items.map((item) => item.id),
      [orgA.id],
    );

    const outsiderListed = await callApi("/organizations", {
      token: ctx.outsider.accessToken,
      tenant: slugA,
    });
    assert.equal(outsiderListed.status, 200, outsiderListed.text);
    assert.deepEqual(outsiderListed.json.items, []);

    const createBlocked = await callApi("/organizations", {
      method: "POST",
      token: ctx.admin.accessToken,
      tenant: slugA,
      body: { name: label("Blocked on tenant") },
    });
    assertError(createBlocked, 403, "forbidden", "Forbidden.");

    const signupCandidate = identity("tenantsignup");
    const signupBlocked = await callApi("/auth/user", {
      method: "POST",
      tenant: slugA,
      body: signupCandidate,
    });
    assertError(signupBlocked, 403, "forbidden", "Forbidden.");

    const otherOrgNotFound = await callApi(`/organizations/${orgB.id}`, {
      token: ctx.admin.accessToken,
      tenant: slugA,
    });
    assertError(otherOrgNotFound, 404, "not_found", "Not found.");

    const unknownTenant = await callApi(`/organizations/${orgA.id}`, {
      token: ctx.admin.accessToken,
      tenant: "unknown-tenant-slug-xyz",
    });
    assertError(unknownTenant, 404, "not_found", "Not found.");

    const slugChangeOnTenant = await callApi(`/organizations/${orgA.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      tenant: slugA,
      body: { slug: null },
    });
    assertError(slugChangeOnTenant, 403, "forbidden", "Forbidden.");

    const superAdminUsersOnTenant = await callApi("/users", {
      token: ctx.admin.accessToken,
      tenant: slugA,
    });
    assertError(superAdminUsersOnTenant, 403, "forbidden", "Forbidden.");

    const projectB = await createJson(ctx.admin.accessToken, `/organizations/${orgB.id}/projects`, {
      title: label("Tenant B project"),
      accessType: "Public",
    });
    const categoryB = await createJson(ctx.admin.accessToken, `/organizations/${orgB.id}/task-categories`, {
      name: label("Tenant B category"),
    });
    const entryB = await createJson(ctx.admin.accessToken, `/users/${ctx.admin.user.id}/time-entries`, {
      organizationId: orgB.id,
      projectId: projectB.id,
      taskCategoryId: categoryB.id,
      mode: "Total",
      durationMinutes: 60,
      occurredOn: "2026-04-01",
    });
    const crossOrgEntryGet = await callApi(`/time-entries/${entryB.id}`, {
      token: ctx.admin.accessToken,
      tenant: slugA,
    });
    assertError(crossOrgEntryGet, 404, "not_found", "Not found.");

    const crossOrgCreate = await callApi(`/users/${ctx.admin.user.id}/time-entries`, {
      method: "POST",
      token: ctx.admin.accessToken,
      tenant: slugA,
      body: {
        organizationId: orgB.id,
        projectId: projectB.id,
        taskCategoryId: categoryB.id,
        mode: "Total",
        durationMinutes: 30,
        occurredOn: "2026-04-02",
      },
    });
    assertError(crossOrgCreate, 404, "not_found", "Not found.");

    const entriesOnTenantA = await callApi(`/users/${ctx.admin.user.id}/time-entries`, {
      token: ctx.admin.accessToken,
      tenant: slugA,
    });
    assert.equal(entriesOnTenantA.status, 200, entriesOnTenantA.text);
    assert.ok(entriesOnTenantA.json.items.every((item) => item.organizationId === orgA.id));

    const invitee = identity("tenantinv");
    const invited = await callApi(`/organizations/${orgA.id}/invitations`, {
      method: "POST",
      token: ctx.admin.accessToken,
      tenant: slugA,
      body: { email: invitee.email, role: "VOLUNTEER" },
    });
    assert.equal(invited.status, 201, invited.text);
    const messages = await waitForEmails(invitee.email, 1);
    assert.match(messages[0].text, new RegExp(`https?://${slugA}\\.[a-z0-9.-]+(?::\\d+)?/accept\\?code=[A-Z0-9-]{14}`));

    const cleared = await callApi(`/organizations/${orgA.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { slug: null },
    });
    assert.equal(cleared.status, 200, cleared.text);
    assert.equal(cleared.json.slug, null);
  });
});
