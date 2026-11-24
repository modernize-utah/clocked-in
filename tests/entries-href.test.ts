import assert from "node:assert/strict";
import test from "node:test";
import { entriesHref, entriesHrefFromAccessor } from "../src/lib/entries-href.ts";

test("entriesHref writes known query keys", () => {
  assert.equal(entriesHref(), "/entries");
  assert.equal(
    entriesHref({ from: "2026-10-01", taskCategoryId: ["11111111-1111-4111-8111-111111111111"], everyone: true }),
    "/entries?from=2026-10-01&taskCategoryId=11111111-1111-4111-8111-111111111111&everyone=1",
  );
});

test("entriesHref keeps single-id report filters and drops multi-id ones", () => {
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";
  assert.equal(entriesHref({ projectId: [a], userId: [a, b] }), `/entries?projectId=${a}`);
});

test("value cards open tenant entries", () => {
  assert.equal(entriesHrefFromAccessor("user.hours"), "/entries?everyone=1");
  assert.equal(entriesHrefFromAccessor("user.inKind"), "/entries?everyone=1");
});

test("category and project slices pass the row id", () => {
  const category = "22222222-2222-4222-8222-222222222222";
  const project = "33333333-3333-4333-8333-333333333333";
  assert.equal(
    entriesHrefFromAccessor("user.byCategory", { rowId: category }),
    `/entries?taskCategoryId=${category}&everyone=1`,
  );
  assert.equal(entriesHrefFromAccessor("user.byProject", { rowId: project }), `/entries?projectId=${project}&everyone=1`);
  assert.equal(entriesHrefFromAccessor("user.byCategory", { rowId: "unclassified" }), "/entries?unclassified=1&everyone=1");
});

test("person slices open that volunteer", () => {
  const userId = "44444444-4444-4444-8444-444444444444";
  assert.equal(entriesHrefFromAccessor("user.byVolunteer", { rowId: userId }), `/entries?person=${userId}`);
});

test("month slices set the date range for that month", () => {
  assert.equal(entriesHrefFromAccessor("user.byMonth", { rowId: "2026-10" }), "/entries?from=2026-10-01&to=2026-10-31&everyone=1");
});

test("report filters carry onto the entries link", () => {
  assert.equal(
    entriesHrefFromAccessor("user.hours", { filters: { from: "2026-01-01", to: "2026-01-31" } }),
    "/entries?from=2026-01-01&to=2026-01-31&everyone=1",
  );
});
