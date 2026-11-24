import { authenticate } from "@/lib/api/access";
import { parseUpdateApiKey, revokeApiKey, updateApiKey } from "@/lib/api/features/api-keys";
import { withGuids } from "@/lib/api/guid";
import { readBody } from "@/lib/api/json";

export const PATCH = withGuids<{ id: string; keyId: string }>(async (request, { id, keyId }) => {
  const access = await authenticate(request);
  return updateApiKey(access, id, keyId, parseUpdateApiKey(await readBody(request)));
});

export const DELETE = withGuids<{ id: string; keyId: string }>(async (request, { id, keyId }) => {
  await revokeApiKey(await authenticate(request), id, keyId);
}, 204);
