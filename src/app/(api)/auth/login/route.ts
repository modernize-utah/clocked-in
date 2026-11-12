import { logIn, parseLogIn } from "@/lib/api/features/auth";
import { readBody } from "@/lib/api/json";
import { clientIp } from "@/lib/api/rate-limit";
import { respond } from "@/lib/api/respond";

export function POST(request: Request) {
  return respond(async () => logIn(parseLogIn(await readBody(request)), { ip: clientIp(request.headers) }));
}
