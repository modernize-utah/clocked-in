import { authenticate } from "@/lib/api/access";
import { createProject, listProjects, parseCreateProject } from "@/lib/api/features/projects";
import { withGuids } from "@/lib/api/guid";
import { query, readBody } from "@/lib/api/json";

export const GET = withGuids<{ id: string }>(async (request, { id }) =>
  listProjects(await authenticate(request), id, query(request)),
);

export const POST = withGuids<{ id: string }>(async (request, { id }) => {
  const access = await authenticate(request);
  return createProject(access, id, parseCreateProject(await readBody(request)));
}, 201);
