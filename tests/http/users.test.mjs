import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import {
  acceptInvite,
  assertError,
  assertList,
  assertUser,
  callApi,
  countSuperAdmins,
  createJson,
  grantSuperAdmin,
  identity,
  label,
  logIn,
  missingId,
  remove,
  signUp,
  suite,
  joinOrg,
} from "./client.mjs";

describe("users", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.owner = await signUp("users");
    ctx.other = await signUp("usersb");
    ctx.stranger = await signUp("usersc");
    ctx.org = await createJson(ctx.owner.accessToken, "/organizations", { name: label("Users org") });
    const invited = await createJson(ctx.owner.accessToken, `/organizations/${ctx.org.id}/invitations`, {
      email: ctx.other.email,
      role: "MEMBER",
    });
    ctx.invitationId = invited.id;
    await acceptInvite(ctx.other.accessToken, ctx.other.email);
  });

  test("get me returns the caller", async () => {
    const response = await callApi("/users/me", { token: ctx.owner.accessToken });
    assert.equal(response.status, 200);
    assertUser(response.json, ctx.owner);
    assert.equal(response.json.id, ctx.owner.user.id);
  });

  test("patch me updates the profile and rejects isSuperAdmin", async () => {
    const rejected = await callApi("/users/me", {
      method: "PATCH",
      token: ctx.owner.accessToken,
      body: { isSuperAdmin: true },
    });
    assertError(rejected, 403, "forbidden", "Forbidden.");
    const response = await callApi("/users/me", {
      method: "PATCH",
      token: ctx.owner.accessToken,
      body: {
        displayName: "Owner",
        phone: null,
        zipCode: "84101",
        notes: "Board chair",
        timezone: "America/Denver",
      },
    });
    assert.equal(response.status, 200);
    assert.equal(response.json.profile.displayName, "Owner");
    assert.equal(response.json.profile.phone, null);
    assert.equal(response.json.profile.zipCode, "84101");
    assert.equal(response.json.profile.notes, "Board chair");
    assert.equal(response.json.profile.timezone, "America/Denver");
    assert.equal(response.json.isSuperAdmin, false);
  });

  test("patch me updates the email", async () => {
    const next = `updated-${ctx.owner.email}`;
    const response = await callApi("/users/me", {
      method: "PATCH",
      token: ctx.owner.accessToken,
      body: { email: next.toUpperCase() },
    });
    assert.equal(response.status, 200);
    assert.equal(response.json.email, next.toLowerCase());
    const restored = await callApi("/users/me", {
      method: "PATCH",
      token: ctx.owner.accessToken,
      body: { email: ctx.owner.email },
    });
    assert.equal(restored.status, 200);
    assert.equal(restored.json.email, ctx.owner.email);
  });

  test("patch me changes the password only with the current password", async () => {
    const missing = await callApi("/users/me", {
      method: "PATCH",
      token: ctx.owner.accessToken,
      body: { password: "another-password-1" },
    });
    assertError(missing, 400, "validation_error", "currentPassword is required to change the password.");
    const wrong = await callApi("/users/me", {
      method: "PATCH",
      token: ctx.owner.accessToken,
      body: { password: "another-password-1", currentPassword: "wrong-password" },
    });
    assertError(wrong, 400, "validation_error", "The current password is incorrect.");
    const response = await callApi("/users/me", {
      method: "PATCH",
      token: ctx.owner.accessToken,
      body: { password: "another-password-1", currentPassword: ctx.owner.password },
    });
    assert.equal(response.status, 200);
    const oldRefresh = await callApi("/auth/refresh", {
      method: "POST",
      body: { refreshToken: ctx.owner.refreshToken },
    });
    assertError(oldRefresh, 401, "unauthorized");
    ctx.owner = { ...ctx.owner, ...(await logIn(ctx.owner.username, "another-password-1")), password: "another-password-1" };
  });

  test("list is forbidden until the caller is a SuperAdmin", async () => {
    const forbidden = await callApi("/users", { token: ctx.owner.accessToken });
    assertError(forbidden, 403, "forbidden", "Forbidden.");
    const unauthenticated = await callApi("/users");
    assertError(unauthenticated, 401, "unauthorized", "Authentication is required.");
  });

  test("get by id is limited to the user, a peer, or a SuperAdmin", async () => {
    const self = await callApi(`/users/${ctx.owner.user.id}`, { token: ctx.owner.accessToken });
    const peer = await callApi(`/users/${ctx.owner.user.id}`, { token: ctx.other.accessToken });
    const stranger = await callApi(`/users/${ctx.owner.user.id}`, { token: ctx.stranger.accessToken });
    const missing = await callApi(`/users/${missingId()}`, { token: ctx.owner.accessToken });
    assert.equal(self.status, 200);
    assert.equal(self.json.id, ctx.owner.user.id);
    assert.equal(peer.status, 200);
    assert.equal(peer.json.id, ctx.owner.user.id);
    assertError(stranger, 403, "forbidden", "Forbidden.");
    assertError(missing, 404, "not_found", "Not found.");
  });

  test("patch by id accepts isSuperAdmin only from a SuperAdmin", async () => {
    const forbidden = await callApi(`/users/${ctx.other.user.id}`, {
      method: "PATCH",
      token: ctx.owner.accessToken,
      body: { isSuperAdmin: true },
    });
    assertError(forbidden, 403, "forbidden", "Forbidden.");
    await grantSuperAdmin(ctx.owner.user.id);
    await grantSuperAdmin(ctx.other.user.id);
    ctx.owner = { ...ctx.owner, ...(await logIn(ctx.owner.username, ctx.owner.password)) };
    ctx.other = { ...ctx.other, ...(await logIn(ctx.other.username, ctx.other.password)) };
    const demoted = await callApi(`/users/${ctx.other.user.id}`, {
      method: "PATCH",
      token: ctx.owner.accessToken,
      body: { isSuperAdmin: false },
    });
    assert.equal(demoted.status, 200);
    assert.equal(demoted.json.isSuperAdmin, false);
    let found = null;
    for (let offset = 0; !found; offset += 100) {
      const listed = await callApi("/users", { token: ctx.owner.accessToken, query: { limit: 100, offset } });
      assertList(listed.json, { limit: 100, offset });
      found = listed.json.items.find((user) => user.id === ctx.owner.user.id);
      if (listed.json.items.length < 100) {
        break;
      }
    }
    assert.equal(found?.isSuperAdmin, true);
    const onlyOne = (await countSuperAdmins()) === 1;
    const last = await callApi(`/users/${ctx.owner.user.id}`, {
      method: "PATCH",
      token: ctx.owner.accessToken,
      body: { isSuperAdmin: false },
    });
    if (onlyOne) {
      assertError(last, 409, "conflict", "The last SuperAdmin cannot be removed.");
    } else {
      assert.equal(last.status, 200);
      assert.equal(last.json.isSuperAdmin, false);
      await grantSuperAdmin(ctx.owner.user.id);
      ctx.owner = { ...ctx.owner, ...(await logIn(ctx.owner.username, ctx.owner.password)) };
    }
  });

  test("delete removes a user who has no time, and keeps the last SuperAdmin", async () => {
    const deletable = await signUp("usersdel");
    if ((await countSuperAdmins()) === 1) {
      const blocked = await callApi(`/users/${ctx.owner.user.id}`, {
        method: "DELETE",
        token: ctx.owner.accessToken,
      });
      assertError(blocked, 409, "conflict", "The last SuperAdmin cannot be removed.");
    }
    await remove(deletable.accessToken, `/users/${deletable.user.id}`);
    const missing = await callApi(`/users/${deletable.user.id}`, { token: ctx.owner.accessToken });
    assertError(missing, 404, "not_found", "Not found.");
  });
});

describe("users / workspace", suite, () => {
  test("returns the apex workspace and ignores a tenant pin", async () => {
    const owner = await signUp("wsowner");
    const member = await signUp("wsmember");
    const volunteer = identity("wsvol");
    const first = await createJson(owner.accessToken, "/organizations", { name: label("Workspace A") });
    const second = await createJson(owner.accessToken, "/organizations", { name: label("Workspace B") });
    const slug = `ws${Date.now().toString(36)}`;
    const launched = await callApi(`/organizations/${first.id}`, {
      method: "PATCH",
      token: owner.accessToken,
      body: { slug },
    });
    assert.equal(launched.status, 200);

    await joinOrg(owner.accessToken, first.id, member, { role: "MEMBER" });
    await createJson(owner.accessToken, `/organizations/${first.id}/memberships`, {
      email: volunteer.email,
      username: volunteer.username,
      password: volunteer.password,
      firstName: "Vol",
      lastName: "Unteer",
      role: "VOLUNTEER",
    });

    const ownerWorkspace = await callApi("/users/me/workspace", {
      token: owner.accessToken,
      query: { organizationId: second.id },
      tenant: slug,
    });
    assert.equal(ownerWorkspace.status, 200);
    assert.equal(ownerWorkspace.json.organization.id, second.id);
    assert.equal(
      ownerWorkspace.json.organizations.some((item) => item.id === first.id),
      true,
    );
    assert.equal(
      ownerWorkspace.json.organizations.some((item) => item.id === second.id),
      true,
    );
    assert.equal(ownerWorkspace.json.role, "ADMIN");
    assert.equal(ownerWorkspace.json.isAdmin, true);
    assert.equal(ownerWorkspace.json.canSelectRate, true);
    assert.equal(ownerWorkspace.json.isCoordinator, false);
    assert.equal(ownerWorkspace.json.groupDepartments, "all");
    assert.equal(ownerWorkspace.json.permissions.includes("manage_organization"), true);
    assert.equal(ownerWorkspace.json.viewer.id, owner.user.id);
    assert.equal(ownerWorkspace.json.viewer.username, owner.user.username);

    const fallback = await callApi("/users/me/workspace", {
      token: owner.accessToken,
      query: { organizationId: missingId() },
    });
    assert.equal(fallback.status, 200);
    assert.equal(fallback.json.organization.id, fallback.json.organizations[0].id);

    const memberWorkspace = await callApi("/users/me/workspace", { token: member.accessToken });
    assert.equal(memberWorkspace.status, 200);
    assert.equal(memberWorkspace.json.organization.id, first.id);
    assert.equal(memberWorkspace.json.role, "MEMBER");
    assert.equal(memberWorkspace.json.isAdmin, false);
    assert.equal(memberWorkspace.json.canSelectRate, true);
    assert.equal(memberWorkspace.json.permissions.includes("manage_organization"), false);
    assert.equal(memberWorkspace.json.permissions.includes("log_own_time"), true);

    const temporary = await logIn(volunteer.username, volunteer.password, { mustChangePassword: true });
    const blocked = await callApi("/users/me/workspace", { token: temporary.accessToken });
    assertError(blocked, 403, "password_change_required", "You must change your password before continuing.");
    const changed = await callApi("/users/me", {
      method: "PATCH",
      token: temporary.accessToken,
      body: { password: "volunteer-password-1", currentPassword: volunteer.password },
    });
    assert.equal(changed.status, 200);
    const after = await logIn(volunteer.username, "volunteer-password-1");
    const volunteerWorkspace = await callApi("/users/me/workspace", { token: after.accessToken });
    assert.equal(volunteerWorkspace.status, 200);
    assert.equal(volunteerWorkspace.json.role, "VOLUNTEER");
    assert.equal(volunteerWorkspace.json.isAdmin, false);
    assert.equal(volunteerWorkspace.json.canSelectRate, false);
    assert.equal(volunteerWorkspace.json.permissions.includes("log_own_time"), true);
    assert.equal(volunteerWorkspace.json.permissions.includes("manage_organization"), false);
    assert.deepEqual(volunteerWorkspace.json.groupDepartments, []);

    const lonely = await signUp("wslonely");
    const empty = await callApi("/users/me/workspace", { token: lonely.accessToken });
    assert.equal(empty.status, 200);
    assert.equal(empty.json.organization, null);
    assert.deepEqual(empty.json.organizations, []);
    assert.equal(empty.json.role, null);
    assert.deepEqual(empty.json.permissions, []);
    assert.equal(empty.json.isAdmin, false);
    assert.equal(empty.json.isCoordinator, false);
    assert.equal(empty.json.canSelectRate, false);
    assert.deepEqual(empty.json.groupDepartments, []);

    const unauthenticated = await callApi("/users/me/workspace");
    assertError(unauthenticated, 401, "unauthorized", "Authentication is required.");
  });
});
