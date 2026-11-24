import { authenticate } from "@/lib/api/access";
import { savedReportData } from "@/lib/api/features/saved-reports";
import { withGuids } from "@/lib/api/guid";
import { query } from "@/lib/api/json";

export const GET = withGuids<{ id: string; reportId: string }>(async (request, { id, reportId }) =>
  savedReportData(await authenticate(request), id, reportId, query(request)),
);
