import { authenticate } from "@/lib/api/access";
import { deleteReportTemplate, getReportTemplate, updateReportTemplate } from "@/lib/api/features/report-templates";
import { withGuids } from "@/lib/api/guid";
import { readBody } from "@/lib/api/json";

export const GET = withGuids<{ id: string; templateId: string }>(async (request, { id, templateId }) =>
  getReportTemplate(await authenticate(request), id, templateId),
);

export const PATCH = withGuids<{ id: string; templateId: string }>(async (request, { id, templateId }) => {
  const access = await authenticate(request);
  return updateReportTemplate(access, id, templateId, await readBody(request));
});

export const DELETE = withGuids<{ id: string; templateId: string }>(async (request, { id, templateId }) => {
  await deleteReportTemplate(await authenticate(request), id, templateId);
}, 204);
