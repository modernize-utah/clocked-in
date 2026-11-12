import { isIP } from "node:net";
import { ApiError } from "@/lib/api/errors";
import { hashCode } from "@/lib/api/security";
import { prisma } from "@/lib/prisma";

export type RateLimitRule = { key: string; limit: number; windowMs: number };

export const minute = 60 * 1000;

/**
 * The caller's public IP. On Vercel, x-forwarded-for is set by the platform, not the client.
 * Loopback and private addresses return null, so local runs and tests are not limited by IP.
 */
export function clientIp(headers: Pick<Headers, "get">) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || "";
  const ip = forwarded.replace(/^::ffff:/, "");
  if (!isIP(ip) || isPrivate(ip)) {
    return null;
  }
  return ip;
}

function isPrivate(ip: string) {
  return (
    ip === "::1" ||
    /^127\./.test(ip) ||
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^f[cd][0-9a-f]{2}:/i.test(ip) ||
    /^fe80:/i.test(ip)
  );
}

function tooMany(): never {
  throw new ApiError(429, "rate_limited", "Too many attempts. Wait a few minutes and try again.");
}

function storedKey(key: string) {
  return hashCode(`rate:${key}`);
}

/** Counts one attempt and fails once the window holds more than the limit. */
export async function consumeRateLimit(rule: RateLimitRule) {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "windowStart", "count")
    VALUES (${storedKey(rule.key)}, now(), 1)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowStart" <= now() - ${rule.windowMs} * interval '1 millisecond'
        THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimit"."windowStart" <= now() - ${rule.windowMs} * interval '1 millisecond'
        THEN now() ELSE "RateLimit"."windowStart" END
    RETURNING "count"`;
  if (Math.random() < 0.01) {
    await prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "windowStart" < now() - interval '1 day'`;
  }
  if ((rows[0]?.count ?? 0) > rule.limit) {
    tooMany();
  }
}

/** Fails while a rule's window already holds its limit, without counting this attempt. */
export async function assertUnderRateLimit(rule: RateLimitRule) {
  const row = await prisma.rateLimit.findUnique({ where: { key: storedKey(rule.key) } });
  if (row && row.count >= rule.limit && row.windowStart.getTime() > Date.now() - rule.windowMs) {
    tooMany();
  }
}

/** Counts a failure against a rule without failing this request. */
export async function recordRateLimitFailure(rule: RateLimitRule) {
  try {
    await consumeRateLimit({ ...rule, limit: Number.MAX_SAFE_INTEGER });
  } catch {
    // The request already failed for its own reason; a counter error must not replace it.
  }
}
