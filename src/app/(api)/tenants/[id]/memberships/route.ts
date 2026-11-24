import { authenticate } from "@/lib/api/access";
import {
  createOrgMembership,
  deleteOrgMemberships,
  listOrgMemberships,
  parseCreateOrgMembership,
  parseDeleteOrgMemberships,
} from "@/lib/api/features/memberships";
import { withGuids } from "@/lib/api/guid";
import { query, readBody } from "@/lib/api/json";

export const GET = withGuids<{ id: string }>(async (request, { id }) =>
  listOrgMemberships(await authenticate(request), id, query(request)),
);

export const POST = withGuids<{ id: string }>(async (request, { id }) => {
  const access = await authenticate(request);
  return createOrgMembership(access, id, parseCreateOrgMembership(await readBody(request)));
}, 201);

export const DELETE = withGuids<{ id: string }>(async (request, { id }) => {
  await deleteOrgMemberships(await authenticate(request), id, parseDeleteOrgMemberships(await readBody(request)));
}, 204);
