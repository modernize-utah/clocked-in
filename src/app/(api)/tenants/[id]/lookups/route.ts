import { authenticate } from "@/lib/api/access";
import { loadLookups } from "@/lib/api/features/lookups";
import { withGuids } from "@/lib/api/guid";

export const GET = withGuids<{ id: string }>(async (request, { id }) => loadLookups(await authenticate(request), id));
