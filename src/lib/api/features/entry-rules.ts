import { Prisma } from "@/generated/prisma/client";
import { Access } from "@/lib/api/access";
import { forbidden, notFound, validation } from "@/lib/api/errors";
import { volunteerConnectedTo } from "@/lib/api/features/connections";
import { defaultVolunteerRate } from "@/lib/api/features/hourly-rates";
import { prisma } from "@/lib/prisma";

export async function assertCanWriteUserEntry(
  access: Access,
  userId: string,
  tenantId: string,
  organizationId: string | null,
) {
  if (access.isApiKey) {
    if (!access.canWrite(tenantId)) {
      forbidden();
    }

    return;
  }

  if (
    access.actorUserId === userId ||
    access.isSuperAdmin ||
    (await access.isOrgAdmin(tenantId)) ||
    (organizationId !== null && (await access.isOrganizationAdmin(organizationId))) ||
    (await volunteerConnectedTo(access, tenantId, userId))
  ) {
    return;
  }

  forbidden();
}

async function assertPlacement(tenantId: string, organizationId: string | null) {
  if ((await prisma.tenant.count({ where: { id: tenantId } })) === 0) {
    notFound();
  }

  if (organizationId !== null) {
    const organization = await prisma.tenant.findUnique({
      where: { id: organizationId },
      select: { tenantId: true },
    });
    if (!organization) {
      notFound();
    }

    if (organization.tenantId !== tenantId) {
      validation("organizationId does not belong to this tenant.");
    }
  }
}

export async function assertLogTarget(
  access: Access,
  userId: string,
  tenantId: string,
  organizationId: string | null,
) {
  const pinned = await access.pinnedTenant();
  if (pinned && pinned.id !== tenantId) {
    notFound();
  }

  await assertPlacement(tenantId, organizationId);
  if (access.isSuperAdmin) {
    return;
  }

  const member = await prisma.tenantMembership.count({ where: { userId, tenantId, isActive: true } });
  if (member === 0) {
    forbidden();
  }
}

export async function assertCollectiveWrite(access: Access, tenantId: string, organizationId: string | null) {
  const pinned = await access.pinnedTenant();
  if (pinned && pinned.id !== tenantId) {
    notFound();
  }

  await assertPlacement(tenantId, organizationId);
  if (access.isSuperAdmin || access.canWrite(tenantId)) {
    return;
  }
  if (organizationId === null) {
    if ((await access.visibility(tenantId)).kind === "all" && await access.can(tenantId, "log_event_totals")) {
      return;
    }
    forbidden();
  }
  if (
    (await access.can(tenantId, "log_group_sessions", organizationId)) ||
    (await access.can(tenantId, "log_event_totals", organizationId)) ||
    (await access.isOrganizationAdmin(organizationId))
  ) {
    return;
  }
  forbidden();
}

export async function assertProject(
  access: Access,
  workerId: string,
  tenantId: string,
  organizationId: string | null,
  projectId: string,
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { editors: { select: { userId: true } } },
  });
  if (!project) {
    notFound();
  }

  if (project.tenantId !== tenantId) {
    validation("projectId does not belong to this tenant.");
  }

  if (!project.isActive) {
    validation("This project is not active.");
  }

  if (project.accessType === "Organization" && (organizationId === null || organizationId !== project.organizationId)) {
    validation("organizationId must match this organization project.");
  }

  if (
    project.accessType === "Private" &&
    !access.isSuperAdmin &&
    project.ownerUserId !== workerId &&
    project.editors.every((editor) => editor.userId !== workerId) &&
    !access.canWrite(tenantId) &&
    !(await access.isOrgAdmin(tenantId))
  ) {
    forbidden();
  }
}

export async function assertTaskCategory(tenantId: string, taskCategoryId: string) {
  const category = await prisma.taskCategory.findUnique({
    where: { id: taskCategoryId },
    select: { tenantId: true },
  });
  if (!category) {
    notFound();
  }

  if (category.tenantId !== tenantId) {
    validation("taskCategoryId does not belong to this tenant.");
  }
}

export async function tags(tenantId: string, tagIds: string[]) {
  const unique = [...new Set(tagIds)];
  if (unique.length === 0) {
    return [];
  }

  const found = await prisma.tag.findMany({ where: { id: { in: unique }, tenantId }, select: { id: true } });
  if (found.length !== unique.length) {
    validation("A tag does not belong to this tenant.");
  }

  return found.map((tag) => tag.id);
}

async function paidCatalogRate(tenantId: string, amount: Prisma.Decimal | null) {
  if (amount === null) {
    validation("Set a pay rate for this person before logging paid time.");
  }

  const rate = await prisma.hourlyRate.findFirst({
    where: { tenantId, type: "Paid", isArchived: false, perHourRate: amount },
    orderBy: { name: "asc" },
  });
  if (!rate) {
    validation("Add a paid hourly rate that matches this person's pay rate.");
  }

  return { id: rate.id, rate: Number(rate.perHourRate), type: "Paid" as const };
}

export async function resolveHourlyRate(
  access: Access,
  userId: string,
  tenantId: string,
  hourlyRateId: string | null | undefined,
) {
  const membership = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { rateType: true, professionalBillingRate: true },
  });
  const paidMember = membership?.rateType === "Paid";
  const lockToDefault =
    !paidMember && !access.isApiKey && !access.isSuperAdmin && (await access.isOrgVolunteer(tenantId));
  if (paidMember && !hourlyRateId) {
    return paidCatalogRate(tenantId, membership.professionalBillingRate);
  }

  if (lockToDefault || !hourlyRateId) {
    const volunteer = await defaultVolunteerRate(tenantId);
    return { ...volunteer, type: "Volunteer" as const };
  }

  const rate = await prisma.hourlyRate.findFirst({ where: { id: hourlyRateId, tenantId } });
  if (!rate) {
    notFound();
  }

  if (rate.isArchived) {
    validation("This hourly rate is archived.");
  }

  if (paidMember && rate.type !== "Paid") {
    validation("Choose a paid hourly rate.");
  }

  return { id: rate.id, rate: Number(rate.perHourRate), type: rate.type };
}
