import { Prisma } from "@/generated/prisma/client";
import { Access } from "@/lib/api/access";
import { guard, lockUser, transaction } from "@/lib/api/db";
import { ApiError, conflict, notFound, validation } from "@/lib/api/errors";
import { Body, has, list, normalizeEmail, normalizeRole, normalizeUsername, page, Page, personName, requireString, RoleCode } from "@/lib/api/json";
import { usernameFromName } from "@/lib/import/username";
import { sendEmail } from "@/lib/api/mail";
import {
  organizationMembershipJson,
  membershipInclude,
  orgMembershipJson,
  roleId,
  roleJson,
} from "@/lib/api/features/memberships";
import { readPreferences } from "@/lib/api/features/tenants";
import { labels } from "@/lib/labels";
import { appUrl, hashCode, inviteCode, inviteMs, normalizeInviteCode } from "@/lib/api/security";
import { assertUnderRateLimit, minute, recordRateLimitFailure, type RateLimitRule } from "@/lib/api/rate-limit";
import { prisma } from "@/lib/prisma";

const invitationInclude = { role: true } as const;
type InvitationRow = Prisma.InvitationGetPayload<{ include: typeof invitationInclude }>;

function invitationJson(invitation: InvitationRow) {
  return {
    id: invitation.id,
    email: invitation.email,
    tenantId: invitation.tenantId,
    organizationId: invitation.organizationId,
    role: roleJson(invitation.role),
    invitedByUserId: invitation.invitedByUserId,
    expiresAt: invitation.expiresAt.toISOString(),
    acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
    revokedAt: invitation.revokedAt?.toISOString() ?? null,
    createdAt: invitation.createdAt.toISOString(),
    firstName: invitation.firstName,
    lastName: invitation.lastName,
    username: invitation.username,
  };
}

export type CreateInvitationRequest = {
  email: string;
  role: RoleCode;
  firstName: string;
  lastName: string;
  username?: string | null;
};

export function parseCreateInvitation(body: Body): CreateInvitationRequest {
  return {
    email: normalizeEmail(requireString(body, "email")),
    role: normalizeRole(requireString(body, "role")),
    firstName: has(body, "firstName") ? personName(requireString(body, "firstName"), "firstName") : "Volunteer",
    lastName: has(body, "lastName") ? personName(requireString(body, "lastName"), "lastName") : "Invitee",
    username: has(body, "username") ? normalizeUsername(requireString(body, "username")) : null,
  };
}

export type AcceptInvitationRequest = { code: string };

export function parseAcceptInvitation(body: Body): AcceptInvitationRequest {
  return { code: requireString(body, "code") };
}

function inviteUrl(code: string, slug?: string | null) {
  return appUrl(`/accept?code=${encodeURIComponent(code)}`, slug);
}

function inviteContext(
  target: { targetKind: string; targetName: string; slug?: string | null },
  roleName: string,
  username: string,
  code: string,
) {
  return {
    tenant: { name: target.targetName },
    invite: {
      targetKind: target.targetKind,
      targetName: target.targetName,
      roleName,
      code,
      url: inviteUrl(code, target.slug),
    },
    user: { username },
  };
}

async function usernameTaken(username: string) {
  return Boolean(
    (await prisma.user.findUnique({ where: { username }, select: { id: true } })) ||
      (await prisma.invitation.findFirst({ where: { username, acceptedAt: null, revokedAt: null }, select: { id: true } })),
  );
}

async function reserveUsername(firstName: string, lastName: string) {
  const preview = await previewUsername(firstName, lastName);
  if (!preview.username) validation("username is already in use.");
  return preview.username;
}

export async function previewUsername(firstName: string, lastName: string) {
  const base = usernameFromName(firstName, lastName);
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const username = attempt === 0 ? base : `${base.slice(0, 48)}${attempt}`;
    if (!(await usernameTaken(username))) {
      return { username, base, collided: attempt > 0 };
    }
  }
  return { username: "", base, collided: true };
}

function inviteHash(code: string) {
  return hashCode(normalizeInviteCode(code));
}

async function mailedCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = inviteCode();
    if (!(await prisma.invitation.findUnique({ where: { codeHash: inviteHash(code) }, select: { id: true } }))) {
      return code;
    }
  }
  throw new Error("Could not allocate an invite code.");
}

/** Wrong invite codes from one address, or by one account, are limited so codes cannot be guessed. */
function lookupRule(ip: string | null | undefined): RateLimitRule | null {
  return ip ? { key: `invite-lookup:ip:${ip}`, limit: 30, windowMs: 15 * minute } : null;
}

function inviteTarget(
  tenant: { name: string; slug?: string | null; preferences?: Parameters<typeof readPreferences>[0] },
  organizationName?: string,
) {
  const copy = labels(readPreferences(tenant.preferences));
  return organizationName
    ? { targetKind: copy.organization, targetName: organizationName, slug: tenant.slug ?? null }
    : { targetKind: copy.tenant, targetName: tenant.name, slug: tenant.slug ?? null };
}

async function create(
  access: Access,
  tenantId: string,
  organizationId: string | null,
  target: { targetKind: string; targetName: string; slug?: string | null },
  request: CreateInvitationRequest,
) {
  const now = new Date();
  const code = await mailedCode();
  const username = request.username || (await reserveUsername(request.firstName, request.lastName));
  const invitation = await guard(
    prisma.invitation.create({
      data: {
        email: request.email,
        tenantId,
        organizationId,
        roleId: await roleId(request.role, tenantId),
        codeHash: inviteHash(code),
        invitedByUserId: access.actorUserId,
        expiresAt: new Date(now.getTime() + inviteMs),
        createdAt: now,
        firstName: request.firstName,
        lastName: request.lastName,
        username,
      },
      include: invitationInclude,
    }),
  );
  try {
    await sendEmail({
      to: request.email,
      tenantId,
      for: "Invite",
      context: inviteContext(target, invitation.role.name, username, code),
    });
  } catch (error) {
    await prisma.invitation.delete({ where: { id: invitation.id } });
    throw error;
  }

  return invitationJson(invitation);
}

async function listWhere(where: Prisma.InvitationWhereInput, paging: Page) {
  const invitations = await prisma.invitation.findMany({
    where,
    include: invitationInclude,
    orderBy: { createdAt: "desc" },
    skip: paging.offset,
    take: paging.limit,
  });
  return list(invitations.map(invitationJson), paging);
}

async function revoke(where: Prisma.InvitationWhereInput) {
  const invitation = await prisma.invitation.findFirst({ where, include: invitationInclude });
  if (!invitation) {
    notFound();
  }

  if (invitation.acceptedAt) {
    conflict("This invite has already been accepted.");
  }

  if (invitation.revokedAt) {
    return invitationJson(invitation);
  }

  return invitationJson(
    await guard(
      prisma.invitation.update({
        where: { id: invitation.id },
        data: { revokedAt: new Date() },
        include: invitationInclude,
      }),
    ),
  );
}

export async function createTenantInvitation(
  access: Access,
  tenantId: string,
  request: CreateInvitationRequest,
) {
  const { assertInvitationsMutable } = await import("@/lib/api/features/external-sync");
  await assertInvitationsMutable(tenantId);
  const tenant = await access.requireTenantAdmin(tenantId);
  return create(access, tenant.id, null, inviteTarget(tenant), request);
}

export async function createOrganizationInvitation(access: Access, organizationId: string, request: CreateInvitationRequest) {
  const organization = await access.requireOrganizationManager(organizationId);
  const { assertInvitationsMutable } = await import("@/lib/api/features/external-sync");
  await assertInvitationsMutable(organization.tenantId);
  const tenant = await access.requireTenant(organization.tenantId, false);
  return create(access, organization.tenantId, organization.id, inviteTarget(tenant, organization.name), request);
}

export async function listTenantInvitations(access: Access, tenantId: string, params: URLSearchParams) {
  const paging = page(params);
  await access.requireTenantAdmin(tenantId);
  return listWhere({ tenantId, organizationId: null }, paging);
}

export async function listOrganizationInvitations(access: Access, organizationId: string, params: URLSearchParams) {
  const paging = page(params);
  await access.requireOrganizationManager(organizationId);
  return listWhere({ organizationId }, paging);
}

async function resend(
  where: Prisma.InvitationWhereInput,
  target: { targetKind: string; targetName: string; slug?: string | null },
) {
  const invitation = await prisma.invitation.findFirst({ where, include: invitationInclude });
  if (!invitation) {
    notFound();
  }

  if (invitation.acceptedAt) {
    conflict("This invite has already been accepted.");
  }

  if (invitation.revokedAt) {
    conflict("This invite has been revoked.");
  }

  const previous = {
    codeHash: invitation.codeHash,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
  };
  const now = new Date();
  const code = await mailedCode();
  await guard(
    prisma.invitation.update({
      where: { id: invitation.id },
      data: {
        codeHash: inviteHash(code),
        expiresAt: new Date(now.getTime() + inviteMs),
        createdAt: now,
      },
    }),
  );
  try {
    await sendEmail({
      to: invitation.email,
      tenantId: invitation.tenantId,
      for: "Invite",
      context: inviteContext(target, invitation.role.name, invitation.username ?? "", code),
    });
  } catch (error) {
    await prisma.invitation.update({ where: { id: invitation.id }, data: previous });
    throw error;
  }

  return invitationJson({ ...invitation, expiresAt: new Date(now.getTime() + inviteMs), createdAt: now });
}

export async function resendTenantInvitation(access: Access, tenantId: string, invitationId: string) {
  const tenant = await access.requireTenantAdmin(tenantId);
  return resend({ id: invitationId, tenantId, organizationId: null }, inviteTarget(tenant));
}

export async function revokeTenantInvitation(access: Access, tenantId: string, invitationId: string) {
  await access.requireTenantAdmin(tenantId);
  return revoke({ id: invitationId, tenantId, organizationId: null });
}

export async function revokeOrganizationInvitation(access: Access, organizationId: string, invitationId: string) {
  await access.requireOrganizationManager(organizationId);
  return revoke({ id: invitationId, organizationId });
}

function usable(invitation: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date }, now: Date) {
  return !invitation.acceptedAt && !invitation.revokedAt && invitation.expiresAt > now;
}

export const inviteEmailMismatch = "This invite was sent to a different email.";

export function acceptCodeFromNext(next: string) {
  const queryIndex = next.indexOf("?");
  const path = queryIndex === -1 ? next : next.slice(0, queryIndex);
  if (path !== "/accept") {
    return null;
  }

  const code = new URLSearchParams(queryIndex === -1 ? "" : next.slice(queryIndex + 1)).get("code")?.trim() ?? "";
  return code || null;
}

export function acceptAuthRedirect(code: string, userExists: boolean) {
  const next = `/accept?code=${encodeURIComponent(code)}`;
  return `${userExists ? "/login" : "/signup"}?next=${encodeURIComponent(next)}`;
}

export async function invitationAccount(code: string, pinnedTenantId?: string | null, options?: { ip?: string | null }) {
  const trimmed = code.trim();
  if (!trimmed) {
    return null;
  }

  const rule = lookupRule(options?.ip);
  if (rule) {
    await assertUnderRateLimit(rule);
  }

  const found = await prisma.invitation.findUnique({ where: { codeHash: inviteHash(trimmed) } });
  if (!found || !usable(found, new Date())) {
    if (rule) {
      await recordRateLimitFailure(rule);
    }
    return null;
  }

  if (pinnedTenantId && found.tenantId !== pinnedTenantId) {
    return null;
  }

  const user = await prisma.user.findUnique({ where: { email: found.email }, select: { id: true } });
  return {
    email: found.email,
    tenantId: found.tenantId,
    userExists: user !== null,
    firstName: found.firstName,
    lastName: found.lastName,
    username: found.username,
  };
}

export async function acceptInvitation(access: Access, request: AcceptInvitationRequest, options?: { ip?: string | null }) {
  const caller = access.requireHuman();
  const rules = [{ key: `invite-accept:user:${caller.id}`, limit: 10, windowMs: 15 * minute }, lookupRule(options?.ip)].filter(
    (rule): rule is RateLimitRule => rule !== null,
  );
  for (const rule of rules) {
    await assertUnderRateLimit(rule);
  }

  const pinned = await access.pinnedTenant();
  const now = new Date();
  const found = await prisma.invitation.findUnique({ where: { codeHash: inviteHash(request.code) } });
  if (!found || !usable(found, now)) {
    for (const rule of rules) {
      await recordRateLimitFailure(rule);
    }
    validation("The code is not valid.");
  }

  if (pinned && found.tenantId !== pinned.id) {
    throw new ApiError(403, "forbidden", "This invite belongs to another tenant.");
  }

  if (found.email !== caller.email) {
    throw new ApiError(403, "forbidden", inviteEmailMismatch);
  }

  const memberRoleId = await roleId("MEMBER");
  const accepted = await transaction(async (tx) => {
    await lockUser(tx, caller.id);
    const invitation = await tx.invitation.findUniqueOrThrow({ where: { id: found.id } });
    if (!usable(invitation, now)) {
      validation("The code is not valid.");
    }

    const memberOfTenant =
      (await tx.tenantMembership.count({
        where: { userId: caller.id, tenantId: invitation.tenantId },
      })) > 0;
    const newTenantMembership = async (membershipRoleId: string) => {
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: invitation.tenantId },
        select: { defaultRateType: true },
      });
      return tx.tenantMembership.create({
        data: {
          userId: caller.id,
          tenantId: invitation.tenantId,
          roleId: membershipRoleId,
          rateType: tenant.defaultRateType,
          isActive: true,
          joinedAt: now,
        },
        include: membershipInclude,
      });
    };

    let tenantMembership = null;
    let organizationMembership = null;
    if (invitation.organizationId) {
      const alreadyInOrganization =
        (await tx.tenantMembership.count({
          where: { userId: caller.id, organizationId: invitation.organizationId },
        })) > 0;
      if (alreadyInOrganization) {
        conflict("You are already a member.");
      }

      if (!memberOfTenant) {
        tenantMembership = await newTenantMembership(memberRoleId);
      }

      organizationMembership = await tx.tenantMembership.create({
        data: { userId: caller.id, organizationId: invitation.organizationId, roleId: invitation.roleId, joinedAt: now },
        include: membershipInclude,
      });
    } else {
      if (memberOfTenant) {
        conflict("You are already a member.");
      }

      tenantMembership = await newTenantMembership(invitation.roleId);
    }

    const saved = await tx.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: now },
      include: invitationInclude,
    });
    return { invitation: saved, tenantMembership, organizationMembership };
  });

  return {
    invitation: invitationJson(accepted.invitation),
    tenantMembership: accepted.tenantMembership
      ? orgMembershipJson(
          accepted.tenantMembership,
          accepted.invitation.organizationId ? [accepted.invitation.organizationId] : [],
        )
      : null,
    organizationMembership: accepted.organizationMembership
      ? organizationMembershipJson(accepted.organizationMembership, accepted.invitation.tenantId)
      : null,
  };
}
