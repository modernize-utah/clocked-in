"use server";

import {
  createFeedback,
  editFeedback,
  parseCreateFeedback,
  parseEditFeedback,
  parseUpdateFeedback,
  syncFeedbackLinearIssue,
  updateFeedback,
} from "@/lib/api/features/feedback";
import { run } from "@/lib/server/action";
import { uploadFeedbackScreenshots } from "@/lib/server/feedback-assets";
import { requireAccess } from "@/lib/server/session";
import type { ActionResult, Feedback } from "@/lib/types";

export async function createFeedbackAction(formData: FormData): Promise<ActionResult<Feedback>> {
  let isSuperAdmin = false;
  const result = await run(async () => {
    const access = await requireAccess();
    isSuperAdmin = access.caller.isSuperAdmin;
    const files = formData.getAll("screenshots").filter((item): item is File => item instanceof File && item.size > 0);
    const screenshotUrls = files.length > 0 ? await uploadFeedbackScreenshots(access.caller.id, files) : [];
    const tenantId = String(formData.get("tenantId") ?? "").trim();
    return createFeedback(
      access,
      parseCreateFeedback({
        type: String(formData.get("type") ?? ""),
        priority: String(formData.get("priority") ?? ""),
        area: String(formData.get("area") ?? ""),
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? ""),
        screenshotUrls,
        ...(tenantId ? { tenantId } : {}),
      }),
    );
  }, "Thanks for the feedback.");

  if (result.ok && isSuperAdmin && result.data && !result.data.ticketUrl) {
    return {
      ...result,
      message: "Feedback saved, but Linear ticket could not be created (check LINEAR_API_KEY).",
    };
  }

  return result;
}

export async function editFeedbackAction(input: {
  id: string;
  type: string;
  priority: string;
  area: string;
  title: string;
  description: string;
}): Promise<ActionResult<Feedback>> {
  return run(async () => {
    const access = await requireAccess();
    return editFeedback(
      access,
      input.id,
      parseEditFeedback({
        type: input.type,
        priority: input.priority,
        area: input.area,
        title: input.title,
        description: input.description,
      }),
    );
  }, "Feedback saved.");
}

export async function updateFeedbackAction(input: {
  id: string;
  status: string;
  description: string;
  ticketUrl?: string;
}): Promise<ActionResult<Feedback>> {
  return run(async () => {
    const access = await requireAccess();
    return updateFeedback(
      access,
      input.id,
      parseUpdateFeedback({
        status: input.status,
        description: input.description,
        ...(input.ticketUrl ? { ticketUrl: input.ticketUrl } : {}),
      }),
    );
  }, "Feedback updated.");
}

export async function syncFeedbackLinearAction(id: string): Promise<ActionResult<Feedback>> {
  return run(async () => {
    const access = await requireAccess();
    return syncFeedbackLinearIssue(access, id);
  }, "Linear issue linked.");
}
