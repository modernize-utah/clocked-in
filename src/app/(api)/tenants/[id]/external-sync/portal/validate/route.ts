import { validatePortalDirectory } from "@/lib/api/features/external-sync";
import { authenticate } from "@/lib/api/access";
import { respond } from "@/lib/api/respond";

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { id } = await context.params;
    return validatePortalDirectory(await authenticate(request), id);
  });
}
