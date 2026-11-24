import { authenticate } from "@/lib/api/access";
import { createTenant, listTenants, parseName } from "@/lib/api/features/tenants";
import { query, readBody } from "@/lib/api/json";
import { respond } from "@/lib/api/respond";

export function GET(request: Request) {
  return respond(async () => listTenants(await authenticate(request), query(request)));
}

export function POST(request: Request) {
  return respond(async () => {
    const access = await authenticate(request);
    return createTenant(access, parseName(await readBody(request)));
  }, 201);
}

