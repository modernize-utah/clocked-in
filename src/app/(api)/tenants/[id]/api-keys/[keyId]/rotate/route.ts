import { authenticate } from "@/lib/api/access";
import { rotateApiKey } from "@/lib/api/features/api-keys";
import { withGuids } from "@/lib/api/guid";

export const POST = withGuids<{ id: string; keyId: string }>(async (request, { id, keyId }) =>
  rotateApiKey(await authenticate(request), id, keyId),
);
