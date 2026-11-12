"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createOrganization,
  getOrganization,
  parseEmailSettings,
  parseName,
  parseUpdateOrganization,
  updateOrganization,
  type OrganizationPreferences,
} from "@/lib/api/features/organizations";
import { createTheme, deleteTheme, updateTheme, type ThemeWriteRequest } from "@/lib/api/features/themes";
import { requireBrandKind, removeOrganizationBrand, uploadOrganizationBrand } from "@/lib/api/features/brand";
import { forbidden } from "@/lib/api/errors";
import { type BrandKind } from "@/lib/brand";
import { run, text } from "@/lib/server/action";
import { getOrganizations } from "@/lib/server/dal";
import { requireAccess } from "@/lib/server/session";
import { writeOrganization } from "@/lib/server/session-cookies";
import type { ActionResult } from "@/lib/types";

export async function switchOrganizationAction(organizationId: string) {
  return run(async () => {
    const organizations = await getOrganizations();
    if (!organizations.some((item) => item.id === organizationId)) {
      forbidden();
    }

    writeOrganization(await cookies(), organizationId);
    refresh();
  });
}

export async function createOrganizationAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const result = await run(async () => {
    const access = await requireAccess();
    const created = await createOrganization(access, parseName({ name: text(formData, "name") }));
    writeOrganization(await cookies(), created.id);
    return created;
  }, "Organization created.");
  if (!result.ok) return result;
  refresh();
  redirect("/organization");
}

export async function updateOrganizationDetailsAction(
  organizationId: string,
  _: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return run(async () => {
    const access = await requireAccess();
    await updateOrganization(
      access,
      organizationId,
      parseUpdateOrganization({
        name: text(formData, "name"),
        description: text(formData, "description"),
        websiteUrl: text(formData, "websiteUrl"),
        publicSlug: text(formData, "publicSlug"),
      }),
    );
    refresh();
  }, "Organization saved.");
}

export async function updateOrganizationSettingsAction(
  organizationId: string,
  _: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return run(async () => {
    const access = await requireAccess();
    const current = await getOrganization(access, organizationId);
    const preferences: OrganizationPreferences = {
      allowTimeEntryEditing: formData.get("allowTimeEntryEditing") === "on",
      allowVolunteersToAddVolunteers: formData.get("allowVolunteersToAddVolunteers") === "on",
      entityLabels: {
        organization: text(formData, "labelOrganization"),
        project: text(formData, "labelProject"),
        department: text(formData, "labelDepartment"),
        taskCategory: text(formData, "labelTaskCategory"),
      },
      feedbackNotifyUserIds: text(formData, "feedbackNotifyUserIds")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      emailSettings: current.preferences.emailSettings,
    };
    await updateOrganization(
      access,
      organizationId,
      parseUpdateOrganization({
        preferences,
        publicSlug: text(formData, "publicSlug") || null,
      }),
    );
    refresh();
  }, "Organization saved.");
}

export async function updateOrganizationEmailSettingsAction(
  organizationId: string,
  _: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return run(async () => {
    const access = await requireAccess();
    const current = await getOrganization(access, organizationId);
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
    const preferences: OrganizationPreferences = {
      ...current.preferences,
      emailSettings,
    };
    await updateOrganization(
      access,
      organizationId,
      parseUpdateOrganization({
        preferences,
      }),
    );
    refresh();
  }, "Email settings saved.");
}

export async function updateOrganizationSlugAction(
  organizationId: string,
  _: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return run(async () => {
    const access = await requireAccess();
    const rawSlug = text(formData, "slug");
    await updateOrganization(
      access,
      organizationId,
      parseUpdateOrganization({
        slug: rawSlug ? rawSlug : null,
      }),
    );
    refresh();
  }, "Organization address saved.");
}

export async function applyThemeAction(organizationId: string, themeId: string) {
  return run(async () => {
    const access = await requireAccess();
    await updateOrganization(access, organizationId, parseUpdateOrganization({ themeId }));
    refresh();
  }, "Theme applied.");
}

export async function saveThemeAction(organizationId: string, themeId: string | null, request: ThemeWriteRequest) {
  return run(async () => {
    const access = await requireAccess();
    const theme = themeId
      ? await updateTheme(access, organizationId, themeId, request)
      : await createTheme(access, organizationId, request);
    await updateOrganization(access, organizationId, parseUpdateOrganization({ themeId: theme.id }));
    refresh();
    return theme;
  }, "Theme saved.");
}

export async function deleteThemeAction(organizationId: string, themeId: string) {
  return run(async () => {
    const access = await requireAccess();
    await deleteTheme(access, organizationId, themeId);
    refresh();
  }, "Theme deleted.");
}

export async function uploadOrganizationBrandAction(
  organizationId: string,
  kind: BrandKind,
  formData: FormData,
): Promise<ActionResult> {
  return run(async () => {
    const access = await requireAccess();
    const asset = requireBrandKind(kind);
    await uploadOrganizationBrand(access, organizationId, asset, formData.get("file"));
    refresh();
  }, `${assetLabel(kind)} saved.`);
}

export async function removeOrganizationBrandAction(
  organizationId: string,
  kind: BrandKind,
): Promise<ActionResult> {
  return run(async () => {
    const access = await requireAccess();
    const asset = requireBrandKind(kind);
    await removeOrganizationBrand(access, organizationId, asset);
    refresh();
  }, `${assetLabel(kind)} removed.`);
}

function assetLabel(kind: BrandKind) {
  if (kind === "mark") {
    return "Favicon";
  }

  return kind === "wordmark" ? "Light on dark logo" : "Dark on light logo";
}
