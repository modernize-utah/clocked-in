import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  completePortalAuth,
  parseExternalAuthState,
} from "@/lib/api/features/external-auth";
import { respond } from "@/lib/api/respond";
import { appUrl } from "@/lib/api/security";
import { prisma } from "@/lib/prisma";
import { setSessionCookies } from "@/lib/server/session";
import { writeTenant } from "@/lib/server/session-cookies";

async function finish(input: {
  tenantId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  next: string;
}) {
  const session = await completePortalAuth({
    tenantId: input.tenantId,
    code: input.code,
    codeVerifier: input.codeVerifier,
    redirectUri: input.redirectUri,
  });
  await setSessionCookies(session);
  writeTenant(await cookies(), input.tenantId);
  const tenant = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
    select: { slug: true },
  });
  return NextResponse.redirect(appUrl(input.next, tenant?.slug ?? null));
}

export function GET(request: Request) {
  return respond(async () => {
    const url = new URL(request.url);
    const state = url.searchParams.get("state") || "";
    const code = url.searchParams.get("code") || "";
    const error = url.searchParams.get("error");
    if (error || !state || !code) {
      return NextResponse.redirect(new URL("/login?error=external_auth", request.url));
    }

    const parsed = parseExternalAuthState(state);
    const redirectUri = `${url.origin}/auth/external/callback`;
    return finish({
      tenantId: parsed.tenantId,
      code,
      codeVerifier: parsed.codeVerifier,
      redirectUri,
      next: parsed.next,
    });
  });
}
