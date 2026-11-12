import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import {
  assertError,
  assertKeys,
  callApi,
  createJson,
  identity,
  label,
  logIn,
  signUp,
  suite,
  joinOrg,
} from "./client.mjs";

describe("imports", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.admin = await signUp("importadmin");
    ctx.member = await signUp("importmember");
    ctx.existing = await signUp("importexisting");
    ctx.org = await createJson(ctx.admin.accessToken, "/organizations", { name: label("Import org") });
    await joinOrg(ctx.admin.accessToken, ctx.org.id, ctx.member, { role: "MEMBER" });
    ctx.department = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/departments`, {
      name: label("Import group"),
    });
  });

  test("requires an organization admin", async () => {
    const denied = await callApi(`/organizations/${ctx.org.id}/imports/people`, {
      method: "POST",
      token: ctx.member.accessToken,
      body: { rows: [] },
    });
    assertError(denied, 403, "forbidden", "Forbidden.");
  });

  test("creates people, skips existing emails, and reports row errors", async () => {
    const person = identity("imported");
    const second = identity("importedtwo");
    const created = await callApi(`/organizations/${ctx.org.id}/imports/people`, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: {
        rows: [
          { email: "not-an-email", firstName: "Bad", lastName: "Row" },
          {
            email: person.email,
            firstName: "Ada",
            lastName: "Lovelace",
            memberNumber: "014",
            primaryDepartment: ctx.department.name,
            role: "volunteer",
          },
          { email: second.email, firstName: "Grace" },
          { email: person.email, firstName: "Again", lastName: "Lovelace" },
          {},
        ],
      },
    });
    assert.equal(created.status, 200, created.text);
    assertKeys(created.json, ["created", "skipped", "errors", "passwords"]);
    assert.equal(created.json.created, 1);
    assert.equal(created.json.skipped, 1);
    assert.deepEqual(
      created.json.errors.map((error) => error.row),
      [1, 3],
    );
    assert.equal(created.json.errors[1].message, "lastName is required.");
    assert.equal(created.json.passwords.length, 1);
    assert.equal(created.json.passwords[0].email, person.email);
    assert.match(created.json.passwords[0].username, /^alovelace\d*$/);
    assert.ok(created.json.passwords[0].temporaryPassword.length >= 16);

    const session = await logIn(created.json.passwords[0].username, created.json.passwords[0].temporaryPassword, {
      email: person.email,
      firstName: "Ada",
      lastName: "Lovelace",
      mustChangePassword: true,
    });
    assert.equal(session.user.profile.memberNumber, "014");

    const members = await callApi(`/organizations/${ctx.org.id}/memberships?limit=100`, { token: ctx.admin.accessToken });
    const membership = members.json.items.find((item) => item.user.email === person.email);
    assert.equal(membership.role.code, "VOLUNTEER");
    assert.deepEqual(membership.departmentIds, [ctx.department.id]);

    const again = await callApi(`/organizations/${ctx.org.id}/imports/people`, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: { rows: [{ email: person.email, firstName: "Changed", lastName: "Name" }] },
    });
    assert.equal(again.status, 200, again.text);
    assert.equal(again.json.created, 0);
    assert.equal(again.json.skipped, 1);
    assert.deepEqual(again.json.passwords, []);
    const unchanged = await logIn(created.json.passwords[0].username, created.json.passwords[0].temporaryPassword, {
      firstName: "Ada",
      mustChangePassword: true,
    });
    assert.equal(unchanged.user.profile.firstName, "Ada");

    const skipped = await callApi(`/organizations/${ctx.org.id}/imports/people`, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: { rows: [{ email: ctx.existing.email, firstName: "Changed", lastName: "Person" }] },
    });
    assert.equal(skipped.json.skipped, 1);
    assert.equal(skipped.json.created, 0);
    const stillOut = await callApi(`/organizations/${ctx.org.id}/memberships?limit=100`, { token: ctx.admin.accessToken });
    assert.equal(stillOut.json.items.some((item) => item.user.email === ctx.existing.email), false);

    const merged = await callApi(`/organizations/${ctx.org.id}/imports/people`, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: { rows: [{ email: ctx.existing.email, firstName: "Merged", lastName: "Outsider", _action: "merge" }] },
    });
    assert.equal(merged.status, 200, merged.text);
    const notJoined = await callApi(`/organizations/${ctx.org.id}/memberships?limit=100`, { token: ctx.admin.accessToken });
    assert.equal(notJoined.json.items.some((item) => item.user.email === ctx.existing.email), false);
    const outsider = await callApi("/users/me", { token: ctx.existing.accessToken });
    assert.equal(outsider.json.profile.firstName, ctx.existing.firstName);
  });

  test("no longer imports groups", async () => {
    const response = await callApi(`/organizations/${ctx.org.id}/imports/departments`, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: { rows: [{ name: label("Imported group") }] },
    });
    assert.equal(response.status, 404);
  });

  test("creates projects and skips titles that already exist", async () => {
    const title = label("Imported project");
    const created = await callApi(`/organizations/${ctx.org.id}/imports/projects`, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: {
        rows: [
          { title, projectType: "event", isActive: "yes" },
          { title: title.toUpperCase() },
          { title: label("Missing group"), accessType: "Department", department: "not a group" },
          { title: label("Grouped project"), accessType: "department", department: ctx.department.name },
        ],
      },
    });
    assert.equal(created.status, 200, created.text);
    assert.equal(created.json.created, 2);
    assert.equal(created.json.skipped, 1);
    assert.equal(created.json.errors.length, 1);
    assert.equal(created.json.errors[0].row, 3);
    assert.equal(created.json.errors[0].message, "department was not found.");

    const listed = await callApi(`/organizations/${ctx.org.id}/projects?limit=100`, { token: ctx.admin.accessToken });
    const project = listed.json.items.find((item) => item.title === title);
    assert.equal(project.projectType, "Event");
    assert.equal(project.isActive, true);
    assert.equal(project.accessType, "Public");
    assert.equal(project.ownerUserId, ctx.admin.user.id);
    const grouped = listed.json.items.find((item) => item.accessType === "Department" && item.departmentId === ctx.department.id);
    assert.ok(grouped);
  });
});
