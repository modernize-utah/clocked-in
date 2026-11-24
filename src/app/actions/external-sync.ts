"use server";

import { refresh } from "next/cache";
import {
  pullPortalDirectoryForTenant,
  setPortalApiToken,
  setPortalClientId,
  setPortalClientSecret,
  setPortalWebhookSecret,
  validatePortalDirectory,
} from "@/lib/api/features/external-sync";
import { getTenant, parseUpdateTenant, updateTenant } from "@/lib/api/features/tenants";
import { run, text } from "@/lib/server/action";
import { requireAccess } from "@/lib/server/session";
import type { ActionResult } from "@/lib/types";

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function updateExternalSyncSettingsAction(
  tenantId: string,
  _: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return run(async () => {
    const access = await requireAccess();
    const current = await getTenant(access, tenantId);
    const portalOrigin = emptyToNull(text(formData, "portalOrigin"));
    await updateTenant(
      access,
      tenantId,
      parseUpdateTenant({
        preferences: {
          ...current.preferences,
          portalOrigin,
          portalDirectoryCron: portalOrigin ? emptyToNull(text(formData, "portalDirectoryCron")) : null,
          portalSignIn: formData.get("portalSignIn") === "on",
          portalDirectorySync: formData.get("portalDirectorySync") === "on",
        },
      }),
    );

    const clientId = text(formData, "portalClientId");
    await setPortalClientId(access, tenantId, clientId);

    const clientSecret = text(formData, "portalClientSecret");
    if (clientSecret.trim()) {
      await setPortalClientSecret(access, tenantId, clientSecret);
    }

    const apiToken = text(formData, "portalApiToken");
    if (apiToken.trim()) {
      await setPortalApiToken(access, tenantId, apiToken);
    }

    const webhookSecret = text(formData, "portalWebhookSecret");
    if (webhookSecret.trim()) {
      await setPortalWebhookSecret(access, tenantId, webhookSecret);
    }

    refresh();
  }, "Portal settings saved.");
}

export async function validatePortalDirectoryAction(tenantId: string) {
  return run(async () => {
    const access = await requireAccess();
    return validatePortalDirectory(access, tenantId);
  });
}

export async function pullPortalDirectoryAction(tenantId: string) {
  return run(async () => {
    const access = await requireAccess();
    const result = await pullPortalDirectoryForTenant(access, tenantId);
    refresh();
    return result;
  }, "Portal directory pulled.");
}
