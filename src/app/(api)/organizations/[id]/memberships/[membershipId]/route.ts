import { authenticate } from "@/lib/api/access";
import {
  deleteOrganizationMembership,
  parseUpdateOrganizationMembership,
  updateOrganizationMembership,
} from "@/lib/api/features/memberships";
import { withGuids } from "@/lib/api/guid";
import { readBody } from "@/lib/api/json";

export const PATCH = withGuids<{ id: string; membershipId: string }>(async (request, { id, membershipId }) => {
  const access = await authenticate(request);
  return updateOrganizationMembership(access, id, membershipId, parseUpdateOrganizationMembership(await readBody(request)));
});

export const DELETE = withGuids<{ id: string; membershipId: string }>(async (request, { id, membershipId }) => {
  await deleteOrganizationMembership(await authenticate(request), id, membershipId);
}, 204);
