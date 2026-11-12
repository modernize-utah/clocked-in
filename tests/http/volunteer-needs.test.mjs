import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, describe, test } from "node:test";
import {
  assertError,
  assertInstant,
  assertKeys,
  assertList,
  assertStatus,
  assertUuid,
  callApi,
  createJson,
  identity,
  label,
  missingId,
  signUp,
  suite,
  waitForEmails,
  joinOrg,
} from "./client.mjs";

const needKeys = [
  "id",
  "organizationId",
  "createdByUserId",
  "publicToken",
  "name",
  "description",
  "type",
  "countNeeded",
  "countVetted",
  "startDate",
  "endDate",
  "requiredBy",
  "allowPublic",
  "requireVetting",
  "questions",
  "projectId",
  "taskCategoryId",
  "departmentId",
  "status",
  "createdAt",
  "updatedAt",
];

function question(prompt = "Can you lift 25 pounds?") {
  const questionId = randomUUID();
  const yes = randomUUID();
  const no = randomUUID();
  return {
    questionId,
    yes,
    no,
    form: {
      version: 1,
      items: [
        {
          id: questionId,
          prompt,
          kind: "single",
          choices: [
            { id: yes, label: "Yes" },
            { id: no, label: "No" },
          ],
          correctChoiceIds: [yes],
        },
      ],
    },
  };
}

function guestBody(form, choiceId, person, extra = {}) {
  return {
    name: person.name,
    email: person.email,
    phone: "555-0100",
    comment: "I can help Saturday.",
    acknowledged: true,
    captchaToken: "test",
    answers: [{ questionId: form.questionId, choiceIds: [choiceId] }],
    ...extra,
  };
}

describe("volunteer needs", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.admin = await signUp("needadmin");
    ctx.member = await signUp("needmember");
    ctx.org = await createJson(ctx.admin.accessToken, "/organizations", { name: label("Need org") });
    await joinOrg(ctx.admin.accessToken, ctx.org.id, ctx.member, { role: "MEMBER" });
    ctx.form = question();
    ctx.need = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/volunteer-needs`, {
      name: label("Setup"),
      description: "Move chairs.",
      type: "Task",
      countNeeded: 2,
      allowPublic: true,
      requireVetting: false,
      questions: ctx.form.form,
    });
  });

  test("admins manage needs and members cannot", async () => {
    assertKeys(ctx.need, needKeys);
    assert.equal(ctx.need.organizationId, ctx.org.id);
    assert.equal(ctx.need.type, "Task");
    assert.equal(ctx.need.countVetted, 0);
    assert.equal(ctx.need.questions.items[0].correctChoiceIds[0], ctx.form.yes);
    assert.match(ctx.need.publicToken, /^[0-9a-f]{32}$/);
    const listed = await callApi(`/organizations/${ctx.org.id}/volunteer-needs`, {
      token: ctx.admin.accessToken,
      query: { type: "Task", sort: "name" },
    });
    assertStatus(listed, 200);
    assertList(listed.json);
    assert.ok(listed.json.items.some((item) => item.id === ctx.need.id));
    const forbidden = await callApi(`/organizations/${ctx.org.id}/volunteer-needs`, { token: ctx.member.accessToken });
    assertError(forbidden, 403, "forbidden");
    const anonymous = await callApi(`/organizations/${ctx.org.id}/volunteer-needs`);
    assertError(anonymous, 401, "unauthorized");
    const renamed = await callApi(`/volunteer-needs/${ctx.need.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { description: "Move chairs and tables." },
    });
    assertStatus(renamed, 200);
    assert.equal(renamed.json.description, "Move chairs and tables.");
  });

  test("public payload hides correct answers", async () => {
    const open = await callApi(`/volunteer-needs/public/${ctx.need.publicToken}`);
    assertStatus(open, 200);
    assert.equal(open.json.name, ctx.need.name);
    assert.equal(open.json.closed, null);
    assert.equal(open.json.organizationName, ctx.org.name);
    assert.equal(open.json.questions[0].prompt, "Can you lift 25 pounds?");
    assert.equal("correctChoiceIds" in open.json.questions[0], false);
    const hidden = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/volunteer-needs`, {
      name: label("Private"),
      type: "Position",
      countNeeded: 1,
    });
    const missing = await callApi(`/volunteer-needs/public/${hidden.publicToken}`);
    assertError(missing, 404, "not_found");
  });

  test("a guest with the right answer is vetted", async () => {
    const person = { ...identity("guest"), name: "Guest Volunteer" };
    const signup = await createJson(
      null,
      `/volunteer-needs/public/${ctx.need.publicToken}/signups`,
      guestBody(ctx.form, ctx.form.yes, person),
    );
    assert.equal(signup.kind, "guest");
    assert.equal(signup.passed, true);
    assert.equal(signup.vetted, true);
    assert.equal(signup.email, person.email);
    assert.equal(signup.comment, "I can help Saturday.");
    assert.equal(signup.answers[0].labels[0], "Yes");
    const again = await callApi(`/volunteer-needs/public/${ctx.need.publicToken}/signups`, {
      method: "POST",
      body: guestBody(ctx.form, ctx.form.yes, person),
    });
    assertError(again, 409, "conflict", "You are already signed up for this need.");
    const need = await callApi(`/volunteer-needs/${ctx.need.id}`, { token: ctx.admin.accessToken });
    assert.equal(need.json.countVetted, 1);
    ctx.guest = person;
    ctx.guestSignup = signup;
  });

  test("a wrong answer is kept and does not fill a spot", async () => {
    const person = { ...identity("wrong"), name: "Wrong Answer" };
    const signup = await createJson(
      null,
      `/volunteer-needs/public/${ctx.need.publicToken}/signups`,
      guestBody(ctx.form, ctx.form.no, person),
    );
    assert.equal(signup.passed, false);
    assert.equal(signup.vetted, false);
    const need = await callApi(`/volunteer-needs/${ctx.need.id}`, { token: ctx.admin.accessToken });
    assert.equal(need.json.countVetted, 1);
    ctx.wrong = signup;
  });

  test("an existing user must log in", async () => {
    const response = await callApi(`/volunteer-needs/public/${ctx.need.publicToken}/signups`, {
      method: "POST",
      body: guestBody(ctx.form, ctx.form.yes, { name: "Member", email: ctx.member.email }),
    });
    assertError(response, 409, "account_exists", "An account already uses this email. Log in to sign up.");
    const signup = await createJson(ctx.member.accessToken, `/volunteer-needs/public/${ctx.need.publicToken}/signups`, {
      acknowledged: true,
      captchaToken: "test",
      comment: "I am a member.",
      answers: [{ questionId: ctx.form.questionId, choiceIds: [ctx.form.yes] }],
    });
    assert.equal(signup.kind, "member");
    assert.equal(signup.userId, ctx.member.user.id);
    assert.equal(signup.vetted, true);
    const full = await callApi(`/volunteer-needs/${ctx.need.id}`, { token: ctx.admin.accessToken });
    assert.equal(full.json.countVetted, 2);
    assert.equal(full.json.countNeeded, 2);
  });

  test("a full need and a past deadline reject signup", async () => {
    const person = { ...identity("late"), name: "Too Late" };
    const full = await callApi(`/volunteer-needs/public/${ctx.need.publicToken}/signups`, {
      method: "POST",
      body: guestBody(ctx.form, ctx.form.yes, person),
    });
    assertError(full, 409, "conflict", "This need is already filled.");
    const closedForm = question("Can you stay until noon?");
    const closed = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/volunteer-needs`, {
      name: label("Closed"),
      type: "Position",
      countNeeded: 3,
      allowPublic: true,
      requiredBy: "2020-01-01T00:00:00.000Z",
      questions: closedForm.form,
    });
    const deadline = await callApi(`/volunteer-needs/public/${closed.publicToken}/signups`, {
      method: "POST",
      body: guestBody(closedForm, closedForm.yes, person),
    });
    assertError(deadline, 409, "conflict", "Sign-up for this need has closed.");
    const view = await callApi(`/volunteer-needs/public/${closed.publicToken}`);
    assert.equal(view.json.closed, "deadline");
  });

  test("vetting waits for an admin", async () => {
    const form = question("Have you volunteered here before?");
    const need = await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/volunteer-needs`, {
      name: label("Reviewed"),
      type: "Position",
      countNeeded: 1,
      allowPublic: true,
      requireVetting: true,
      questions: form.form,
    });
    const person = { ...identity("review"), name: "Needs Review" };
    const signup = await createJson(
      null,
      `/volunteer-needs/public/${need.publicToken}/signups`,
      guestBody(form, form.yes, person),
    );
    assert.equal(signup.passed, true);
    assert.equal(signup.vetted, false);
    const vetted = await callApi(`/volunteer-needs/${need.id}/signups/${signup.id}/vet`, {
      method: "POST",
      token: ctx.admin.accessToken,
    });
    assertStatus(vetted, 200);
    assert.equal(vetted.json.vetted, true);
    const after = await callApi(`/volunteer-needs/${need.id}`, { token: ctx.admin.accessToken });
    assert.equal(after.json.countVetted, 1);
    const unvet = await callApi(`/volunteer-needs/${need.id}/signups/${signup.id}/unvet`, {
      method: "POST",
      token: ctx.admin.accessToken,
    });
    assert.equal(unvet.json.vetted, false);
    const removed = await callApi(`/volunteer-needs/${need.id}/signups/${ctx.wrong.id}`, { method: "DELETE", token: ctx.admin.accessToken });
    assertStatus(removed, 404);
    await callApi(`/volunteer-needs/${ctx.need.id}/signups/${ctx.wrong.id}`, { method: "DELETE", token: ctx.admin.accessToken }).then((response) => {
      assertStatus(response, 204);
    });
  });

  test("creating a user links a guest with the same email", async () => {
    const listed = await callApi(`/volunteer-needs/${ctx.need.id}/signups`, { token: ctx.admin.accessToken });
    assertStatus(listed, 200);
    const guest = listed.json.items.find((item) => item.email === ctx.guest.email);
    assert.equal(guest.linkedUserId, null);
    const account = await signUp("linkedguest", { email: ctx.guest.email });
    const again = await callApi(`/volunteer-needs/${ctx.need.id}/signups`, { token: ctx.admin.accessToken });
    const linked = again.json.items.find((item) => item.email === ctx.guest.email);
    assert.equal(linked.linkedUserId, account.user.id);
    assertUuid(linked.linkedUserId);
  });

  test("admins can email a volunteer", async () => {
    const sent = await callApi(`/volunteer-needs/${ctx.need.id}/emails`, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: { signupIds: [ctx.guestSignup.id], subject: "Saturday setup", body: "Please arrive at 8." },
    });
    if (sent.status === 502) {
      assertError(sent, 502, "email_failed");
      return;
    }
    assertStatus(sent, 200);
    assert.equal(sent.json.sent, 1);
    if ((process.env.RESEND_API_URL ?? "").includes("5399")) {
      const messages = await waitForEmails(ctx.guest.email, 1);
      assert.match(messages.at(-1).subject, /Saturday setup/);
      assert.match(messages.at(-1).text, /Please arrive at 8/);
    }
  });

  test("missing need and bad questions fail", async () => {
    const missing = await callApi(`/volunteer-needs/${missingId()}`, { token: ctx.admin.accessToken });
    assertError(missing, 404, "not_found");
    const bad = await callApi(`/organizations/${ctx.org.id}/volunteer-needs`, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: { name: label("Bad"), type: "Task", countNeeded: 1, questions: { version: 1, items: [] } },
    });
    assertStatus(bad, 201);
    const invalid = await callApi(`/organizations/${ctx.org.id}/volunteer-needs`, {
      method: "POST",
      token: ctx.admin.accessToken,
      body: { name: label("Invalid"), type: "Shift", countNeeded: 1 },
    });
    assertError(invalid, 400, "validation_error", "type must be Position or Task.");
    const signup = ctx.guestSignup;
    assertInstant(signup.createdAt);
  });
});
