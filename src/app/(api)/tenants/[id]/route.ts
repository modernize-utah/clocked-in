import { authenticate } from "@/lib/api/access";
import {
  deleteTenant,
  getTenant,
  parseUpdateTenant,
  updateTenant,
} from "@/lib/api/features/tenants";
import { withGuids } from "@/lib/api/guid";
import { readBody } from "@/lib/api/json";

export const GET = withGuids<{ id: string }>(async (request, { id }) => getTenant(await authenticate(request), id));

export const PATCH = withGuids<{ id: string }>(async (request, { id }) => {
  const access = await authenticate(request);
  return updateTenant(access, id, parseUpdateTenant(await readBody(request)));
});

export const DELETE = withGuids<{ id: string }>(async (request, { id }) => {
  await deleteTenant(await authenticate(request), id);
}, 204);
