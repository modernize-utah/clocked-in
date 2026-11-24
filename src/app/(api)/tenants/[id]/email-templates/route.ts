import { authenticate } from "@/lib/api/access";
import { listEmailTemplates } from "@/lib/api/features/email-templates";
import { withGuids } from "@/lib/api/guid";

export const GET = withGuids<{ id: string }>(async (request, { id }) =>
  listEmailTemplates(await authenticate(request), id),
);
