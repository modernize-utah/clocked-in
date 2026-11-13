import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { apiBaseUrl } from "./fixture.mjs";
import { assertError, callApi, createJson, label, signUp, suite } from "./client.mjs";

const toolNames = [
  "cancel_clock",
  "clock_in",
  "clock_out",
  "create_collective_entry",
  "create_connection",
  "create_department",
  "create_hourly_rate",
  "create_invitation",
  "create_member",
  "create_project",
  "create_tag",
  "create_task_category",
  "create_theme",
  "create_time_entry",
  "create_volunteer_need",
  "delete_collective_entry",
  "delete_connection",
  "delete_department",
  "delete_hourly_rate",
  "delete_membership",
  "delete_memberships",
  "delete_project",
  "delete_tag",
  "delete_task_category",
  "delete_theme",
  "delete_time_entry",
  "delete_volunteer_need",
  "export_summary_csv",
  "export_time_entries_csv",
  "get_collective_entry",
  "get_organization",
  "get_project",
  "get_report",
  "get_time_entry",
  "get_volunteer_need",
  "list_collective_entries",
  "list_connections",
  "list_departments",
  "list_hourly_rates",
  "list_invitations",
  "list_members",
  "list_organizations",
  "list_projects",
  "list_tags",
  "list_task_categories",
  "list_themes",
  "list_time_entries",
  "list_volunteer_needs",
  "reset_clock",
  "revoke_invitation",
  "update_collective_entry",
  "update_connection",
  "update_department",
  "update_hourly_rate",
  "update_membership",
  "update_organization",
  "update_project",
  "update_tag",
  "update_task_category",
  "update_theme",
  "update_time_entry",
  "update_volunteer_need",
];

function rpcMessage(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed);
  }

  const data = trimmed
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .find((line) => line.startsWith("{"));
  if (!data) {
    throw new Error(`MCP response was not JSON: ${trimmed.slice(0, 400)}`);
  }

  return JSON.parse(data);
}

async function mcp(token, body) {
  const response = await fetch(new URL("/mcp", apiBaseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, text, json: text ? rpcMessage(text) : null };
}

describe("mcp", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.user = await signUp("mcp");
  });

  test("requires authentication", async () => {
    const missing = await callApi("/mcp", {
      method: "POST",
      body: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    });
    assertError(missing, 401, "unauthorized", "Authentication is required.");
  });

  test("lists the retained Next.js tool catalog", async () => {
    const listed = await mcp(ctx.user.accessToken, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    });
    assert.equal(listed.status, 200, listed.text.slice(0, 600));
    const names = listed.json.result.tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, toolNames);
    const organizations = listed.json.result.tools.find((tool) => tool.name === "list_organizations");
    assert.deepEqual([...organizations.inputSchema.required].sort(), ["limit", "offset"]);
    const clockOut = listed.json.result.tools.find((tool) => tool.name === "clock_out");
    assert.deepEqual([...clockOut.inputSchema.required].sort(), ["description", "tagIds", "userId"]);
  });

  test("list_organizations matches the REST list", async () => {
    const rest = await callApi("/organizations", { token: ctx.user.accessToken });
    assert.equal(rest.status, 200);
    const called = await mcp(ctx.user.accessToken, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "list_organizations", arguments: { limit: null, offset: null } },
    });
    assert.equal(called.status, 200, called.text.slice(0, 600));
    assert.equal(called.json.result.isError, undefined);
    const text = called.json.result.content[0].text;
    assert.deepEqual(JSON.parse(text), rest.json);
  });

  test("organization API keys authenticate MCP tool calls", async () => {
    const org = await createJson(ctx.user.accessToken, "/organizations", { name: label("MCP key org") });
    const key = await createJson(ctx.user.accessToken, `/organizations/${org.id}/api-keys`, {
      name: "MCP reader",
      scopes: ["org:read"],
    });
    const called = await mcp(key.key, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "get_organization", arguments: { organizationId: org.id } },
    });
    assert.equal(called.status, 200);
    assert.equal(called.json.result.isError, undefined);
    assert.equal(JSON.parse(called.json.result.content[0].text).id, org.id);
  });
});
