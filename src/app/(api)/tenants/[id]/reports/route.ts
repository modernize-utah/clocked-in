import { authenticate } from "@/lib/api/access";
import { createSavedReport, listSavedReports } from "@/lib/api/features/saved-reports";
import { withGuids } from "@/lib/api/guid";
import { query, readBody } from "@/lib/api/json";

export const GET = withGuids<{ id: string }>(async (request, { id }) =>
  listSavedReports(await authenticate(request), id, query(request)),
);

export const POST = withGuids<{ id: string }>(async (request, { id }) => {
  const access = await authenticate(request);
  return createSavedReport(access, id, await readBody(request));
}, 201);
