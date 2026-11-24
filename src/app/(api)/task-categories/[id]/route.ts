import { authenticate } from "@/lib/api/access";
import { parseName } from "@/lib/api/features/tenants";
import { deleteTaskCategory, updateTaskCategory } from "@/lib/api/features/task-categories";
import { withGuids } from "@/lib/api/guid";
import { readBody } from "@/lib/api/json";

export const PATCH = withGuids<{ id: string }>(async (request, { id }) => {
  const access = await authenticate(request);
  return updateTaskCategory(access, id, parseName(await readBody(request)));
});

export const DELETE = withGuids<{ id: string }>(async (request, { id }) => {
  await deleteTaskCategory(await authenticate(request), id);
}, 204);
