import { authenticate } from "@/lib/api/access";
import { deleteOrgMembership, parseUpdateOrgMembership, updateOrgMembership } from "@/lib/api/features/memberships";
import { withGuids } from "@/lib/api/guid";
import { readBody } from "@/lib/api/json";

export const PATCH = withGuids<{ id: string; membershipId: string }>(async (request, { id, membershipId }) => {
  const access = await authenticate(request);
  return updateOrgMembership(access, id, membershipId, parseUpdateOrgMembership(await readBody(request)));
});

export const DELETE = withGuids<{ id: string; membershipId: string }>(async (request, { id, membershipId }) => {
  await deleteOrgMembership(await authenticate(request), id, membershipId);
}, 204);
