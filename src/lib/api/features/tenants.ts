import { Prisma } from "@/generated/prisma/client";
import { Access } from "@/lib/api/access";
import { guard, transaction, type Db } from "@/lib/api/db";
import { conflict, forbidden, notFound, validation } from "@/lib/api/errors";
import { parseGuid } from "@/lib/api/guid";
import {
    Body,
    has,
    ids,
    limited,
    list,
    normalizeRateType,
    optional,
    optionalString,
    Optional,
    page,
    RateType,
    requireBool,
    requireDecimal,
    requireName,
    requireString,
    roundMoney,
} from "@/lib/api/json";
import { defaultEmailTemplateRows } from "@/lib/api/features/email-templates";
import { defaultVolunteerRate } from "@/lib/api/features/hourly-rates";
import { roleId } from "@/lib/api/features/memberships";
import { clockedInThemeId, themeJson, type ThemeJson } from "@/lib/api/features/themes";
import {
  defaultEmailSettings,
  isTimeEmailFrequency,
  readEmailSettings,
  type TenantEmailSettings,
} from "@/lib/email/templates";
import { isValidCronExpression } from "@/lib/external-sync/cron";
import { defaultEntityLabels, type EntityLabels } from "@/lib/labels";
import { isValidTenantSlug, reservedTenantSlugs } from "@/lib/portal";
import { isOwnedBrandBlob, isVercelBlobUrl } from "@/lib/brand";
import { prisma } from "@/lib/prisma";

export type TenantPreferences = {
  allowTimeEntryEditing: boolean;
  allowVolunteersToAddVolunteers: boolean;
  entityLabels: EntityLabels;
  feedbackNotifyUserIds: string[];
  emailSettings: TenantEmailSettings;
  portalOrigin: string | null;
  portalDirectoryCron: string | null;
  portalSignIn: boolean;
  portalDirectorySync: boolean;
};

const emptyExternalPrefs = {
  portalOrigin: null as string | null,
  portalDirectoryCron: null as string | null,
  portalSignIn: false,
  portalDirectorySync: false,
};

const themeInclude = { theme: true } as const;

function labelValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function readNullableHttpsUrl(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function readNullableCron(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return isValidCronExpression(trimmed) ? trimmed : null;
}

export function readPreferences(value: Prisma.JsonValue | null | undefined): TenantPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      allowTimeEntryEditing: false,
      allowVolunteersToAddVolunteers: false,
      entityLabels: defaultEntityLabels,
      feedbackNotifyUserIds: [],
      emailSettings: { ...defaultEmailSettings },
      ...emptyExternalPrefs,
    };
  }

  const record = value as Record<string, unknown>;
  const labels = record.entityLabels;
  const source = labels && typeof labels === "object" && !Array.isArray(labels) ? (labels as Record<string, unknown>) : {};
  const portalOrigin = readNullableHttpsUrl(record.portalOrigin);
  return {
    allowTimeEntryEditing: record.allowTimeEntryEditing === true,
    allowVolunteersToAddVolunteers: record.allowVolunteersToAddVolunteers === true,
    entityLabels: {
      tenant: labelValue(source.tenant ?? source.organization, defaultEntityLabels.tenant),
      project: labelValue(source.project, defaultEntityLabels.project),
      organization: labelValue(source.organization ?? source.department, defaultEntityLabels.organization),
      taskCategory: labelValue(source.taskCategory, defaultEntityLabels.taskCategory),
    },
    feedbackNotifyUserIds: readNotifyUserIds(record.feedbackNotifyUserIds),
    emailSettings: readEmailSettings(record.emailSettings),
    portalOrigin,
    portalDirectoryCron: portalOrigin ? readNullableCron(record.portalDirectoryCron) : null,
    portalSignIn: record.portalSignIn === true,
    portalDirectorySync: record.portalDirectorySync === true,
  };
}

export function portalDirectorySyncEnabled(preferences: TenantPreferences) {
  return preferences.portalDirectorySync && preferences.portalOrigin !== null;
}

export function portalSignInEnabled(preferences: TenantPreferences) {
  return preferences.portalSignIn && preferences.portalOrigin !== null;
}

function readNotifyUserIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? parseGuid(item) : null))
    .filter((item): item is string => item !== null);
}

function preferenceRecord(value: Prisma.JsonValue | null | undefined): Record<string, Prisma.InputJsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return { ...(value as Record<string, Prisma.InputJsonValue>) };
}

function parseEntityLabels(value: unknown): EntityLabels {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    validation("entityLabels must be an object.");
  }

  const body = value as Body;
  const read = (key: keyof EntityLabels) => {
    const text = requireString(body, key).trim();
    if (text.length < 1 || text.length > 40) {
      validation(`${key} must be 1 to 40 characters.`);
    }

    return text;
  };

  return {
    tenant: has(body, "tenant") ? read("tenant") : has(body, "organization") ? requireString(body, "organization").trim() : defaultEntityLabels.tenant,
    project: read("project"),
    organization: has(body, "organization")
      ? read("organization")
      : has(body, "department")
        ? requireString(body, "department").trim()
        : defaultEntityLabels.organization,
    taskCategory: read("taskCategory"),
  };
}

export function parseEmailSettings(value: unknown): TenantEmailSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    validation("emailSettings must be an object.");
  }

  const body = value as Body;
  const readFreq = (key: "LoggedTime" | "UnclassifiedEntry") => {
    if (!has(body, key)) return defaultEmailSettings[key];
    const freq = body[key];
    if (!isTimeEmailFrequency(freq)) {
      validation(`${key} must be immediate, weekly, or off.`);
    }
    return freq;
  };

  const settings: TenantEmailSettings = {
    LoggedTime: readFreq("LoggedTime"),
    UnclassifiedEntry: readFreq("UnclassifiedEntry"),
    FeedbackReceived: has(body, "FeedbackReceived") ? requireBool(body, "FeedbackReceived") : defaultEmailSettings.FeedbackReceived,
    FeedbackNotify: has(body, "FeedbackNotify") ? requireBool(body, "FeedbackNotify") : defaultEmailSettings.FeedbackNotify,
    FeedbackCompleted: has(body, "FeedbackCompleted") ? requireBool(body, "FeedbackCompleted") : defaultEmailSettings.FeedbackCompleted,
    AccessRequestReceived: has(body, "AccessRequestReceived")
      ? requireBool(body, "AccessRequestReceived")
      : defaultEmailSettings.AccessRequestReceived,
    AccessRequestDecided: has(body, "AccessRequestDecided")
      ? requireBool(body, "AccessRequestDecided")
      : defaultEmailSettings.AccessRequestDecided,
    NeedSubmitted: has(body, "NeedSubmitted") ? requireBool(body, "NeedSubmitted") : defaultEmailSettings.NeedSubmitted,
    NeedDecided: has(body, "NeedDecided") ? requireBool(body, "NeedDecided") : defaultEmailSettings.NeedDecided,
    VolunteerMessage: has(body, "VolunteerMessage")
      ? requireBool(body, "VolunteerMessage")
      : defaultEmailSettings.VolunteerMessage,
  };
  return settings;
}

function parseHttpsUrlOrNull(body: Body, key: string): string | null {
  if (!has(body, key) || body[key] === null || body[key] === "") {
    return null;
  }

  const value = requireString(body, key).trim();
  if (value.length > 2000) {
    validation(`${key} must be a URL.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    validation(`${key} must be a valid URL.`);
  }
  if (parsed.protocol !== "https:") {
    validation(`${key} must be an https URL.`);
  }

  return parsed.toString();
}

function parseCronOrNull(body: Body, key: string, requiresUrl: string | null): string | null {
  if (!has(body, key) || body[key] === null || body[key] === "") {
    return null;
  }

  const value = requireString(body, key).trim();
  if (!requiresUrl) {
    validation(`${key} requires the corresponding management URL to be set.`);
  }
  if (!isValidCronExpression(value)) {
    validation(`${key} must be a valid 5-field cron expression.`);
  }

  return value;
}

function parsePreferences(value: unknown): TenantPreferences {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    validation("preferences must be an object.");
  }

  const body = value as Body;
  const portalOrigin = has(body, "portalOrigin") ? parseHttpsUrlOrNull(body, "portalOrigin") : null;
  return {
    allowTimeEntryEditing: requireBool(body, "allowTimeEntryEditing"),
    allowVolunteersToAddVolunteers: has(body, "allowVolunteersToAddVolunteers")
      ? requireBool(body, "allowVolunteersToAddVolunteers")
      : false,
    entityLabels: has(body, "entityLabels") ? parseEntityLabels(body.entityLabels) : defaultEntityLabels,
    feedbackNotifyUserIds: has(body, "feedbackNotifyUserIds")
      ? [...new Set(ids(body, "feedbackNotifyUserIds", false))]
      : [],
    emailSettings: has(body, "emailSettings") ? parseEmailSettings(body.emailSettings) : { ...defaultEmailSettings },
    portalOrigin,
    portalDirectoryCron: has(body, "portalDirectoryCron")
      ? parseCronOrNull(body, "portalDirectoryCron", portalOrigin)
      : null,
    portalSignIn: has(body, "portalSignIn") ? requireBool(body, "portalSignIn") : false,
    portalDirectorySync: has(body, "portalDirectorySync") ? requireBool(body, "portalDirectorySync") : false,
  };
}

function brandUrl(body: Body, key: string) {
  if (!has(body, key) || body[key] === null) {
    return null;
  }

  const value = requireString(body, key);
  if (value.length > 2000) {
    validation(`${key} must be a URL.`);
  }

  return value;
}

export function parseTenantSlug(body: Body, key: string): string | null {
  const value = optionalString(body, key);
  if (value === null || value === undefined || value.trim().length === 0) {
    return null;
  }

  const slug = value.trim().toLowerCase();
  if (reservedTenantSlugs.has(slug)) {
    validation("slug is reserved.");
  }
  if (!isValidTenantSlug(slug)) {
    validation("slug must be 1 to 63 lowercase letters, digits, or hyphens, and cannot start or end with a hyphen.");
  }

  return slug;
}

export function tenantJson(
  tenant: {
    id: string;
    name: string;
    slug?: string | null;
    defaultRateType: string;
    preferences?: Prisma.JsonValue | null;
    themeId: string;
    theme: Parameters<typeof themeJson>[0];
    wordmarkUrl: string | null;
    wordmarkOnLightUrl: string | null;
    markUrl: string | null;
    accentImageUrl: string | null;
    description: string | null;
    websiteUrl: string | null;
    publicSlug?: string | null;
    portalClientId?: string | null;
    portalClientSecretEnc?: string | null;
    portalApiTokenEnc?: string | null;
    portalWebhookSecretEnc?: string | null;
    portalLastPulledAt?: Date | null;
  },
  volunteerHourlyRate: number,
) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug ? tenant.slug.toLowerCase() : null,
    volunteerHourlyRate,
    defaultRateType: tenant.defaultRateType,
    preferences: readPreferences(tenant.preferences),
    themeId: tenant.themeId,
    theme: themeJson(tenant.theme),
    wordmarkUrl: tenant.wordmarkUrl,
    wordmarkOnLightUrl: tenant.wordmarkOnLightUrl,
    markUrl: tenant.markUrl,
    accentImageUrl: tenant.accentImageUrl,
    description: tenant.description,
    websiteUrl: tenant.websiteUrl,
    publicSlug: tenant.publicSlug ?? null,
    portal: {
      clientId: tenant.portalClientId ?? null,
      clientSecretSet: Boolean(tenant.portalClientSecretEnc),
      apiTokenSet: Boolean(tenant.portalApiTokenEnc),
      webhookSecretSet: Boolean(tenant.portalWebhookSecretEnc),
      lastPulledAt: tenant.portalLastPulledAt?.toISOString() ?? null,
    },
  };
}

export type NameRequest = { name: string };

export function parseName(body: Body): NameRequest {
  return { name: requireName(requireString(body, "name")) };
}

export type UpdateTenantRequest = {
  name: Optional<string>;
  slug: Optional<string | null>;
  volunteerHourlyRate: Optional<number>;
  defaultRateType: Optional<RateType>;
  preferences: Optional<TenantPreferences>;
  themeId: Optional<string>;
  wordmarkUrl: Optional<string | null>;
  wordmarkOnLightUrl: Optional<string | null>;
  markUrl: Optional<string | null>;
  accentImageUrl: Optional<string | null>;
  description: Optional<string | null>;
  websiteUrl: Optional<string | null>;
  publicSlug: Optional<string | null>;
};

export function parseUpdateTenant(body: Body): UpdateTenantRequest {
  const request: UpdateTenantRequest = {
    name: optional(body, "name", (b, k) => requireName(requireString(b, k))),
    slug: optional(body, "slug", parseTenantSlug),
    volunteerHourlyRate: optional(body, "volunteerHourlyRate", (b, k) => {
      const rate = requireDecimal(b, k);
      if (rate <= 0) {
        validation("volunteerHourlyRate must be greater than zero.");
      }

      return roundMoney(rate);
    }),
    defaultRateType: optional(body, "defaultRateType", (b, k) => normalizeRateType(requireString(b, k))),
    preferences: optional(body, "preferences", (b, k) => parsePreferences(b[k])),
    themeId: optional(body, "themeId", (b, k) => requireString(b, k)),
    wordmarkUrl: optional(body, "wordmarkUrl", brandUrl),
    wordmarkOnLightUrl: optional(body, "wordmarkOnLightUrl", brandUrl),
    markUrl: optional(body, "markUrl", brandUrl),
    accentImageUrl: optional(body, "accentImageUrl", brandUrl),
    description: optional(body, "description", (b, k) => limited(b, k, 8000, "description must be 8000 characters or fewer.")),
    websiteUrl: optional(body, "websiteUrl", (b, k) => limited(b, k, 2000, "websiteUrl must be a URL.")),
    publicSlug: optional(body, "publicSlug", (b, k) => {
      const value = optionalString(b, k);
      if (!value) return null;
      const slug = value.trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{1,47}$/.test(slug)) {
        validation("publicSlug must be 2 to 48 letters, numbers, or hyphens.");
      }
      return slug;
    }),
  };
  if (
    !request.name.set &&
    !request.slug.set &&
    !request.volunteerHourlyRate.set &&
    !request.defaultRateType.set &&
    !request.preferences.set &&
    !request.themeId.set &&
    !request.wordmarkUrl.set &&
    !request.wordmarkOnLightUrl.set &&
    !request.markUrl.set &&
    !request.accentImageUrl.set &&
    !request.description.set &&
    !request.websiteUrl.set &&
    !request.publicSlug.set
  ) {
    validation("Provide at least one field to update.");
  }

  return request;
}

export async function createTenant(access: Access, request: NameRequest) {
  const caller = access.requireHuman();
  if (access.tenantSlug) {
    await access.pinnedTenant();
    forbidden();
  }

  const adminRoleId = await roleId("ADMIN");
  const tenant = await guard(
    prisma.tenant.create({
      data: {
        name: request.name,
        defaultRateType: "Volunteer",
        theme: { connect: { id: clockedInThemeId } },
        hourlyRates: { create: { type: "Volunteer", name: "Volunteer", perHourRate: 35.47, isDefault: true } },
        emailTemplates: { create: defaultEmailTemplateRows().map((row) => ({ id: crypto.randomUUID(), ...row })) },
        memberships: {
          create: { userId: caller.id, roleId: adminRoleId, rateType: "Volunteer", isActive: true },
        },
      },
      include: themeInclude,
    }),
  );
  return tenantJson(tenant, 35.47);
}

export async function listTenants(access: Access, params: URLSearchParams) {
  const paging = page(params);
  const pinned = await access.pinnedTenant();
  let where: Prisma.TenantWhereInput;
  if (pinned) {
    if (access.isApiKey) {
      const allowed = await access.activeTenantIds();
      where = { id: { in: allowed.filter((id) => id === pinned.id) } };
    } else {
      where = {
        id: pinned.id,
        memberships: { some: { userId: access.actorUserId, isActive: true } },
      };
    }
  } else if (access.isApiKey) {
    where = { id: { in: await access.activeTenantIds() } };
  } else if (access.isSuperAdmin) {
    where = {};
  } else {
    where = { memberships: { some: { userId: access.actorUserId, isActive: true } } };
  }

  const tenants = await prisma.tenant.findMany({
    where,
    include: { ...themeInclude, hourlyRates: { where: { isDefault: true }, take: 1 } },
    orderBy: { name: "asc" },
    skip: paging.offset,
    take: paging.limit,
  });
  return list(
    tenants.map((tenant) =>
      tenantJson(tenant, Number(tenant.hourlyRates[0]?.perHourRate ?? 35.47)),
    ),
    paging,
  );
}

export async function getTenant(access: Access, tenantId: string) {
  const tenant = await access.requireTenant(tenantId, false);
  return tenantJson(tenant, (await defaultVolunteerRate(tenantId)).rate);
}

export async function updateTenant(access: Access, tenantId: string, request: UpdateTenantRequest) {
  await access.requireTenantAdmin(tenantId);
  for (const [key, change] of [
    ["markUrl", request.markUrl],
    ["wordmarkUrl", request.wordmarkUrl],
    ["wordmarkOnLightUrl", request.wordmarkOnLightUrl],
  ] as const) {
    if (change.set && change.value && isVercelBlobUrl(change.value) && !isOwnedBrandBlob(tenantId, change.value)) {
      validation(`${key} must be an image uploaded for this tenant.`);
    }
  }
  if (request.slug.set && access.tenantSlug) {
    forbidden();
  }

  const tenant = await transaction(async (tx) => {
    const current = await tx.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { preferences: true },
    });
    const currentPrefs = readPreferences(current.preferences);
    if (
      portalDirectorySyncEnabled(currentPrefs) &&
      (request.name.set || request.description.set || request.websiteUrl.set)
    ) {
      validation("Tenant details are managed by an external system for this tenant.");
    }
    if (request.themeId.set) {
      const theme = await tx.theme.findFirst({
        where: { id: request.themeId.value, OR: [{ tenantId: null }, { tenantId }] },
      });
      if (!theme) {
        notFound();
      }
    }

    if (request.preferences.set) {
      await assertNotifyUsers(tx, tenantId, request.preferences.value.feedbackNotifyUserIds);
    }

    const nextPreferences = request.preferences.set
      ? {
          ...preferenceRecord(current.preferences),
          allowTimeEntryEditing: request.preferences.value.allowTimeEntryEditing,
          allowVolunteersToAddVolunteers: request.preferences.value.allowVolunteersToAddVolunteers,
          entityLabels: request.preferences.value.entityLabels,
          feedbackNotifyUserIds: request.preferences.value.feedbackNotifyUserIds,
          emailSettings: request.preferences.value.emailSettings,
          portalOrigin: request.preferences.value.portalOrigin,
          portalDirectoryCron: request.preferences.value.portalOrigin
            ? request.preferences.value.portalDirectoryCron
            : null,
          portalSignIn: request.preferences.value.portalSignIn,
          portalDirectorySync: request.preferences.value.portalDirectorySync,
        }
      : undefined;
    await tx.tenant.update({
      where: { id: tenantId },
      data: {
        name: request.name.set ? request.name.value : undefined,
        slug: request.slug.set ? request.slug.value : undefined,
        defaultRateType: request.defaultRateType.set ? request.defaultRateType.value : undefined,
        themeId: request.themeId.set ? request.themeId.value : undefined,
        wordmarkUrl: request.wordmarkUrl.set ? request.wordmarkUrl.value : undefined,
        wordmarkOnLightUrl: request.wordmarkOnLightUrl.set ? request.wordmarkOnLightUrl.value : undefined,
        markUrl: request.markUrl.set ? request.markUrl.value : undefined,
        accentImageUrl: request.accentImageUrl.set ? request.accentImageUrl.value : undefined,
        description: request.description.set ? request.description.value : undefined,
        websiteUrl: request.websiteUrl.set ? request.websiteUrl.value : undefined,
        publicSlug: request.publicSlug.set ? request.publicSlug.value : undefined,
        preferences: nextPreferences,
      },
    });
    if (request.volunteerHourlyRate.set) {
      const updated = await tx.hourlyRate.updateMany({
        where: { tenantId, isDefault: true },
        data: { perHourRate: request.volunteerHourlyRate.value },
      });
      if (updated.count === 0) {
        await tx.hourlyRate.create({
          data: {
            tenantId,
            type: "Volunteer",
            name: "Volunteer",
            perHourRate: request.volunteerHourlyRate.value,
            isDefault: true,
          },
        });
      }
    }

    return tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, include: themeInclude });
  });
  return tenantJson(tenant, (await defaultVolunteerRate(tenantId)).rate);
}

async function assertNotifyUsers(db: Db, tenantId: string, userIds: string[]) {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) {
    return;
  }

  const active = await db.tenantMembership.count({
    where: { tenantId, isActive: true, userId: { in: unique } },
  });
  if (active !== unique.length) {
    validation("feedbackNotifyUserIds must be active users in this tenant.");
  }
}

export async function deleteTenant(access: Access, tenantId: string) {
  access.requireHuman();
  await access.requireTenantAdmin(tenantId);
  const referenced =
    (await prisma.userTimeEntry.count({ where: { tenantId } })) > 0 ||
    (await prisma.collectiveTimeEntry.count({ where: { tenantId } })) > 0;
  if (referenced) {
    conflict("Delete the time entries first.");
  }

  await guard(prisma.tenant.delete({ where: { id: tenantId } }));
}

export type { ThemeJson };
