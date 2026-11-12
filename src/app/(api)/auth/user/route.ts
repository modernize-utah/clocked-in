import { parseSignUp, signUp } from "@/lib/api/features/auth";
import { readBody } from "@/lib/api/json";
import { clientIp } from "@/lib/api/rate-limit";
import { respond } from "@/lib/api/respond";
import { resolveRequestTenantSlug } from "@/lib/portal";

export function POST(request: Request) {
  return respond(
    async () =>
      signUp(parseSignUp(await readBody(request)), {
        tenantSlug: resolveRequestTenantSlug(request.headers),
        ip: clientIp(request.headers),
      }),
    201,
  );
}
