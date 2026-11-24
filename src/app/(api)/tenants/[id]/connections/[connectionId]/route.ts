import { authenticate } from "@/lib/api/access";
import { deleteConnection, parseUpdateConnection, updateConnection } from "@/lib/api/features/connections";
import { withGuids } from "@/lib/api/guid";
import { readBody } from "@/lib/api/json";

export const PATCH = withGuids<{ id: string; connectionId: string }>(async (request, { id, connectionId }) => {
  const access = await authenticate(request);
  return updateConnection(access, id, connectionId, parseUpdateConnection(await readBody(request)));
});

export const DELETE = withGuids<{ id: string; connectionId: string }>(async (request, { id, connectionId }) => {
  await deleteConnection(await authenticate(request), id, connectionId);
}, 204);
