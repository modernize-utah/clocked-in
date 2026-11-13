import { Prisma } from "@/generated/prisma/client";
import { Access } from "@/lib/api/access";
import { guard } from "@/lib/api/db";
import { fail, forbidden, notFound, unauthorized, validation } from "@/lib/api/errors";
import {
  activeFeedbackStatuses,
  Body,
  feedbackTitle,
  isActiveFeedback,
  isCompletedFeedback,
  list,
  normalizeFeedbackArea,
  normalizeFeedbackPriority,
  normalizeFeedbackStatus,
  normalizeFeedbackType,
  optionalUuid,
  page,
  queryBool,
  requiredLongText,
  requireString,
  screenshotUrls,
  ticketUrl,
  type FeedbackArea,
  type FeedbackPriority,
  type FeedbackStatus,
  type FeedbackType,
  utcNow,
} from "@/lib/api/json";
import {
  createLinearIssue,
  createLinearIssueDetailed,
  extractFeedbackDescription,
  extractFeedbackIdFromDescription,
  mapLinearPriorityToFeedbackPriority,
  mapLinearStateToFeedbackStatus,
  notifySlackFeedbackWebhook,
  syncLinearIssueState,
  verifyLinearWebhookSignature,
} from "@/lib/api/linear-issues";
import { sendEmail } from "@/lib/api/mail";
import type { EmailContext, EmailTemplateFor } from "@/lib/email/templates";
import { appUrl } from "@/lib/api/security";
import { readPreferences } from "@/lib/api/features/organizations";
import { prisma } from "@/lib/prisma";

const personSelect = {
  id: true,
  username: true,
  email: true,
  profile: { select: { firstName: true, lastName: true, displayName: true } },
} as const;

const feedbackInclude = {
  user: { select: personSelect },
  organization: { select: { id: true, name: true, preferences: true } },
} as const;

const detailInclude = {
  ...feedbackInclude,
  actions: {
    orderBy: { updatedAt: "asc" as const },
    include: { takenBy: { select: personSelect } },
  },
};

type PersonRow = {
  id: string;
  username: string;
  email: string;
  profile: { firstName: string; lastName: string; displayName: string | null } | null;
};

type FeedbackRow = Prisma.FeedbackGetPayload<{ include: typeof feedbackInclude }> & {
  screenshotUrls: unknown;
  actions?: Prisma.FeedbackActionGetPayload<{ include: { takenBy: { select: typeof personSelect } } }>[];
};

function personJson(user: PersonRow) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName:
      user.profile?.displayName?.trim() ||
      (user.profile ? `${user.profile.firstName} ${user.profile.lastName}`.trim() : null) ||
      null,
  };
}

function urls(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  }

  return [];
}

function feedbackJson(feedback: FeedbackRow, includeActions: boolean) {
  const status = feedback.status as FeedbackStatus;
  return {
    id: feedback.id,
    userId: feedback.userId,
    organizationId: feedback.organizationId,
    type: feedback.type,
    priority: feedback.priority,
    area: feedback.area,
    title: feedback.title,
    description: feedback.description,
    screenshotUrls: urls(feedback.screenshotUrls),
    status,
    active: isActiveFeedback(status),
    completed: isCompletedFeedback(status),
    linearIssueId: feedback.linearIssueId,
    linearIssueIdentifier: feedback.linearIssueIdentifier,
    ticketUrl: feedback.ticketUrl,
    createdAt: feedback.createdAt.toISOString(),
    updatedAt: feedback.updatedAt.toISOString(),
    user: personJson(feedback.user),
    organization: feedback.organization ? { id: feedback.organization.id, name: feedback.organization.name } : null,
    actions: includeActions
      ? (feedback.actions ?? []).map((action) => ({
          id: action.id,
          feedbackId: action.feedbackId,
          previousStatus: action.previousStatus,
          updatedStatus: action.updatedStatus,
          updatedAt: action.updatedAt.toISOString(),
          description: action.description,
          takenByUserId: action.takenByUserId,
          ticketUrl: action.ticketUrl,
          takenBy: action.takenBy ? personJson(action.takenBy) : null,
        }))
      : [],
  };
}

export type CreateFeedbackRequest = {
  type: FeedbackType;
  priority: FeedbackPriority;
  area: FeedbackArea;
  title: string;
  description: string;
  screenshotUrls: string[];
  organizationId: string | null;
};

export function parseCreateFeedback(body: Body): CreateFeedbackRequest {
  return {
    type: normalizeFeedbackType(requireString(body, "type")),
    priority: normalizeFeedbackPriority(requireString(body, "priority")),
    area: normalizeFeedbackArea(requireString(body, "area")),
    title: feedbackTitle(requireString(body, "title")),
    description: requiredLongText(body, "description", 4000),
    screenshotUrls: screenshotUrls(body),
    organizationId: optionalUuid(body, "organizationId"),
  };
}

export type UpdateFeedbackRequest = {
  status: FeedbackStatus;
  description: string;
  ticketUrl: string | null;
};

export function parseUpdateFeedback(body: Body): UpdateFeedbackRequest {
  return {
    status: normalizeFeedbackStatus(requireString(body, "status")),
    description: requiredLongText(body, "description", 2000),
    ticketUrl: ticketUrl(body),
  };
}

export type EditFeedbackRequest = {
  type: FeedbackType;
  priority: FeedbackPriority;
  area: FeedbackArea;
  title: string;
  description: string;
};

export function parseEditFeedback(body: Body): EditFeedbackRequest {
  return {
    type: normalizeFeedbackType(requireString(body, "type")),
    priority: normalizeFeedbackPriority(requireString(body, "priority")),
    area: normalizeFeedbackArea(requireString(body, "area")),
    title: feedbackTitle(requireString(body, "title")),
    description: requiredLongText(body, "description", 4000),
  };
}

function requireSuperAdmin(access: Access) {
  if (access.isApiKey || !access.isSuperAdmin) {
    forbidden();
  }
}

async function requireFeedbackEditor(
  access: Access,
  feedback: { userId: string; organizationId: string | null },
) {
  const pinned = await access.pinnedOrganization();
  if (pinned && feedback.organizationId !== pinned.id) {
    notFound();
  }

  if (access.isApiKey) {
    forbidden();
  }

  const caller = access.requireHuman();
  if (access.isSuperAdmin || caller.id === feedback.userId) {
    return;
  }

  if (feedback.organizationId && (await access.isOrgAdmin(feedback.organizationId))) {
    return;
  }

  forbidden();
}

function firstName(user: PersonRow) {
  return user.profile?.firstName?.trim() || user.username;
}

function displayName(user: PersonRow) {
  return personJson(user).displayName || user.username;
}

function typeLabel(type: string) {
  return type === "Feature" ? "feature request" : "bug";
}

function areaLabel(area: string) {
  return area === "LogTime" ? "Log time" : area;
}

function outcome(status: FeedbackStatus) {
  if (status === "Resolved") return "we completed the work you asked for";
  if (status === "Cancelled") return "we are not going to proceed with this";
  return "we were not able to reproduce this";
}

async function trySend(
  to: string,
  organizationId: string | null,
  kind: EmailTemplateFor,
  context: EmailContext,
) {
  try {
    await sendEmail({ to, organizationId, for: kind, context });
  } catch {
    // Keep the saved feedback even if a notify email fails.
  }
}

async function tryOpenLinearIssue(feedback: FeedbackRow) {
  const issue = await createLinearIssue({
    id: feedback.id,
    title: feedback.title,
    type: feedback.type as FeedbackType,
    priority: feedback.priority as FeedbackPriority,
    area: feedback.area as FeedbackArea,
    description: feedback.description,
    screenshotUrls: urls(feedback.screenshotUrls),
    submitterName: displayName(feedback.user),
    submitterUsername: feedback.user.username,
    organizationName: feedback.organization?.name ?? null,
    adminUrl: appUrl(`/feedback/${feedback.id}`),
  });
  if (!issue) {
    return feedback;
  }

  try {
    return await prisma.feedback.update({
      where: { id: feedback.id },
      data: {
        linearIssueId: issue.id,
        linearIssueIdentifier: issue.identifier,
        ticketUrl: issue.url,
      },
      include: feedbackInclude,
    });
  } catch {
    return {
      ...feedback,
      linearIssueId: issue.id,
      linearIssueIdentifier: issue.identifier,
      ticketUrl: issue.url,
    };
  }
}

async function notifyCreated(feedback: FeedbackRow) {
  const sent = new Set<string>();
  await trySend(feedback.user.email, feedback.organizationId, "FeedbackReceived", {
    user: { firstName: firstName(feedback.user) },
    feedback: { title: feedback.title, typeLabel: typeLabel(feedback.type) },
  });
  sent.add(feedback.user.email.toLowerCase());

  const notify = {
    feedback: {
      submitterName: displayName(feedback.user),
      typeLabel: typeLabel(feedback.type),
      priorityLabel: feedback.priority,
      areaLabel: areaLabel(feedback.area),
      title: feedback.title,
      description: feedback.description,
      url: appUrl("/feedback"),
    },
  };
  const superAdmins = await prisma.user.findMany({ where: { isSuperAdmin: true }, select: { email: true } });
  for (const admin of superAdmins) {
    if (!sent.has(admin.email.toLowerCase())) {
      sent.add(admin.email.toLowerCase());
      await trySend(admin.email, feedback.organizationId, "FeedbackNotify", notify);
    }
  }

  if (!feedback.organizationId || !feedback.organization) {
    return;
  }

  const notifyIds = readPreferences(feedback.organization.preferences).feedbackNotifyUserIds;
  if (notifyIds.length === 0) {
    return;
  }

  const recipients = await prisma.organizationMembership.findMany({
    where: { organizationId: feedback.organizationId, isActive: true, userId: { in: notifyIds } },
    select: { user: { select: { email: true } } },
  });
  for (const membership of recipients) {
    const email = membership.user.email;
    if (!sent.has(email.toLowerCase())) {
      sent.add(email.toLowerCase());
      await trySend(email, feedback.organizationId, "FeedbackNotify", notify);
    }
  }
}

export async function createFeedback(access: Access, request: CreateFeedbackRequest) {
  const pinned = await access.pinnedOrganization();
  const organizationId = request.organizationId ?? pinned?.id ?? null;
  if (pinned) {
    if (organizationId !== pinned.id) {
      notFound();
    }
    await access.requireOrganization(pinned.id, false);
  } else if (organizationId) {
    // Feedback for an organization emails its notify list, so only its members may send it.
    await access.requireOrganization(organizationId, false);
  }

  const caller = access.requireHuman();
  const now = utcNow();
  const created = await guard(
    prisma.feedback.create({
      data: {
        userId: caller.id,
        organizationId,
        type: request.type,
        priority: request.priority,
        area: request.area,
        title: request.title,
        description: request.description,
        screenshotUrls: request.screenshotUrls as Prisma.InputJsonValue,
        status: "Pending",
        createdAt: now,
        updatedAt: now,
      },
      include: feedbackInclude,
    }),
  );
  await notifyCreated(created);
  return feedbackJson(await tryOpenLinearIssue(created), false);
}

export async function listFeedback(access: Access, params: URLSearchParams) {
  requireSuperAdmin(access);
  const paging = page(params);
  const active = queryBool(params, "active");
  const type = params.get("type") ? normalizeFeedbackType(params.get("type") ?? "") : undefined;
  const priority = params.get("priority") ? normalizeFeedbackPriority(params.get("priority") ?? "") : undefined;
  const area = params.get("area") ? normalizeFeedbackArea(params.get("area") ?? "") : undefined;
  const status = params.get("status") ? normalizeFeedbackStatus(params.get("status") ?? "") : undefined;
  const sort = params.get("sort") ?? "createdAt";
  const descending = params.get("order") !== "asc";
  const where: Prisma.FeedbackWhereInput = {
    ...(active === true ? { status: { in: activeFeedbackStatuses } } : {}),
    ...(active === false ? { status: { notIn: activeFeedbackStatuses } } : {}),
    ...(type ? { type } : {}),
    ...(priority ? { priority } : {}),
    ...(area ? { area } : {}),
    ...(status ? { status } : {}),
  };
  const orderBy: Prisma.FeedbackOrderByWithRelationInput =
    sort === "title" || sort === "status" || sort === "priority" || sort === "type" || sort === "area"
      ? { [sort]: descending ? "desc" : "asc" }
      : { createdAt: descending ? "desc" : "asc" };
  const items = await prisma.feedback.findMany({
    where,
    include: feedbackInclude,
    orderBy,
    skip: paging.offset,
    take: paging.limit,
  });
  return list(
    items.map((item) => feedbackJson(item, false)),
    paging,
  );
}

export async function getFeedback(access: Access, feedbackId: string) {
  const feedback = await prisma.feedback.findUnique({ where: { id: feedbackId }, include: detailInclude });
  if (!feedback) {
    notFound();
  }

  await requireFeedbackEditor(access, feedback);
  return feedbackJson(feedback, true);
}

export async function editFeedback(access: Access, feedbackId: string, request: EditFeedbackRequest) {
  const existing = await prisma.feedback.findUnique({ where: { id: feedbackId } });
  if (!existing) {
    notFound();
  }

  await requireFeedbackEditor(access, existing);
  const updated = await guard(
    prisma.feedback.update({
      where: { id: feedbackId },
      data: {
        type: request.type,
        priority: request.priority,
        area: request.area,
        title: request.title,
        description: request.description,
        updatedAt: utcNow(),
      },
      include: detailInclude,
    }),
  );
  return feedbackJson(updated, true);
}

export async function updateFeedback(access: Access, feedbackId: string, request: UpdateFeedbackRequest) {
  requireSuperAdmin(access);
  const existing = await prisma.feedback.findUnique({ where: { id: feedbackId }, include: detailInclude });
  if (!existing) {
    notFound();
  }

  const previous = existing.status as FeedbackStatus;
  const now = utcNow();
  const updated = await guard(
    prisma.feedback.update({
      where: { id: feedbackId },
      data: {
        status: request.status,
        updatedAt: now,
        ...(!existing.ticketUrl && request.ticketUrl ? { ticketUrl: request.ticketUrl } : {}),
        actions: {
          create: {
            previousStatus: previous,
            updatedStatus: request.status,
            updatedAt: now,
            description: request.description,
            takenByUserId: access.caller.id,
            ticketUrl: request.ticketUrl,
          },
        },
      },
      include: detailInclude,
    }),
  );
  if (existing.linearIssueId) {
    await syncLinearIssueState(existing.linearIssueId, request.status);
  }

  if (!isCompletedFeedback(previous) && isCompletedFeedback(request.status)) {
    await trySend(updated.user.email, updated.organizationId, "FeedbackCompleted", {
      user: { firstName: firstName(updated.user) },
      feedback: {
        title: updated.title,
        typeLabel: typeLabel(updated.type),
        outcome: outcome(request.status),
        note: request.description,
      },
    });
  }

  return feedbackJson(updated, true);
}

export async function syncFeedbackLinearIssue(access: Access, feedbackId: string) {
  requireSuperAdmin(access);
  const existing = await prisma.feedback.findUnique({ where: { id: feedbackId }, include: detailInclude });
  if (!existing) {
    notFound();
  }

  if (existing.linearIssueId) {
    await syncLinearIssueState(existing.linearIssueId, existing.status as FeedbackStatus);
    return feedbackJson(existing, true);
  }

  const { issue, error } = await createLinearIssueDetailed({
    id: existing.id,
    title: existing.title,
    type: existing.type as FeedbackType,
    priority: existing.priority as FeedbackPriority,
    area: existing.area as FeedbackArea,
    status: existing.status as FeedbackStatus,
    description: existing.description,
    screenshotUrls: urls(existing.screenshotUrls),
    submitterName: displayName(existing.user),
    submitterUsername: existing.user.username,
    organizationName: existing.organization?.name ?? null,
    adminUrl: appUrl(`/feedback/${existing.id}`),
  });
  if (!issue) {
    fail(502, "linear_unavailable", error ?? "Could not create a Linear issue. Check that LINEAR_API_KEY is configured.");
  }

  const updated = await guard(
    prisma.feedback.update({
      where: { id: existing.id },
      data: {
        linearIssueId: issue.id,
        linearIssueIdentifier: issue.identifier,
        ticketUrl: issue.url,
        updatedAt: utcNow(),
      },
      include: detailInclude,
    }),
  );
  return feedbackJson(updated, true);
}

function cleanHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2000) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? trimmed : null;
  } catch {
    return null;
  }
}

async function resolveWebhookActorUserId(
  actor: Record<string, unknown> | null,
  dataUser: Record<string, unknown> | null,
): Promise<string | null> {
  const rawEmail =
    (typeof actor?.email === "string" && actor.email.trim()) ||
    (typeof dataUser?.email === "string" && dataUser.email.trim()) ||
    "";
  if (!rawEmail) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { email: rawEmail.toLowerCase() },
    select: { id: true },
  });
  return user?.id ?? null;
}

async function findFeedbackForIssueWebhook(data: Record<string, unknown>) {
  const issueId = typeof data.id === "string" ? data.id.trim() : "";
  const identifier = typeof data.identifier === "string" ? data.identifier.trim() : "";
  const descriptionText = typeof data.description === "string" ? data.description : null;
  const feedbackId = extractFeedbackIdFromDescription(descriptionText);

  if (issueId) {
    const byIssueId = await prisma.feedback.findUnique({
      where: { linearIssueId: issueId },
      include: detailInclude,
    });
    if (byIssueId) return byIssueId;
  }

  if (identifier) {
    const byIdentifier = await prisma.feedback.findFirst({
      where: { linearIssueIdentifier: identifier },
      include: detailInclude,
    });
    if (byIdentifier) return byIdentifier;
  }

  if (feedbackId) {
    const byFeedbackId = await prisma.feedback.findUnique({
      where: { id: feedbackId },
      include: detailInclude,
    });
    if (byFeedbackId) return byFeedbackId;
  }

  return null;
}

async function findFeedbackForCommentWebhook(data: Record<string, unknown>) {
  const issueObj =
    typeof data.issue === "object" && data.issue !== null ? (data.issue as Record<string, unknown>) : null;
  const issueId =
    (typeof data.issueId === "string" && data.issueId.trim()) ||
    (typeof issueObj?.id === "string" && issueObj.id.trim()) ||
    "";
  const identifier = typeof issueObj?.identifier === "string" ? issueObj.identifier.trim() : "";

  if (issueId) {
    const byIssueId = await prisma.feedback.findUnique({
      where: { linearIssueId: issueId },
      include: detailInclude,
    });
    if (byIssueId) return byIssueId;
  }

  if (identifier) {
    const byIdentifier = await prisma.feedback.findFirst({
      where: { linearIssueIdentifier: identifier },
      include: detailInclude,
    });
    if (byIdentifier) return byIdentifier;
  }

  return null;
}

export async function handleLinearWebhook(rawBody: string, signatureHeader: string | null) {
  if (!process.env.LINEAR_WEBHOOK_SECRET?.trim()) {
    fail(503, "webhook_unconfigured", "Linear webhook secret is not configured.");
  }

  if (!verifyLinearWebhookSignature(rawBody, signatureHeader)) {
    unauthorized("Invalid Linear webhook signature.");
  }

  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      validation("Request body must be JSON.");
    }
    payload = parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      throw error;
    }
    validation("Request body must be JSON.");
  }

  if (typeof payload.webhookTimestamp === "number" && Number.isFinite(payload.webhookTimestamp)) {
    const timestampMs =
      payload.webhookTimestamp < 1_000_000_000_000 ? payload.webhookTimestamp * 1000 : payload.webhookTimestamp;
    if (Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
      unauthorized("Linear webhook timestamp is expired.");
    }
  }

  const type = typeof payload.type === "string" ? payload.type.trim() : "";
  const action = typeof payload.action === "string" ? payload.action.trim() : "";
  const data =
    typeof payload.data === "object" && payload.data !== null && !Array.isArray(payload.data)
      ? (payload.data as Record<string, unknown>)
      : null;
  if (!data) {
    return { ok: true, matched: false };
  }

  const actor =
    typeof payload.actor === "object" && payload.actor !== null && !Array.isArray(payload.actor)
      ? (payload.actor as Record<string, unknown>)
      : null;
  const dataUser =
    typeof data.user === "object" && data.user !== null && !Array.isArray(data.user)
      ? (data.user as Record<string, unknown>)
      : null;
  const actorName =
    (typeof actor?.name === "string" && actor.name.trim()) ||
    (typeof dataUser?.name === "string" && dataUser.name.trim()) ||
    "Linear";

  if (type === "Comment") {
    if (action !== "create") {
      return { ok: true, matched: false };
    }

    const existing = await findFeedbackForCommentWebhook(data);
    if (!existing) {
      return { ok: true, matched: false };
    }

    const rawComment = typeof data.body === "string" ? data.body.trim() : "";
    if (!rawComment) {
      return { ok: true, matched: true, feedback: feedbackJson(existing, true) };
    }

    const takenByUserId = await resolveWebhookActorUserId(actor, dataUser);
    const commentText =
      !takenByUserId && actorName !== "Linear"
        ? `${actorName} commented in Linear:\n${rawComment}`.slice(0, 2000)
        : rawComment.slice(0, 2000);
    const now = utcNow();
    const updated = await guard(
      prisma.feedback.update({
        where: { id: existing.id },
        data: {
          updatedAt: now,
          actions: {
            create: {
              previousStatus: existing.status,
              updatedStatus: existing.status,
              updatedAt: now,
              description: commentText,
              takenByUserId,
              ticketUrl: existing.ticketUrl,
            },
          },
        },
        include: detailInclude,
      }),
    );
    return { ok: true, matched: true, feedback: feedbackJson(updated, true) };
  }

  if (type !== "Issue") {
    return { ok: true, matched: false };
  }

  const existing = await findFeedbackForIssueWebhook(data);
  if (!existing) {
    return { ok: true, matched: false };
  }

  const previous = existing.status as FeedbackStatus;
  const stateObj =
    typeof data.state === "object" && data.state !== null && !Array.isArray(data.state)
      ? (data.state as { name?: string | null; type?: string | null })
      : null;

  let nextStatus: FeedbackStatus = previous;
  let actionDescription: string | null = null;
  if (action === "remove" || data.trashed === true) {
    nextStatus = "Cancelled";
    actionDescription = "Issue cancelled in Linear.";
  } else if (typeof data.archivedAt === "string" && data.archivedAt.trim().length > 0 && !isCompletedFeedback(previous)) {
    nextStatus = "Archived";
    actionDescription = "Issue archived in Linear.";
  } else if (stateObj) {
    const mapped = mapLinearStateToFeedbackStatus(stateObj);
    if (mapped) {
      nextStatus = mapped;
      const stateLabel = stateObj.name?.trim() || stateObj.type?.trim() || mapped;
      actionDescription = `Status updated in Linear (${stateLabel}).`;
    }
  }

  const issueId = typeof data.id === "string" && data.id.trim() ? data.id.trim() : existing.linearIssueId;
  const identifier =
    typeof data.identifier === "string" && data.identifier.trim()
      ? data.identifier.trim()
      : existing.linearIssueIdentifier;
  const resolvedTicketUrl = cleanHttpUrl(data.url) ?? cleanHttpUrl(payload.url) ?? existing.ticketUrl;
  const nextPriority = mapLinearPriorityToFeedbackPriority(data.priority) ?? (existing.priority as FeedbackPriority);
  const rawTitle = typeof data.title === "string" ? data.title.trim() : "";
  const nextTitle = rawTitle.length >= 1 ? rawTitle.slice(0, 120) : existing.title;
  const extractedDescription =
    typeof data.description === "string" ? extractFeedbackDescription(data.description) : null;
  const nextDescription = extractedDescription ?? existing.description;

  const statusChanged = nextStatus !== previous;
  const takenByUserId = statusChanged ? await resolveWebhookActorUserId(actor, dataUser) : null;
  const now = utcNow();

  const updated = await guard(
    prisma.feedback.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        priority: nextPriority,
        title: nextTitle,
        description: nextDescription,
        linearIssueId: issueId,
        linearIssueIdentifier: identifier,
        ticketUrl: resolvedTicketUrl,
        updatedAt: now,
        ...(statusChanged
          ? {
              actions: {
                create: {
                  previousStatus: previous,
                  updatedStatus: nextStatus,
                  updatedAt: now,
                  description: actionDescription ?? `Status updated to ${nextStatus} in Linear.`,
                  takenByUserId,
                  ticketUrl: resolvedTicketUrl,
                },
              },
            }
          : {}),
      },
      include: detailInclude,
    }),
  );

  if (action === "create") {
    await notifySlackFeedbackWebhook({
      id: updated.id,
      title: updated.title,
      type: updated.type as FeedbackType,
      priority: updated.priority as FeedbackPriority,
      area: updated.area as FeedbackArea,
      description: updated.description,
      screenshotUrls: urls(updated.screenshotUrls),
      submitterName: displayName(updated.user),
      submitterUsername: updated.user.username,
      organizationName: updated.organization?.name ?? null,
      adminUrl: appUrl(`/feedback/${updated.id}`),
      linearIssueIdentifier: updated.linearIssueIdentifier,
      ticketUrl: updated.ticketUrl,
    });
  }

  if (statusChanged && !isCompletedFeedback(previous) && isCompletedFeedback(nextStatus)) {
    await trySend(updated.user.email, updated.organizationId, "FeedbackCompleted", {
      user: { firstName: firstName(updated.user) },
      feedback: {
        title: updated.title,
        typeLabel: typeLabel(updated.type),
        outcome: outcome(nextStatus),
        note: actionDescription ?? `Status updated to ${nextStatus} in Linear.`,
      },
    });
  }

  return { ok: true, matched: true, feedback: feedbackJson(updated, true) };
}
