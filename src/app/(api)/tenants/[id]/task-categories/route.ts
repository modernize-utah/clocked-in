import { authenticate } from "@/lib/api/access";
import { parseName } from "@/lib/api/features/tenants";
import { createTaskCategory, listTaskCategories } from "@/lib/api/features/task-categories";
import { withGuids } from "@/lib/api/guid";
import { query, readBody } from "@/lib/api/json";

export const GET = withGuids<{ id: string }>(async (request, { id }) =>
  listTaskCategories(await authenticate(request), id, query(request)),
);

export const POST = withGuids<{ id: string }>(async (request, { id }) => {
  const access = await authenticate(request);
  return createTaskCategory(access, id, parseName(await readBody(request)));
}, 201);
