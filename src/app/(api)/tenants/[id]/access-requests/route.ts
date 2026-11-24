import { authenticate } from "@/lib/api/access";
import { createAccessRequest, listAccessRequests, parseCreateAccessRequest } from "@/lib/api/features/access-requests";
import { withGuids } from "@/lib/api/guid";
import { query, readBody } from "@/lib/api/json";

export const GET = withGuids<{ id: string }>(async (request, { id }) =>
  listAccessRequests(await authenticate(request), id, query(request)),
);

export const POST = withGuids<{ id: string }>(async (request, { id }) => {
  const access = await authenticate(request);
  return createAccessRequest(access, id, parseCreateAccessRequest(await readBody(request)));
}, 201);
