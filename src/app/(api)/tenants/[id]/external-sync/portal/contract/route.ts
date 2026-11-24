import { portalContract } from "@/lib/api/features/external-sync";
import { respond } from "@/lib/api/respond";

export function GET() {
  return respond(async () => portalContract);
}
