import { authenticate } from "@/lib/api/access";
import { importProjects, parseImportRows } from "@/lib/api/features/imports";
import { withGuids } from "@/lib/api/guid";
import { readBody } from "@/lib/api/json";

export const POST = withGuids<{ id: string }>(async (request, { id }) => {
  const access = await authenticate(request);
  return importProjects(access, id, parseImportRows(await readBody(request)));
});
