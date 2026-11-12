import { NextResponse, type NextRequest } from "next/server";
import { refresh } from "@/lib/api/features/auth";
import { accessCookie, refreshCookie, verifyAccessToken } from "@/lib/api/security";
import { resolveRequestTenantSlug } from "@/lib/portal";
import { writeSession, type IssuedSession } from "@/lib/server/session-cookies";

const protectedPrefixes = [
  "/dashboard",
  "/log",
  "/entries",
  "/groups",
  "/reports",
  "/people",
  "/settings",
  "/developer",
  "/about-prototype",
  "/profile",
  "/organization",
  "/change-password",
  "/feedback",
  "/needs",
];
const guestOnly = ["/login", "/signup"];

// Parallel requests on one instance share a rotation. Other instances rely on the
// refresh overlap window. A failed refresh leaves cookies alone so a slower
// response cannot delete the session a faster response just stored.
const inflight = new Map<string, { at: number; session: Promise<IssuedSession | null> }>();

function rotate(refreshToken: string) {
  const now = Date.now();
  for (const [key, entry] of inflight) {
    if (now - entry.at > 30_000) inflight.delete(key);
  }

  const existing = inflight.get(refreshToken);
  if (existing) {
    return existing.session;
  }

  const session = refresh({ refreshToken }).catch(() => null);
  inflight.set(refreshToken, { at: now, session });
  return session;
}

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Expo web runs on another local port and calls this API with a bearer token. */
function browserOrigin(value: string | null) {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1") {
    return url.origin;
  }
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  const [first, second] = parts;
  const privateAddress =
    first === 10 || (first === 192 && second === 168) || (first === 172 && second !== undefined && second >= 16 && second <= 31);
  return privateAddress ? url.origin : null;
}

function withCors(response: NextResponse, origin: string | null) {
  if (!origin) return response;
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD");
  response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Api-Key");
  response.headers.set("Access-Control-Max-Age", "600");
  response.headers.append("Vary", "Origin");
  return response;
}

function rewriteFeedbackApi(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname !== "/feedback" && !pathname.startsWith("/feedback/")) {
    return null;
  }

  const accept = request.headers.get("accept") ?? "";
  if (
    request.headers.has("next-action") ||
    request.headers.has("rsc") ||
    request.headers.has("next-router-prefetch") ||
    request.headers.has("next-router-segment-prefetch") ||
    request.headers.has("next-router-state-tree") ||
    accept.includes("text/x-component") ||
    searchParams.has("_rsc")
  ) {
    return null;
  }

  const dest = request.headers.get("sec-fetch-dest") ?? "";
  const isDocument = dest === "document" || dest === "iframe" || accept.includes("text/html");
  const isApi =
    request.headers.has("authorization") ||
    (request.method !== "GET" && request.method !== "HEAD") ||
    accept.includes("application/json") ||
    !isDocument;
  if (!isApi) {
    return null;
  }

  const url = request.nextUrl.clone();
  url.pathname = `/api${pathname}`;
  return url;
}

export async function proxy(request: NextRequest) {
  const origin = browserOrigin(request.headers.get("origin"));
  if (origin && request.method === "OPTIONS") {
    return withCors(new NextResponse(null, { status: 204 }), origin);
  }

  const tenantSlug = resolveRequestTenantSlug(request.headers);
  const feedbackApiUrl = rewriteFeedbackApi(request);

  if (request.headers.has("authorization")) {
    return withCors(feedbackApiUrl ? NextResponse.rewrite(feedbackApiUrl) : NextResponse.next(), origin);
  }

  const { pathname, search } = request.nextUrl;
  if (!feedbackApiUrl && tenantSlug && pathname === "/signup") {
    const nextParam = request.nextUrl.searchParams.get("next") ?? "";
    if (!/[?&]code=/.test(nextParam)) {
      const login = new URL("/login", request.url);
      if (nextParam) {
        login.searchParams.set("next", nextParam);
      }
      return NextResponse.redirect(login);
    }
  }

  const accessToken = request.cookies.get(accessCookie)?.value;
  const refreshToken = request.cookies.get(refreshCookie)?.value;
  let signedIn = Boolean(accessToken && (await verifyAccessToken(accessToken)));
  let issued: IssuedSession | null = null;

  if (!signedIn && refreshToken) {
    issued = await rotate(refreshToken);
    signedIn = issued !== null;
  }

  let response: NextResponse;
  if (!feedbackApiUrl && !signedIn && matches(pathname, protectedPrefixes)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    response = NextResponse.redirect(login);
  } else if (!feedbackApiUrl && signedIn && matches(pathname, guestOnly)) {
    response = NextResponse.redirect(new URL("/dashboard", request.url));
  } else if (issued) {
    request.cookies.set(accessCookie, issued.accessToken);
    request.cookies.set(refreshCookie, issued.refreshToken);
    const headers = new Headers(request.headers);
    headers.set("cookie", request.cookies.toString());
    response = feedbackApiUrl
      ? NextResponse.rewrite(feedbackApiUrl, { request: { headers } })
      : NextResponse.next({ request: { headers } });
  } else if (feedbackApiUrl) {
    response = NextResponse.rewrite(feedbackApiUrl);
  } else {
    response = NextResponse.next();
  }

  if (issued) {
    writeSession(response.cookies, issued);
  }

  return withCors(response, origin);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
