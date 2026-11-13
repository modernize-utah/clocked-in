import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { before, describe, test } from "node:test";
import {
  acceptInvite,
  assertError,
  assertInstant,
  assertKeys,
  assertList,
  assertUuid,
  callApi,
  createJson,
  grantSuperAdmin,
  label,
  missingId,
  signUp,
  suite,
  waitForLinearIssue,
  waitForMatchingEmails,
} from "./client.mjs";
import { apiBaseUrl } from "./fixture.mjs";

function feedbackBody(overrides = {}) {
  return {
    type: "Bug",
    priority: "High",
    area: "LogTime",
    title: label("Timer"),
    description: "The timer did not stop when I clocked out.",
    screenshotUrls: [],
    ...overrides,
  };
}

function signLinearWebhook(payload, secret = process.env.LINEAR_WEBHOOK_SECRET || "") {
  const raw = JSON.stringify(payload);
  const signature = createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  return { raw, signature };
}

async function postLinearWebhook(payload, { signature, secret } = {}) {
  const signed = signLinearWebhook(payload, secret);
  const headers = {
    "content-type": "application/json",
    ...(signature !== null ? { "linear-signature": signature ?? signed.signature } : {}),
  };
  const response = await fetch(`${apiBaseUrl}/webhooks/linear`, {
    method: "POST",
    headers,
    body: signed.raw,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, text, json };
}

function assertFeedback(item, expected = {}) {
  assertKeys(item, [
    "id",
    "userId",
    "organizationId",
    "type",
    "priority",
    "area",
    "title",
    "description",
    "screenshotUrls",
    "status",
    "active",
    "completed",
    "linearIssueId",
    "linearIssueIdentifier",
    "ticketUrl",
    "createdAt",
    "updatedAt",
    "user",
    "organization",
    "actions",
  ]);
  assertUuid(item.id);
  assertUuid(item.userId);
  assertInstant(item.createdAt);
  assertInstant(item.updatedAt);
  assert.equal(typeof item.active, "boolean");
  assert.equal(typeof item.completed, "boolean");
  assert.ok(Array.isArray(item.screenshotUrls));
  assert.ok(Array.isArray(item.actions));
  assertKeys(item.user, ["id", "username", "email", "displayName"]);
  if (expected.status) {
    assert.equal(item.status, expected.status);
  }
  if (expected.active !== undefined) {
    assert.equal(item.active, expected.active);
  }
  if (expected.completed !== undefined) {
    assert.equal(item.completed, expected.completed);
  }
  if (expected.title) {
    assert.equal(item.title, expected.title);
  }
  if (expected.userId) {
    assert.equal(item.userId, expected.userId);
  }
}

describe("feedback", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.admin = await signUp("fbadmin");
    ctx.member = await signUp("fbmember");
    ctx.super = await signUp("fbsuper");
    ctx.notify = await signUp("fbnotify");
    await grantSuperAdmin(ctx.super.user.id);
    ctx.superNotifyCount = 0;
    ctx.org = await createJson(ctx.admin.accessToken, "/organizations", { name: label("Feedback org") });
    await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/invitations`, {
      email: ctx.member.email,
      role: "MEMBER",
    });
    await acceptInvite(ctx.member.accessToken, ctx.member.email);
    await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/invitations`, {
      email: ctx.notify.email,
      role: "MEMBER",
    });
    await acceptInvite(ctx.notify.accessToken, ctx.notify.email);
    await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/invitations`, {
      email: ctx.super.email,
      role: "MEMBER",
    });
    await acceptInvite(ctx.super.accessToken, ctx.super.email);
    const saved = await callApi(`/organizations/${ctx.org.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: {
        preferences: {
          allowTimeEntryEditing: false,
          feedbackNotifyUserIds: [ctx.notify.user.id],
        },
      },
    });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.json.preferences.feedbackNotifyUserIds, [ctx.notify.user.id]);
  });

  test("only members can send feedback to an organization", async () => {
    const stranger = await signUp("fbstranger");
    const refused = await callApi("/feedback", {
      method: "POST",
      token: stranger.accessToken,
      body: feedbackBody({ organizationId: ctx.org.id, title: label("Not a member") }),
    });
    assertError(refused, 403, "forbidden", "Forbidden.");
  });

  test("members can create feedback and SuperAdmins can list it", async () => {
    const body = feedbackBody({ organizationId: ctx.org.id, title: label("Clock out") });
    const created = await createJson(ctx.member.accessToken, "/feedback", body);
    ctx.item = created;
    assertFeedback(created, {
      status: "Pending",
      active: true,
      completed: false,
      title: body.title,
      userId: ctx.member.user.id,
    });
    assert.equal(created.organizationId, ctx.org.id);
    assert.equal(created.organization.name, ctx.org.name);
    assert.equal(created.actions.length, 0);
    const issue = await waitForLinearIssue(body.title);
    assert.equal(created.linearIssueId, issue.id);
    assert.equal(created.linearIssueIdentifier, issue.identifier);
    assert.equal(created.ticketUrl, issue.url);
    assert.equal(issue.stateType, "triage");
    assert.ok(issue.labels.includes("Bug"));
    assert.match(issue.description, new RegExp(`\\*\\*VolunTime:\\*\\* https?://\\S+/feedback/${created.id}(?:\\s|$)`));
    ctx.linearIssue = issue;

    const memberList = await callApi("/feedback", { token: ctx.member.accessToken });
    assertError(memberList, 403, "forbidden", "Forbidden.");
    const adminList = await callApi("/feedback", { token: ctx.admin.accessToken });
    assertError(adminList, 403, "forbidden", "Forbidden.");
    const listed = await callApi("/feedback", {
      token: ctx.super.accessToken,
      query: { active: "true", limit: "100" },
    });
    assertList(listed.json, { limit: 100 });
    assert.ok(listed.json.items.some((item) => item.id === created.id));
    const detail = await callApi(`/feedback/${created.id}`, { token: ctx.super.accessToken });
    assert.equal(detail.status, 200);
    assertFeedback(detail.json, { title: body.title, status: "Pending" });
    const memberGet = await callApi(`/feedback/${created.id}`, { token: ctx.member.accessToken });
    assert.equal(memberGet.status, 200);
    assertFeedback(memberGet.json, { title: body.title, status: "Pending" });
    const adminGet = await callApi(`/feedback/${created.id}`, { token: ctx.admin.accessToken });
    assert.equal(adminGet.status, 200);
    const notifyGet = await callApi(`/feedback/${created.id}`, { token: ctx.notify.accessToken });
    assertError(notifyGet, 403, "forbidden", "Forbidden.");
    const unauthenticated = await callApi("/feedback");
    assertError(unauthenticated, 401, "unauthorized", "Authentication is required.");
  });

  test("create emails the submitter, SuperAdmins, and the org notify list once", async () => {
    const thanks = await waitForMatchingEmails(ctx.member.email, /Thanks for your bug/i);
    assert.match(thanks.at(-1).subject, /Thanks for your bug/i);
    const notify = await waitForMatchingEmails(ctx.notify.email, /New bug:/i);
    assert.match(notify.at(-1).subject, /New bug:/i);
    const superMail = await waitForMatchingEmails(ctx.super.email, /New bug:/i);
    assert.match(superMail.at(-1).text, /Review it at/);
    ctx.superNotifyCount = superMail.length;

    const withDuplicate = await callApi(`/organizations/${ctx.org.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: {
        preferences: {
          allowTimeEntryEditing: false,
          feedbackNotifyUserIds: [ctx.notify.user.id, ctx.super.user.id],
        },
      },
    });
    assert.equal(withDuplicate.status, 200);
    await createJson(ctx.member.accessToken, "/feedback", feedbackBody({ organizationId: ctx.org.id }));
    const afterDedup = await waitForMatchingEmails(ctx.super.email, /New bug:/i, ctx.superNotifyCount + 1);
    assert.equal(afterDedup.length, ctx.superNotifyCount + 1);
    ctx.superNotifyCount = afterDedup.length;
  });

  test("notify list rejects inactive or outsider users", async () => {
    const outsider = await signUp("fbout");
    const memberships = await callApi(`/organizations/${ctx.org.id}/memberships`, { token: ctx.admin.accessToken });
    const row = memberships.json.items.find((item) => item.userId === ctx.notify.user.id);
    const deactivated = await callApi(`/organizations/${ctx.org.id}/memberships/${row.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { isActive: false, rateType: "Volunteer" },
    });
    assert.equal(deactivated.status, 200);

    const notifyBefore = (await waitForMatchingEmails(ctx.notify.email, /New bug:/i)).length;
    await createJson(ctx.member.accessToken, "/feedback", feedbackBody({ organizationId: ctx.org.id }));
    await waitForMatchingEmails(ctx.super.email, /New bug:/i, ctx.superNotifyCount + 1);
    ctx.superNotifyCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 400));
    const notifyAfter = await waitForMatchingEmails(ctx.notify.email, /New bug:/i);
    assert.equal(notifyAfter.length, notifyBefore);

    const bad = await callApi(`/organizations/${ctx.org.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: {
        preferences: {
          allowTimeEntryEditing: false,
          feedbackNotifyUserIds: [outsider.user.id],
        },
      },
    });
    assertError(bad, 400, "validation_error", "feedbackNotifyUserIds must be active users in this organization.");
    const alsoInactive = await callApi(`/organizations/${ctx.org.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: {
        preferences: {
          allowTimeEntryEditing: false,
          feedbackNotifyUserIds: [ctx.notify.user.id],
        },
      },
    });
    assertError(
      alsoInactive,
      400,
      "validation_error",
      "feedbackNotifyUserIds must be active users in this organization.",
    );

    await callApi(`/organizations/${ctx.org.id}/memberships/${row.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { isActive: true, rateType: "Volunteer" },
    });
  });

  test("SuperAdmins update status, write an action, and email on completed statuses", async () => {
    const edited = await callApi(`/feedback/${ctx.item.id}`, {
      method: "PATCH",
      token: ctx.member.accessToken,
      body: {
        type: "Bug",
        priority: "Low",
        area: "Dashboard",
        title: ctx.item.title,
        description: "The timer still did not stop.",
      },
    });
    assert.equal(edited.status, 200);
    assert.equal(edited.json.description, "The timer still did not stop.");
    assert.equal(edited.json.priority, "Low");
    assert.equal(edited.json.area, "Dashboard");
    assert.equal(edited.json.status, "Pending");
    const notifyEdit = await callApi(`/feedback/${ctx.item.id}`, {
      method: "PATCH",
      token: ctx.notify.accessToken,
      body: {
        type: "Bug",
        priority: "High",
        area: "LogTime",
        title: ctx.item.title,
        description: "A member who did not send this cannot change it.",
      },
    });
    assertError(notifyEdit, 403, "forbidden", "Forbidden.");
    const adminEdit = await callApi(`/feedback/${ctx.item.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: {
        type: "Bug",
        priority: "High",
        area: "LogTime",
        title: ctx.item.title,
        description: "The timer did not stop when I clocked out.",
      },
    });
    assert.equal(adminEdit.status, 200);
    assert.equal(adminEdit.json.description, "The timer did not stop when I clocked out.");
    const forbidden = await callApi(`/feedback/${ctx.item.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { status: "Resolved", description: "Shipped." },
    });
    assertError(forbidden, 403, "forbidden", "Forbidden.");
    const missing = await callApi(`/feedback/${missingId()}`, {
      method: "PATCH",
      token: ctx.super.accessToken,
      body: { status: "Resolved", description: "Missing." },
    });
    assertError(missing, 404, "not_found", "Not found.");
    const updated = await callApi(`/feedback/${ctx.item.id}`, {
      method: "PATCH",
      token: ctx.super.accessToken,
      body: { status: "Resolved", description: "This shipped.", ticketUrl: "https://linear.app/team/issue/ABC-1" },
    });
    assert.equal(updated.status, 200);
    assertFeedback(updated.json, { status: "Resolved", active: false, completed: true });
    assert.equal(updated.json.actions.length, 1);
    assert.equal(updated.json.actions[0].previousStatus, "Pending");
    assert.equal(updated.json.actions[0].updatedStatus, "Resolved");
    assert.equal(updated.json.actions[0].ticketUrl, "https://linear.app/team/issue/ABC-1");
    assert.equal(updated.json.actions[0].takenByUserId, ctx.super.user.id);
    const closed = await waitForLinearIssue(ctx.item.title, (issue) => issue.stateType === "completed");
    assert.equal(closed.id, ctx.linearIssue.id);
    assert.equal(closed.stateType, "completed");
    assert.equal(closed.stateName, "Done");
    const completed = await waitForMatchingEmails(ctx.member.email, /Update on your bug/i);
    assert.match(completed.at(-1).text, /completed the work/i);
    const completedCount = completed.length;

    const archived = await createJson(ctx.member.accessToken, "/feedback", feedbackBody({ organizationId: ctx.org.id }));
    const archivedUpdate = await callApi(`/feedback/${archived.id}`, {
      method: "PATCH",
      token: ctx.super.accessToken,
      body: { status: "Archived", description: "Closing without a reply." },
    });
    assert.equal(archivedUpdate.status, 200);
    assertFeedback(archivedUpdate.json, { status: "Archived", active: false, completed: false });
    await waitForMatchingEmails(ctx.member.email, /Thanks for your bug/i, 2);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const afterArchive = await waitForMatchingEmails(ctx.member.email, /Update on your bug/i);
    assert.equal(afterArchive.length, completedCount);

    const inactive = await callApi("/feedback", {
      token: ctx.super.accessToken,
      query: { active: "false", limit: "100" },
    });
    assertList(inactive.json, { limit: 100 });
    assert.ok(inactive.json.items.some((item) => item.id === ctx.item.id));
    assert.ok(inactive.json.items.every((item) => item.active === false));
    const active = await callApi("/feedback", {
      token: ctx.super.accessToken,
      query: { active: "true", limit: "100" },
    });
    assert.ok(active.json.items.every((item) => item.active === true));
    assert.equal(active.json.items.some((item) => item.id === ctx.item.id), false);
  });

  test("Linear webhook validates signature and syncs issue updates, comments, and completion emails", async () => {
    const item = await createJson(
      ctx.member.accessToken,
      "/feedback",
      feedbackBody({ organizationId: ctx.org.id, title: label("Linear sync") }),
    );
    const issue = await waitForLinearIssue(item.title);
    assert.equal(item.linearIssueId, issue.id);
    assert.equal(item.linearIssueIdentifier, issue.identifier);

    // 1. Missing or invalid signature is rejected with 401
    const unsigned = await postLinearWebhook(
      { action: "update", type: "Issue", data: { id: issue.id } },
      { signature: null },
    );
    assertError(unsigned, 401, "unauthorized", "Invalid Linear webhook signature.");

    const wrongSignature = await postLinearWebhook(
      { action: "update", type: "Issue", data: { id: issue.id } },
      { signature: "deadbeef" },
    );
    assertError(wrongSignature, 401, "unauthorized", "Invalid Linear webhook signature.");

    // 2. Expired timestamp is rejected with 401
    const expired = await postLinearWebhook({
      action: "update",
      type: "Issue",
      webhookTimestamp: Date.now() - 10 * 60 * 1000,
      data: { id: issue.id },
    });
    assertError(expired, 401, "unauthorized", "Linear webhook timestamp is expired.");

    // 3. Issue update transitions status to InProgress and updates priority/title/description
    const inProgressWebhook = await postLinearWebhook({
      action: "update",
      type: "Issue",
      webhookTimestamp: Date.now(),
      data: {
        id: issue.id,
        identifier: issue.identifier,
        title: `${item.title} (triaged)`,
        description: "Updated description from Linear.",
        priority: 1,
        url: issue.url,
        state: { id: "state-in-progress", name: "In Progress", type: "started" },
      },
      actor: { name: "Linear Bot" },
    });
    assert.equal(inProgressWebhook.status, 200);
    assert.equal(inProgressWebhook.json.ok, true);
    assert.equal(inProgressWebhook.json.matched, true);
    assert.equal(inProgressWebhook.json.feedback.status, "InProgress");
    assert.equal(inProgressWebhook.json.feedback.priority, "Urgent");
    assert.equal(inProgressWebhook.json.feedback.title, `${item.title} (triaged)`);
    assert.equal(inProgressWebhook.json.feedback.description, "Updated description from Linear.");
    assert.equal(inProgressWebhook.json.feedback.actions.length, 1);
    assert.equal(inProgressWebhook.json.feedback.actions[0].previousStatus, "Pending");
    assert.equal(inProgressWebhook.json.feedback.actions[0].updatedStatus, "InProgress");
    assert.equal(inProgressWebhook.json.feedback.actions[0].takenBy, null);

    // 4. Comment webhook records an action history item
    const commentWebhook = await postLinearWebhook({
      action: "create",
      type: "Comment",
      webhookTimestamp: Date.now(),
      data: {
        id: "comment-1",
        issueId: issue.id,
        body: "Investigating the root cause in the timer hook.",
        user: { name: "Alex Admin" },
      },
    });
    assert.equal(commentWebhook.status, 200);
    assert.equal(commentWebhook.json.feedback.actions.length, 2);
    assert.equal(commentWebhook.json.feedback.actions[1].previousStatus, "InProgress");
    assert.equal(commentWebhook.json.feedback.actions[1].updatedStatus, "InProgress");
    assert.match(commentWebhook.json.feedback.actions[1].description, /Investigating the root cause/);

    // 5. Issue resolved in Linear transitions status to Resolved and emails the submitter
    const beforeCompletedEmails = (await waitForMatchingEmails(ctx.member.email, /Update on your bug/i)).length;
    const resolvedWebhook = await postLinearWebhook({
      action: "update",
      type: "Issue",
      webhookTimestamp: Date.now(),
      data: {
        id: issue.id,
        identifier: issue.identifier,
        state: { id: "state-done", name: "Done", type: "completed" },
      },
      actor: { email: ctx.super.email, name: "Super Admin" },
    });
    assert.equal(resolvedWebhook.status, 200);
    assert.equal(resolvedWebhook.json.feedback.status, "Resolved");
    assert.equal(resolvedWebhook.json.feedback.completed, true);
    assert.equal(resolvedWebhook.json.feedback.actions.length, 3);
    assert.equal(resolvedWebhook.json.feedback.actions[2].takenByUserId, ctx.super.user.id);
    const afterCompletedEmails = await waitForMatchingEmails(
      ctx.member.email,
      /Update on your bug/i,
      beforeCompletedEmails + 1,
    );
    assert.equal(afterCompletedEmails.length, beforeCompletedEmails + 1);

    // 6. Issue remove webhook cancels active feedback
    const removable = await createJson(
      ctx.member.accessToken,
      "/feedback",
      feedbackBody({ organizationId: ctx.org.id, title: label("Linear remove") }),
    );
    const removableIssue = await waitForLinearIssue(removable.title);
    const removedWebhook = await postLinearWebhook({
      action: "remove",
      type: "Issue",
      webhookTimestamp: Date.now(),
      data: {
        id: removableIssue.id,
        identifier: removableIssue.identifier,
      },
    });
    assert.equal(removedWebhook.status, 200);
    assert.equal(removedWebhook.json.feedback.status, "Cancelled");
    assert.equal(removedWebhook.json.feedback.active, false);
  });
});
