import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import {
  assertError,
  assertList,
  assertRole,
  callApi,
  createJson,
  label,
  signUp,
  suite,
} from "./client.mjs";

describe("roles / list", suite, () => {
  let admin;

  before(async () => {
    admin = await signUp("roles");
    const org = await createJson(admin.accessToken, "/tenants", { name: label("Role isolation") });
    await createJson(admin.accessToken, `/tenants/${org.id}/roles`, {
      code: "EVENT_LEAD", name: "Event lead", scope: "self", permissions: ["log_own_time"],
    });
  });

  test("requires authentication", async () => {
    const response = await callApi("/roles");
    assertError(response, 401, "unauthorized", "Authentication is required.");
  });

  test("returns ADMIN, MEMBER, and VOLUNTEER", async () => {
    const response = await callApi("/roles", { token: admin.accessToken });
    assert.equal(response.status, 200);
    assertList(response.json);
    assert.equal(response.json.items.length, 3);
    assertRole(response.json.items[0], "ADMIN");
    assertRole(response.json.items[1], "MEMBER");
    assertRole(response.json.items[2], "VOLUNTEER");
  });

  test("pages with limit and offset", async () => {
    const first = await callApi("/roles", { token: admin.accessToken, query: { limit: 1, offset: 0 } });
    const second = await callApi("/roles", { token: admin.accessToken, query: { limit: 1, offset: 1 } });
    assertList(first.json, { limit: 1, offset: 0 });
    assertList(second.json, { limit: 1, offset: 1 });
    assert.equal(first.json.items.length, 1);
    assert.equal(second.json.items.length, 1);
    assert.equal(first.json.items[0].code, "ADMIN");
    assert.equal(second.json.items[0].code, "MEMBER");
  });

  test("rejects a limit outside 1 through 100", async () => {
    const low = await callApi("/roles", { token: admin.accessToken, query: { limit: 0 } });
    const high = await callApi("/roles", { token: admin.accessToken, query: { limit: 101 } });
    const offset = await callApi("/roles", { token: admin.accessToken, query: { offset: -1 } });
    assertError(low, 400, "validation_error", "limit must be from 1 to 100.");
    assertError(high, 400, "validation_error", "limit must be from 1 to 100.");
    assertError(offset, 400, "validation_error", "offset must be zero or greater.");
  });

  test("has no write route", async () => {
    const response = await callApi("/roles", { method: "POST", token: admin.accessToken, body: { code: "OWNER" } });
    assert.equal(response.status, 405);
  });
});
