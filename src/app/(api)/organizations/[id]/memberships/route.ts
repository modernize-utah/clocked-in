import { authenticate } from "@/lib/api/access";
import { listOrganizationMemberships } from "@/lib/api/features/memberships";
import { withGuids } from "@/lib/api/guid";
import { query } from "@/lib/api/json";

export const GET = withGuids<{ id: string }>(async (request, { id }) =>
  listOrganizationMemberships(await authenticate(request), id, query(request)),
);
