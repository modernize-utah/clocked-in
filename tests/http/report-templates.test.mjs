import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, describe, test } from "node:test";
import { assertError, assertUuid, callApi, createJson, joinOrg, grantSuperAdmin, label, signUp, suite } from "./client.mjs";

function valueCard(over = {}) {
  return {
    id: randomUUID(),
    kind: "value",
    title: "Hours",
    description: "",
    column: 1,
    row: 1,
    columns: 3,
    rows: 1,
    accessor: "user.hours",
    color: "primary",
    format: "hours",
    icon: "clock",
    ...over,
  };
}

function layout(cards) {
  return { version: 1, cards };
}

describe("report templates", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.admin = await signUp("tmpladmin");
    ctx.member = await signUp("tmplmember");
    ctx.outsider = await signUp("tmplout");
    ctx.superAdmin = await signUp("tmplsuper");
    await grantSuperAdmin(ctx.superAdmin.user.id);
    ctx.org = await createJson(ctx.admin.accessToken, "/organizations", { name: label("Template org") });
    await joinOrg(ctx.admin.accessToken, ctx.org.id, ctx.member, { role: "MEMBER" });
    ctx.path = `/organizations/${ctx.org.id}/report-templates`;
  });

  test("members list the globals in key order", async () => {
    const listed = await callApi(ctx.path, { token: ctx.member.accessToken });
    assert.equal(listed.status, 200, listed.text);
    const globals = listed.json.items.filter((item) => item.scope === "global");
    assert.deepEqual(
      globals.map((item) => item.key),
      ["summary", "people", "groups", "staff"],
    );
    for (const item of globals) {
      assert.equal(item.organizationId, null);
      assert.equal(item.layout.version, 1);
    }
    ctx.summary = globals[0];

    const outsider = await callApi(ctx.path, { token: ctx.outsider.accessToken });
    assertError(outsider, 403, "forbidden", "Forbidden.");
  });

  test("an admin creates an organization template; members and duplicates are refused", async () => {
    const denied = await callApi(ctx.path, {
      method: "POST",
      token: ctx.member.accessToken,
      body: { name: "Member template", layout: layout([valueCard()]) },
    });
    assertError(denied, 403, "forbidden", "Forbidden.");

    const created = await callApi(ctx.path, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: { name: "Board packet", layout: layout([valueCard()]) },
    });
    assert.equal(created.status, 201, created.text);
    assertUuid(created.json.id);
    assert.equal(created.json.scope, "organization");
    assert.equal(created.json.organizationId, ctx.org.id);
    assert.equal(created.json.key, null);
    ctx.owned = created.json;

    const duplicate = await callApi(ctx.path, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: { name: "board PACKET", layout: layout([]) },
    });
    assertError(duplicate, 409, "conflict", "A template with that name already exists.");

    const badLayout = await callApi(ctx.path, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: { name: "Broken", layout: { version: 2, cards: [] } },
    });
    assertError(badLayout, 400, "validation_error", "version must be 1.");

    const noLayout = await callApi(ctx.path, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: { name: "No layout" },
    });
    assertError(noLayout, 400, "validation_error", "layout is required.");
  });

  test("an override replaces the global for that organization until it is deleted", async () => {
    const override = await callApi(ctx.path, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: { baseTemplateId: ctx.summary.id, layout: layout([valueCard({ title: "Our hours" })]) },
    });
    assert.equal(override.status, 201, override.text);
    assert.equal(override.json.scope, "override");
    assert.equal(override.json.key, "summary");
    assert.equal(override.json.baseTemplateId, ctx.summary.id);

    const again = await callApi(ctx.path, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: { baseTemplateId: ctx.summary.id, layout: layout([valueCard({ title: "Second pass" })]) },
    });
    assert.equal(again.status, 201, again.text);
    assert.equal(again.json.id, override.json.id);
    assert.equal(again.json.layout.cards[0].title, "Second pass");

    const listed = await callApi(ctx.path, { token: ctx.member.accessToken });
    const summary = listed.json.items.find((item) => item.key === "summary");
    assert.equal(summary.id, override.json.id);
    assert.equal(listed.json.items.filter((item) => item.key === "summary").length, 1);

    const notGlobal = await callApi(ctx.path, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: { baseTemplateId: ctx.owned.id, layout: layout([]) },
    });
    assertError(notGlobal, 400, "validation_error", "baseTemplateId must be a global template.");

    const removed = await callApi(`${ctx.path}/${override.json.id}`, { method: "DELETE", token: ctx.admin.accessToken });
    assert.equal(removed.status, 204, removed.text);
    const after = await callApi(ctx.path, { token: ctx.member.accessToken });
    assert.equal(after.json.items.find((item) => item.key === "summary").id, ctx.summary.id);
  });

  test("only a SuperAdmin can patch a global, and globals are never deleted", async () => {
    const orgAdmin = await callApi(`${ctx.path}/${ctx.summary.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { layout: ctx.summary.layout },
    });
    assertError(orgAdmin, 403, "forbidden", "Forbidden.");

    const superAdminOrgs = await createJson(ctx.superAdmin.accessToken, "/organizations", { name: label("Super org") });
    const superPath = `/organizations/${superAdminOrgs.id}/report-templates`;
    const patched = await callApi(`${superPath}/${ctx.summary.id}`, {
      method: "PATCH",
      token: ctx.superAdmin.accessToken,
      body: { name: ctx.summary.name, layout: ctx.summary.layout },
    });
    assert.equal(patched.status, 200, patched.text);
    assert.equal(patched.json.scope, "global");

    const deleteGlobal = await callApi(`${ctx.path}/${ctx.summary.id}`, { method: "DELETE", token: ctx.admin.accessToken });
    assertError(deleteGlobal, 403, "forbidden", "Forbidden.");
  });

  test("an admin renames and deletes an organization template", async () => {
    const renamed = await callApi(`${ctx.path}/${ctx.owned.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { name: "Board packet v2" },
    });
    assert.equal(renamed.status, 200, renamed.text);
    assert.equal(renamed.json.name, "Board packet v2");
    const memberPatch = await callApi(`${ctx.path}/${ctx.owned.id}`, {
      method: "PATCH",
      token: ctx.member.accessToken,
      body: { name: "Nope" },
    });
    assertError(memberPatch, 403, "forbidden", "Forbidden.");
    const removed = await callApi(`${ctx.path}/${ctx.owned.id}`, { method: "DELETE", token: ctx.admin.accessToken });
    assert.equal(removed.status, 204);
    const gone = await callApi(`${ctx.path}/${ctx.owned.id}`, { token: ctx.member.accessToken });
    assert.equal(gone.status, 404);
  });
});
