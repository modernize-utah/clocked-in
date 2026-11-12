import { Access, Account, accountInclude } from "@/lib/api/access";
import { Db, guard, transaction } from "@/lib/api/db";
import { ApiError, forbidden, notFound, unauthorized, validation } from "@/lib/api/errors";
import {
  assertTimezone,
  Body,
  has,
  limited,
  normalizeEmail,
  normalizePassword,
  normalizeUsername,
  optionalString,
  personName,
  requireString,
} from "@/lib/api/json";
import { sendEmail } from "@/lib/api/mail";
import { linkGuest } from "@/lib/api/features/volunteer-needs";
import {
  assertUnderRateLimit,
  consumeRateLimit,
  minute,
  recordRateLimitFailure,
  type RateLimitRule,
} from "@/lib/api/rate-limit";
import { prisma } from "@/lib/prisma";
import {
  allocateNumericCode,
  appUrl,
  hashCode,
  hashPassword,
  randomCode,
  refreshReuseMs,
  refreshTokenMs,
  resetCodeMs,
  resetCooldownMs,
  signAccessToken,
  verifyDummy,
  verifyPassword,
} from "@/lib/api/security";
import { userJson } from "@/lib/api/features/users";

export type SignUpRequest = {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  timezone: string;
  phone: string | null;
};

export function parseSignUp(body: Body): SignUpRequest {
  const username = normalizeUsername(requireString(body, "username"));
  const email = normalizeEmail(requireString(body, "email"));
  const password = normalizePassword(requireString(body, "password"));
  const firstName = personName(requireString(body, "firstName"), "firstName");
  const lastName = personName(requireString(body, "lastName"), "lastName");
  const displayName = has(body, "displayName") ? limited(body, "displayName", 100, "displayName is required.") : null;
  let timezone = "UTC";
  const zone = optionalString(body, "timezone");
  if (zone && zone.trim()) {
    timezone = zone.trim();
    assertTimezone(timezone);
  }

  const phone = has(body, "phone") ? limited(body, "phone", 40, "phone is required.") : null;
  return { username, email, password, firstName, lastName, displayName, timezone, phone };
}

export type LogInRequest = { username: string; password: string };

export function parseLogIn(body: Body): LogInRequest {
  return {
    username: normalizeUsername(requireString(body, "username")),
    password: requireString(body, "password"),
  };
}

export type RefreshTokenRequest = { refreshToken: string };

export function parseRefreshToken(body: Body): RefreshTokenRequest {
  return { refreshToken: requireString(body, "refreshToken") };
}

export type ConfirmPasswordResetRequest = { email: string; code: string; password: string };

export function parseConfirmPasswordReset(body: Body): ConfirmPasswordResetRequest {
  return {
    email: normalizeEmail(requireString(body, "email")),
    code: requireString(body, "code"),
    password: normalizePassword(requireString(body, "password")),
  };
}

async function issueSession(user: Account, db: Db = prisma) {
  const { accessToken, expiresAt } = await signAccessToken(user);
  const refreshToken = randomCode();
  await db.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashCode(refreshToken),
      expiresAt: new Date(Date.now() + refreshTokenMs),
    },
  });
  return { accessToken, refreshToken, expiresAt: expiresAt.toISOString(), user: userJson(user) };
}

/** The caller's public IP, when known, for rate limits. */
export type ClientContext = { ip?: string | null };

/** Wrong guesses allowed on one reset code before it stops working. */
export const maxResetAttempts = 5;

export async function signUp(
  request: SignUpRequest,
  options?: { invitationEmail?: string; tenantSlug?: string | null } & ClientContext,
) {
  if (options?.ip) {
    await consumeRateLimit({ key: `signup:ip:${options.ip}`, limit: 20, windowMs: 60 * minute });
  }

  const invitationEmail = options?.invitationEmail;
  if (invitationEmail && invitationEmail !== request.email) {
    validation("Use the email address the invitation was sent to.");
  }

  const tenantSlug = options?.tenantSlug?.trim().toLowerCase() || null;
  if (tenantSlug && !invitationEmail) {
    const pinned = await prisma.organization.findFirst({ where: { slug: tenantSlug }, select: { id: true } });
    if (!pinned) {
      notFound();
    }
    forbidden();
  }

  const user = await guard(
    prisma.user.create({
      data: {
        username: request.username,
        email: request.email,
        passwordHash: await hashPassword(request.password),
        profile: {
          create: {
            firstName: request.firstName,
            lastName: request.lastName,
            displayName: request.displayName,
            timezone: request.timezone,
            phone: request.phone,
          },
        },
      },
      include: accountInclude,
    }),
  );
  await linkGuest(prisma, user.email, user.id);
  return issueSession(user);
}

export async function logIn(request: LogInRequest, options?: ClientContext) {
  const rules: RateLimitRule[] = [{ key: `login:user:${request.username}`, limit: 10, windowMs: 15 * minute }];
  if (options?.ip) {
    rules.push({ key: `login:ip:${options.ip}`, limit: 50, windowMs: 15 * minute });
  }
  for (const rule of rules) {
    await assertUnderRateLimit(rule);
  }

  const user = await prisma.user.findUnique({ where: { username: request.username }, include: accountInclude });
  if (!user) {
    await verifyDummy(request.password);
  }

  if (!user || !(await verifyPassword(request.password, user.passwordHash))) {
    for (const rule of rules) {
      await recordRateLimitFailure(rule);
    }
    unauthorized("The username or password is incorrect.");
  }

  return issueSession(user);
}

export async function refresh(request: RefreshTokenRequest) {
  const tokenHash = hashCode(request.refreshToken);
  return transaction(async (tx) => {
    const now = new Date();
    const claimed = await tx.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });
    const token = await tx.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: accountInclude } },
    });
    if (!token || token.expiresAt <= now) {
      unauthorized();
    }

    const rotatedRecently =
      token.revokedAt !== null && now.getTime() - token.revokedAt.getTime() <= refreshReuseMs;
    if (claimed.count === 0 && !rotatedRecently) {
      unauthorized();
    }

    return issueSession(token.user, tx);
  });
}

export async function logOut(access: Access, request: RefreshTokenRequest) {
  const now = new Date();
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashCode(request.refreshToken), userId: access.caller.id, expiresAt: { gt: now } },
    data: { revokedAt: now, expiresAt: now },
  });
  return { ok: true };
}

/**
 * A reset uses an organization's template and host only when the person is an active member,
 * because that organization's admins edit the template that carries the reset code.
 */
async function resetOrganization(userId: string, tenantSlug?: string | null) {
  if (tenantSlug) {
    const pinned = await prisma.organization.findFirst({
      where: { slug: tenantSlug, memberships: { some: { userId, isActive: true } } },
      select: { id: true, slug: true },
    });
    if (pinned) {
      return pinned;
    }
  }

  const memberships = await prisma.organizationMembership.findMany({
    where: { userId, isActive: true },
    select: { organization: { select: { id: true, slug: true } } },
    distinct: ["organizationId"],
    take: 2,
  });
  return memberships.length === 1 ? memberships[0].organization : null;
}

export async function requestPasswordReset(
  emailValue: string | null,
  options?: { tenantSlug?: string | null } & ClientContext,
) {
  if (!emailValue?.trim()) {
    validation("email is required.");
  }

  if (options?.ip) {
    await consumeRateLimit({ key: `reset-request:ip:${options.ip}`, limit: 20, windowMs: 60 * minute });
  }

  let email: string;
  try {
    email = normalizeEmail(emailValue);
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: true };
    }

    throw error;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { ok: true };
  }

  const latest = await prisma.passwordResetCode.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (latest && Date.now() - latest.createdAt.getTime() < resetCooldownMs) {
    return { ok: true };
  }

  const code = await allocateNumericCode(async (codeHash) => {
    const existing = await prisma.passwordResetCode.findUnique({ where: { codeHash }, select: { id: true } });
    return existing !== null;
  });
  const created = await prisma.passwordResetCode.create({
    data: { userId: user.id, codeHash: hashCode(code), expiresAt: new Date(Date.now() + resetCodeMs) },
  });
  try {
    const org = await resetOrganization(user.id, options?.tenantSlug?.trim().toLowerCase() || null);
    await sendEmail({
      to: email,
      organizationId: org?.id ?? null,
      for: "PasswordReset",
      context: { reset: { code, url: appUrl(`/forgot-password?code=${encodeURIComponent(code)}`, org?.slug) } },
    });
  } catch (error) {
    await prisma.passwordResetCode.delete({ where: { id: created.id } });
    throw error;
  }

  await prisma.passwordResetCode.updateMany({
    where: { userId: user.id, usedAt: null, id: { not: created.id } },
    data: { usedAt: new Date() },
  });
  return { ok: true };
}

/** A wrong guess counts against every active code for that person, and retires codes that reach the limit. */
async function countWrongResetCode(userId: string, now: Date) {
  await prisma.passwordResetCode.updateMany({
    where: { userId, usedAt: null, expiresAt: { gt: now } },
    data: { failedAttempts: { increment: 1 } },
  });
  await prisma.passwordResetCode.updateMany({
    where: { userId, usedAt: null, failedAttempts: { gte: maxResetAttempts } },
    data: { usedAt: now },
  });
}

export async function confirmPasswordReset(request: ConfirmPasswordResetRequest, options?: ClientContext) {
  const ipRule = options?.ip ? { key: `reset-confirm:ip:${options.ip}`, limit: 30, windowMs: 15 * minute } : null;
  if (ipRule) {
    await assertUnderRateLimit(ipRule);
  }

  const now = new Date();
  const user = await prisma.user.findUnique({ where: { email: request.email } });
  const reset = user
    ? await prisma.passwordResetCode.findFirst({
        where: {
          userId: user.id,
          codeHash: hashCode(request.code),
          usedAt: null,
          expiresAt: { gt: now },
          failedAttempts: { lt: maxResetAttempts },
        },
      })
    : null;
  if (!user || !reset) {
    if (ipRule) {
      await recordRateLimitFailure(ipRule);
    }
    if (user) {
      await countWrongResetCode(user.id, now);
    }
    validation("The code is not valid.");
  }

  const passwordHash = await hashPassword(request.password);
  await transaction(async (tx) => {
    const now = new Date();
    await tx.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } });
    await tx.passwordResetCode.update({ where: { id: reset.id }, data: { usedAt: now } });
    await tx.refreshToken.updateMany({
      where: { userId: user.id, expiresAt: { gt: now } },
      data: { revokedAt: now, expiresAt: now },
    });
  });
  return { ok: true };
}
