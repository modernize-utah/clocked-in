import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import {
  acceptInvite,
  assertError,
  callApi,
  createJson,
  label,
  signUp,
  suite,
  waitForMatchingEmails,
} from "./client.mjs";
import { mailSinkUrl } from "./fixture.mjs";

const kinds = [
  "Invite",
  "Welcome",
  "PasswordReset",
  "LoggedTime",
  "UnclassifiedEntry",
  "FeedbackReceived",
  "FeedbackNotify",
  "FeedbackCompleted",
  "AccessRequestReceived",
  "AccessRequestDecided",
  "NeedSubmitted",
  "NeedDecided",
  "VolunteerMessage",
];

describe("email templates", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.admin = await signUp("mailadmin");
    ctx.member = await signUp("mailmember");
    ctx.outsider = await signUp("mailout");
    ctx.org = await createJson(ctx.admin.accessToken, "/tenants", { name: label("Mail org") });
    await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/invitations`, {
      email: ctx.member.email,
      role: "MEMBER",
    });
    await acceptInvite(ctx.member.accessToken, ctx.member.email);
    ctx.path = `/tenants/${ctx.org.id}/email-templates`;
  });

  test("a new tenant is seeded with every template and members can list them", async () => {
    const listed = await callApi(ctx.path, { token: ctx.member.accessToken });
    assert.equal(listed.status, 200, listed.text);
    assert.deepEqual(
      listed.json.items.map((item) => item.for),
      kinds,
    );
    const invite = listed.json.items.find((item) => item.for === "Invite");
    assert.equal(invite.version, 1);
    assert.equal(invite.isEnabled, true);
    assert.equal(invite.isOptional, false);
    assert.ok(invite.fields.includes("invite.code"));
    assert.match(invite.template, /\{\{invite\.code\}\}/);
    const logged = listed.json.items.find((item) => item.for === "LoggedTime");
    assert.equal(logged.isOptional, true);
    ctx.invite = invite;
    ctx.logged = logged;

    const one = await callApi(`${ctx.path}/${invite.id}`, { token: ctx.member.accessToken });
    assert.equal(one.status, 200);
    assert.equal(one.json.id, invite.id);

    const outsider = await callApi(ctx.path, { token: ctx.outsider.accessToken });
    assertError(outsider, 403, "forbidden", "Forbidden.");
  });

  test("an admin patch sanitizes the body and bumps the version", async () => {
    const updated = await callApi(`${ctx.path}/${ctx.invite.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: {
        subject: "Join {{tenant.name}}",
        template: '<p onclick="x()">Hello <strong>{{user.username}}</strong></p><script>alert(1)</script><p>{{invite.code}}</p>',
      },
    });
    assert.equal(updated.status, 200, updated.text);
    assert.equal(updated.json.version, 2);
    assert.equal(updated.json.subject, "Join {{tenant.name}}");
    assert.equal(updated.json.template, "<p>Hello <strong>{{user.username}}</strong></p><p>{{invite.code}}</p>");
  });

  test("patch validation", async () => {
    const member = await callApi(`${ctx.path}/${ctx.invite.id}`, {
      method: "PATCH",
      token: ctx.member.accessToken,
      body: { subject: "Nope" },
    });
    assertError(member, 403, "forbidden", "Forbidden.");
    const unknown = await callApi(`${ctx.path}/${ctx.invite.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { subject: "Hours {{entry.hours}}" },
    });
    assertError(unknown, 400, "validation_error", "{{entry.hours}} is not a field for this email.");
    const off = await callApi(`${ctx.path}/${ctx.invite.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { isEnabled: false },
    });
    assertError(off, 400, "validation_error", "This email cannot be turned off.");
    const kind = await callApi(`${ctx.path}/${ctx.invite.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { for: "Welcome" },
    });
    assertError(kind, 400, "validation_error", "for cannot be changed.");
    const empty = await callApi(`${ctx.path}/${ctx.invite.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: {},
    });
    assertError(empty, 400, "validation_error", "Provide at least one field to update.");
    const blank = await callApi(`${ctx.path}/${ctx.invite.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { template: "<script>only</script>" },
    });
    assertError(blank, 400, "validation_error", "template is required.");
  });

  test("reset restores the default copy", async () => {
    const reset = await callApi(`${ctx.path}/${ctx.invite.id}/reset`, { method: "POST", token: ctx.admin.accessToken });
    assert.equal(reset.status, 200, reset.text);
    assert.equal(reset.json.version, 3);
    assert.equal(reset.json.subject, "{{tenant.name}} invited you to join VolunTime");
    assert.match(reset.json.template, /Use this code to accept the invite:/);
  });

  test("logging classified hours sends the LoggedTime email", async () => {
    const category = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/task-categories`, {
      name: label("Mail category"),
    });
    const project = await createJson(ctx.admin.accessToken, `/tenants/${ctx.org.id}/projects`, {
      title: label("Mail project"),
      accessType: "Public",
    });
    await callApi(`${ctx.path}/${ctx.logged.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { subject: "Logged for {{tenant.name}}: {{entry.hours}}h" },
    });
    await createJson(ctx.member.accessToken, "/time/duration", {
      tenantId: ctx.org.id,
      projectId: project.id,
      taskCategoryId: category.id,
      durationMinutes: 90,
      occurredOn: "2026-10-05",
    });
    const [mail] = await waitForMatchingEmails(ctx.member.email, /Logged for .*: 1\.5h/);
    assert.match(mail.text, /1\.5 hours were saved on/);
    ctx.category = category;
    ctx.project = project;
  });

  test("tenant emailSettings control when LoggedTime, UnclassifiedEntry, and optional notifications are sent", async () => {
    const badFreq = await callApi(`/tenants/${ctx.org.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: {
        preferences: {
          allowTimeEntryEditing: false,
          emailSettings: { LoggedTime: "daily" },
        },
      },
    });
    assertError(badFreq, 400, "validation_error", "LoggedTime must be immediate, weekly, or off.");

    const badObj = await callApi(`/tenants/${ctx.org.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: {
        preferences: {
          allowTimeEntryEditing: false,
          emailSettings: null,
        },
      },
    });
    assertError(badObj, 400, "validation_error", "emailSettings must be an object.");

    const badBool = await callApi(`/tenants/${ctx.org.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: {
        preferences: {
          allowTimeEntryEditing: false,
          emailSettings: { NeedSubmitted: "nope" },
        },
      },
    });
    assertError(badBool, 400, "validation_error", "NeedSubmitted must be a boolean.");

    const updated = await callApi(`/tenants/${ctx.org.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: {
        preferences: {
          allowTimeEntryEditing: false,
          emailSettings: {
            LoggedTime: "weekly",
            UnclassifiedEntry: "off",
            AccessRequestReceived: false,
            AccessRequestDecided: false,
          },
        },
      },
    });
    assert.equal(updated.status, 200, updated.text);
    assert.equal(updated.json.preferences.emailSettings.LoggedTime, "weekly");
    assert.equal(updated.json.preferences.emailSettings.UnclassifiedEntry, "off");
    assert.equal(updated.json.preferences.emailSettings.AccessRequestReceived, false);
    assert.equal(updated.json.preferences.emailSettings.AccessRequestDecided, false);
    assert.equal(updated.json.preferences.emailSettings.NeedSubmitted, true);

    const getEmails = async (email) => (await fetch(`${mailSinkUrl}/emails?to=${encodeURIComponent(email)}`)).json();
    const beforeEmails = await getEmails(ctx.member.email);
    await createJson(ctx.member.accessToken, "/time/duration", {
      tenantId: ctx.org.id,
      projectId: ctx.project.id,
      taskCategoryId: ctx.category.id,
      durationMinutes: 60,
      occurredOn: "2026-10-06",
    });
    const afterLogged = await getEmails(ctx.member.email);
    assert.equal(afterLogged.length, beforeEmails.length);

    await createJson(ctx.member.accessToken, "/time/clock-in", {
      tenantId: ctx.org.id,
    });
    await createJson(ctx.member.accessToken, "/time/clock-out", {}, 200);
    const afterUnclassified = await getEmails(ctx.member.email);
    assert.equal(afterUnclassified.length, beforeEmails.length);

    const beforeAdminEmails = await getEmails(ctx.admin.email);
    const reqRes = await createJson(ctx.member.accessToken, `/tenants/${ctx.org.id}/access-requests`, {
      message: "Need admin access",
    });
    const afterAdminEmails = await getEmails(ctx.admin.email);
    assert.equal(afterAdminEmails.length, beforeAdminEmails.length);

    const decideRes = await callApi(`/tenants/${ctx.org.id}/access-requests/${reqRes.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { status: "declined" },
    });
    assert.equal(decideRes.status, 200, decideRes.text);
    const afterDecidedEmails = await getEmails(ctx.member.email);
    assert.equal(afterDecidedEmails.length, beforeEmails.length);

    const reenabled = await callApi(`/tenants/${ctx.org.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: {
        preferences: {
          allowTimeEntryEditing: false,
          emailSettings: {
            LoggedTime: "immediate",
            UnclassifiedEntry: "immediate",
          },
        },
      },
    });
    assert.equal(reenabled.status, 200, reenabled.text);

    await createJson(ctx.member.accessToken, "/time/clock-in", {
      tenantId: ctx.org.id,
    });
    await createJson(ctx.member.accessToken, "/time/clock-out", {}, 200);
    const [unclassifiedMail] = await waitForMatchingEmails(ctx.member.email, /Please classify your volunteer time/);
    assert.match(unclassifiedMail.text, /Review unclassified entries/);
  });
});
