import { Prisma } from "@/generated/prisma/client";
import { Access } from "@/lib/api/access";
import { guard } from "@/lib/api/db";
import { notFound, validation } from "@/lib/api/errors";
import {
  Body,
  collectiveInKind,
  description,
  has,
  ids,
  list,
  optional,
  Optional,
  optionalDescription,
  optionalString,
  optionalUuid,
  or,
  page,
  queryUuid,
  requireInstant,
  requireInt,
  requireUuid,
} from "@/lib/api/json";
import { assertCollectiveWrite, assertProject, assertTaskCategory, resolveHourlyRate, tags } from "@/lib/api/features/entry-rules";
import { prisma } from "@/lib/prisma";

const collectiveInclude = { tags: { select: { tagId: true } } } as const;
type CollectiveRow = Prisma.CollectiveTimeEntryGetPayload<{ include: typeof collectiveInclude }>;

function collectiveJson(entry: CollectiveRow) {
  return {
    id: entry.id,
    recordedByUserId: entry.recordedByUserId,
    tenantId: entry.tenantId,
    organizationId: entry.organizationId,
    projectId: entry.projectId,
    taskCategoryId: entry.taskCategoryId,
    hourlyRateId: entry.hourlyRateId,
    startedAt: entry.startedAt.toISOString(),
    endedAt: entry.endedAt.toISOString(),
    participantCount: entry.participantCount,
    description: entry.description,
    hourlyRate: Number(entry.hourlyRate),
    inKindValue: Number(entry.inKindValue),
    createdAt: entry.createdAt.toISOString(),
    tagIds: entry.tags.map((row) => row.tagId).sort(),
  };
}

function assertSpan(startedAt: Date, endedAt: Date, participantCount: number) {
  if (endedAt <= startedAt) {
    validation("endedAt must be after startedAt.");
  }

  if (participantCount < 1) {
    validation("participantCount must be at least 1.");
  }
}

export type CreateCollectiveRequest = {
  tenantId: string;
  organizationId: string | null;
  projectId: string;
  taskCategoryId: string;
  startedAt: Date;
  endedAt: Date;
  participantCount: number;
  description: string | null;
  tagIds: string[];
  hourlyRateId: string | null;
};

export function parseCreateCollective(body: Body): CreateCollectiveRequest {
  const tenantId = requireUuid(body, "tenantId");
  const organizationId = optionalUuid(body, "organizationId");
  const projectId = requireUuid(body, "projectId");
  const taskCategoryId = requireUuid(body, "taskCategoryId");
  const startedAt = requireInstant(body, "startedAt");
  const endedAt = requireInstant(body, "endedAt");
  const participantCount = requireInt(body, "participantCount");
  const entryDescription = optionalDescription(body);
  assertSpan(startedAt, endedAt, participantCount);
  const tagIds = ids(body, "tagIds", true);
  return {
    tenantId,
    organizationId,
    projectId,
    taskCategoryId,
    startedAt,
    endedAt,
    participantCount,
    description: entryDescription,
    tagIds,
    hourlyRateId: has(body, "hourlyRateId") ? optionalUuid(body, "hourlyRateId") : null,
  };
}

export type UpdateCollectiveRequest = {
  tenantId: Optional<string>;
  organizationId: Optional<string | null>;
  projectId: Optional<string>;
  taskCategoryId: Optional<string>;
  hourlyRateId: Optional<string | null>;
  startedAt: Optional<Date>;
  endedAt: Optional<Date>;
  participantCount: Optional<number>;
  description: Optional<string | null>;
  tagIds: Optional<string[]>;
};

export function parseUpdateCollective(body: Body): UpdateCollectiveRequest {
  return {
    tenantId: optional(body, "tenantId", requireUuid),
    organizationId: optional(body, "organizationId", optionalUuid),
    projectId: optional(body, "projectId", requireUuid),
    taskCategoryId: optional(body, "taskCategoryId", requireUuid),
    hourlyRateId: optional(body, "hourlyRateId", optionalUuid),
    startedAt: optional(body, "startedAt", requireInstant),
    endedAt: optional(body, "endedAt", requireInstant),
    participantCount: optional(body, "participantCount", requireInt),
    description: optional(body, "description", (b, k) => description(optionalString(b, k))),
    tagIds: optional(body, "tagIds", (b, k) => ids(b, k, false)),
  };
}

async function load(entryId: string) {
  const entry = await prisma.collectiveTimeEntry.findUnique({ where: { id: entryId }, include: collectiveInclude });
  if (!entry) {
    notFound();
  }

  return entry;
}

export async function listCollective(access: Access, params: URLSearchParams) {
  const paging = page(params);
  const pinned = await access.pinnedTenant();
  const tenantId = queryUuid(params, "tenantId") ?? pinned?.id;
  const organizationId = queryUuid(params, "organizationId");
  if (tenantId !== undefined) {
    await access.requireTenant(tenantId, false);
  }

  if (organizationId !== undefined) {
    const organization = await access.requireOrganization(organizationId);
    if (tenantId !== undefined && organization.tenantId !== tenantId) {
      validation("organizationId does not belong to this tenant.");
    }
  }

  const where: Prisma.CollectiveTimeEntryWhereInput = {};
  if (tenantId !== undefined) {
    where.tenantId = tenantId;
  } else if (!access.isSuperAdmin) {
    where.tenantId = { in: await access.activeTenantIds() };
  }

  if (organizationId !== undefined) {
    where.organizationId = organizationId;
  } else if (tenantId !== undefined) {
    const visibility = await access.visibility(tenantId);
    if (visibility.kind === "organizations") {
      where.organizationId = { in: visibility.organizationIds };
    } else if (visibility.kind === "self") {
      where.recordedByUserId = access.actorUserId;
    }
  }

  const entries = await prisma.collectiveTimeEntry.findMany({
    where,
    include: collectiveInclude,
    orderBy: { startedAt: "desc" },
    skip: paging.offset,
    take: paging.limit,
  });
  return list(entries.map(collectiveJson), paging);
}

export async function createCollective(access: Access, request: CreateCollectiveRequest) {
  const callerId = access.actorUserId;
  await assertCollectiveWrite(access, request.tenantId, request.organizationId);
  await assertProject(access, callerId, request.tenantId, request.organizationId, request.projectId);
  await assertTaskCategory(request.tenantId, request.taskCategoryId);
  const tagIds = await tags(request.tenantId, request.tagIds);
  const resolved = await resolveHourlyRate(access, callerId, request.tenantId, request.hourlyRateId);
  const hourlyRate = resolved.rate;
  const entry = await guard(
    prisma.collectiveTimeEntry.create({
      data: {
        recordedByUserId: callerId,
        tenantId: request.tenantId,
        organizationId: request.organizationId,
        projectId: request.projectId,
        taskCategoryId: request.taskCategoryId,
        hourlyRateId: resolved.id,
        startedAt: request.startedAt,
        endedAt: request.endedAt,
        participantCount: request.participantCount,
        description: request.description,
        hourlyRate,
        inKindValue: collectiveInKind(request.startedAt, request.endedAt, request.participantCount, hourlyRate),
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
      },
      include: collectiveInclude,
    }),
  );
  return collectiveJson(entry);
}

export async function getCollective(access: Access, entryId: string) {
  const entry = await load(entryId);
  await access.requireTenant(entry.tenantId, false);
  return collectiveJson(entry);
}

export async function updateCollective(access: Access, entryId: string, request: UpdateCollectiveRequest) {
  const existing = await load(entryId);
  if (request.tenantId.set && request.tenantId.value !== existing.tenantId) {
    validation("tenantId cannot change.");
  }

  const organizationId = or(request.organizationId, existing.organizationId);
  const projectId = or(request.projectId, existing.projectId);
  const taskCategoryId = or(request.taskCategoryId, existing.taskCategoryId);
  const startedAt = or(request.startedAt, existing.startedAt);
  const endedAt = or(request.endedAt, existing.endedAt);
  const participantCount = or(request.participantCount, existing.participantCount);
  assertSpan(startedAt, endedAt, participantCount);
  await assertCollectiveWrite(access, existing.tenantId, organizationId);
  await assertProject(access, access.actorUserId, existing.tenantId, organizationId, projectId);
  await assertTaskCategory(existing.tenantId, taskCategoryId);
  const tagIds = request.tagIds.set ? await tags(existing.tenantId, request.tagIds.value) : null;
  const resolved = request.hourlyRateId.set
    ? await resolveHourlyRate(access, access.actorUserId, existing.tenantId, request.hourlyRateId.value)
    : { id: existing.hourlyRateId, rate: Number(existing.hourlyRate) };
  const updated = await guard(
    prisma.collectiveTimeEntry.update({
      where: { id: entryId },
      data: {
        organizationId,
        projectId,
        taskCategoryId,
        hourlyRateId: resolved.id,
        hourlyRate: resolved.rate,
        startedAt,
        endedAt,
        participantCount,
        description: or(request.description, existing.description),
        inKindValue: collectiveInKind(startedAt, endedAt, participantCount, resolved.rate),
        tags: tagIds === null ? undefined : { deleteMany: {}, create: tagIds.map((tagId) => ({ tagId })) },
      },
      include: collectiveInclude,
    }),
  );
  return collectiveJson(updated);
}

export async function deleteCollective(access: Access, entryId: string) {
  const entry = await load(entryId);
  await assertCollectiveWrite(access, entry.tenantId, entry.organizationId);
  await guard(prisma.collectiveTimeEntry.delete({ where: { id: entryId } }));
}
