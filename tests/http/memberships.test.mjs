import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import {
  acceptInvite,
  assertError,
  assertList,
  assertMembership,
  assertMoney,
  callApi,
  createJson,
  identity,
  joinOrg,
  label,
  missingId,
  remove,
  signUp,
  suite,
  waitForEmails,
} from "./client.mjs";
import { mailSinkUrl } from "./fixture.mjs";

describe("memberships", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.admin = await signUp("memadmin");
    ctx.member = await signUp("memmember");
    ctx.second = await signUp("memsecond");
    ctx.departmentAdmin = await signUp("memdept");
    ctx.org = await createJson(ctx.admin.accessToken, "/organizations", { name: label("Membership org") });
    ctx.otherOrg = await createJson(ctx.admin.accessToken, "/organizations", { name: label("Other membership org") });
    ctx.department = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/departments`, {
      name: label("Membership department"),
    });
    ctx.otherDepartment = await createJson(ctx.admin.accessToken, `/organizations/${ctx.otherOrg.id}/departments`, {
      name: label("Elsewhere"),
    });
    ctx.category = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/task-categories`, {
      name: label("Category"),
    });
    ctx.project = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/projects`, {
      title: label("Project"),
      accessType: "Public",
    });
    await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/invitations`, {
      email: ctx.member.email,
      role: "MEMBER",
    });
    ctx.memberAccept = await acceptInvite(ctx.member.accessToken, ctx.member.email);
    await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/invitations`, {
      email: ctx.second.email,
      role: "ADMIN",
    });
    await acceptInvite(ctx.second.accessToken, ctx.second.email);
    await createJson(ctx.admin.accessToken, `/departments/${ctx.department.id}/invitations`, {
      email: ctx.departmentAdmin.email,
      role: "ADMIN",
    });
    ctx.departmentAccept = await acceptInvite(ctx.departmentAdmin.accessToken, ctx.departmentAdmin.email);
  });

  test("list organization memberships", async () => {
    const response = await callApi(`/organizations/${ctx.org.id}/memberships`, { token: ctx.member.accessToken });
    assertList(response.json);
    const admin = response.json.items.find((item) => item.userId === ctx.admin.user.id);
    const member = response.json.items.find((item) => item.userId === ctx.member.user.id);
    assertMembership(admin, {
      organizationId: ctx.org.id,
      departmentId: null,
      role: "ADMIN",
      userId: ctx.admin.user.id,
    });
    assert.equal(admin.rateType, null);
    assert.equal(admin.user.email, null);
    assert.equal(admin.professionalBillingRate, null);
    assert.equal(admin.isActive, true);
    assert.equal(admin.primaryDepartmentId, null);
    assert.deepEqual(admin.departmentIds, []);
    assert.equal(admin.user.firstName, "Ada");
    assert.equal(admin.user.lastName, "Lovelace");
    assertMembership(member, {
      organizationId: ctx.org.id,
      departmentId: null,
      role: "MEMBER",
      userId: ctx.member.user.id,
      departmentIds: [],
    });
    const unauthenticated = await callApi(`/organizations/${ctx.org.id}/memberships`);
    assertError(unauthenticated, 401, "unauthorized", "Authentication is required.");
  });

  test("patch organization membership updates role, rate, and department", async () => {
    const listed = await callApi(`/organizations/${ctx.org.id}/memberships`, { token: ctx.admin.accessToken });
    const member = listed.json.items.find((item) => item.userId === ctx.member.user.id);
    const admin = listed.json.items.find((item) => item.userId === ctx.admin.user.id);
    const forbidden = await callApi(`/organizations/${ctx.org.id}/memberships/${member.id}`, {
      method: "PATCH",
      token: ctx.member.accessToken,
      body: { role: "ADMIN" },
    });
    const empty = await callApi(`/organizations/${ctx.org.id}/memberships/${member.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: {},
    });
    const last = await callApi(`/organizations/${ctx.org.id}/memberships/${admin.id}`, {
      method: "PATCH",
      token: ctx.second.accessToken,
      body: { role: "MEMBER" },
    });
    const elsewhere = await callApi(`/organizations/${ctx.org.id}/memberships/${member.id}`, {
      method: "PATCH",
      token: ctx.second.accessToken,
      body: { primaryDepartmentId: ctx.otherDepartment.id },
    });
    const professional = await callApi(`/organizations/${ctx.org.id}/memberships/${member.id}`, {
      method: "PATCH",
      token: ctx.second.accessToken,
      body: { rateType: "Professional" },
    });
    assertError(forbidden, 403, "forbidden", "Forbidden.");
    assertError(empty, 400, "validation_error", "Provide at least one field to update.");
    assert.equal(last.status, 200);
    assert.equal(last.json.role.code, "MEMBER");
    assertError(elsewhere, 400, "validation_error", "primaryDepartmentId does not belong to this organization.");
    assertError(professional, 400, "validation_error", "professionalBillingRate is required when rateType is Professional.");

    const updated = await callApi(`/organizations/${ctx.org.id}/memberships/${member.id}`, {
      method: "PATCH",
      token: ctx.second.accessToken,
      body: {
        rateType: "Professional",
        professionalBillingRate: 80,
        isActive: true,
        primaryDepartmentId: ctx.department.id,
      },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.json.rateType, "Professional");
    assertMoney(updated.json.professionalBillingRate, 80);
    assert.equal(updated.json.primaryDepartmentId, ctx.department.id);
    assert.deepEqual(updated.json.departmentIds, [ctx.department.id]);
    const entry = await createJson(ctx.member.accessToken, "/time/duration", {
      organizationId: ctx.org.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      durationMinutes: 60,
      occurredOn: "2026-10-06",
    });
    assertMoney(entry.hourlyRate, 35.47);
    assertMoney(entry.inKindValue, 35.47);

    const inactive = await callApi(`/organizations/${ctx.org.id}/memberships/${member.id}`, {
      method: "PATCH",
      token: ctx.second.accessToken,
      body: { isActive: false, rateType: "Volunteer" },
    });
    assert.equal(inactive.status, 200);
    assert.equal(inactive.json.isActive, false);
    assert.equal(inactive.json.professionalBillingRate, null);
    const blocked = await callApi("/time/duration", {
      method: "POST",
      token: ctx.member.accessToken,
      body: {
        organizationId: ctx.org.id,
        projectId: ctx.project.id,
        taskCategoryId: ctx.category.id,
        durationMinutes: 30,
        occurredOn: "2026-10-07",
      },
    });
    assertError(blocked, 403, "forbidden", "Forbidden.");
  });

  test("delete keeps the last organization admin and removes department memberships", async () => {
    const listed = await callApi(`/organizations/${ctx.org.id}/memberships`, { token: ctx.second.accessToken });
    const remainingAdmin = listed.json.items.find((item) => item.role.code === "ADMIN");
    const blocked = await callApi(`/organizations/${ctx.org.id}/memberships/${remainingAdmin.id}`, {
      method: "DELETE",
      token: ctx.second.accessToken,
    });
    assertError(blocked, 409, "conflict", "The last organization admin cannot be removed.");
    const departmentListed = await callApi(`/departments/${ctx.department.id}/memberships`, {
      token: ctx.second.accessToken,
    });
    assertList(departmentListed.json);
    const departmentMembership = departmentListed.json.items.find((item) => item.userId === ctx.departmentAdmin.user.id);
    assertMembership(departmentMembership, {
      organizationId: ctx.org.id,
      departmentId: ctx.department.id,
      role: "ADMIN",
      userId: ctx.departmentAdmin.user.id,
      departmentIds: [ctx.department.id],
    });
    assert.equal(departmentMembership.rateType, null);
    assert.equal(departmentMembership.isActive, null);
    const orgMembership = listed.json.items.find((item) => item.userId === ctx.departmentAdmin.user.id);
    await remove(ctx.second.accessToken, `/organizations/${ctx.org.id}/memberships/${orgMembership.id}`);
    const after = await callApi(`/departments/${ctx.department.id}/memberships`, { token: ctx.second.accessToken });
    assert.equal(after.json.items.some((item) => item.userId === ctx.departmentAdmin.user.id), false);
    const missing = await callApi(`/organizations/${ctx.org.id}/memberships/${missingId()}`, {
      method: "DELETE",
      token: ctx.second.accessToken,
    });
    assertError(missing, 404, "not_found", "Not found.");
  });

  test("department admins can change a department role", async () => {
    const recruit = await signUp("memrecruit");
    await createJson(ctx.second.accessToken, `/departments/${ctx.department.id}/invitations`, {
      email: recruit.email,
      role: "MEMBER",
    });
    await acceptInvite(recruit.accessToken, recruit.email);
    const listed = await callApi(`/departments/${ctx.department.id}/memberships`, { token: ctx.second.accessToken });
    const membership = listed.json.items.find((item) => item.userId === recruit.user.id);
    const updated = await callApi(`/departments/${ctx.department.id}/memberships/${membership.id}`, {
      method: "PATCH",
      token: ctx.second.accessToken,
      body: { role: "ADMIN" },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.json.role.code, "ADMIN");
    await remove(recruit.accessToken, `/departments/${ctx.department.id}/memberships/${membership.id}`);
    const after = await callApi(`/departments/${ctx.department.id}/memberships`, { token: ctx.second.accessToken });
    assert.equal(after.json.items.some((item) => item.userId === recruit.user.id), false);
  });

  test("organization admins can add a person with a temporary password and departments", async () => {
    const extraDepartment = await createJson(ctx.second.accessToken, `/organizations/${ctx.org.id}/departments`, {
      name: label("Second department"),
    });
    const person = identity("newperson");
    const created = await createJson(ctx.second.accessToken, `/organizations/${ctx.org.id}/memberships`, {
      email: person.email,
      username: person.username,
      password: person.password,
      firstName: "New",
      lastName: "Person",
      role: "VOLUNTEER",
      departmentIds: [ctx.department.id, extraDepartment.id],
    });
    assertMembership(created, {
      organizationId: ctx.org.id,
      departmentId: null,
      role: "VOLUNTEER",
      userId: created.userId,
      departmentIds: [ctx.department.id, extraDepartment.id],
    });
    assert.equal(created.user.firstName, "New");
    assert.equal(created.user.lastName, "Person");
    assert.equal(created.primaryDepartmentId, ctx.department.id);
    const session = await callApi("/auth/login", {
      method: "POST",
      body: { username: person.username, password: person.password },
    });
    assert.equal(session.status, 200);
    assert.equal(session.json.user.mustChangePassword, true);

    const existing = await signUp("alreadyin");
    const refused = await callApi(`/organizations/${ctx.org.id}/memberships`, {
      method: "POST",
      token: ctx.second.accessToken,
      body: {
        email: existing.email,
        firstName: "Already",
        lastName: "Here",
        role: "MEMBER",
        departmentIds: [extraDepartment.id],
      },
    });
    assertError(refused, 409, "account_exists", "This email already has an account. Send them an invitation instead.");
    const untouched = await callApi("/users/me", { token: existing.accessToken });
    assert.equal(untouched.json.profile.firstName, existing.firstName);

    const added = await joinOrg(ctx.second.accessToken, ctx.org.id, existing, {
      role: "MEMBER",
      departmentIds: [extraDepartment.id],
    });
    assert.equal(added.userId, existing.user.id);
    assert.deepEqual(added.departmentIds, [extraDepartment.id]);
    const samePassword = await callApi("/auth/login", {
      method: "POST",
      body: { username: existing.username, password: existing.password },
    });
    assert.equal(samePassword.status, 200);

    const duplicate = await callApi(`/organizations/${ctx.org.id}/memberships`, {
      method: "POST",
      token: ctx.second.accessToken,
      body: {
        email: existing.email,
        firstName: "Already",
        lastName: "Here",
        role: "MEMBER",
      },
    });
    assertError(duplicate, 409, "conflict", "This person is already in the organization.");

    const forbidden = await callApi(`/organizations/${ctx.org.id}/memberships`, {
      method: "POST",
      token: ctx.member.accessToken,
      body: {
        email: "blocked@example.com",
        username: "blockeduser",
        password: "temp-pass-1",
        firstName: "No",
        lastName: "Access",
        role: "VOLUNTEER",
      },
    });
    assertError(forbidden, 403, "forbidden", "Forbidden.");

    const denied = await callApi(`/organizations/${ctx.org.id}/memberships/${added.id}`, {
      method: "PATCH",
      token: ctx.member.accessToken,
      body: { email: "member-change@example.com" },
    });
    assertError(denied, 403, "forbidden", "Forbidden.");

    const claimed = await callApi(`/organizations/${ctx.org.id}/memberships/${added.id}`, {
      method: "PATCH",
      token: ctx.second.accessToken,
      body: { email: `patched.${existing.email}` },
    });
    assertError(claimed, 403, "forbidden", "This person has signed in, so only they can change their email.");

    const nextEmail = `patched.${person.email}`;
    const profile = await callApi(`/organizations/${ctx.org.id}/memberships/${created.id}`, {
      method: "PATCH",
      token: ctx.second.accessToken,
      body: {
        email: nextEmail.toUpperCase(),
        firstName: "Patched",
        lastName: "Name",
        displayName: "Patched Name",
        departmentIds: [ctx.department.id, extraDepartment.id],
      },
    });
    assert.equal(profile.status, 200);
    assert.equal(profile.json.user.email, nextEmail);
    assert.equal(profile.json.user.firstName, "Patched");
    assert.equal(profile.json.user.lastName, "Name");
    assert.equal(profile.json.user.displayName, "Patched Name");
    assert.deepEqual(profile.json.departmentIds, [ctx.department.id, extraDepartment.id].sort());

    const taken = await callApi(`/organizations/${ctx.org.id}/memberships/${created.id}`, {
      method: "PATCH",
      token: ctx.second.accessToken,
      body: { email: existing.email },
    });
    assertError(taken, 409, "conflict", "That email is already in use.");

    await remove(ctx.second.accessToken, `/organizations/${ctx.org.id}/memberships/${added.id}`);
    const stillExists = await callApi("/auth/login", {
      method: "POST",
      body: { username: existing.username, password: existing.password },
    });
    assert.equal(stillExists.status, 200);
    const gone = await callApi(`/organizations/${ctx.org.id}/memberships`, { token: ctx.second.accessToken });
    assert.equal(gone.json.items.some((item) => item.userId === existing.user.id), false);
  });

  test("another organization's admin cannot take over or edit a shared account", async () => {
    const victim = await signUp("takeover");
    const attacker = await signUp("attacker");
    const attackerOrg = await createJson(attacker.accessToken, "/organizations", { name: label("Attacker org") });
    const forced = await callApi(`/organizations/${attackerOrg.id}/memberships`, {
      method: "POST",
      token: attacker.accessToken,
      body: { email: victim.email, firstName: "Taken", lastName: "Over", role: "MEMBER" },
    });
    assertError(forced, 409, "account_exists", "This email already has an account. Send them an invitation instead.");

    const membership = await joinOrg(ctx.second.accessToken, ctx.org.id, victim, { role: "MEMBER" });
    await joinOrg(attacker.accessToken, attackerOrg.id, victim, { role: "MEMBER" });
    const attackerView = await callApi(`/organizations/${attackerOrg.id}/memberships`, { token: attacker.accessToken });
    const shared = attackerView.json.items.find((item) => item.userId === victim.user.id);
    const reEmail = await callApi(`/organizations/${attackerOrg.id}/memberships/${shared.id}`, {
      method: "PATCH",
      token: attacker.accessToken,
      body: { email: `owned.${attacker.email}` },
    });
    assertError(reEmail, 403, "forbidden", "This person belongs to another organization, so only they can change their profile.");
    const rename = await callApi(`/organizations/${ctx.org.id}/memberships/${membership.id}`, {
      method: "PATCH",
      token: ctx.second.accessToken,
      body: { firstName: "Renamed" },
    });
    assertError(rename, 403, "forbidden", "This person belongs to another organization, so only they can change their profile.");

    const unchangedProfile = await callApi(`/organizations/${ctx.org.id}/memberships/${membership.id}`, {
      method: "PATCH",
      token: ctx.second.accessToken,
      body: { firstName: victim.firstName, email: victim.email, orgUserTitle: "Usher" },
    });
    assert.equal(unchangedProfile.status, 200, unchangedProfile.text);
    assert.equal(unchangedProfile.json.orgUserTitle, "Usher");
    const me = await callApi("/users/me", { token: victim.accessToken });
    assert.equal(me.json.email, victim.email);
    assert.equal(me.json.profile.firstName, victim.firstName);
  });

  test("members see names but not other members' emails or pay", async () => {
    const volunteer = await signUp("memvisible");
    await joinOrg(ctx.second.accessToken, ctx.org.id, volunteer, { role: "VOLUNTEER" });
    const path = `/organizations/${ctx.org.id}/memberships?limit=100`;
    const asVolunteer = await callApi(path, { token: volunteer.accessToken });
    assert.equal(asVolunteer.status, 200, asVolunteer.text);
    const others = asVolunteer.json.items.filter((item) => item.userId !== volunteer.user.id);
    assert.ok(others.length > 0);
    assert.ok(others.every((item) => item.user.email === null && item.rateType === null && item.professionalBillingRate === null));
    assert.ok(others.every((item) => item.user.username && "firstName" in item.user));
    const self = asVolunteer.json.items.find((item) => item.userId === volunteer.user.id);
    assert.equal(self.user.email, volunteer.email);
    assert.equal(self.rateType, "Volunteer");

    const asAdmin = await callApi(path, { token: ctx.second.accessToken });
    const seen = asAdmin.json.items.find((item) => item.userId === volunteer.user.id);
    assert.equal(seen.user.email, volunteer.email);
    assert.equal(seen.rateType, "Volunteer");
  });

  test("organization notes stay on the membership, not the person's profile", async () => {
    const person = identity("memnotes");
    const created = await createJson(ctx.second.accessToken, `/organizations/${ctx.org.id}/memberships`, {
      email: person.email,
      username: person.username,
      password: person.password,
      firstName: "Note",
      lastName: "Taker",
      role: "VOLUNTEER",
      notes: "Prefers mornings",
    });
    assert.equal(created.notes, "Prefers mornings");
    const patched = await callApi(`/organizations/${ctx.org.id}/memberships/${created.id}`, {
      method: "PATCH",
      token: ctx.second.accessToken,
      body: { notes: "Prefers evenings" },
    });
    assert.equal(patched.status, 200, patched.text);
    assert.equal(patched.json.notes, "Prefers evenings");
    const profile = await callApi(`/users/${created.userId}`, { token: ctx.second.accessToken });
    assert.equal(profile.json.profile.notes, null);

    const peer = await signUp("memnotespeer");
    await joinOrg(ctx.second.accessToken, ctx.org.id, peer, { role: "VOLUNTEER" });
    const asPeer = await callApi(`/organizations/${ctx.org.id}/memberships?limit=100`, { token: peer.accessToken });
    assert.equal(asPeer.json.items.find((item) => item.id === created.id).notes, null);
  });

  test("batch delete removes the selected memberships", async () => {
    const path = `/organizations/${ctx.org.id}/memberships`;
    const firstPerson = identity("batchone");
    const secondPerson = identity("batchtwo");
    const first = await createJson(ctx.second.accessToken, path, {
      email: firstPerson.email,
      username: firstPerson.username,
      password: firstPerson.password,
      firstName: "Batch",
      lastName: "One",
      role: "VOLUNTEER",
      departmentIds: [ctx.department.id],
    });
    const second = await createJson(ctx.second.accessToken, path, {
      email: secondPerson.email,
      username: secondPerson.username,
      password: secondPerson.password,
      firstName: "Batch",
      lastName: "Two",
      role: "VOLUNTEER",
      departmentIds: [ctx.department.id],
    });

    const empty = await callApi(path, { method: "DELETE", token: ctx.second.accessToken, body: { membershipIds: [] } });
    const tooMany = await callApi(path, {
      method: "DELETE",
      token: ctx.second.accessToken,
      body: { membershipIds: Array.from({ length: 101 }, () => missingId()) },
    });
    const malformed = await callApi(path, {
      method: "DELETE",
      token: ctx.second.accessToken,
      body: { membershipIds: ["not-an-id"] },
    });
    const forbidden = await callApi(path, {
      method: "DELETE",
      token: ctx.member.accessToken,
      body: { membershipIds: [first.id, second.id] },
    });
    const missing = await callApi(path, {
      method: "DELETE",
      token: ctx.second.accessToken,
      body: { membershipIds: [first.id, missingId()] },
    });
    const listed = await callApi(path, { token: ctx.second.accessToken });
    const admins = listed.json.items.filter((item) => item.role.code === "ADMIN");
    const blocked = await callApi(path, {
      method: "DELETE",
      token: ctx.second.accessToken,
      body: { membershipIds: [...admins.map((item) => item.id), first.id] },
    });
    assertError(empty, 400, "validation_error", "membershipIds must include at least one id.");
    assertError(tooMany, 400, "validation_error", "membershipIds must include at most 100 ids.");
    assertError(malformed, 400, "validation_error", "membershipIds must be an array of ids.");
    assertError(forbidden, 403, "forbidden", "Forbidden.");
    assertError(missing, 404, "not_found", "Not found.");
    assertError(blocked, 409, "conflict", "The last organization admin cannot be removed.");

    const stillThere = await callApi(path, { token: ctx.second.accessToken });
    assert.equal(stillThere.json.items.some((item) => item.id === first.id), true);
    assert.equal(stillThere.json.items.some((item) => item.id === second.id), true);
    for (const admin of admins) {
      assert.equal(stillThere.json.items.some((item) => item.id === admin.id), true);
    }

    const deleted = await callApi(path, {
      method: "DELETE",
      token: ctx.second.accessToken,
      body: { membershipIds: [first.id, first.id, second.id] },
    });
    assert.equal(deleted.status, 204);
    assert.equal(deleted.text, "");
    const after = await callApi(path, { token: ctx.second.accessToken });
    assert.equal(after.json.items.some((item) => item.userId === first.userId), false);
    assert.equal(after.json.items.some((item) => item.userId === second.userId), false);
    const departments = await callApi(`/departments/${ctx.department.id}/memberships`, { token: ctx.second.accessToken });
    assert.equal(departments.json.items.some((item) => item.userId === first.userId), false);
    assert.equal(departments.json.items.some((item) => item.userId === second.userId), false);
    const login = await callApi("/auth/login", {
      method: "POST",
      body: { username: firstPerson.username, password: firstPerson.password },
    });
    assert.equal(login.status, 200);
  });

  test("emailUser sends a new account its temporary password", async () => {
    const person = identity("emailed");
    const created = await createJson(ctx.second.accessToken, `/organizations/${ctx.org.id}/memberships`, {
      email: person.email,
      username: person.username,
      password: person.password,
      firstName: "Mailed",
      lastName: "Person",
      role: "VOLUNTEER",
      emailUser: true,
    });
    assert.equal(created.user.email, person.email);
    const messages = await waitForEmails(person.email, 1);
    assert.match(messages[0].subject, new RegExp(escapeRegExp(ctx.org.name)));
    assert.match(messages[0].text, new RegExp(escapeRegExp(person.username)));
    assert.match(messages[0].text, new RegExp(escapeRegExp(person.password)));
    assert.match(messages[0].text, /\/login/);

    const quiet = identity("quiet");
    await createJson(ctx.second.accessToken, `/organizations/${ctx.org.id}/memberships`, {
      email: quiet.email,
      username: quiet.username,
      password: quiet.password,
      firstName: "Quiet",
      lastName: "Person",
      role: "VOLUNTEER",
      emailUser: false,
    });
    const quietMail = await fetch(`${mailSinkUrl}/emails?to=${encodeURIComponent(quiet.email)}`);
    assert.equal(quietMail.ok, true);
    assert.deepEqual(await quietMail.json(), []);

    const existing = await signUp("mailexisting");
    const refused = await callApi(`/organizations/${ctx.org.id}/memberships`, {
      method: "POST",
      token: ctx.second.accessToken,
      body: { email: existing.email, firstName: "Existing", lastName: "Mail", role: "MEMBER", emailUser: true },
    });
    assert.equal(refused.status, 409);
    const existingMail = await fetch(`${mailSinkUrl}/emails?to=${encodeURIComponent(existing.email)}`);
    assert.equal(existingMail.ok, true);
    const existingMessages = await existingMail.json();
    assert.equal(existingMessages.some((message) => String(message.text).includes("Temporary password")), false);

    const invalid = await callApi(`/organizations/${ctx.org.id}/memberships`, {
      method: "POST",
      token: ctx.second.accessToken,
      body: {
        email: identity("badflag").email,
        username: "badflaguser",
        password: "temp-pass-1",
        firstName: "Bad",
        lastName: "Flag",
        role: "VOLUNTEER",
        emailUser: "yes",
      },
    });
    assertError(invalid, 400, "validation_error", "emailUser must be a boolean.");
  });
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
