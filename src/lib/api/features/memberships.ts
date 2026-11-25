import { Prisma } from "@/generated/prisma/client";
import { Access } from "@/lib/api/access";
import { guard, lockTenant, transaction } from "@/lib/api/db";
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
import { assertOwnAvatarUrl } from "@/lib/api/features/users";
import { isVercelBlobUrl } from "@/lib/brand";
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

export type OrganizationAssignment = { organizationIds: string[]; managedOrganizationIds: string[] };

export function orgMembershipJson(
  membership: {
    id: string;
    userId: string;
    tenantId: string;
    joinedAt: Date;
    rateType: string;
    professionalBillingRate: Prisma.Decimal | null;
    isActive: boolean;
    primaryOrganizationId: string | null;
    title: string | null;
    memberDescription: string | null;
    notes: string | null;
    role: RoleRow;
    user: MemberUser;
  },
  organizations: string[] | OrganizationAssignment = [],
) {
  const assignment = Array.isArray(organizations)
    ? { organizationIds: organizations, managedOrganizationIds: [] as string[] }
    : organizations;
  return {
    id: membership.id,
    userId: membership.userId,
    tenantId: membership.tenantId,
    organizationId: null,
    role: roleJson(membership.role),
    joinedAt: membership.joinedAt.toISOString(),
    rateType: membership.rateType as string | null,
    professionalBillingRate:
      membership.professionalBillingRate === null ? null : Number(membership.professionalBillingRate),
    isActive: membership.isActive,
    primaryOrganizationId: membership.primaryOrganizationId,
    organizationIds: [...assignment.organizationIds].sort(),
    managedOrganizationIds: [...assignment.managedOrganizationIds].sort(),
    title: membership.title,
    memberDescription: membership.memberDescription,
    notes: membership.notes,
    user: memberUserJson(membership.user),
  };
}

export function organizationMembershipJson(
  membership: { id: string; userId: string; organizationId: string; joinedAt: Date; role: RoleRow; user: MemberUser },
  tenantId: string,
) {
  return {
    id: membership.id,
    userId: membership.userId,
    tenantId,
    organizationId: membership.organizationId,
    role: roleJson(membership.role),
    joinedAt: membership.joinedAt.toISOString(),
    rateType: null,
    professionalBillingRate: null,
    isActive: null,
    primaryOrganizationId: null,
    organizationIds: [membership.organizationId],
    title: null,
    memberDescription: null,
    notes: null,
    user: memberUserJson(membership.user),
  };
}

export async function roleId(code: RoleCode, tenantId?: string | null) {
  const role = await resolveRole(code, tenantId);
  if (!role) {
    validation("role was not found.");
  }
  return role.id;
}

export async function resolveRole(code: string, tenantId?: string | null) {
  const normalized = code.trim().toUpperCase();
  if (tenantId) {
    const custom = await prisma.role.findFirst({
      where: { code: normalized, tenantId },
      select: { id: true, code: true, name: true, tenantId: true, isSystem: true, scope: true },
    });
    if (custom) return custom;
  }

  return prisma.role.findFirst({
    where: { code: normalized, tenantId: null },
    select: { id: true, code: true, name: true, tenantId: true, isSystem: true, scope: true },
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
  title: string | null;
  memberDescription: string | null;
  role: RoleCode;
  organizationIds: string[];
  managedOrganizationIds: string[];
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
    title: body.title === undefined ? null : limited(body, "title", 100, "title must be 100 characters or fewer."),
    memberDescription:
      body.memberDescription === undefined
        ? null
        : limited(body, "memberDescription", 8000, "memberDescription must be 8000 characters or fewer."),
    role: normalizeRole(requireString(body, "role")),
    organizationIds: ids(body, "organizationIds", true),
    managedOrganizationIds: body.managedOrganizationIds === undefined ? [] : ids(body, "managedOrganizationIds", true),
    relationship: body.relationship === undefined ? null : normalizeRelationship(requireString(body, "relationship")),
    emailUser: body.emailUser === undefined ? false : requireBool(body, "emailUser"),
  };
}

export type UpdateOrgMembershipRequest = {
  role: Optional<RoleCode>;
  rateType: Optional<RateType>;
  professionalBillingRate: Optional<number | null>;
  isActive: Optional<boolean>;
  primaryOrganizationId: Optional<string | null>;
  organizationIds: Optional<string[]>;
  managedOrganizationIds: Optional<string[]>;
  firstName: Optional<string>;
  lastName: Optional<string>;
  displayName: Optional<string | null>;
  timezone: Optional<string>;
  phone: Optional<string | null>;
  zipCode: Optional<string | null>;
  notes: Optional<string | null>;
  avatarUrl: Optional<string | null>;
  description: Optional<string | null>;
  title: Optional<string | null>;
  memberDescription: Optional<string | null>;
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
    primaryOrganizationId: optional(body, "primaryOrganizationId", optionalUuid),
    organizationIds: optional(body, "organizationIds", (b, k) => ids(b, k, false)),
    managedOrganizationIds: optional(body, "managedOrganizationIds", (b, k) => ids(b, k, false)),
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
    title: optional(body, "title", (b, k) => limited(b, k, 100, "title must be 100 characters or fewer.")),
    memberDescription: optional(body, "memberDescription", (b, k) =>
      limited(b, k, 8000, "memberDescription must be 8000 characters or fewer."),
    ),
    email: optional(body, "email", (b, k) => normalizeEmail(requireString(b, k))),
  };
  if (
    !request.role.set &&
    !request.rateType.set &&
    !request.professionalBillingRate.set &&
    !request.isActive.set &&
    !request.primaryOrganizationId.set &&
    !request.organizationIds.set &&
    !request.managedOrganizationIds.set &&
    !request.firstName.set &&
    !request.lastName.set &&
    !request.displayName.set &&
    !request.timezone.set &&
    !request.phone.set &&
    !request.zipCode.set &&
    !request.notes.set &&
    !request.avatarUrl.set &&
    !request.description.set &&
    !request.title.set &&
    !request.memberDescription.set &&
    !request.email.set
  ) {
    validation("Provide at least one field to update.");
  }

  return request;
}

export type UpdateOrganizationMembershipRequest = { role: RoleCode };

export function parseUpdateOrganizationMembership(body: Body): UpdateOrganizationMembershipRequest {
  return { role: normalizeRole(requireString(body, "role")) };
}

export async function listRoles(params: URLSearchParams) {
  const paging = page(params);
  const roles = await prisma.role.findMany({
    where: { tenantId: null, isSystem: true },
    orderBy: { code: "asc" },
    skip: paging.offset,
    take: paging.limit,
  });
  return list(roles.map(roleJson), paging);
}

/** What a caller may see about other members: email needs people-management rights, pay needs manage_members. */
async function memberVisibility(access: Access, tenantId: string) {
  const pay = await access.can(tenantId, "manage_members");
  return { pay, contact: pay || (await access.can(tenantId, "invite_members")) };
}

function redactMember<
  T extends { userId: string; rateType: string | null; professionalBillingRate: number | null; notes: string | null; user: { email: string | null } },
>(
  member: T,
  visibility: { pay: boolean; contact: boolean },
  selfId: string,
): T {
  if (member.userId === selfId) return member;
  return {
    ...member,
    rateType: visibility.pay ? member.rateType : null,
    professionalBillingRate: visibility.pay ? member.professionalBillingRate : null,
    notes: visibility.pay ? member.notes : null,
    user: { ...member.user, email: visibility.contact ? member.user.email : null },
  };
}

export async function listOrgMemberships(access: Access, tenantId: string, params: URLSearchParams) {
  const paging = page(params);
  await access.requireTenant(tenantId, false);
  const visibility = await memberVisibility(access, tenantId);
  const memberships = await prisma.tenantMembership.findMany({
    where: { tenantId },
    include: membershipInclude,
    orderBy: { joinedAt: "asc" },
    skip: paging.offset,
    take: paging.limit,
  });
  const organizationIds = await organizationIdsByUser(
    tenantId,
    memberships.map((item) => item.userId),
  );
  return list(
    memberships.map((item) =>
      redactMember(
        orgMembershipJson(item, organizationIds.get(item.userId) ?? { organizationIds: [], managedOrganizationIds: [] }),
        visibility,
        access.actorUserId,
      ),
    ),
    paging,
  );
}

async function assertAnotherAdmin(tx: Prisma.TransactionClient, tenantId: string, exceptMembershipId: string) {
  const another = await tx.tenantMembership.count({
    where: { tenantId, role: { code: "ADMIN" }, id: { not: exceptMembershipId } },
  });
  if (another === 0) {
    conflict("The last tenant admin cannot be removed.");
  }
}

export async function createOrgMembership(access: Access, tenantId: string, request: CreateOrgMembershipRequest) {
  const { assertPeopleRolesMutable } = await import("@/lib/api/features/external-sync");
  await assertPeopleRolesMutable(tenantId);
  const admin = access.isSuperAdmin || (await access.isOrgAdmin(tenantId));
  let volunteerAdd = false;
  if (admin) {
    await access.requireTenantAdmin(tenantId);
  } else if (await access.isOrgVolunteer(tenantId)) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { preferences: true },
    });
    if (!tenant || !allowsVolunteerAdds(tenant.preferences)) {
      forbidden();
    }

    if (request.role !== "VOLUNTEER") {
      validation("Volunteers can only add volunteers.");
    }

    if (request.organizationIds.length > 0) {
      validation("Volunteers cannot assign organizations.");
    }

    if (!request.relationship) {
      validation("relationship is required.");
    }

    volunteerAdd = true;
  } else {
    await access.requireTenantAdmin(tenantId);
  }
  // Resolve outside the transaction. The production pool has one connection, so a
  // query on the global client while the transaction holds it times out.
  const resolvedRoleId = await roleId(request.role, tenantId);
  let tenantName = "";
  let tenantSlug: string | null = null;
  const membership = await transaction(async (tx) => {
    await lockTenant(tx, tenantId);
    const existing = await tx.user.findUnique({
      where: { email: request.email },
      select: { tenantMemberships: { where: { tenantId }, select: { id: true } } },
    });
    if (existing?.tenantMemberships.length) {
      conflict(
        volunteerAdd
          ? "This person is already a member. Ask an admin to connect you."
          : "This person is already in the tenant.",
      );
    }

    // Joining someone else's account to an tenant would let its admins edit that account.
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
    if (request.avatarUrl && isVercelBlobUrl(request.avatarUrl)) {
      validation("avatarUrl must be an image uploaded for this person.");
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
            avatarUrl: request.avatarUrl,
            description: request.description,
          },
        },
      },
    });

    await linkGuest(tx, user.email, user.id);
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { defaultRateType: true, name: true, slug: true },
    });
    tenantName = tenant.name;
    tenantSlug = tenant.slug;
    await syncOrganizations(tx, tenantId, user.id, request.organizationIds, request.managedOrganizationIds);
    const saved = await tx.tenantMembership.create({
      data: {
        userId: user.id,
        tenantId,
        roleId: resolvedRoleId,
        rateType: tenant.defaultRateType,
        isActive: true,
        primaryOrganizationId: request.organizationIds[0] ?? null,
        title: request.title,
        memberDescription: request.memberDescription,
        notes: request.notes,
      },
      include: membershipInclude,
    });
    if (volunteerAdd && request.relationship) {
      await insertConnection(tx, {
        tenantId,
        fromUserId: access.actorUserId,
        toUserId: user.id,
        relationship: request.relationship,
        createdByUserId: access.actorUserId,
      });
    }

    return orgMembershipJson(saved, {
      organizationIds: request.organizationIds,
      managedOrganizationIds: request.managedOrganizationIds,
    });
  });
  if (request.emailUser && request.username && request.password) {
    try {
      await sendEmail({
        to: request.email,
        tenantId,
        for: "Welcome",
        context: {
          tenant: { name: tenantName },
          user: { username: request.username, password: request.password },
          account: { url: appUrl("/login", tenantSlug) },
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
 * Org admins edit a member's account and global profile only while no other tenant
 * shares that person. Changing the login email also requires an account the person has
 * never signed in to, because the email controls password resets.
 */
function assertTenantOwnsAccount(
  account: { isSuperAdmin: boolean; mustChangePassword: boolean; _count: { tenantMemberships: number } },
  emailChanged: boolean,
) {
  if (account.isSuperAdmin || account._count.tenantMemberships > 0) {
    throw new ApiError(403, "forbidden", "This person belongs to another tenant, so only they can change their profile.");
  }

  if (emailChanged && !account.mustChangePassword) {
    throw new ApiError(403, "forbidden", "This person has signed in, so only they can change their email.");
  }
}

export async function updateOrgMembership(
  access: Access,
  tenantId: string,
  membershipId: string,
  request: UpdateOrgMembershipRequest,
) {
  const { assertPeopleRolesMutable } = await import("@/lib/api/features/external-sync");
  await assertPeopleRolesMutable(tenantId);
  await access.requireTenantAdmin(tenantId);
  const nextRoleId = request.role.set ? await roleId(request.role.value, tenantId) : undefined;
  return transaction(async (tx) => {
    await lockTenant(tx, tenantId);
    const membership = await tx.tenantMembership.findFirst({
      where: { id: membershipId, tenantId },
      include: { role: true },
    });
    if (!membership) {
      notFound();
    }

    if (request.role.set && membership.role.code === "ADMIN" && request.role.value !== "ADMIN") {
      await assertAnotherAdmin(tx, tenantId, membership.id);
    }

    const rateType = or(request.rateType, membership.rateType);
    let professionalBillingRate = or(
      request.professionalBillingRate,
      membership.professionalBillingRate === null ? null : Number(membership.professionalBillingRate),
    );
    if (request.organizationIds.set || request.managedOrganizationIds.set) {
      const nextOrganizations = request.organizationIds.set
        ? request.organizationIds.value
        : (await organizationIdsByUser(tenantId, [membership.userId], tx)).get(membership.userId)?.organizationIds ?? [];
      const nextManaged = request.managedOrganizationIds.set
        ? request.managedOrganizationIds.value
        : (await organizationIdsByUser(tenantId, [membership.userId], tx)).get(membership.userId)?.managedOrganizationIds ?? [];
      await syncOrganizations(tx, tenantId, membership.userId, nextOrganizations, nextManaged);
    }

    if (request.primaryOrganizationId.set && request.primaryOrganizationId.value !== null) {
      await assertOrganization(tx, tenantId, request.primaryOrganizationId.value, "primaryOrganizationId does not belong to this tenant.");
      await ensureOrganizationMembership(tx, membership.userId, request.primaryOrganizationId.value);
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

    const primaryOrganizationId = request.primaryOrganizationId.set
      ? request.primaryOrganizationId.value
      : request.organizationIds.set
        ? (request.organizationIds.value[0] ?? null)
        : undefined;

    const account = await tx.user.findUniqueOrThrow({
      where: { id: membership.userId },
      select: {
        email: true,
        isSuperAdmin: true,
        mustChangePassword: true,
        profile: true,
        _count: { select: { tenantMemberships: { where: { tenantId: { not: tenantId } } } } },
      },
    });
    const nextEmail = request.email.set && request.email.value !== account.email ? request.email.value : null;
    const emailChanged = nextEmail !== null;
    const profileChanged = (
      ["firstName", "lastName", "displayName", "timezone", "phone", "zipCode", "avatarUrl", "description"] as const
    ).some((field) => {
      const change: Optional<string | null> = request[field];
      return change.set && change.value !== (account.profile?.[field] ?? null);
    });
    if (emailChanged || profileChanged) {
      assertTenantOwnsAccount(account, emailChanged);
    }
    if (request.avatarUrl.set && request.avatarUrl.value) {
      assertOwnAvatarUrl(membership.userId, request.avatarUrl.value);
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
          avatarUrl: request.avatarUrl.set ? request.avatarUrl.value : undefined,
          description: request.description.set ? request.description.value : undefined,
        },
      });
    }

    const saved = await tx.tenantMembership.update({
      where: { id: membership.id },
      data: {
        roleId: nextRoleId,
        rateType,
        professionalBillingRate,
        isActive: request.isActive.set ? request.isActive.value : undefined,
        primaryOrganizationId,
        title: request.title.set ? request.title.value : undefined,
        memberDescription: request.memberDescription.set ? request.memberDescription.value : undefined,
        notes: request.notes.set ? request.notes.value : undefined,
      },
      include: membershipInclude,
    });
    const organizationIds = await organizationIdsByUser(tenantId, [saved.userId], tx);
    return orgMembershipJson(saved, organizationIds.get(saved.userId) ?? { organizationIds: [], managedOrganizationIds: [] });
  });
}

export function parseDeleteOrgMemberships(body: Body) {
  return ids(body, "membershipIds", false);
}

export async function deleteOrgMembership(access: Access, tenantId: string, membershipId: string) {
  await deleteOrgMemberships(access, tenantId, [membershipId]);
}

export async function deleteOrgMemberships(access: Access, tenantId: string, membershipIds: string[]) {
  const { assertPeopleRolesMutable } = await import("@/lib/api/features/external-sync");
  await assertPeopleRolesMutable(tenantId);
  const idsToDelete = [...new Set(membershipIds)];
  if (idsToDelete.length === 0) {
    validation("membershipIds must include at least one id.");
  }

  if (idsToDelete.length > 100) {
    validation("membershipIds must include at most 100 ids.");
  }

  const orgAdmin = access.isSuperAdmin || (await access.isOrgAdmin(tenantId));
  await transaction(async (tx) => {
    await lockTenant(tx, tenantId);
    const memberships = await tx.tenantMembership.findMany({
      where: { tenantId, id: { in: idsToDelete } },
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
      const admins = await tx.tenantMembership.count({
        where: { tenantId, role: { code: "ADMIN" } },
      });
      if (admins - removingAdmins < 1) {
        conflict("The last tenant admin cannot be removed.");
      }
    }

    const userIds = memberships.map((membership) => membership.userId);
    await tx.organizationMembership.deleteMany({
      where: { userId: { in: userIds }, organization: { tenantId } },
    });
    await tx.tenantMembership.deleteMany({
      where: { tenantId, id: { in: idsToDelete } },
    });
  });
}

export async function listOrganizationMemberships(access: Access, organizationId: string, params: URLSearchParams) {
  const paging = page(params);
  const organization = await access.requireOrganization(organizationId);
  const visibility = await memberVisibility(access, organization.tenantId);
  const memberships = await prisma.organizationMembership.findMany({
    where: { organizationId },
    include: membershipInclude,
    orderBy: { joinedAt: "asc" },
    skip: paging.offset,
    take: paging.limit,
  });
  return list(
    memberships.map((membership) =>
      redactMember(organizationMembershipJson(membership, organization.tenantId), visibility, access.actorUserId),
    ),
    paging,
  );
}

export async function updateOrganizationMembership(
  access: Access,
  organizationId: string,
  membershipId: string,
  request: UpdateOrganizationMembershipRequest,
) {
  const organization = await access.requireOrganizationManager(organizationId);
  const membership = await prisma.organizationMembership.findFirst({ where: { id: membershipId, organizationId } });
  if (!membership) {
    notFound();
  }

  const saved = await guard(
    prisma.organizationMembership.update({
      where: { id: membership.id },
      data: { roleId: await roleId(request.role) },
      include: membershipInclude,
    }),
  );
  return organizationMembershipJson(saved, organization.tenantId);
}

export async function deleteOrganizationMembership(access: Access, organizationId: string, membershipId: string) {
  const membership = await prisma.organizationMembership.findFirst({
    where: { id: membershipId, organizationId },
    include: { organization: true },
  });
  if (!membership) {
    notFound();
  }

  const allowed =
    access.isSuperAdmin ||
    access.actorUserId === membership.userId ||
    (await access.isOrgAdmin(membership.organization.tenantId)) ||
    (await access.isOrganizationAdmin(organizationId));
  if (!allowed) {
    forbidden();
  }

  await guard(prisma.organizationMembership.delete({ where: { id: membership.id } }));
}

async function organizationIdsByUser(tenantId: string, userIds: string[], db: Prisma.TransactionClient | typeof prisma = prisma) {
  if (userIds.length === 0) {
    return new Map<string, OrganizationAssignment>();
  }

  const rows = await db.organizationMembership.findMany({
    where: { userId: { in: userIds }, organization: { tenantId } },
    select: { userId: true, organizationId: true, role: { select: { code: true } } },
  });
  const grouped = new Map<string, OrganizationAssignment>();
  for (const row of rows) {
    const current = grouped.get(row.userId) ?? { organizationIds: [], managedOrganizationIds: [] };
    current.organizationIds.push(row.organizationId);
    if (row.role.code === "ADMIN") current.managedOrganizationIds.push(row.organizationId);
    grouped.set(row.userId, current);
  }

  return grouped;
}

async function assertOrganization(
  db: Prisma.TransactionClient,
  tenantId: string,
  organizationId: string,
  message: string,
) {
  const organization = await db.organization.findUnique({ where: { id: organizationId } });
  if (!organization) {
    notFound();
  }

  if (organization.tenantId !== tenantId) {
    validation(message);
  }
}

async function ensureOrganizationMembership(db: Prisma.TransactionClient, userId: string, organizationId: string) {
  const existing = await db.organizationMembership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
  });
  if (existing) {
    return;
  }

  const memberRole = await db.role.findUniqueOrThrow({ where: { code: "MEMBER" }, select: { id: true } });
  await db.organizationMembership.create({
    data: { userId, organizationId, roleId: memberRole.id },
  });
}

async function syncOrganizations(
  db: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  organizationIds: string[],
  managedOrganizationIds: string[] = [],
) {
  const unique = [...new Set(organizationIds)];
  const managed = new Set(managedOrganizationIds.filter((id) => unique.includes(id)));
  for (const organizationId of unique) {
    await assertOrganization(db, tenantId, organizationId, "organizationIds must belong to this tenant.");
  }

  await db.organizationMembership.deleteMany({
    where: { userId, organization: { tenantId }, organizationId: { notIn: unique } },
  });
  const memberRole = await db.role.findUniqueOrThrow({ where: { code: "MEMBER" }, select: { id: true } });
  const adminRole = await db.role.findUniqueOrThrow({ where: { code: "ADMIN" }, select: { id: true } });
  const existing = await db.organizationMembership.findMany({
    where: { userId, organization: { tenantId } },
    select: { id: true, organizationId: true },
  });
  const keep = new Map(existing.map((item) => [item.organizationId, item.id]));
  for (const organizationId of unique) {
    const roleId = managed.has(organizationId) ? adminRole.id : memberRole.id;
    const existingId = keep.get(organizationId);
    if (existingId) {
      await db.organizationMembership.update({ where: { id: existingId }, data: { roleId } });
    } else {
      await db.organizationMembership.create({
        data: { userId, organizationId, roleId },
      });
    }
  }
}
