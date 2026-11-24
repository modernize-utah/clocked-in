import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import {
  assertError,
  assertInstant,
  assertKeys,
  assertList,
  assertUuid,
  acceptInvite,
  callApi,
  createJson,
  label,
  missingId,
  signUp,
  suite,
} from "./client.mjs";

describe("tenant API keys", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.admin = await signUp("keyadmin");
    ctx.member = await signUp("keymember");
    ctx.outsider = await signUp("keyout");
    ctx.org = await createJson(ctx.admin.accessToken, "/tenants", { name: label("Key org") });
    await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/invitations`, {
      email: ctx.member.email,
      role: "MEMBER",
    });
    await acceptInvite(ctx.member.accessToken, ctx.member.email);
  });

  test("org admins create, list, rotate, and revoke keys", async () => {
    const created = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/api-keys`, {
      name: "Reporting",
      scopes: ["org:read"],
      ignored: true,
    });
    assertKeys(created, [
      "id",
      "tenantId",
      "name",
      "prefix",
      "scopes",
      "createdByUserId",
      "createdAt",
      "lastUsedAt",
      "expiresAt",
      "key",
    ]);
    assertUuid(created.id);
    assert.equal(created.tenantId, ctx.org.id);
    assert.equal(created.name, "Reporting");
    assert.match(created.prefix, /^cki_test_/);
    assert.equal(created.key.startsWith(`${created.prefix}_`), true);
    assert.deepEqual(created.scopes, ["org:read"]);
    assert.equal(created.createdByUserId, ctx.admin.user.id);
    assertInstant(created.createdAt);
    assert.equal(created.lastUsedAt, null);
    assert.equal(created.expiresAt, null);
    ctx.key = created;

    const listed = await callApi(`/tenants/${ctx.org.id}/api-keys`, { token: ctx.admin.accessToken });
    assert.equal(listed.status, 200);
    assertList(listed.json);
    const item = listed.json.items.find((row) => row.id === created.id);
    assert.equal(item.key, undefined);
    assert.equal(item.prefix, created.prefix);

    const rotated = await callApi(`/tenants/${ctx.org.id}/api-keys/${created.id}/rotate`, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: {},
    });
    assert.equal(rotated.status, 200);
    assert.equal(rotated.json.key.startsWith(`${rotated.json.prefix}_`), true);
    assert.notEqual(rotated.json.key, created.key);
    ctx.key = rotated.json;

    const patched = await callApi(`/tenants/${ctx.org.id}/api-keys/${created.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { name: "Reports" },
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.json.name, "Reports");
    assert.equal(patched.json.key, undefined);
  });

  test("a read key can get the tenant and cannot write", async () => {
    const read = await callApi(`/tenants/${ctx.org.id}`, { token: ctx.key.key });
    assert.equal(read.status, 200);
    assert.equal(read.json.id, ctx.org.id);

    const header = await callApi(`/tenants/${ctx.org.id}`, { apiKey: ctx.key.key });
    assert.equal(header.status, 200);
    assert.equal(header.json.id, ctx.org.id);

    const tagged = await callApi(`/tenants/${ctx.org.id}/tags`, {
      method: "POST",
      token: ctx.key.key,
      body: { name: label("Tag") },
    });
    assertError(tagged, 403, "forbidden", "Forbidden.");
  });

  test("a write key cannot mint keys or manage memberships", async () => {
    const write = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/api-keys`, {
      name: "Writer",
      scopes: ["org:write"],
    });
    const tag = await createJson(write.key, `/tenants/${ctx.org.id}/tags`, { name: label("Keyed tag") });
    assert.equal(tag.tenantId, ctx.org.id);

    const mint = await callApi(`/tenants/${ctx.org.id}/api-keys`, {
      method: "POST",
      token: write.key,
      body: { name: "Stolen", scopes: ["org:admin"] },
    });
    assertError(mint, 403, "forbidden", "Forbidden.");

    const invite = await callApi(`/tenants/${ctx.org.id}/invitations`, {
      method: "POST",
      token: write.key,
      body: { email: ctx.member.email, role: "MEMBER" },
    });
    assertError(invite, 403, "forbidden", "Forbidden.");
  });

  test("a key cannot access another tenant", async () => {
    const other = await signUp("keyother");
    const otherOrg = await createJson(other.accessToken, "/tenants", { name: label("Other key org") });
    const stolen = await callApi(`/tenants/${otherOrg.id}`, { token: ctx.key.key });
    assertError(stolen, 403, "forbidden", "Forbidden.");
  });

  test("members cannot manage keys and revoked keys fail", async () => {
    const member = await callApi(`/tenants/${ctx.org.id}/api-keys`, { token: ctx.member.accessToken });
    assertError(member, 403, "forbidden", "Forbidden.");
    const outsider = await callApi(`/tenants/${ctx.org.id}/api-keys`, { token: ctx.outsider.accessToken });
    assertError(outsider, 403, "forbidden", "Forbidden.");

    const created = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/api-keys`, {
      name: "Temp",
      scopes: ["org:read"],
    });
    const removed = await callApi(`/tenants/${ctx.org.id}/api-keys/${created.id}`, {
      method: "DELETE",
      token: ctx.admin.accessToken,
    });
    assert.equal(removed.status, 204);
    const reuse = await callApi(`/tenants/${ctx.org.id}`, { token: created.key });
    assertError(reuse, 401, "unauthorized", "Authentication is required.");
    const missing = await callApi(`/tenants/${ctx.org.id}/api-keys/${missingId()}`, {
      method: "DELETE",
      token: ctx.admin.accessToken,
    });
    assertError(missing, 404, "not_found", "Not found.");
  });

  test("MCP requires authentication", async () => {
    const missing = await callApi("/mcp", {
      method: "POST",
      body: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    });
    assert.equal(missing.status, 401);
  });
});
