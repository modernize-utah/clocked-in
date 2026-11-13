import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import {
  extractFeedbackDescription,
  extractFeedbackIdFromDescription,
  feedbackPriorityToLinear,
  formatLinearDescription,
  formatSlackFeedbackPayload,
  mapLinearPriorityToFeedbackPriority,
  mapLinearStateToFeedbackStatus,
  notifySlackFeedbackWebhook,
  pickLinearStateId,
  verifyLinearWebhookSignature,
} from "../src/lib/api/linear-issues";
import {
  classifyFeedbackAttachment,
  feedbackAttachmentName,
  isFeedbackImageUrl,
} from "../src/lib/feedback";
import { keys, syncFeedbackInCache } from "../src/lib/queries";
import type { Feedback, Paged } from "../src/lib/types";

const originalSecret = process.env.LINEAR_WEBHOOK_SECRET;

before(() => {
  process.env.LINEAR_WEBHOOK_SECRET = "unit-test-linear-webhook-secret";
});

after(() => {
  if (originalSecret === undefined) {
    delete process.env.LINEAR_WEBHOOK_SECRET;
  } else {
    process.env.LINEAR_WEBHOOK_SECRET = originalSecret;
  }
});

test("verifyLinearWebhookSignature validates HMAC-SHA256 signatures using LINEAR_WEBHOOK_SECRET", () => {
  const body = JSON.stringify({ action: "update", type: "Issue", data: { id: "issue-1" } });
  const validSig = createHmac("sha256", "unit-test-linear-webhook-secret").update(body, "utf8").digest("hex");

  assert.equal(verifyLinearWebhookSignature(body, validSig), true);
  assert.equal(verifyLinearWebhookSignature(body, `sha256=${validSig}`), true);
  assert.equal(verifyLinearWebhookSignature(body, "invalid-signature"), false);
  assert.equal(verifyLinearWebhookSignature(body, null), false);
});

test("mapLinearStateToFeedbackStatus and pickLinearStateId round-trip workflow states", () => {
  assert.equal(mapLinearStateToFeedbackStatus({ name: "Triage", type: "triage" }), "Pending");
  assert.equal(mapLinearStateToFeedbackStatus({ name: "Backlog", type: "backlog" }), "Acknowledged");
  assert.equal(mapLinearStateToFeedbackStatus({ name: "Todo", type: "unstarted" }), "Planned");
  assert.equal(mapLinearStateToFeedbackStatus({ name: "In Progress", type: "started" }), "InProgress");
  assert.equal(mapLinearStateToFeedbackStatus({ name: "Done", type: "completed" }), "Resolved");
  assert.equal(mapLinearStateToFeedbackStatus({ name: "Canceled", type: "canceled" }), "Cancelled");
  assert.equal(
    mapLinearStateToFeedbackStatus({ name: "Could not reproduce", type: "canceled" }),
    "CouldNotReproduce",
  );
  assert.equal(mapLinearStateToFeedbackStatus({ name: "Archived", type: "canceled" }), "Archived");

  const states = [
    { id: "s1", name: "Triage", type: "triage" },
    { id: "s2", name: "Backlog", type: "backlog" },
    { id: "s3", name: "Todo", type: "unstarted" },
    { id: "s4", name: "In Progress", type: "started" },
    { id: "s5", name: "Done", type: "completed" },
    { id: "s6", name: "Canceled", type: "canceled" },
  ];
  assert.equal(pickLinearStateId(states, "Pending"), "s1");
  assert.equal(pickLinearStateId(states, "Acknowledged"), "s2");
  assert.equal(pickLinearStateId(states, "Planned"), "s3");
  assert.equal(pickLinearStateId(states, "InProgress"), "s4");
  assert.equal(pickLinearStateId(states, "Resolved"), "s5");
  assert.equal(pickLinearStateId(states, "Cancelled"), "s6");
});

test("priority and description helpers preserve feedback metadata and extract clean descriptions", () => {
  assert.equal(feedbackPriorityToLinear("Urgent"), 1);
  assert.equal(feedbackPriorityToLinear("High"), 2);
  assert.equal(feedbackPriorityToLinear("Medium"), 3);
  assert.equal(feedbackPriorityToLinear("Low"), 4);

  assert.equal(mapLinearPriorityToFeedbackPriority(1), "Urgent");
  assert.equal(mapLinearPriorityToFeedbackPriority(2), "High");
  assert.equal(mapLinearPriorityToFeedbackPriority(3), "Medium");
  assert.equal(mapLinearPriorityToFeedbackPriority(4), "Low");
  assert.equal(mapLinearPriorityToFeedbackPriority(0), null);

  const feedbackId = "11111111-2222-4333-8444-555555555555";
  const formatted = formatLinearDescription({
    id: feedbackId,
    title: "Timer bug",
    type: "Bug",
    priority: "High",
    area: "LogTime",
    description: "Original description from user.\nSecond line.",
    screenshotUrls: [
      "https://voluntime.app/s1.png",
      "https://voluntime.app/feedback/u1/11111111-2222-4333-8444-555555555555-error-report.pdf",
    ],
    submitterName: "Ada Lovelace",
    submitterUsername: "ada",
    organizationName: "CASWJ",
    adminUrl: `https://voluntime.app/feedback/${feedbackId}`,
  });

  assert.equal(formatted.includes("![Screenshot](https://voluntime.app/s1.png)"), true);
  assert.equal(
    formatted.includes(
      "[Attachment: error-report.pdf](https://voluntime.app/feedback/u1/11111111-2222-4333-8444-555555555555-error-report.pdf)",
    ),
    true,
  );
  assert.equal(extractFeedbackIdFromDescription(formatted), feedbackId);
  assert.equal(extractFeedbackDescription(formatted), "Original description from user.\nSecond line.");
  assert.equal(extractFeedbackDescription("Plain description edited in Linear."), "Plain description edited in Linear.");
});

test("classifyFeedbackAttachment and attachment URL helpers handle images and documents", () => {
  assert.deepEqual(
    classifyFeedbackAttachment({ name: "pasted-image-1.png", type: "image/png", size: 2048 }),
    { kind: "image" },
  );
  assert.deepEqual(
    classifyFeedbackAttachment({ name: "Audit Report (Q3).pdf", type: "application/pdf", size: 4096 }),
    {
      kind: "document",
      extension: ".pdf",
      contentType: "application/pdf",
      safeName: "Audit-Report-Q3.pdf",
    },
  );
  assert.deepEqual(
    classifyFeedbackAttachment({ name: "notes.docx", type: "application/octet-stream", size: 1024 }),
    {
      kind: "document",
      extension: ".docx",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      safeName: "notes.docx",
    },
  );
  assert.equal("error" in classifyFeedbackAttachment({ name: "malware.exe", type: "application/x-msdownload", size: 512 }), true);
  assert.equal("error" in classifyFeedbackAttachment({ name: "huge.pdf", type: "application/pdf", size: 5 * 1024 * 1024 }), true);

  assert.equal(isFeedbackImageUrl("https://blob.vercel-storage.com/feedback/u1/abc.webp"), true);
  assert.equal(isFeedbackImageUrl("https://blob.vercel-storage.com/feedback/u1/abc-report.pdf"), false);
  assert.equal(
    feedbackAttachmentName("https://blob.vercel-storage.com/feedback/u1/11111111-2222-4333-8444-555555555555-report.pdf"),
    "report.pdf",
  );
});

test("syncFeedbackInCache updates item and active/inactive list caches immediately", () => {
  const queryClient = new QueryClient();
  const baseItem: Feedback = {
    id: "11111111-2222-4333-8444-555555555555",
    userId: "user-1",
    organizationId: null,
    type: "Bug",
    priority: "High",
    area: "Dashboard",
    title: "Initial title",
    description: "Initial description",
    screenshotUrls: [],
    status: "Pending",
    active: true,
    completed: false,
    ticketUrl: null,
    linearIssueId: null,
    linearIssueIdentifier: null,
    createdAt: "2026-10-30T00:00:00.000Z",
    updatedAt: "2026-10-30T00:00:00.000Z",
    user: { id: "user-1", username: "ada", email: "ada@example.com", displayName: "Ada Lovelace" },
    organization: null,
    actions: [],
  };

  queryClient.setQueryData<Paged<Feedback>>(keys.feedback(true), { items: [baseItem], limit: 100, offset: 0 });
  queryClient.setQueryData<Paged<Feedback>>(keys.feedback(false), { items: [], limit: 100, offset: 0 });

  const resolvedItem: Feedback = {
    ...baseItem,
    title: "Updated title",
    status: "Resolved",
    active: false,
    completed: true,
    actions: [
      {
        id: "act-1",
        feedbackId: baseItem.id,
        previousStatus: "Pending",
        updatedStatus: "Resolved",
        description: "Fixed",
        takenByUserId: "user-1",
        ticketUrl: null,
        updatedAt: "2026-10-30T01:00:00.000Z",
        takenBy: baseItem.user,
      },
    ],
  };

  syncFeedbackInCache(queryClient, resolvedItem);

  assert.equal(queryClient.getQueryData<Feedback>(keys.feedbackItem(baseItem.id))?.title, "Updated title");
  assert.equal(queryClient.getQueryData<Paged<Feedback>>(keys.feedback(true))?.items.length, 0);
  assert.equal(queryClient.getQueryData<Paged<Feedback>>(keys.feedback(false))?.items[0]?.status, "Resolved");
});

test("formatSlackFeedbackPayload and notifySlackFeedbackWebhook format and post Slack alerts", async () => {
  const alert = {
    id: "11111111-2222-4333-8444-555555555555",
    title: "Timer <bug> & edge case",
    type: "Bug" as const,
    priority: "Urgent" as const,
    area: "LogTime" as const,
    description: "When clicking <Stop>, the timer keeps running & increments.",
    screenshotUrls: [
      "https://voluntime.app/s1.png",
      "https://voluntime.app/feedback/u1/11111111-2222-4333-8444-555555555555-error-report.pdf",
    ],
    submitterName: "Ada Lovelace",
    submitterUsername: "ada",
    organizationName: "CASWJ & Friends",
    adminUrl: "https://voluntime.app/feedback/11111111-2222-4333-8444-555555555555",
    linearIssueIdentifier: "VOL-42",
    ticketUrl: "https://linear.app/voluntime/issue/VOL-42",
  };

  const payload = formatSlackFeedbackPayload(alert);
  assert.equal(payload.text, "New bug report: [VOL-42] Timer <bug> & edge case");
  assert.equal(payload.blocks[0]?.type, "header");
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes("CASWJ &amp; Friends"), true);
  assert.equal(serialized.includes("When clicking &lt;Stop&gt;, the timer keeps running &amp; increments."), true);
  assert.equal(serialized.includes("<https://linear.app/voluntime/issue/VOL-42|VOL-42>"), true);
  assert.equal(serialized.includes("<https://voluntime.app/feedback/11111111-2222-4333-8444-555555555555|View in VolunTime>"), true);
  assert.equal(serialized.includes("<https://voluntime.app/s1.png|Screenshot 1>"), true);

  const previousSlackUrl = process.env.SLACK_WEBHOOK_URL;
  delete process.env.SLACK_WEBHOOK_URL;
  assert.equal(await notifySlackFeedbackWebhook(alert), false);

  const received: unknown[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    received.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  try {
    process.env.SLACK_WEBHOOK_URL = `http://127.0.0.1:${port}/slack-webhook`;
    const sent = await notifySlackFeedbackWebhook(alert);
    assert.equal(sent, true);
    assert.equal(received.length, 1);
    assert.deepEqual(received[0], payload);
  } finally {
    if (previousSlackUrl === undefined) {
      delete process.env.SLACK_WEBHOOK_URL;
    } else {
      process.env.SLACK_WEBHOOK_URL = previousSlackUrl;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
