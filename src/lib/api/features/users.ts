import { Access, Account, accountInclude } from "@/lib/api/access";
import { lockSuperAdmins, transaction } from "@/lib/api/db";
import { conflict, forbidden, notFound, passwordChangeRequired, validation } from "@/lib/api/errors";
import {
  assertTimezone,
  Body,
  limited,
  list,
  normalizeEmail,
  normalizePassword,
  normalizeUsername,
  optional,
  Optional,
  optionalString,
  page,
  personName,
  requireBool,
  requireString,
} from "@/lib/api/json";
import { hashPassword, verifyPassword } from "@/lib/api/security";
import { isOwnedAvatarBlob, isVercelBlobUrl } from "@/lib/brand";
import { prisma } from "@/lib/prisma";

/** A stored Blob avatar must be one uploaded for this person, so another person's file is never served as theirs. */
export function assertOwnAvatarUrl(userId: string, avatarUrl: string) {
  if (isVercelBlobUrl(avatarUrl) && !isOwnedAvatarBlob(userId, avatarUrl)) {
    validation("avatarUrl must be an image uploaded for this person.");
  }
}

export function userJson(user: Account, includePrivate = true) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    isSuperAdmin: user.isSuperAdmin,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    profile: user.profile
      ? {
          id: user.profile.id,
          firstName: user.profile.firstName,
          lastName: user.profile.lastName,
          displayName: user.profile.displayName,
          timezone: user.profile.timezone,
          phone: includePrivate ? user.profile.phone : null,
          zipCode: includePrivate ? user.profile.zipCode : null,
          notes: includePrivate ? user.profile.notes : null,
          memberNumber: user.profile.memberNumber,
          avatarUrl: user.profile.avatarUrl,
          description: user.profile.description,
        }
      : null,
  };
}

export type UpdateUserRequest = {
  username: Optional<string>;
  email: Optional<string>;
  password: Optional<string>;
  currentPassword: string | null;
  firstName: Optional<string>;
  lastName: Optional<string>;
  displayName: Optional<string | null>;
  timezone: Optional<string>;
  phone: Optional<string | null>;
  zipCode: Optional<string | null>;
  notes: Optional<string | null>;
  avatarUrl: Optional<string | null>;
  description: Optional<string | null>;
  isSuperAdmin: Optional<boolean>;
};

export function parseUpdateUser(body: Body): UpdateUserRequest {
  const username = optional(body, "username", (b, k) => normalizeUsername(requireString(b, k)));
  const email = optional(body, "email", (b, k) => normalizeEmail(requireString(b, k)));
  const password = optional(body, "password", (b, k) => normalizePassword(requireString(b, k)));
  let currentPassword: string | null = null;
  if (password.set) {
    currentPassword = optionalString(body, "currentPassword") ?? null;
    if (!currentPassword) {
      validation("currentPassword is required to change the password.");
    }
  }

  return {
    username,
    email,
    password,
    currentPassword,
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
    isSuperAdmin: optional(body, "isSuperAdmin", requireBool),
  };
}

export async function listUsers(access: Access, params: URLSearchParams) {
  const paging = page(params);
  if (!access.isSuperAdmin) {
    forbidden();
  }

  const users = await prisma.user.findMany({
    include: accountInclude,
    orderBy: { username: "asc" },
    skip: paging.offset,
    take: paging.limit,
  });
  return list(users.map((user) => userJson(user)), paging);
}

export async function getUser(access: Access, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: accountInclude });
  if (!user) {
    notFound();
  }

  if (access.isSuperAdmin || access.actorUserId === user.id) {
    return userJson(user);
  }

  const shared = await access.sharedOrganizationIds(user.id);
  if (shared.length === 0) {
    forbidden();
  }

  let adminOfShared = false;
  for (const organizationId of shared) {
    adminOfShared ||= await access.isOrgAdmin(organizationId);
  }

  return userJson(user, adminOfShared);
}

export async function updateUser(access: Access, userId: string, request: UpdateUserRequest, fromMe: boolean) {
  const caller = access.requireHuman();
  if (request.avatarUrl.set && request.avatarUrl.value) {
    assertOwnAvatarUrl(userId, request.avatarUrl.value);
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, include: accountInclude });
  if (!user || !user.profile) {
    notFound();
  }

  if (caller.id !== user.id && !access.isSuperAdmin) {
    const shared = await access.sharedOrganizationIds(user.id);
    let adminOfShared = false;
    for (const organizationId of shared) {
      adminOfShared ||= await access.isOrgAdmin(organizationId);
    }

    if (!adminOfShared) {
      forbidden();
    }

    if (request.username.set || request.email.set || request.password.set || request.isSuperAdmin.set) {
      forbidden();
    }
  }

  if (request.isSuperAdmin.set && (fromMe || !access.isSuperAdmin)) {
    forbidden();
  }

  if (caller.mustChangePassword && caller.id === user.id && !request.password.set) {
    passwordChangeRequired();
  }

  if (request.password.set && !(await verifyPassword(request.currentPassword!, user.passwordHash))) {
    validation("The current password is incorrect.");
  }

  if (user.mustChangePassword && request.password.set && (await verifyPassword(request.password.value, user.passwordHash))) {
    validation("Choose a different password.");
  }

  const passwordHash = request.password.set ? await hashPassword(request.password.value) : undefined;
  const updated = await transaction(async (tx) => {
    if (request.isSuperAdmin.set && !request.isSuperAdmin.value && user.isSuperAdmin) {
      await lockSuperAdmins(tx);
      const others = await tx.user.count({ where: { isSuperAdmin: true, id: { not: user.id } } });
      if (others === 0) {
        conflict("This account cannot be removed.");
      }
    }

    const saved = await tx.user.update({
      where: { id: user.id },
      data: {
        username: request.username.set ? request.username.value : undefined,
        email: request.email.set ? request.email.value : undefined,
        passwordHash,
        mustChangePassword: request.password.set ? false : undefined,
        isSuperAdmin: request.isSuperAdmin.set ? request.isSuperAdmin.value : undefined,
        profile: {
          update: {
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
        },
      },
      include: accountInclude,
    });
    if (request.password.set) {
      const now = new Date();
      await tx.refreshToken.updateMany({
        where: { userId: user.id, expiresAt: { gt: now } },
        data: { revokedAt: now, expiresAt: now },
      });
    }

    return saved;
  });
  return userJson(updated);
}

export async function deleteUser(access: Access, userId: string) {
  const caller = access.requireHuman();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    notFound();
  }

  if (caller.id !== user.id && !access.isSuperAdmin) {
    forbidden();
  }

  await transaction(async (tx) => {
    if (user.isSuperAdmin) {
      await lockSuperAdmins(tx);
      const others = await tx.user.count({ where: { isSuperAdmin: true, id: { not: user.id } } });
      if (others === 0) {
        conflict("This account cannot be removed.");
      }
    }

    const referenced =
      (await tx.userTimeEntry.count({ where: { OR: [{ userId }, { enteredByUserId: userId }] } })) > 0 ||
      (await tx.collectiveTimeEntry.count({ where: { recordedByUserId: userId } })) > 0 ||
      (await tx.project.count({ where: { ownerUserId: userId } })) > 0 ||
      (await tx.feedback.count({ where: { userId } })) > 0 ||
      (await tx.feedbackAction.count({ where: { takenByUserId: userId } })) > 0;
    if (referenced) {
      conflict("Delete the time entries first.");
    }

    await tx.user.delete({ where: { id: userId } });
  });
}
