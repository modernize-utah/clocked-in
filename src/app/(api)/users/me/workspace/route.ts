import { authenticate } from "@/lib/api/access";
import { getUserWorkspace } from "@/lib/api/features/workspace";
import { respond } from "@/lib/api/respond";

export function GET(request: Request) {
  return respond(async () => {
    const access = await authenticate(request);
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    return getUserWorkspace(access, organizationId);
  });
}
