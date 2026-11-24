import { authenticate } from "@/lib/api/access";
import { createReportTemplate, listReportTemplates } from "@/lib/api/features/report-templates";
import { withGuids } from "@/lib/api/guid";
import { query, readBody } from "@/lib/api/json";

export const GET = withGuids<{ id: string }>(async (request, { id }) =>
  listReportTemplates(await authenticate(request), id, query(request)),
);

export const POST = withGuids<{ id: string }>(async (request, { id }) => {
  const access = await authenticate(request);
  return createReportTemplate(access, id, await readBody(request));
}, 201);
