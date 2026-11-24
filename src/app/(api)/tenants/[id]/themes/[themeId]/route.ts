import { authenticate } from "@/lib/api/access";
import { deleteTheme, parseThemeWrite, updateTheme } from "@/lib/api/features/themes";
import { withGuids } from "@/lib/api/guid";
import { readBody } from "@/lib/api/json";

export const PATCH = withGuids<{ id: string; themeId: string }>(async (request, { id, themeId }) => {
  const access = await authenticate(request);
  return updateTheme(access, id, themeId, parseThemeWrite(await readBody(request)));
});

export const DELETE = withGuids<{ id: string; themeId: string }>(async (request, { id, themeId }) => {
  await deleteTheme(await authenticate(request), id, themeId);
  return new Response(null, { status: 204 });
});
