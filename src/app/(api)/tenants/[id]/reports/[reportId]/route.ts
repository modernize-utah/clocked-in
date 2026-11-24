import { authenticate } from "@/lib/api/access";
import { deleteSavedReport, getSavedReport, updateSavedReport } from "@/lib/api/features/saved-reports";
import { withGuids } from "@/lib/api/guid";
import { readBody } from "@/lib/api/json";

export const GET = withGuids<{ id: string; reportId: string }>(async (request, { id, reportId }) =>
  getSavedReport(await authenticate(request), id, reportId),
);

export const PATCH = withGuids<{ id: string; reportId: string }>(async (request, { id, reportId }) => {
  const access = await authenticate(request);
  return updateSavedReport(access, id, reportId, await readBody(request));
});

export const DELETE = withGuids<{ id: string; reportId: string }>(async (request, { id, reportId }) => {
  await deleteSavedReport(await authenticate(request), id, reportId);
}, 204);
