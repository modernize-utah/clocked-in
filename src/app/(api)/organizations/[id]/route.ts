import { authenticate } from "@/lib/api/access";
import { deleteOrganization, getOrganization, updateOrganization } from "@/lib/api/features/organizations";
import { parseName } from "@/lib/api/features/tenants";
import { withGuids } from "@/lib/api/guid";
import { readBody } from "@/lib/api/json";

export const GET = withGuids<{ id: string }>(async (request, { id }) => getOrganization(await authenticate(request), id));

export const PATCH = withGuids<{ id: string }>(async (request, { id }) => {
  const access = await authenticate(request);
  return updateOrganization(access, id, parseName(await readBody(request)));
});

export const DELETE = withGuids<{ id: string }>(async (request, { id }) => {
  await deleteOrganization(await authenticate(request), id);
}, 204);
