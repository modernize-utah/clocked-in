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

describe("tags", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.admin = await signUp("tagadmin");
    ctx.member = await signUp("tagmember");
    ctx.org = await createJson(ctx.admin.accessToken, "/tenants", { name: label("Tag org") });
    await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/invitations`, {
      email: ctx.member.email,
      role: "MEMBER",
    });
    await acceptInvite(ctx.member.accessToken, ctx.member.email);
    ctx.name = label("Tag");
    ctx.tag = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/tags`, { name: ctx.name });
  });

  test("create and list tags", async () => {
    assertNamed(ctx.tag, { tenantId: ctx.org.id, name: ctx.name, isArchived: false });
    const listed = await callApi(`/tenants/${ctx.org.id}/tags`, { token: ctx.member.accessToken });
    assertList(listed.json);
    assert.ok(listed.json.items.some((item) => item.id === ctx.tag.id && item.name === ctx.name));
    const unauthenticated = await callApi(`/tenants/${ctx.org.id}/tags`);
    assertError(unauthenticated, 401, "unauthorized", "Authentication is required.");
  });

  test("patch requires an tenant admin and keeps names unique", async () => {
    const forbidden = await callApi(`/tenants/${ctx.org.id}/tags`, {
      method: "POST",
      token: ctx.member.accessToken,
      body: { name: label("Nope") },
    });
    assertError(forbidden, 403, "forbidden", "Forbidden.");
    const renamed = label("Renamed tag");
    const updated = await callApi(`/tags/${ctx.tag.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { name: renamed },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.json.name, renamed);
    const duplicate = await callApi(`/tenants/${ctx.org.id}/tags`, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: { name: `  ${renamed.toLowerCase()}  ` },
    });
    assertError(duplicate, 409, "conflict", "That value is already in use.");
    const missing = await callApi(`/tags/${missingId()}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { name: label("Missing") },
    });
    assertError(missing, 404, "not_found", "Not found.");
  });

  test("delete removes an unused tag", async () => {
    const tag = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/tags`, {
      name: label("Temporary tag"),
    });
    const forbidden = await callApi(`/tags/${tag.id}`, { method: "DELETE", token: ctx.member.accessToken });
    assertError(forbidden, 403, "forbidden", "Forbidden.");
    await remove(ctx.admin.accessToken, `/tags/${tag.id}`);
    const missing = await callApi(`/tags/${tag.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { name: label("Gone") },
    });
    assertError(missing, 404, "not_found", "Not found.");
  });
});
