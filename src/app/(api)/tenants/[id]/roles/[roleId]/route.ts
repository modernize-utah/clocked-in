import { authenticate } from "@/lib/api/access";
import { deleteTenantRole, parseUpdateRole, updateTenantRole } from "@/lib/api/features/roles";
import { withGuids } from "@/lib/api/guid";
import { readBody } from "@/lib/api/json";

export const PATCH = withGuids<{ id: string; roleId: string }>(async (request, { id, roleId }) => {
  const access = await authenticate(request);
  return updateTenantRole(access, id, roleId, parseUpdateRole(await readBody(request)));
});

export const DELETE = withGuids<{ id: string; roleId: string }>(async (request, { id, roleId }) => {
  await deleteTenantRole(await authenticate(request), id, roleId);
}, 204);
