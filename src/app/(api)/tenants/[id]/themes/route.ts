import { authenticate } from "@/lib/api/access";
import { createTheme, listThemes, parseThemeWrite } from "@/lib/api/features/themes";
import { withGuids } from "@/lib/api/guid";
import { readBody } from "@/lib/api/json";

export const GET = withGuids<{ id: string }>(async (request, { id }) =>
  listThemes(await authenticate(request), id),
);

export const POST = withGuids<{ id: string }>(async (request, { id }) => {
  const access = await authenticate(request);
  return createTheme(access, id, parseThemeWrite(await readBody(request)));
}, 201);
