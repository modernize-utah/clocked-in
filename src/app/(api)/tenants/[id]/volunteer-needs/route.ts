import { authenticate } from "@/lib/api/access";
import { createVolunteerNeed, listVolunteerNeeds, parseSaveNeed } from "@/lib/api/features/volunteer-needs";
import { withGuids } from "@/lib/api/guid";
import { query, readBody } from "@/lib/api/json";

export const GET = withGuids<{ id: string }>(async (request, { id }) =>
  listVolunteerNeeds(await authenticate(request), id, query(request)),
);

export const POST = withGuids<{ id: string }>(async (request, { id }) => {
  const access = await authenticate(request);
  return createVolunteerNeed(access, id, parseSaveNeed(await readBody(request)));
}, 201);
