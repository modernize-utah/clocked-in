import { authenticate } from "@/lib/api/access";
import { listTenantTimeEntries } from "@/lib/api/features/time-entries";
import { withGuids } from "@/lib/api/guid";
import { query } from "@/lib/api/json";

export const GET = withGuids<{ id: string }>(async (request, { id }) =>
  listTenantTimeEntries(await authenticate(request), id, query(request)),
);
