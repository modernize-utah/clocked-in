"use server";

import {
  parseEmailTemplatePatch,
  resetEmailTemplate,
  updateEmailTemplate,
} from "@/lib/api/features/email-templates";
import { body, run } from "@/lib/server/action";
import { requireAccess } from "@/lib/server/session";

export async function updateEmailTemplateAction(
  tenantId: string,
  templateId: string,
  input: { name?: string; subject?: string; heading?: string; preview?: string; template?: string; isEnabled?: boolean },
) {
  return run(async () => {
    const access = await requireAccess();
    return updateEmailTemplate(access, tenantId, templateId, parseEmailTemplatePatch(body(input)));
  }, "Email template saved.");
}

export async function resetEmailTemplateAction(tenantId: string, templateId: string) {
  return run(async () => {
    const access = await requireAccess();
    return resetEmailTemplate(access, tenantId, templateId);
  }, "Email template reset to the default.");
}
