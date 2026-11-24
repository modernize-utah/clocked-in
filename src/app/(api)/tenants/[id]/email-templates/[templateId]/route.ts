import { authenticate } from "@/lib/api/access";
import { getEmailTemplate, parseEmailTemplatePatch, updateEmailTemplate } from "@/lib/api/features/email-templates";
import { withGuids } from "@/lib/api/guid";
import { readBody } from "@/lib/api/json";

export const GET = withGuids<{ id: string; templateId: string }>(async (request, { id, templateId }) =>
  getEmailTemplate(await authenticate(request), id, templateId),
);

export const PATCH = withGuids<{ id: string; templateId: string }>(async (request, { id, templateId }) => {
  const access = await authenticate(request);
  return updateEmailTemplate(access, id, templateId, parseEmailTemplatePatch(await readBody(request)));
});
