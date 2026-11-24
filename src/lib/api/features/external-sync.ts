import { Access } from "@/lib/api/access";
import { guard, transaction } from "@/lib/api/db";
import { forbidden, notFound, validation } from "@/lib/api/errors";
import {
  portalDirectorySyncEnabled,
  readPreferences,
} from "@/lib/api/features/tenants";
import { decryptSecret, encryptSecret, verifySyncWebhookSignature } from "@/lib/external-sync/crypto";
import { applyPortalDirectory } from "@/lib/external-sync/portal-apply";
import {
  portalEventSchema,
  pullPortalDirectory,
  type PortalDirectorySnapshot,
} from "@/lib/external-sync/portal-client";
import { cronDueInWindow } from "@/lib/external-sync/cron";
import { prisma } from "@/lib/prisma";

async function requireTenantAdmin(access: Access, tenantId: string) {
  if (!(await access.can(tenantId, "manage_tenant"))) {
    forbidden();
  }
}

async function loadTenant(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    notFound();
  }
  return tenant;
}

export async function setPortalClientSecret(access: Access, tenantId: string, secret: string) {
  await requireTenantAdmin(access, tenantId);
  const enc = encryptSecret(secret.trim());
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { portalClientSecretEnc: enc },
  });
  return { set: true };
}

export async function setPortalApiToken(access: Access, tenantId: string, token: string) {
  await requireTenantAdmin(access, tenantId);
  const enc = encryptSecret(token.trim());
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { portalApiTokenEnc: enc },
  });
  return { set: true };
}

export async function setPortalWebhookSecret(access: Access, tenantId: string, secret: string) {
  await requireTenantAdmin(access, tenantId);
  const enc = encryptSecret(secret.trim());
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { portalWebhookSecretEnc: enc },
  });
  return { set: true };
}

export async function setPortalClientId(access: Access, tenantId: string, clientId: string) {
  await requireTenantAdmin(access, tenantId);
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { portalClientId: clientId.trim() || null },
  });
  return { clientId: clientId.trim() || null };
}

function requirePortalPullConfig(tenant: Awaited<ReturnType<typeof loadTenant>>) {
  const preferences = readPreferences(tenant.preferences);
  if (!portalDirectorySyncEnabled(preferences) || !preferences.portalOrigin) {
    validation("Portal directory sync is not enabled.");
  }
  if (!tenant.portalApiTokenEnc) {
    validation("Portal API token is not set.");
  }
  return {
    preferences,
    apiToken: decryptSecret(tenant.portalApiTokenEnc),
    origin: preferences.portalOrigin,
  };
}

export async function validatePortalDirectory(access: Access, tenantId: string) {
  await requireTenantAdmin(access, tenantId);
  const tenant = await loadTenant(tenantId);
  const { origin, apiToken } = requirePortalPullConfig(tenant);
  const snapshot = await pullPortalDirectory({ portalOrigin: origin, apiToken });
  return {
    ok: true,
    counts: {
      people: snapshot.people.length,
      organizations: snapshot.organizations.length,
      roles: snapshot.roles.length,
      memberships: snapshot.memberships.length,
      positions: snapshot.positions.length,
    },
  };
}

export async function pullPortalDirectoryForTenant(access: Access, tenantId: string) {
  await requireTenantAdmin(access, tenantId);
  return guard(() =>
    transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) {
        notFound();
      }
      const { origin, apiToken } = requirePortalPullConfig(tenant);
      const snapshot = await pullPortalDirectory({ portalOrigin: origin, apiToken });
      const applied = await applyPortalDirectory(tx, tenantId, snapshot);
      await tx.tenant.update({
        where: { id: tenantId },
        data: { portalLastPulledAt: new Date() },
      });
      return { ok: true, applied };
    }),
  );
}

/** Cron ticker: pull for each tenant whose portalDirectoryCron is due. */
export async function runPortalDirectoryCron(now = new Date()) {
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      preferences: true,
      portalApiTokenEnc: true,
      portalLastPulledAt: true,
    },
  });

  const results: { tenantId: string; ok: boolean; error?: string }[] = [];

  for (const tenant of tenants) {
    const preferences = readPreferences(tenant.preferences);
    if (
      !portalDirectorySyncEnabled(preferences) ||
      !preferences.portalOrigin ||
      !preferences.portalDirectoryCron ||
      !tenant.portalApiTokenEnc
    ) {
      continue;
    }
    if (!cronDueInWindow(preferences.portalDirectoryCron, now, tenant.portalLastPulledAt)) {
      continue;
    }
    try {
      await transaction(async (tx) => {
        const apiToken = decryptSecret(tenant.portalApiTokenEnc!);
        const snapshot = await pullPortalDirectory({
          portalOrigin: preferences.portalOrigin!,
          apiToken,
        });
        await applyPortalDirectory(tx, tenant.id, snapshot);
        await tx.tenant.update({
          where: { id: tenant.id },
          data: { portalLastPulledAt: now },
        });
      });
      results.push({ tenantId: tenant.id, ok: true });
    } catch (error) {
      results.push({
        tenantId: tenant.id,
        ok: false,
        error: error instanceof Error ? error.message : "pull failed",
      });
    }
  }

  return { ranAt: now.toISOString(), results };
}

const seenWebhookIds = new Map<string, number>();

function rememberWebhookId(id: string) {
  const now = Date.now();
  for (const [key, at] of seenWebhookIds) {
    if (now - at > 24 * 60 * 60 * 1000) {
      seenWebhookIds.delete(key);
    }
  }
  if (seenWebhookIds.has(id)) {
    return true;
  }
  seenWebhookIds.set(id, now);
  return false;
}

/**
 * Ingest a portal webhook event. Verifies CASWJ-Signature (or legacy Clocked-In-Signature),
 * dedupes on event id, then triggers a full directory pull for simplicity and consistency.
 */
export async function ingestPortalWebhook(input: {
  tenantId: string;
  rawBody: string;
  signatureHeader: string | null;
}) {
  const tenant = await loadTenant(input.tenantId);
  const preferences = readPreferences(tenant.preferences);
  if (!portalDirectorySyncEnabled(preferences)) {
    validation("Portal directory sync is not enabled.");
  }
  if (!verifySyncWebhookSignature(input.rawBody, input.signatureHeader, tenant.portalWebhookSecretEnc)) {
    forbidden("Invalid webhook signature.");
  }

  let event;
  try {
    event = portalEventSchema.parse(JSON.parse(input.rawBody));
  } catch {
    validation("Invalid webhook payload.");
  }

  if (rememberWebhookId(event.id)) {
    return { ok: true, duplicate: true };
  }

  // Full pull on any event — portal delivery is at-least-once; snapshot is source of truth.
  if (tenant.portalApiTokenEnc && preferences.portalOrigin) {
    await transaction(async (tx) => {
      const snapshot = await pullPortalDirectory({
        portalOrigin: preferences.portalOrigin!,
        apiToken: decryptSecret(tenant.portalApiTokenEnc!),
      });
      await applyPortalDirectory(tx, tenant.id, snapshot as PortalDirectorySnapshot);
      await tx.tenant.update({
        where: { id: tenant.id },
        data: { portalLastPulledAt: new Date() },
      });
    });
  }

  return { ok: true, duplicate: false, type: event.type };
}

export const portalContract = {
  auth: "OIDC authorization code + PKCE; ID token RS256 via JWKS",
  directory: "GET {portalOrigin}/api/v1/{people|organizations|roles|memberships|positions}",
  webhooks: "POST with CASWJ-Signature HMAC over t.body",
  mapping: {
    society: "Tenant",
    ao: "Organization",
    membership_society: "TenantMembership",
    membership_ao: "OrganizationMembership",
    position: "OrganizationMembership.title (or TenantMembership.title)",
  },
};
