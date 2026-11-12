import { randomUUID } from "node:crypto";
import { Access } from "@/lib/api/access";
import { guard, transaction } from "@/lib/api/db";
import { parseGuid } from "@/lib/api/guid";
import { ApiError, conflict, forbidden, notFound, validation } from "@/lib/api/errors";
import { Body, has, ids, list, normalizeEmail, optionalUuid, page, requireString } from "@/lib/api/json";
import { sendEmail } from "@/lib/api/mail";
import { resolveRole, roleId } from "@/lib/api/features/memberships";
import { assertCanGrant, effectivePermissions } from "@/lib/api/features/roles";
import { isRoleScope } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/** The ids that are departments of this organization. */
async function departmentsIn(organizationId: string, departmentIds: string[]) {
  if (departmentIds.length === 0) return [];
  const rows = await prisma.department.findMany({
    where: { organizationId, id: { in: departmentIds.map(parseGuid).filter((id): id is string => id !== null) } },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

function requestJson(row: {
  id: string;
  organizationId: string;
  userId: string | null;
  guestId: string | null;
  requestedRoleId: string | null;
  requestedDepartmentIds: unknown;
  message: string | null;
  status: string;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  volunteerNeedId: string | null;
  createdAt: Date;
  user?: { email: string; username: string; profile?: { firstName: string; lastName: string; displayName: string | null } | null } | null;
  guest?: { name: string; email: string } | null;
  requestedRole?: { code: string; name: string } | null;
}) {
  const profile = row.user?.profile;
  const name =
    row.guest?.name ||
    profile?.displayName ||
    [profile?.firstName, profile?.lastName].filter(Boolean).join(" ").trim() ||
    row.user?.username ||
    row.user?.email ||
    row.guest?.email ||
    "Unknown";
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    guestId: row.guestId,
    email: row.user?.email ?? row.guest?.email ?? "",
    name,
    requestedRoleId: row.requestedRoleId,
    requestedRole: row.requestedRole
      ? { code: row.requestedRole.code, name: row.requestedRole.name }
      : asStringArray(row.requestedDepartmentIds).length > 0
        ? { code: "GROUP_MANAGER", name: "Group manager" }
        : null,
    requestedDepartmentIds: asStringArray(row.requestedDepartmentIds),
    message: row.message,
    status: row.status,
    reviewedByUserId: row.reviewedByUserId,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    volunteerNeedId: row.volunteerNeedId,
    createdAt: row.createdAt.toISOString(),
  };
}

const requestInclude = {
  user: { select: { email: true, username: true, profile: { select: { firstName: true, lastName: true, displayName: true } } } },
  guest: { select: { name: true, email: true } },
  requestedRole: { select: { code: true, name: true } },
} as const;

export function parseCreateAccessRequest(body: Body) {
  return {
    message: has(body, "message") ? requireString(body, "message").trim().slice(0, 2000) : null,
    requestedRole: has(body, "requestedRole") ? requireString(body, "requestedRole") : "GROUP_MANAGER",
    requestedDepartmentIds: [...new Set(ids(body, "requestedDepartmentIds", true))],
    email: has(body, "email") ? normalizeEmail(requireString(body, "email")) : null,
    name: has(body, "name") ? requireString(body, "name").trim() : null,
    volunteerNeedId: optionalUuid(body, "volunteerNeedId"),
    guestId: has(body, "guestId") ? requireString(body, "guestId") : null,
  };
}

export async function listAccessRequests(access: Access, organizationId: string, params: URLSearchParams) {
  const paging = page(params);
  await access.requirePermission(organizationId, "approve_access_requests");
  const status = params.get("status")?.trim();
  const rows = await prisma.accessRequest.findMany({
    where: { organizationId, ...(status ? { status } : {}) },
    include: requestInclude,
    orderBy: { createdAt: "desc" },
    skip: paging.offset,
    take: paging.limit,
  });
  return list(rows.map(requestJson), paging);
}

export async function createAccessRequest(
  access: Access,
  organizationId: string,
  request: ReturnType<typeof parseCreateAccessRequest>,
) {
  await access.requireOrganization(organizationId, false);
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } });
  const role =
    request.requestedRole === "GROUP_MANAGER" ? null : await resolveRole(request.requestedRole, organizationId);
  const existing = await prisma.accessRequest.findFirst({
    where: { organizationId, userId: access.actorUserId, status: "pending" },
  });
  if (existing) {
    conflict("You already have a pending access request.");
  }

  const departments = await departmentsIn(organizationId, request.requestedDepartmentIds);
  if (departments.length !== request.requestedDepartmentIds.length) {
    validation("requestedDepartmentIds must be departments of this organization.");
  }

  if (
    request.volunteerNeedId &&
    !(await prisma.volunteerNeed.findFirst({ where: { id: request.volunteerNeedId, organizationId }, select: { id: true } }))
  ) {
    validation("volunteerNeedId must be a need of this organization.");
  }
  const created = await guard(
    prisma.accessRequest.create({
      data: {
        id: randomUUID(),
        organizationId,
        userId: access.actorUserId,
        requestedRoleId: role?.id ?? null,
        requestedDepartmentIds: request.requestedDepartmentIds,
        message: request.message,
        volunteerNeedId: request.volunteerNeedId,
      },
      include: requestInclude,
    }),
  );
  await notifyAdmins(organizationId, organization.name, created.user?.email ?? access.caller.email);
  return requestJson(created);
}

export async function createPublicAccessRequest(
  organizationId: string,
  input: {
    email: string;
    name: string;
    guestId?: string | null;
    volunteerNeedId?: string | null;
    message?: string | null;
  },
) {
  const existing = await prisma.accessRequest.findFirst({
    where: {
      organizationId,
      status: "pending",
      OR: [{ guestId: input.guestId ?? undefined }, { guest: { email: input.email } }],
    },
  });
  if (existing) return requestJson(existing);
  const volunteerRole = await roleId("VOLUNTEER");
  const created = await prisma.accessRequest.create({
    data: {
      id: randomUUID(),
      organizationId,
      guestId: input.guestId ?? null,
      requestedRoleId: volunteerRole,
      requestedDepartmentIds: [],
      message: input.message ?? `Requested access while signing up for a need.`,
      volunteerNeedId: input.volunteerNeedId ?? null,
    },
    include: requestInclude,
  });
  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
  await notifyAdmins(organizationId, organization?.name ?? "VolunTime", input.email);
  return requestJson(created);
}

export async function decideAccessRequest(
  access: Access,
  organizationId: string,
  requestId: string,
  status: "approved" | "declined",
) {
  await access.requirePermission(organizationId, "approve_access_requests");
  const row = await prisma.accessRequest.findFirst({
    where: { id: requestId, organizationId },
    include: { ...requestInclude, organization: { select: { name: true } } },
  });
  if (!row) notFound();
  if (row.status !== "pending") {
    conflict("This request has already been reviewed.");
  }
  if (row.userId && row.userId === access.actorUserId) {
    throw new ApiError(403, "forbidden", "You cannot review your own access request.");
  }
  if (status === "approved") {
    await approve(access, row);
  }
  const updated = await prisma.accessRequest.update({
    where: { id: requestId },
    data: { status, reviewedByUserId: access.actorUserId, reviewedAt: new Date() },
    include: requestInclude,
  });
  const email = updated.user?.email ?? updated.guest?.email;
  if (email) {
    await sendEmail({
      to: email,
      organizationId: row.organizationId,
      for: "AccessRequestDecided",
      context: {
        organization: { name: row.organization.name },
        request: { decision: status === "approved" ? "approved" : "declined" },
        user: { name: updated.user?.profile?.firstName || updated.guest?.name || "there" },
      },
    });
  }
  return requestJson(updated);
}

async function approve(
  access: Access,
  row: {
    userId: string | null;
    organizationId: string;
    requestedRoleId: string | null;
    requestedDepartmentIds: unknown;
    requestedRole?: { code: string; name: string } | null;
  },
) {
  if (!row.userId) {
    return;
  }
  const userId = row.userId;
  if (row.requestedRoleId) {
    const role = await prisma.role.findUniqueOrThrow({ where: { id: row.requestedRoleId }, include: { permissions: true } });
    await assertCanGrant(access, row.organizationId, {
      permissions: effectivePermissions(role),
      scope: isRoleScope(role.scope) ? role.scope : null,
    });
  }
  // Requests stored before this check could name another organization's departments.
  const departmentIds = await departmentsIn(row.organizationId, asStringArray(row.requestedDepartmentIds));
  if (departmentIds.length > 0 && !(await access.isOrgAdmin(row.organizationId))) {
    throw new ApiError(403, "forbidden", "Only an organization admin can make someone a group manager.");
  }
  const adminRole = await roleId("ADMIN");
  await transaction(async (tx) => {
    if (row.requestedRoleId) {
      await tx.organizationMembership.updateMany({
        where: { userId, organizationId: row.organizationId },
        data: { roleId: row.requestedRoleId },
      });
    }
    for (const departmentId of departmentIds) {
      await tx.departmentMembership.upsert({
        where: { userId_departmentId: { userId, departmentId } },
        update: { roleId: adminRole },
        create: { userId, departmentId, roleId: adminRole },
      });
    }
  });
}

async function notifyAdmins(organizationId: string, organizationName: string, requesterEmail: string) {
  const admins = await prisma.organizationMembership.findMany({
    where: { organizationId, isActive: true, role: { code: "ADMIN" } },
    include: { user: { select: { email: true } } },
  });
  await Promise.all(
    admins.map((admin) =>
      sendEmail({
        to: admin.user.email,
        organizationId,
        for: "AccessRequestReceived",
        context: { organization: { name: organizationName }, request: { requesterEmail } },
      }).catch(() => undefined),
    ),
  );
}

export function parseDecideAccessRequest(body: Body) {
  const status = requireString(body, "status");
  if (status !== "approved" && status !== "declined") {
    validation("status must be approved or declined.");
  }
  return { status: status as "approved" | "declined" };
}

export { forbidden };
