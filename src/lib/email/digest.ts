import { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api/errors";
import { hoursFromMinutes } from "@/lib/api/json";
import { sendEmail } from "@/lib/api/mail";
import { appUrl } from "@/lib/api/security";
import { prisma } from "@/lib/prisma";

export type DigestKind = "LoggedTime" | "UnclassifiedEntry";

export type DigestStamp = {
  LoggedTime?: string;
  UnclassifiedEntry?: string;
};

const weekMs = 7 * 24 * 60 * 60 * 1000;

/** Monday of the UTC week containing `now`, as YYYY-MM-DD. */
export function digestWeekKey(now = new Date()) {
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  utc.setUTCDate(utc.getUTCDate() - ((utc.getUTCDay() + 6) % 7));
  return utc.toISOString().slice(0, 10);
}

export function digestWindow(now = new Date()) {
  return { from: new Date(now.getTime() - weekMs), to: now };
}

export function readDigestStamp(preferences: unknown): DigestStamp {
  if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) {
    return {};
  }

  const digest = (preferences as Record<string, unknown>).emailDigest;
  if (!digest || typeof digest !== "object" || Array.isArray(digest)) {
    return {};
  }

  const record = digest as Record<string, unknown>;
  const stamp: DigestStamp = {};
  if (typeof record.LoggedTime === "string") stamp.LoggedTime = record.LoggedTime;
  if (typeof record.UnclassifiedEntry === "string") stamp.UnclassifiedEntry = record.UnclassifiedEntry;
  return stamp;
}

export function digestAlreadySent(stamp: DigestStamp, kind: DigestKind, weekKey: string) {
  return stamp[kind] === weekKey;
}

/** weekly sends once per week key. immediate and off are not digest work. */
export function digestAction(
  frequency: unknown,
  stamp: DigestStamp,
  kind: DigestKind,
  weekKey: string,
): "send" | "skip" | "ignore" {
  if (frequency !== "weekly") return "ignore";
  return digestAlreadySent(stamp, kind, weekKey) ? "skip" : "send";
}

function preferenceRecord(value: Prisma.JsonValue | null): Record<string, Prisma.InputJsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return { ...(value as Record<string, Prisma.InputJsonValue>) };
}

function dateLabel(from: Date, to: Date) {
  const format = (date: Date) =>
    date.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const start = format(from);
  const end = format(to);
  return start === end ? start : `${start} – ${end}`;
}

function emailNotConfigured(error: unknown) {
  return error instanceof ApiError && error.code === "email_failed" && error.message === "Email is not configured.";
}

async function remember(tenantId: string, preferences: Prisma.JsonValue | null, kind: DigestKind, weekKey: string) {
  const current = readDigestStamp(preferences);
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      preferences: {
        ...preferenceRecord(preferences),
        emailDigest: { ...current, [kind]: weekKey },
      },
    },
  });
}

export async function sendWeeklyDigests(now = new Date()) {
  const weekKey = digestWeekKey(now);
  const window = digestWindow(now);
  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true, slug: true, preferences: true },
  });
  let sent = 0;
  let skipped = 0;

  for (const tenant of tenants) {
    const preferences =
      tenant.preferences && typeof tenant.preferences === "object" && !Array.isArray(tenant.preferences)
        ? (tenant.preferences as Record<string, unknown>)
        : {};
    const settings =
      preferences.emailSettings && typeof preferences.emailSettings === "object" && !Array.isArray(preferences.emailSettings)
        ? (preferences.emailSettings as Record<string, unknown>)
        : {};
    const stamp = readDigestStamp(tenant.preferences);

    const logged = digestAction(settings.LoggedTime, stamp, "LoggedTime", weekKey);
    if (logged === "send") {
      const outcome = await sendLoggedTimeDigest(tenant, window);
      if (outcome === "unconfigured") {
        return { weekKey, sent, skipped, emailConfigured: false };
      }
      sent += outcome;
      await remember(tenant.id, tenant.preferences, "LoggedTime", weekKey);
      tenant.preferences = {
        ...preferenceRecord(tenant.preferences),
        emailDigest: { ...stamp, LoggedTime: weekKey },
      };
    } else if (logged === "skip") {
      skipped += 1;
    }

    const latestStamp = readDigestStamp(tenant.preferences);
    const unclassified = digestAction(settings.UnclassifiedEntry, latestStamp, "UnclassifiedEntry", weekKey);
    if (unclassified === "send") {
      const outcome = await sendUnclassifiedDigest(tenant);
      if (outcome === "unconfigured") {
        return { weekKey, sent, skipped, emailConfigured: false };
      }
      sent += outcome;
      await remember(tenant.id, tenant.preferences, "UnclassifiedEntry", weekKey);
    } else if (unclassified === "skip") {
      skipped += 1;
    }
  }

  return { weekKey, sent, skipped, emailConfigured: true };
}

async function sendLoggedTimeDigest(
  tenant: { id: string; name: string; slug: string | null },
  window: { from: Date; to: Date },
) {
  const entries = await prisma.userTimeEntry.findMany({
    where: {
      tenantId: tenant.id,
      durationMinutes: { not: null },
      createdAt: { gte: window.from, lt: window.to },
      NOT: { projectId: null, taskCategoryId: null, organizationId: null },
    },
    select: {
      userId: true,
      durationMinutes: true,
      occurredOn: true,
      user: { select: { email: true, profile: { select: { firstName: true } } } },
    },
  });
  const byUser = new Map<string, { email: string; firstName: string; minutes: number; dates: Date[] }>();
  for (const entry of entries) {
    if (!entry.user.email || entry.durationMinutes === null) continue;
    const current = byUser.get(entry.userId) ?? {
      email: entry.user.email,
      firstName: entry.user.profile?.firstName || "there",
      minutes: 0,
      dates: [],
    };
    current.minutes += entry.durationMinutes;
    current.dates.push(entry.occurredOn);
    byUser.set(entry.userId, current);
  }

  let sent = 0;
  for (const person of byUser.values()) {
    if (person.minutes <= 0) continue;
    person.dates.sort((left, right) => left.getTime() - right.getTime());
    try {
      await sendEmail({
        to: person.email,
        tenantId: tenant.id,
        for: "LoggedTime",
        ignoreSchedule: true,
        context: {
          user: { firstName: person.firstName },
          tenant: { name: tenant.name },
          entry: {
            hours: String(hoursFromMinutes(person.minutes)),
            date: dateLabel(person.dates[0], person.dates[person.dates.length - 1]),
            url: appUrl("/entries", tenant.slug),
          },
        },
      });
      sent += 1;
    } catch (error) {
      if (emailNotConfigured(error)) return "unconfigured" as const;
    }
  }

  return sent;
}

async function sendUnclassifiedDigest(tenant: { id: string; slug: string | null }) {
  const entries = await prisma.userTimeEntry.findMany({
    where: {
      tenantId: tenant.id,
      mode: "Punch",
      endedAt: { not: null },
      projectId: null,
      taskCategoryId: null,
      organizationId: null,
    },
    select: { userId: true, user: { select: { email: true, profile: { select: { firstName: true } } } } },
    distinct: ["userId"],
  });
  let sent = 0;
  for (const entry of entries) {
    if (!entry.user.email) continue;
    try {
      await sendEmail({
        to: entry.user.email,
        tenantId: tenant.id,
        for: "UnclassifiedEntry",
        ignoreSchedule: true,
        context: {
          user: { firstName: entry.user.profile?.firstName || "there" },
          entry: { url: appUrl("/entries?unclassified=1", tenant.slug) },
        },
      });
      sent += 1;
    } catch (error) {
      if (emailNotConfigured(error)) return "unconfigured" as const;
    }
  }

  return sent;
}
