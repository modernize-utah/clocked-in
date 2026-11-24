import { authenticate } from "@/lib/api/access";
import { resetEmailTemplate } from "@/lib/api/features/email-templates";
import { withGuids } from "@/lib/api/guid";

export const POST = withGuids<{ id: string; templateId: string }>(async (request, { id, templateId }) =>
  resetEmailTemplate(await authenticate(request), id, templateId),
);
