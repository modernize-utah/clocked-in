"use server";

import { createReportTemplate, updateReportTemplate } from "@/lib/api/features/report-templates";
import { createSavedReport, deleteSavedReport, updateSavedReport } from "@/lib/api/features/saved-reports";
import { run } from "@/lib/server/action";
import { requireAccess } from "@/lib/server/session";

export async function createReportAction(tenantId: string, body: Record<string, unknown>) {
  return run(async () => createSavedReport(await requireAccess(), tenantId, body));
}

export async function updateReportAction(tenantId: string, reportId: string, body: Record<string, unknown>) {
  return run(async () => updateSavedReport(await requireAccess(), tenantId, reportId, body));
}

export async function deleteReportAction(tenantId: string, reportId: string) {
  return run(async () => deleteSavedReport(await requireAccess(), tenantId, reportId));
}

export async function createReportTemplateAction(tenantId: string, body: Record<string, unknown>) {
  return run(async () => createReportTemplate(await requireAccess(), tenantId, body));
}

export async function updateReportTemplateAction(tenantId: string, templateId: string, body: Record<string, unknown>) {
  return run(async () => updateReportTemplate(await requireAccess(), tenantId, templateId, body));
}
