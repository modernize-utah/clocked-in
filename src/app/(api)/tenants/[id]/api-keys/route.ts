import { authenticate } from "@/lib/api/access";
import { createApiKey, listApiKeys, parseCreateApiKey } from "@/lib/api/features/api-keys";
import { withGuids } from "@/lib/api/guid";
import { query, readBody } from "@/lib/api/json";

export const GET = withGuids<{ id: string }>(async (request, { id }) =>
  listApiKeys(await authenticate(request), id, query(request)),
);

export const POST = withGuids<{ id: string }>(async (request, { id }) => {
  const access = await authenticate(request);
  return createApiKey(access, id, parseCreateApiKey(await readBody(request)));
}, 201);
