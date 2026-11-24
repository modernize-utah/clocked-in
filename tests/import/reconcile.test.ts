import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { organizationFields, peopleFields, projectFields } from "../../src/lib/import/fields.ts";
import { parseCsv } from "../../src/lib/import/parse-csv.ts";
import { fieldChoices, reconcile } from "../../src/lib/import/reconcile.ts";
import { usernameFromEmail } from "../../src/lib/import/username.ts";

describe("parseCsv", () => {
  test("reads quoted commas, escaped quotes, and CRLF", () => {
    assert.deepEqual(parseCsv('email,name\r\n"ada@example.com","say ""hi"""\n'), [
      ["email", "name"],
      ["ada@example.com", 'say "hi"'],
    ]);
  });

  test("keeps a newline inside quotes and strips a BOM", () => {
    assert.deepEqual(parseCsv('\uFEFF"a\nb",c'), [["a\nb", "c"]]);
  });

  test("drops the empty row created by a trailing newline", () => {
    assert.deepEqual(parseCsv("a,b\n"), [["a", "b"]]);
    assert.deepEqual(parseCsv(""), []);
  });

  test("rejects an unterminated quote and a file past the row cap", () => {
    assert.throws(() => parseCsv('"open'), /unterminated quote/);
    const lines = Array.from({ length: 1002 }, (_, index) => `row-${index}`);
    assert.throws(() => parseCsv(lines.join("\n")), /at most 1000 rows/);
  });
});

describe("reconcile", () => {
  test("matches header aliases and refuses a second column for the same field", () => {
    const fields = peopleFields();
    const assigned = reconcile(
      fields,
      ["Volunteer ID", "E-mail", "First Name", "email address"],
      [["014", "ada@example.com", "Ada", "other@example.com"]],
    );
    assert.deepEqual(
      assigned.map((column) => column.field),
      ["memberNumber", "email", "firstName", null],
    );
    assert.equal(assigned[1].confident, true);
    assert.equal(assigned[3].confident, false);
    assert.equal(fieldChoices(fields, assigned, 3).some((field) => field.key === "email"), false);
    assert.equal(fieldChoices(fields, assigned, 1).some((field) => field.key === "email"), true);
  });

  test("matches an obvious sample when the header does not", () => {
    const assigned = reconcile(peopleFields(), ["Stuff", "City"], [["ada@example.com", "Salt Lake"]]);
    assert.equal(assigned[0].field, "email");
    assert.equal(assigned[0].confident, true);
    assert.equal(assigned[1].field, null);
  });

  test("leaves numeric codes unmapped when they could be a ZIP or a member number", () => {
    const assigned = reconcile(peopleFields(), null, [["12345"], ["84101"]]);
    assert.equal(assigned[0].field, null);
    assert.equal(assigned[0].confident, false);
  });

  test("matches a short member number from samples when there is no header", () => {
    const assigned = reconcile(peopleFields(), null, [["014"], ["003"]]);
    assert.equal(assigned[0].field, "memberNumber");
    assert.equal(assigned[0].confident, true);
  });

  test("maps group and project columns from their own catalogs", () => {
    const groups = reconcile(organizationFields("Group"), ["Group"], [["Kitchen"]]);
    assert.equal(groups[0].field, "name");
    const projects = reconcile(
      projectFields("Group"),
      ["Project name", "Start Date", "Active?"],
      [["Garden", "2024-01-02", "yes"]],
    );
    assert.deepEqual(
      projects.map((column) => column.field),
      ["title", "startDate", "isActive"],
    );
  });

  test("does not guess which date column is the start", () => {
    const assigned = reconcile(projectFields(), null, [["2024-01-02", "2024-06-01"]]);
    assert.deepEqual(
      assigned.map((column) => column.field),
      [null, null],
    );
  });
});

describe("usernameFromEmail", () => {
  test("keeps a valid local part and pads a short one", () => {
    assert.equal(usernameFromEmail("Ada.Lovelace@example.com"), "ada.lovelace");
    assert.equal(usernameFromEmail("a@example.com"), "auser");
  });
});
