import { authenticate } from "@/lib/api/access";
import { decideAccessRequest, parseDecideAccessRequest } from "@/lib/api/features/access-requests";
import { withGuids } from "@/lib/api/guid";
import { readBody } from "@/lib/api/json";

export const PATCH = withGuids<{ id: string; requestId: string }>(async (request, { id, requestId }) => {
  const access = await authenticate(request);
  const body = parseDecideAccessRequest(await readBody(request));
  return decideAccessRequest(access, id, requestId, body.status);
});
