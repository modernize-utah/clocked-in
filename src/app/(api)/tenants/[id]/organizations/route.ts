import { authenticate } from "@/lib/api/access";
import { createOrganization, listOrganizations } from "@/lib/api/features/organizations";
import { parseName } from "@/lib/api/features/tenants";
import { withGuids } from "@/lib/api/guid";
import { query, readBody } from "@/lib/api/json";

export const GET = withGuids<{ id: string }>(async (request, { id }) =>
  listOrganizations(await authenticate(request), id, query(request)),
);

export const POST = withGuids<{ id: string }>(async (request, { id }) => {
  const access = await authenticate(request);
  return createOrganization(access, id, parseName(await readBody(request)));
}, 201);
