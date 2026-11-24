"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createTenant,
  getTenant,
  parseEmailSettings,
  parseName,
  parseUpdateTenant,
  updateTenant,
  type TenantPreferences,
} from "@/lib/api/features/tenants";
import { createTheme, deleteTheme, updateTheme, type ThemeWriteRequest } from "@/lib/api/features/themes";
import { requireBrandKind, removeTenantBrand, uploadTenantBrand } from "@/lib/api/features/brand";
import { forbidden } from "@/lib/api/errors";
import { type BrandKind } from "@/lib/brand";
import { run, text } from "@/lib/server/action";
import { getTenants } from "@/lib/server/dal";
import { requireAccess } from "@/lib/server/session";
import { writeTenant } from "@/lib/server/session-cookies";
import type { ActionResult } from "@/lib/types";

export async function switchTenantAction(tenantId: string) {
  return run(async () => {
    const tenants = await getTenants();
    if (!tenants.some((item) => item.id === tenantId)) {
      forbidden();
    }

    writeTenant(await cookies(), tenantId);
    refresh();
  });
}

export async function createTenantAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const result = await run(async () => {
    const access = await requireAccess();
    const created = await createTenant(access, parseName({ name: text(formData, "name") }));
    writeTenant(await cookies(), created.id);
    return created;
  }, "Tenant created.");
  if (!result.ok) return result;
  refresh();
  redirect("/tenant");
}

export async function updateTenantDetailsAction(
  tenantId: string,
  _: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return run(async () => {
    const access = await requireAccess();
    await updateTenant(
      access,
      tenantId,
      parseUpdateTenant({
        name: text(formData, "name"),
        description: text(formData, "description"),
        websiteUrl: text(formData, "websiteUrl"),
        publicSlug: text(formData, "publicSlug"),
      }),
    );
    refresh();
  }, "Tenant saved.");
}

export async function updateTenantSettingsAction(
  tenantId: string,
  _: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return run(async () => {
    const access = await requireAccess();
    const current = await getTenant(access, tenantId);
    const preferences: TenantPreferences = {
      ...current.preferences,
      allowTimeEntryEditing: formData.get("allowTimeEntryEditing") === "on",
      allowVolunteersToAddVolunteers: formData.get("allowVolunteersToAddVolunteers") === "on",
      entityLabels: {
        tenant: text(formData, "labelTenant"),
        project: text(formData, "labelProject"),
        organization: text(formData, "labelOrganization"),
        taskCategory: text(formData, "labelTaskCategory"),
      },
      feedbackNotifyUserIds: text(formData, "feedbackNotifyUserIds")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      emailSettings: current.preferences.emailSettings,
    };
    await updateTenant(
      access,
      tenantId,
      parseUpdateTenant({
        preferences,
        publicSlug: text(formData, "publicSlug") || null,
      }),
    );
    refresh();
  }, "Tenant saved.");
}

export async function updateTenantEmailSettingsAction(
  tenantId: string,
  _: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return run(async () => {
    const access = await requireAccess();
    const current = await getTenant(access, tenantId);
    const emailSettings = parseEmailSettings({
      LoggedTime: text(formData, "LoggedTime") || "immediate",
      UnclassifiedEntry: text(formData, "UnclassifiedEntry") || "immediate",
      FeedbackReceived: formData.get("FeedbackReceived") === "on",
      FeedbackNotify: formData.get("FeedbackNotify") === "on",
      FeedbackCompleted: formData.get("FeedbackCompleted") === "on",
      AccessRequestReceived: formData.get("AccessRequestReceived") === "on",
      AccessRequestDecided: formData.get("AccessRequestDecided") === "on",
      NeedSubmitted: formData.get("NeedSubmitted") === "on",
      NeedDecided: formData.get("NeedDecided") === "on",
      VolunteerMessage: formData.get("VolunteerMessage") === "on",
    });
    const preferences: TenantPreferences = {
      ...current.preferences,
      emailSettings,
    };
    await updateTenant(
      access,
      tenantId,
      parseUpdateTenant({
        preferences,
      }),
    );
    refresh();
  }, "Email settings saved.");
}

export async function updateTenantSlugAction(
  tenantId: string,
  _: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return run(async () => {
    const access = await requireAccess();
    const rawSlug = text(formData, "slug");
    await updateTenant(
      access,
      tenantId,
      parseUpdateTenant({
        slug: rawSlug ? rawSlug : null,
      }),
    );
    refresh();
  }, "Tenant address saved.");
}

export async function applyThemeAction(tenantId: string, themeId: string) {
  return run(async () => {
    const access = await requireAccess();
    await updateTenant(access, tenantId, parseUpdateTenant({ themeId }));
    refresh();
  }, "Theme applied.");
}

export async function saveThemeAction(tenantId: string, themeId: string | null, request: ThemeWriteRequest) {
  return run(async () => {
    const access = await requireAccess();
    const theme = themeId
      ? await updateTheme(access, tenantId, themeId, request)
      : await createTheme(access, tenantId, request);
    await updateTenant(access, tenantId, parseUpdateTenant({ themeId: theme.id }));
    refresh();
    return theme;
  }, "Theme saved.");
}

export async function deleteThemeAction(tenantId: string, themeId: string) {
  return run(async () => {
    const access = await requireAccess();
    await deleteTheme(access, tenantId, themeId);
    refresh();
  }, "Theme deleted.");
}

export async function uploadTenantBrandAction(
  tenantId: string,
  kind: BrandKind,
  formData: FormData,
): Promise<ActionResult> {
  return run(async () => {
    const access = await requireAccess();
    const asset = requireBrandKind(kind);
    await uploadTenantBrand(access, tenantId, asset, formData.get("file"));
    refresh();
  }, `${assetLabel(kind)} saved.`);
}

export async function removeTenantBrandAction(
  tenantId: string,
  kind: BrandKind,
): Promise<ActionResult> {
  return run(async () => {
    const access = await requireAccess();
    const asset = requireBrandKind(kind);
    await removeTenantBrand(access, tenantId, asset);
    refresh();
  }, `${assetLabel(kind)} removed.`);
}

function assetLabel(kind: BrandKind) {
  if (kind === "mark") {
    return "Favicon";
  }

  return kind === "wordmark" ? "Light on dark logo" : "Dark on light logo";
}
