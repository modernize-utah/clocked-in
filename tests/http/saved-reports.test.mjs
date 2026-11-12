import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, describe, test } from "node:test";
import { assertError, assertInstant, assertList, assertStatus, assertUuid, callApi, createJson, joinOrg, label, signUp, suite } from "./client.mjs";

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

describe("saved reports", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.admin = await signUp("designadmin");
    ctx.member = await signUp("designmember");
    ctx.outsider = await signUp("designout");
    ctx.org = await createJson(ctx.admin.accessToken, "/organizations", { name: label("Design org") });
    ctx.department = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/departments`, {
      name: label("Design department"),
    });
    ctx.category = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/task-categories`, {
      name: label("Design category"),
    });
    ctx.project = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/projects`, {
      title: label("Design project"),
      accessType: "Public",
    });
    await joinOrg(ctx.admin.accessToken, ctx.org.id, ctx.member, { role: "MEMBER" });
  });

  test("an admin saves a named design and a member can read it", async () => {
    const denied = await callApi(`/organizations/${ctx.org.id}/reports`, {
      method: "POST",
      token: ctx.member.accessToken,
      body: { name: "Member report", layout: layout([valueCard()]) },
    });
    assertError(denied, 403, "forbidden", "Forbidden.");

    const name = label("Board");
    const created = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/reports`, {
      name: `  ${name}  `,
      isDefault: true,
      layout: layout([
        valueCard(),
        {
          id: randomUUID(),
          kind: "chart",
          title: "By month",
          description: "",
          column: 4,
          row: 1,
          columns: 6,
          rows: 4,
          accessor: "user.byMonth",
          chartType: "column",
          palette: "single",
          valueKey: "hours",
          format: "hours",
        },
        {
          id: randomUUID(),
          kind: "list",
          title: "By project",
          description: "",
          column: 1,
          row: 5,
          columns: 6,
          rows: 4,
          accessor: "user.byProject",
          format: "hours",
          visibleColumns: ["name", "hours", "share", "inKind"],
        },
      ]),
      filters: { departmentId: ctx.department.id, from: "2026-11-01", to: "2026-11-30" },
    });
    assertUuid(created.id);
    assert.equal(created.name, name);
    assert.equal(created.isDefault, true);
    assert.equal(created.isDashboard, false);
    assert.equal(created.layout.version, 1);
    assert.equal(created.layout.cards.length, 3);
    assert.equal(created.layout.cards[0].pattern, "0,0.[00]");
    assert.equal(created.layout.cards[1].kind, "chart");
    assert.equal(created.layout.cards[2].kind, "list");
    assert.deepEqual(created.layout.cards[2].visibleColumns, ["name", "hours", "share", "inKind"]);
    assert.deepEqual(created.filters.departmentId, [ctx.department.id]);
    assertInstant(created.createdAt);
    assertInstant(created.updatedAt);
    ctx.report = created;

    const listed = await callApi(`/organizations/${ctx.org.id}/reports`, { token: ctx.member.accessToken });
    assert.equal(listed.status, 200);
    assertList(listed.json);
    assert.equal(listed.json.items.some((item) => item.id === created.id), true);

    const read = await callApi(`/organizations/${ctx.org.id}/reports/${created.id}`, { token: ctx.member.accessToken });
    assert.equal(read.status, 200);
    assert.equal(read.json.name, name);

    const outsider = await callApi(`/organizations/${ctx.org.id}/reports`, { token: ctx.outsider.accessToken });
    assertError(outsider, 403, "forbidden", "Forbidden.");
  });

  test("names are unique ignoring case and only one report is the default", async () => {
    const duplicate = await callApi(`/organizations/${ctx.org.id}/reports`, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: { name: ctx.report.name.toUpperCase(), layout: layout([valueCard()]) },
    });
    assertError(duplicate, 409, "conflict", "A report with that name already exists.");

    const next = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/reports`, {
      name: label("Second"),
      isDefault: true,
      layout: layout([valueCard()]),
    });
    assert.equal(next.isDefault, true);
    const first = await callApi(`/organizations/${ctx.org.id}/reports/${ctx.report.id}`, { token: ctx.admin.accessToken });
    assert.equal(first.json.isDefault, false);
    ctx.second = next;
  });

  test("only one report is the dashboard", async () => {
    const first = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/reports`, {
      name: label("Home board"),
      isDashboard: true,
      layout: layout([valueCard()]),
    });
    assert.equal(first.isDashboard, true);
    const second = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/reports`, {
      name: label("Other board"),
      isDashboard: true,
      layout: layout([valueCard()]),
    });
    assert.equal(second.isDashboard, true);
    const previous = await callApi(`/organizations/${ctx.org.id}/reports/${first.id}`, { token: ctx.admin.accessToken });
    assert.equal(previous.json.isDashboard, false);
  });

  test("overlapping cards are rejected", async () => {
    const id = randomUUID();
    const response = await callApi(`/organizations/${ctx.org.id}/reports`, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: {
        name: label("Overlap"),
        layout: layout([valueCard({ id }), valueCard({ id: randomUUID() })]),
      },
    });
    assertError(response, 400, "validation_error", "Cards cannot overlap.");
  });

  test("saved filters and a date override share one rollup", async () => {
    await createJson(ctx.member.accessToken, "/time/duration", {
      organizationId: ctx.org.id,
      departmentId: ctx.department.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      durationMinutes: 90,
      occurredOn: "2026-10-01",
    });
    const stored = await callApi(`/organizations/${ctx.org.id}/reports/${ctx.report.id}/data`, {
      token: ctx.member.accessToken,
    });
    assert.equal(stored.status, 200);
    assert.equal(stored.json.user.hours, 0);
    assert.equal(stored.json.user.entries, 0);

    const overridden = await callApi(`/organizations/${ctx.org.id}/reports/${ctx.report.id}/data`, {
      token: ctx.member.accessToken,
      query: { from: "2026-10-01", to: "2026-10-31" },
    });
    assert.equal(overridden.status, 200);
    assert.equal(overridden.json.user.hours, 1.5);
    assert.equal(overridden.json.user.entries, 1);

    const cleared = await callApi(`/organizations/${ctx.org.id}/reports/${ctx.report.id}/data`, {
      token: ctx.member.accessToken,
      query: { clearDates: "true" },
    });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.json.user.hours, 1.5);
  });

  test("a layout patch without filters keeps stored filters", async () => {
    const updated = await callApi(`/organizations/${ctx.org.id}/reports/${ctx.report.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { layout: layout([valueCard()]) },
    });
    assertStatus(updated, 200);
    assert.equal(updated.json.layout.cards.length, 1);
    assert.deepEqual(updated.json.filters.departmentId, [ctx.department.id]);
    assert.equal(updated.json.filters.from, "2026-11-01");
    assert.equal(updated.json.filters.to, "2026-11-30");
  });

  test("an admin can rename and delete a design", async () => {
    const renamed = label("Renamed");
    const updated = await callApi(`/organizations/${ctx.org.id}/reports/${ctx.second.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { name: renamed, isDefault: false },
    });
    assertStatus(updated, 200);
    assert.equal(updated.json.name, renamed);
    assert.equal(updated.json.isDefault, false);

    const removed = await callApi(`/organizations/${ctx.org.id}/reports/${ctx.second.id}`, {
      method: "DELETE",
      token: ctx.admin.accessToken,
    });
    assert.equal(removed.status, 204);
    const missing = await callApi(`/organizations/${ctx.org.id}/reports/${ctx.second.id}`, { token: ctx.admin.accessToken });
    assertError(missing, 404, "not_found", "Not found.");
  });
});
