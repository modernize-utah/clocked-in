import { authenticate } from "@/lib/api/access";
import { createTenantRole, listTenantRoles, parseCreateRole } from "@/lib/api/features/roles";
import { withGuids } from "@/lib/api/guid";
import { query, readBody } from "@/lib/api/json";

export const GET = withGuids<{ id: string }>(async (request, { id }) =>
  listTenantRoles(await authenticate(request), id, query(request)),
);

export const POST = withGuids<{ id: string }>(async (request, { id }) => {
  const access = await authenticate(request);
  return createTenantRole(access, id, parseCreateRole(await readBody(request)));
}, 201);
