import { confirmPasswordReset, parseConfirmPasswordReset, requestPasswordReset } from "@/lib/api/features/auth";
import { query, readBody } from "@/lib/api/json";
import { clientIp } from "@/lib/api/rate-limit";
import { respond } from "@/lib/api/respond";
import { resolveRequestTenantSlug } from "@/lib/portal";

export function GET(request: Request) {
  return respond(() =>
    requestPasswordReset(query(request).get("email"), {
      tenantSlug: resolveRequestTenantSlug(request.headers),
      ip: clientIp(request.headers),
    }),
  );
}

export function POST(request: Request) {
  return respond(async () => confirmPasswordReset(parseConfirmPasswordReset(await readBody(request)), { ip: clientIp(request.headers) }));
}
