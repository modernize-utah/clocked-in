import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import {
  acceptInvite,
  assertError,
  assertInvitation,
  assertKeys,
  assertList,
  callApi,
  createJson,
  label,
  missingId,
  signUp,
  suite,
  waitForCode,
} from "./client.mjs";

describe("invitations", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.admin = await signUp("inviteadmin");
    ctx.member = await signUp("invitemember");
    ctx.org = await createJson(ctx.admin.accessToken, "/tenants", { name: label("Invite org") });
    ctx.tenant = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/tenants`, {
      name: label("Invite organization"),
    });
  });

  test("create, list, and revoke an tenant invitation", async () => {
    const created = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/invitations`, {
      email: ctx.member.email.toUpperCase(),
      role: "member",
    });
    assertInvitation(created, {
      email: ctx.member.email,
      tenantId: ctx.org.id,
      organizationId: null,
      role: "MEMBER",
    });
    assert.equal(created.invitedByUserId, ctx.admin.user.id);
    assert.equal(created.acceptedAt, null);
    assert.equal(created.revokedAt, null);
    const listed = await callApi(`/tenants/${ctx.org.id}/invitations`, { token: ctx.admin.accessToken });
    assertList(listed.json);
    assert.ok(listed.json.items.some((item) => item.id === created.id));
    const duplicate = await callApi(`/tenants/${ctx.org.id}/invitations`, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: { email: ctx.member.email, role: "ADMIN" },
    });
    assertError(duplicate, 409, "conflict", "A pending invite already exists for that email.");
    const forbidden = await callApi(`/tenants/${ctx.org.id}/invitations`, {
      method: "POST",
      token: ctx.member.accessToken,
      body: { email: "later@example.com", role: "MEMBER" },
    });
    assertError(forbidden, 403, "forbidden", "Forbidden.");
    const revoked = await callApi(`/tenants/${ctx.org.id}/invitations/${created.id}`, {
      method: "DELETE",
      token: ctx.admin.accessToken,
    });
    assert.equal(revoked.status, 200);
    assert.equal(revoked.json.id, created.id);
    assert.notEqual(revoked.json.revokedAt, null);
    const missing = await callApi(`/tenants/${ctx.org.id}/invitations/${missingId()}`, {
      method: "DELETE",
      token: ctx.admin.accessToken,
    });
    assertError(missing, 404, "not_found", "Not found.");
  });

  test("accept matches the signed-in email and creates the membership", async () => {
    const created = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/invitations`, {
      email: ctx.member.email,
      role: "MEMBER",
    });
    const code = await waitForCode(ctx.member.email);
    const stranger = await signUp("invitestranger");
    const wrong = await callApi("/invitations/accept", {
      method: "POST",
      token: stranger.accessToken,
      body: { code },
    });
    assertError(wrong, 403, "forbidden", "This invite was sent to a different email.");
    const unauthenticated = await callApi("/invitations/accept", { method: "POST", body: { code } });
    assertError(unauthenticated, 401, "unauthorized", "Authentication is required.");
    const bad = await callApi("/invitations/accept", {
      method: "POST",
      token: ctx.member.accessToken,
      body: { code: "not-a-real-code" },
    });
    assertError(bad, 400, "validation_error", "The code is not valid.");
    const accepted = await callApi("/invitations/accept", {
      method: "POST",
      token: ctx.member.accessToken,
      body: { code },
    });
    assert.equal(accepted.status, 200);
    assertKeys(accepted.json, ["invitation", "tenantMembership", "organizationMembership"]);
    assert.equal(accepted.json.invitation.id, created.id);
    assert.notEqual(accepted.json.invitation.acceptedAt, null);
    assert.equal(accepted.json.organizationMembership, null);
    assert.equal(accepted.json.tenantMembership.userId, ctx.member.user.id);
    assert.equal(accepted.json.tenantMembership.role.code, "MEMBER");
    const again = await callApi(`/tenants/${ctx.org.id}/invitations/${created.id}`, {
      method: "DELETE",
      token: ctx.admin.accessToken,
    });
    assertError(again, 409, "conflict", "This invite has already been accepted.");
    await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/invitations`, {
      email: ctx.member.email,
      role: "ADMIN",
    });
    const codeAgain = await waitForCode(ctx.member.email);
    const repeat = await callApi("/invitations/accept", {
      method: "POST",
      token: ctx.member.accessToken,
      body: { code: codeAgain },
    });
    assertError(repeat, 409, "conflict", "You are already a member.");
  });

  test("accept a organization invitation creates an tenant membership when needed", async () => {
    const recruit = await signUp("inviterecruit");
    const created = await createJson(ctx.admin.accessToken, `/tenants/${ctx.tenant.id}/invitations`, {
      email: recruit.email,
      role: "ADMIN",
    });
    assertInvitation(created, {
      email: recruit.email,
      tenantId: ctx.org.id,
      organizationId: ctx.tenant.id,
      role: "ADMIN",
    });
    const accepted = await acceptInvite(recruit.accessToken, recruit.email);
    assert.equal(accepted.tenantMembership.role.code, "MEMBER");
    assert.equal(accepted.organizationMembership.role.code, "ADMIN");
    assert.equal(accepted.organizationMembership.organizationId, ctx.tenant.id);
    const hidden = await callApi(`/tenants/${ctx.tenant.id}/invitations`, { token: ctx.member.accessToken });
    assertError(hidden, 403, "forbidden", "Forbidden.");
    const listed = await callApi(`/tenants/${ctx.tenant.id}/invitations`, { token: ctx.admin.accessToken });
    assertList(listed.json);
    assert.ok(listed.json.items.some((item) => item.id === created.id));
    const revoked = await callApi(`/tenants/${ctx.tenant.id}/invitations/${created.id}`, {
      method: "DELETE",
      token: ctx.admin.accessToken,
    });
    assertError(revoked, 409, "conflict", "This invite has already been accepted.");
  });

  test("a organization admin can invite to that organization", async () => {
    const coordinator = await signUp("invitecoord");
    const recruit = await signUp("invitecoordrecruit");
    await createJson(ctx.admin.accessToken, `/tenants/${ctx.tenant.id}/invitations`, {
      email: coordinator.email,
      role: "ADMIN",
    });
    await acceptInvite(coordinator.accessToken, coordinator.email);
    const created = await createJson(coordinator.accessToken, `/tenants/${ctx.tenant.id}/invitations`, {
      email: recruit.email,
      role: "MEMBER",
    });
    assertInvitation(created, {
      email: recruit.email,
      tenantId: ctx.org.id,
      organizationId: ctx.tenant.id,
      role: "MEMBER",
    });
    const listed = await callApi(`/tenants/${ctx.tenant.id}/invitations`, { token: coordinator.accessToken });
    assertList(listed.json);
    assert.ok(listed.json.items.some((item) => item.id === created.id));
  });

  test("invite codes are long, forgiving to type, and limited on wrong guesses", async () => {
    const guesser = await signUp("inviteguess");
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const wrong = await callApi("/invitations/accept", {
        method: "POST",
        token: guesser.accessToken,
        body: { code: String(100000 + attempt) },
      });
      assertError(wrong, 400, "validation_error", "The code is not valid.");
    }
    const blocked = await callApi("/invitations/accept", {
      method: "POST",
      token: guesser.accessToken,
      body: { code: "000000" },
    });
    assertError(blocked, 429, "rate_limited", "Too many attempts. Wait a few minutes and try again.");

    const invitee = await signUp("invitetyped");
    await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/invitations`, {
      email: invitee.email,
      role: "MEMBER",
    });
    const code = await waitForCode(invitee.email);
    assert.match(code, /^[A-HJKMNP-TV-Z2-9]{4}-[A-HJKMNP-TV-Z2-9]{4}-[A-HJKMNP-TV-Z2-9]{4}$/);
    const accepted = await callApi("/invitations/accept", {
      method: "POST",
      token: invitee.accessToken,
      body: { code: ` ${code.replaceAll("-", " ").toLowerCase()} ` },
    });
    assert.equal(accepted.status, 200, accepted.text);
    assert.equal(accepted.json.tenantMembership.tenantId, ctx.org.id);
  });

  test("resend replaces the invite code", async () => {
    const recruit = await signUp("inviteresend");
    const created = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/invitations`, {
      email: recruit.email,
      role: "VOLUNTEER",
    });
    const first = await waitForCode(recruit.email);
    const resent = await callApi(`/tenants/${ctx.org.id}/invitations/${created.id}/resend`, {
      method: "POST",
      token: ctx.admin.accessToken,
    });
    assert.equal(resent.status, 200);
    assertInvitation(resent.json, {
      email: recruit.email,
      tenantId: ctx.org.id,
      organizationId: null,
      role: "VOLUNTEER",
    });
    assert.equal(resent.json.id, created.id);
    const second = await waitForCode(recruit.email);
    assert.notEqual(second, first);
    const forbidden = await callApi(`/tenants/${ctx.org.id}/invitations/${created.id}/resend`, {
      method: "POST",
      token: ctx.member.accessToken,
    });
    assertError(forbidden, 403, "forbidden", "Forbidden.");
    const missing = await callApi(`/tenants/${ctx.org.id}/invitations/${missingId()}/resend`, {
      method: "POST",
      token: ctx.admin.accessToken,
    });
    assertError(missing, 404, "not_found", "Not found.");
    await callApi(`/tenants/${ctx.org.id}/invitations/${created.id}`, {
      method: "DELETE",
      token: ctx.admin.accessToken,
    });
    const revoked = await callApi(`/tenants/${ctx.org.id}/invitations/${created.id}/resend`, {
      method: "POST",
      token: ctx.admin.accessToken,
    });
    assertError(revoked, 409, "conflict", "This invite has been revoked.");
  });
});
