import { Prisma } from "@/generated/prisma/client";
import { Access } from "@/lib/api/access";
import { guard, lockOrganization, transaction } from "@/lib/api/db";
import { ApiError, conflict, forbidden, notFound, validation } from "@/lib/api/errors";
import { linkGuest } from "@/lib/api/features/volunteer-needs";
import {
  assertTimezone,
  Body,
  ids,
  limited,
  list,
  normalizeEmail,
  normalizePassword,
  normalizeRateType,
  normalizeRole,
  normalizeUsername,
  optional,
  Optional,
  optionalDecimal,
  optionalString,
  optionalUuid,
  or,
  page,
  personName,
  RateType,
  requireBool,
  requireString,
  RoleCode,
  roundMoney,
} from "@/lib/api/json";
import { sendEmail } from "@/lib/api/mail";
import { appUrl, hashPassword } from "@/lib/api/security";
import { allowsVolunteerAdds, insertConnection, normalizeRelationship } from "@/lib/api/features/connections";
import type { MemberRelationship } from "@/lib/member-connection";
import { prisma } from "@/lib/prisma";

type RoleRow = { id: string; code: string; name: string };
type MemberUser = {
  id: string;
  username: string;
  email: string;
  profile?: { firstName: string; lastName: string; displayName: string | null } | null;
};

export const membershipInclude = {
  role: true,
  user: { select: { id: true, username: true, email: true, profile: { select: { firstName: true, lastName: true, displayName: true } } } },
} as const;

export function roleJson(role: RoleRow) {
  return { id: role.id, code: role.code, name: role.name };
}

function memberUserJson(user: MemberUser) {
  return {
    id: user.id,
    username: user.username,
    email: user.email as string | null,
    firstName: user.profile?.firstName ?? null,
    lastName: user.profile?.lastName ?? null,
    displayName: user.profile?.displayName ?? null,
  };
}

export type DepartmentAssignment = { departmentIds: string[]; managedDepartmentIds: string[] };

export function orgMembershipJson(
  membership: {
    id: string;
    userId: string;
    organizationId: string;
    joinedAt: Date;
    rateType: string;
    professionalBillingRate: Prisma.Decimal | null;
    isActive: boolean;
    primaryDepartmentId: string | null;
    orgUserTitle: string | null;
    orgUserDescription: string | null;
    role: RoleRow;
    user: MemberUser;
  },
  departments: string[] | DepartmentAssignment = [],
) {
  const assignment = Array.isArray(departments)
    ? { departmentIds: departments, managedDepartmentIds: [] as string[] }
    : departments;
  return {
    id: membership.id,
    userId: membership.userId,
    organizationId: membership.organizationId,
    departmentId: null,
    role: roleJson(membership.role),
    joinedAt: membership.joinedAt.toISOString(),
    rateType: membership.rateType as string | null,
    professionalBillingRate:
      membership.professionalBillingRate === null ? null : Number(membership.professionalBillingRate),
    isActive: membership.isActive,
    primaryDepartmentId: membership.primaryDepartmentId,
    departmentIds: [...assignment.departmentIds].sort(),
    managedDepartmentIds: [...assignment.managedDepartmentIds].sort(),
    orgUserTitle: membership.orgUserTitle,
    orgUserDescription: membership.orgUserDescription,
    user: memberUserJson(membership.user),
  };
}

export function departmentMembershipJson(
  membership: { id: string; userId: string; departmentId: string; joinedAt: Date; role: RoleRow; user: MemberUser },
  organizationId: string,
) {
  return {
    id: membership.id,
    userId: membership.userId,
    organizationId,
    departmentId: membership.departmentId,
    role: roleJson(membership.role),
    joinedAt: membership.joinedAt.toISOString(),
    rateType: null,
    professionalBillingRate: null,
    isActive: null,
    primaryDepartmentId: null,
    departmentIds: [membership.departmentId],
    orgUserTitle: null,
    orgUserDescription: null,
    user: memberUserJson(membership.user),
  };
}

export async function roleId(code: RoleCode, organizationId?: string | null) {
  const role = await resolveRole(code, organizationId);
  if (!role) {
    validation("role was not found.");
  }
  return role.id;
}

export async function resolveRole(code: string, organizationId?: string | null) {
  const normalized = code.trim().toUpperCase();
  if (organizationId) {
    const custom = await prisma.role.findFirst({
      where: { code: normalized, organizationId },
      select: { id: true, code: true, name: true, organizationId: true, isSystem: true, scope: true },
    });
    if (custom) return custom;
  }

  return prisma.role.findFirst({
    where: { code: normalized, organizationId: null },
    select: { id: true, code: true, name: true, organizationId: true, isSystem: true, scope: true },
  });
}

export type CreateOrgMembershipRequest = {
  email: string;
  username: string | null;
  password: string | null;
  firstName: string;
  lastName: string;
  displayName: string | null;
  timezone: string;
  phone: string | null;
  zipCode: string | null;
  notes: string | null;
  avatarUrl: string | null;
  description: string | null;
  orgUserTitle: string | null;
  orgUserDescription: string | null;
  role: RoleCode;
  departmentIds: string[];
  managedDepartmentIds: string[];
  relationship: MemberRelationship | null;
  emailUser: boolean;
};

export function parseCreateOrgMembership(body: Body): CreateOrgMembershipRequest {
  const timezoneValue = optionalString(body, "timezone")?.trim();
  if (timezoneValue) {
    assertTimezone(timezoneValue);
  }

  return {
    email: normalizeEmail(requireString(body, "email")),
    username: body.username === undefined ? null : normalizeUsername(requireString(body, "username")),
    password: body.password === undefined ? null : normalizePassword(requireString(body, "password")),
    firstName: personName(requireString(body, "firstName"), "firstName"),
    lastName: personName(requireString(body, "lastName"), "lastName"),
    displayName: body.displayName === undefined ? null : limited(body, "displayName", 100, "displayName is required."),
    timezone: timezoneValue || "UTC",
    phone: body.phone === undefined ? null : limited(body, "phone", 40, "phone is required."),
    zipCode: body.zipCode === undefined ? null : limited(body, "zipCode", 20, "zipCode must be 20 characters or fewer."),
    notes: body.notes === undefined ? null : limited(body, "notes", 2000, "notes must be 2000 characters or fewer."),
    avatarUrl: body.avatarUrl === undefined ? null : limited(body, "avatarUrl", 2000, "avatarUrl must be a URL."),
    description: body.description === undefined ? null : limited(body, "description", 8000, "description must be 8000 characters or fewer."),
    orgUserTitle: body.orgUserTitle === undefined ? null : limited(body, "orgUserTitle", 100, "orgUserTitle must be 100 characters or fewer."),
    orgUserDescription:
      body.orgUserDescription === undefined
        ? null
        : limited(body, "orgUserDescription", 8000, "orgUserDescription must be 8000 characters or fewer."),
    role: normalizeRole(requireString(body, "role")),
    departmentIds: ids(body, "departmentIds", true),
    managedDepartmentIds: body.managedDepartmentIds === undefined ? [] : ids(body, "managedDepartmentIds", true),
    relationship: body.relationship === undefined ? null : normalizeRelationship(requireString(body, "relationship")),
    emailUser: body.emailUser === undefined ? false : requireBool(body, "emailUser"),
  };
}

export type UpdateOrgMembershipRequest = {
  role: Optional<RoleCode>;
  rateType: Optional<RateType>;
  professionalBillingRate: Optional<number | null>;
  isActive: Optional<boolean>;
  primaryDepartmentId: Optional<string | null>;
  departmentIds: Optional<string[]>;
  managedDepartmentIds: Optional<string[]>;
  firstName: Optional<string>;
  lastName: Optional<string>;
  displayName: Optional<string | null>;
  timezone: Optional<string>;
  phone: Optional<string | null>;
  zipCode: Optional<string | null>;
  notes: Optional<string | null>;
  avatarUrl: Optional<string | null>;
  description: Optional<string | null>;
  orgUserTitle: Optional<string | null>;
  orgUserDescription: Optional<string | null>;
  email: Optional<string>;
};

export function parseUpdateOrgMembership(body: Body): UpdateOrgMembershipRequest {
  const request: UpdateOrgMembershipRequest = {
    role: optional(body, "role", (b, k) => normalizeRole(requireString(b, k))),
    rateType: optional(body, "rateType", (b, k) => normalizeRateType(requireString(b, k))),
    professionalBillingRate: optional(body, "professionalBillingRate", (b, k) => {
      const rate = optionalDecimal(b, k);
      return rate === null ? null : roundMoney(rate);
    }),
    isActive: optional(body, "isActive", requireBool),
    primaryDepartmentId: optional(body, "primaryDepartmentId", optionalUuid),
    departmentIds: optional(body, "departmentIds", (b, k) => ids(b, k, false)),
    managedDepartmentIds: optional(body, "managedDepartmentIds", (b, k) => ids(b, k, false)),
    firstName: optional(body, "firstName", (b, k) => personName(requireString(b, k), k)),
    lastName: optional(body, "lastName", (b, k) => personName(requireString(b, k), k)),
    displayName: optional(body, "displayName", (b, k) => limited(b, k, 100, "displayName is required.")),
    timezone: optional(body, "timezone", (b, k) => {
      const value = requireString(b, k).trim();
      assertTimezone(value);
      return value;
    }),
    phone: optional(body, "phone", (b, k) => limited(b, k, 40, "phone is required.")),
    zipCode: optional(body, "zipCode", (b, k) => limited(b, k, 20, "zipCode must be 20 characters or fewer.")),
    notes: optional(body, "notes", (b, k) => limited(b, k, 2000, "notes must be 2000 characters or fewer.")),
    avatarUrl: optional(body, "avatarUrl", (b, k) => limited(b, k, 2000, "avatarUrl must be a URL.")),
    description: optional(body, "description", (b, k) => limited(b, k, 8000, "description must be 8000 characters or fewer.")),
    orgUserTitle: optional(body, "orgUserTitle", (b, k) => limited(b, k, 100, "orgUserTitle must be 100 characters or fewer.")),
    orgUserDescription: optional(body, "orgUserDescription", (b, k) =>
      limited(b, k, 8000, "orgUserDescription must be 8000 characters or fewer."),
    ),
    email: optional(body, "email", (b, k) => normalizeEmail(requireString(b, k))),
  };
  if (
    !request.role.set &&
    !request.rateType.set &&
    !request.professionalBillingRate.set &&
    !request.isActive.set &&
    !request.primaryDepartmentId.set &&
    !request.departmentIds.set &&
    !request.managedDepartmentIds.set &&
    !request.firstName.set &&
    !request.lastName.set &&
    !request.displayName.set &&
    !request.timezone.set &&
    !request.phone.set &&
    !request.zipCode.set &&
    !request.notes.set &&
    !request.avatarUrl.set &&
    !request.description.set &&
    !request.orgUserTitle.set &&
    !request.orgUserDescription.set &&
    !request.email.set
  ) {
    validation("Provide at least one field to update.");
  }

  return request;
}

export type UpdateDepartmentMembershipRequest = { role: RoleCode };

export function parseUpdateDepartmentMembership(body: Body): UpdateDepartmentMembershipRequest {
  return { role: normalizeRole(requireString(body, "role")) };
}

export async function listRoles(params: URLSearchParams) {
  const paging = page(params);
  const roles = await prisma.role.findMany({
    where: { organizationId: null, isSystem: true },
    orderBy: { code: "asc" },
    skip: paging.offset,
    take: paging.limit,
  });
  return list(roles.map(roleJson), paging);
}

/** What a caller may see about other members: email needs people-management rights, pay needs manage_members. */
async function memberVisibility(access: Access, organizationId: string) {
  const pay = await access.can(organizationId, "manage_members");
  return { pay, contact: pay || (await access.can(organizationId, "invite_members")) };
}

function redactMember<T extends { userId: string; rateType: string | null; professionalBillingRate: number | null; user: { email: string | null } }>(
  member: T,
  visibility: { pay: boolean; contact: boolean },
  selfId: string,
): T {
  if (member.userId === selfId) return member;
  return {
    ...member,
    rateType: visibility.pay ? member.rateType : null,
    professionalBillingRate: visibility.pay ? member.professionalBillingRate : null,
    user: { ...member.user, email: visibility.contact ? member.user.email : null },
  };
}

export async function listOrgMemberships(access: Access, organizationId: string, params: URLSearchParams) {
  const paging = page(params);
  await access.requireOrganization(organizationId, false);
  const visibility = await memberVisibility(access, organizationId);
  const memberships = await prisma.organizationMembership.findMany({
    where: { organizationId },
    include: membershipInclude,
    orderBy: { joinedAt: "asc" },
    skip: paging.offset,
    take: paging.limit,
  });
  const departmentIds = await departmentIdsByUser(
    organizationId,
    memberships.map((item) => item.userId),
  );
  return list(
    memberships.map((item) =>
      redactMember(
        orgMembershipJson(item, departmentIds.get(item.userId) ?? { departmentIds: [], managedDepartmentIds: [] }),
        visibility,
        access.actorUserId,
      ),
    ),
    paging,
  );
}

async function assertAnotherAdmin(tx: Prisma.TransactionClient, organizationId: string, exceptMembershipId: string) {
  const another = await tx.organizationMembership.count({
    where: { organizationId, role: { code: "ADMIN" }, id: { not: exceptMembershipId } },
  });
  if (another === 0) {
    conflict("The last organization admin cannot be removed.");
  }
}

export async function createOrgMembership(access: Access, organizationId: string, request: CreateOrgMembershipRequest) {
  const admin = access.isSuperAdmin || (await access.isOrgAdmin(organizationId));
  let volunteerAdd = false;
  if (admin) {
    await access.requireOrganizationAdmin(organizationId);
  } else if (await access.isOrgVolunteer(organizationId)) {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { preferences: true },
    });
    if (!organization || !allowsVolunteerAdds(organization.preferences)) {
      forbidden();
    }

    if (request.role !== "VOLUNTEER") {
      validation("Volunteers can only add volunteers.");
    }

    if (request.departmentIds.length > 0) {
      validation("Volunteers cannot assign departments.");
    }

    if (!request.relationship) {
      validation("relationship is required.");
    }

    volunteerAdd = true;
  } else {
    await access.requireOrganizationAdmin(organizationId);
  }
  // Resolve outside the transaction. The production pool has one connection, so a
  // query on the global client while the transaction holds it times out.
  const resolvedRoleId = await roleId(request.role, organizationId);
  let organizationName = "";
  let organizationSlug: string | null = null;
  const membership = await transaction(async (tx) => {
    await lockOrganization(tx, organizationId);
    const existing = await tx.user.findUnique({
      where: { email: request.email },
      select: { organizationMemberships: { where: { organizationId }, select: { id: true } } },
    });
    if (existing?.organizationMemberships.length) {
      conflict(
        volunteerAdd
          ? "This person is already a member. Ask an admin to connect you."
          : "This person is already in the organization.",
      );
    }

    // Joining someone else's account to an organization would let its admins edit that account.
    if (existing) {
      throw new ApiError(
        409,
        "account_exists",
        volunteerAdd
          ? "This person already has an account. Ask an admin to invite them."
          : "This email already has an account. Send them an invitation instead.",
      );
    }

    if (!request.password || !request.username) {
      validation("username and password are required for a new person.");
    }

    const user = await tx.user.create({
      data: {
        username: request.username,
        email: request.email,
        passwordHash: await hashPassword(request.password),
        mustChangePassword: true,
        profile: {
          create: {
            firstName: request.firstName,
            lastName: request.lastName,
            displayName: request.displayName,
            timezone: request.timezone,
            phone: request.phone,
            zipCode: request.zipCode,
            notes: request.notes,
            avatarUrl: request.avatarUrl,
            description: request.description,
          },
        },
      },
    });

    await linkGuest(tx, user.email, user.id);
    const organization = await tx.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { defaultRateType: true, name: true, slug: true },
    });
    organizationName = organization.name;
    organizationSlug = organization.slug;
    await syncDepartments(tx, organizationId, user.id, request.departmentIds, request.managedDepartmentIds);
    const saved = await tx.organizationMembership.create({
      data: {
        userId: user.id,
        organizationId,
        roleId: resolvedRoleId,
        rateType: organization.defaultRateType,
        isActive: true,
        primaryDepartmentId: request.departmentIds[0] ?? null,
        orgUserTitle: request.orgUserTitle,
        orgUserDescription: request.orgUserDescription,
      },
      include: membershipInclude,
    });
    if (volunteerAdd && request.relationship) {
      await insertConnection(tx, {
        organizationId,
        fromUserId: access.actorUserId,
        toUserId: user.id,
        relationship: request.relationship,
        createdByUserId: access.actorUserId,
      });
    }

    return orgMembershipJson(saved, {
      departmentIds: request.departmentIds,
      managedDepartmentIds: request.managedDepartmentIds,
    });
  });
  if (request.emailUser && request.username && request.password) {
    try {
      await sendEmail({
        to: request.email,
        organizationId,
        for: "Welcome",
        context: {
          organization: { name: organizationName },
          user: { username: request.username, password: request.password },
          account: { url: appUrl("/login", organizationSlug) },
        },
      });
    } catch (error) {
      await prisma.user.delete({ where: { id: membership.userId } });
      throw error;
    }
  }

  return membership;
}

/**
 * Org admins edit a member's account and global profile only while no other organization
 * shares that person. Changing the login email also requires an account the person has
 * never signed in to, because the email controls password resets.
 */
function assertOrganizationOwnsAccount(
  account: { isSuperAdmin: boolean; mustChangePassword: boolean; _count: { organizationMemberships: number } },
  emailChanged: boolean,
) {
  if (account.isSuperAdmin || account._count.organizationMemberships > 0) {
    throw new ApiError(403, "forbidden", "This person belongs to another organization, so only they can change their profile.");
  }

  if (emailChanged && !account.mustChangePassword) {
    throw new ApiError(403, "forbidden", "This person has signed in, so only they can change their email.");
  }
}

export async function updateOrgMembership(
  access: Access,
  organizationId: string,
  membershipId: string,
  request: UpdateOrgMembershipRequest,
) {
  await access.requireOrganizationAdmin(organizationId);
  const nextRoleId = request.role.set ? await roleId(request.role.value, organizationId) : undefined;
  return transaction(async (tx) => {
    await lockOrganization(tx, organizationId);
    const membership = await tx.organizationMembership.findFirst({
      where: { id: membershipId, organizationId },
      include: { role: true },
    });
    if (!membership) {
      notFound();
    }

    if (request.role.set && membership.role.code === "ADMIN" && request.role.value !== "ADMIN") {
      await assertAnotherAdmin(tx, organizationId, membership.id);
    }

    const rateType = or(request.rateType, membership.rateType);
    let professionalBillingRate = or(
      request.professionalBillingRate,
      membership.professionalBillingRate === null ? null : Number(membership.professionalBillingRate),
    );
    if (request.departmentIds.set || request.managedDepartmentIds.set) {
      const nextDepartments = request.departmentIds.set
        ? request.departmentIds.value
        : (await departmentIdsByUser(organizationId, [membership.userId], tx)).get(membership.userId)?.departmentIds ?? [];
      const nextManaged = request.managedDepartmentIds.set
        ? request.managedDepartmentIds.value
        : (await departmentIdsByUser(organizationId, [membership.userId], tx)).get(membership.userId)?.managedDepartmentIds ?? [];
      await syncDepartments(tx, organizationId, membership.userId, nextDepartments, nextManaged);
    }

    if (request.primaryDepartmentId.set && request.primaryDepartmentId.value !== null) {
      await assertDepartment(tx, organizationId, request.primaryDepartmentId.value, "primaryDepartmentId does not belong to this organization.");
      await ensureDepartmentMembership(tx, membership.userId, request.primaryDepartmentId.value);
    }

    if (rateType === "Volunteer") {
      professionalBillingRate = null;
    } else if (professionalBillingRate === null || professionalBillingRate <= 0) {
      validation(
        rateType === "Paid"
          ? "professionalBillingRate is required when rateType is Paid."
          : "professionalBillingRate is required when rateType is Professional.",
      );
    }

    const primaryDepartmentId = request.primaryDepartmentId.set
      ? request.primaryDepartmentId.value
      : request.departmentIds.set
        ? (request.departmentIds.value[0] ?? null)
        : undefined;

    const account = await tx.user.findUniqueOrThrow({
      where: { id: membership.userId },
      select: {
        email: true,
        isSuperAdmin: true,
        mustChangePassword: true,
        profile: true,
        _count: { select: { organizationMemberships: { where: { organizationId: { not: organizationId } } } } },
      },
    });
    const nextEmail = request.email.set && request.email.value !== account.email ? request.email.value : null;
    const emailChanged = nextEmail !== null;
    const profileChanged = (
      ["firstName", "lastName", "displayName", "timezone", "phone", "zipCode", "notes", "avatarUrl", "description"] as const
    ).some((field) => {
      const change: Optional<string | null> = request[field];
      return change.set && change.value !== (account.profile?.[field] ?? null);
    });
    if (emailChanged || profileChanged) {
      assertOrganizationOwnsAccount(account, emailChanged);
    }

    if (nextEmail) {
      await tx.user.update({
        where: { id: membership.userId },
        data: { email: nextEmail },
      });
    }

    if (profileChanged) {
      await tx.userProfile.update({
        where: { userId: membership.userId },
        data: {
          firstName: request.firstName.set ? request.firstName.value : undefined,
          lastName: request.lastName.set ? request.lastName.value : undefined,
          displayName: request.displayName.set ? request.displayName.value : undefined,
          timezone: request.timezone.set ? request.timezone.value : undefined,
          phone: request.phone.set ? request.phone.value : undefined,
          zipCode: request.zipCode.set ? request.zipCode.value : undefined,
          notes: request.notes.set ? request.notes.value : undefined,
          avatarUrl: request.avatarUrl.set ? request.avatarUrl.value : undefined,
          description: request.description.set ? request.description.value : undefined,
        },
      });
    }

    const saved = await tx.organizationMembership.update({
      where: { id: membership.id },
      data: {
        roleId: nextRoleId,
        rateType,
        professionalBillingRate,
        isActive: request.isActive.set ? request.isActive.value : undefined,
        primaryDepartmentId,
        orgUserTitle: request.orgUserTitle.set ? request.orgUserTitle.value : undefined,
        orgUserDescription: request.orgUserDescription.set ? request.orgUserDescription.value : undefined,
      },
      include: membershipInclude,
    });
    const departmentIds = await departmentIdsByUser(organizationId, [saved.userId], tx);
    return orgMembershipJson(saved, departmentIds.get(saved.userId) ?? { departmentIds: [], managedDepartmentIds: [] });
  });
}

export function parseDeleteOrgMemberships(body: Body) {
  return ids(body, "membershipIds", false);
}

export async function deleteOrgMembership(access: Access, organizationId: string, membershipId: string) {
  await deleteOrgMemberships(access, organizationId, [membershipId]);
}

export async function deleteOrgMemberships(access: Access, organizationId: string, membershipIds: string[]) {
  const idsToDelete = [...new Set(membershipIds)];
  if (idsToDelete.length === 0) {
    validation("membershipIds must include at least one id.");
  }

  if (idsToDelete.length > 100) {
    validation("membershipIds must include at most 100 ids.");
  }

  const orgAdmin = access.isSuperAdmin || (await access.isOrgAdmin(organizationId));
  await transaction(async (tx) => {
    await lockOrganization(tx, organizationId);
    const memberships = await tx.organizationMembership.findMany({
      where: { organizationId, id: { in: idsToDelete } },
      select: { id: true, userId: true, role: { select: { code: true } } },
    });
    if (memberships.length !== idsToDelete.length) {
      notFound();
    }

    if (!orgAdmin && memberships.some((membership) => membership.userId !== access.actorUserId)) {
      forbidden();
    }

    const removingAdmins = memberships.filter((membership) => membership.role.code === "ADMIN").length;
    if (removingAdmins > 0) {
      const admins = await tx.organizationMembership.count({
        where: { organizationId, role: { code: "ADMIN" } },
      });
      if (admins - removingAdmins < 1) {
        conflict("The last organization admin cannot be removed.");
      }
    }

    const userIds = memberships.map((membership) => membership.userId);
    await tx.departmentMembership.deleteMany({
      where: { userId: { in: userIds }, department: { organizationId } },
    });
    await tx.organizationMembership.deleteMany({
      where: { organizationId, id: { in: idsToDelete } },
    });
  });
}

export async function listDepartmentMemberships(access: Access, departmentId: string, params: URLSearchParams) {
  const paging = page(params);
  const department = await access.requireDepartment(departmentId);
  const visibility = await memberVisibility(access, department.organizationId);
  const memberships = await prisma.departmentMembership.findMany({
    where: { departmentId },
    include: membershipInclude,
    orderBy: { joinedAt: "asc" },
    skip: paging.offset,
    take: paging.limit,
  });
  return list(
    memberships.map((membership) =>
      redactMember(departmentMembershipJson(membership, department.organizationId), visibility, access.actorUserId),
    ),
    paging,
  );
}

export async function updateDepartmentMembership(
  access: Access,
  departmentId: string,
  membershipId: string,
  request: UpdateDepartmentMembershipRequest,
) {
  const department = await access.requireDepartmentManager(departmentId);
  const membership = await prisma.departmentMembership.findFirst({ where: { id: membershipId, departmentId } });
  if (!membership) {
    notFound();
  }

  const saved = await guard(
    prisma.departmentMembership.update({
      where: { id: membership.id },
      data: { roleId: await roleId(request.role) },
      include: membershipInclude,
    }),
  );
  return departmentMembershipJson(saved, department.organizationId);
}

export async function deleteDepartmentMembership(access: Access, departmentId: string, membershipId: string) {
  const membership = await prisma.departmentMembership.findFirst({
    where: { id: membershipId, departmentId },
    include: { department: true },
  });
  if (!membership) {
    notFound();
  }

  const allowed =
    access.isSuperAdmin ||
    access.actorUserId === membership.userId ||
    (await access.isOrgAdmin(membership.department.organizationId)) ||
    (await access.isDepartmentAdmin(departmentId));
  if (!allowed) {
    forbidden();
  }

  await guard(prisma.departmentMembership.delete({ where: { id: membership.id } }));
}

async function departmentIdsByUser(organizationId: string, userIds: string[], db: Prisma.TransactionClient | typeof prisma = prisma) {
  if (userIds.length === 0) {
    return new Map<string, DepartmentAssignment>();
  }

  const rows = await db.departmentMembership.findMany({
    where: { userId: { in: userIds }, department: { organizationId } },
    select: { userId: true, departmentId: true, role: { select: { code: true } } },
  });
  const grouped = new Map<string, DepartmentAssignment>();
  for (const row of rows) {
    const current = grouped.get(row.userId) ?? { departmentIds: [], managedDepartmentIds: [] };
    current.departmentIds.push(row.departmentId);
    if (row.role.code === "ADMIN") current.managedDepartmentIds.push(row.departmentId);
    grouped.set(row.userId, current);
  }

  return grouped;
}

async function assertDepartment(
  db: Prisma.TransactionClient,
  organizationId: string,
  departmentId: string,
  message: string,
) {
  const department = await db.department.findUnique({ where: { id: departmentId } });
  if (!department) {
    notFound();
  }

  if (department.organizationId !== organizationId) {
    validation(message);
  }
}

async function ensureDepartmentMembership(db: Prisma.TransactionClient, userId: string, departmentId: string) {
  const existing = await db.departmentMembership.findUnique({
    where: { userId_departmentId: { userId, departmentId } },
  });
  if (existing) {
    return;
  }

  const memberRole = await db.role.findUniqueOrThrow({ where: { code: "MEMBER" }, select: { id: true } });
  await db.departmentMembership.create({
    data: { userId, departmentId, roleId: memberRole.id },
  });
}

async function syncDepartments(
  db: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  departmentIds: string[],
  managedDepartmentIds: string[] = [],
) {
  const unique = [...new Set(departmentIds)];
  const managed = new Set(managedDepartmentIds.filter((id) => unique.includes(id)));
  for (const departmentId of unique) {
    await assertDepartment(db, organizationId, departmentId, "departmentIds must belong to this organization.");
  }

  await db.departmentMembership.deleteMany({
    where: { userId, department: { organizationId }, departmentId: { notIn: unique } },
  });
  const memberRole = await db.role.findUniqueOrThrow({ where: { code: "MEMBER" }, select: { id: true } });
  const adminRole = await db.role.findUniqueOrThrow({ where: { code: "ADMIN" }, select: { id: true } });
  const existing = await db.departmentMembership.findMany({
    where: { userId, department: { organizationId } },
    select: { id: true, departmentId: true },
  });
  const keep = new Map(existing.map((item) => [item.departmentId, item.id]));
  for (const departmentId of unique) {
    const roleId = managed.has(departmentId) ? adminRole.id : memberRole.id;
    const existingId = keep.get(departmentId);
    if (existingId) {
      await db.departmentMembership.update({ where: { id: existingId }, data: { roleId } });
    } else {
      await db.departmentMembership.create({
        data: { userId, departmentId, roleId },
      });
    }
  }
}
