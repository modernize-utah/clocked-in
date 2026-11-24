import { authenticate } from "@/lib/api/access";
import { createConnection, listConnections, parseCreateConnection } from "@/lib/api/features/connections";
import { withGuids } from "@/lib/api/guid";
import { query, readBody } from "@/lib/api/json";

export const GET = withGuids<{ id: string }>(async (request, { id }) =>
  listConnections(await authenticate(request), id, query(request)),
);

export const POST = withGuids<{ id: string }>(async (request, { id }) => {
  const access = await authenticate(request);
  return createConnection(access, id, parseCreateConnection(await readBody(request)));
}, 201);
