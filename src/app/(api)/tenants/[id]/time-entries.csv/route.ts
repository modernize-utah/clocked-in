import { authenticate } from "@/lib/api/access";
import { csv } from "@/lib/api/features/reports";
import { withGuids } from "@/lib/api/guid";
import { query } from "@/lib/api/json";

export const GET = withGuids<{ id: string }>(async (request, { id }) =>
  csv(await authenticate(request), id, query(request)),
);
