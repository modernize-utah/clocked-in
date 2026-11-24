import {
  accessCookie,
  accessCookieSeconds,
  refreshCookie,
  refreshCookieSeconds,
} from "@/lib/api/security";

export const tenantCookie = "clocked-in-org";

type CookieWriter = {
  set(name: string, value: string, options: Record<string, unknown>): unknown;
  delete(name: string): unknown;
};

export type IssuedSession = { accessToken: string; refreshToken: string };

const base = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

export function writeSession(store: CookieWriter, session: IssuedSession) {
  store.set(accessCookie, session.accessToken, { ...base, maxAge: accessCookieSeconds });
  store.set(refreshCookie, session.refreshToken, { ...base, maxAge: refreshCookieSeconds });
}

export function eraseSession(store: CookieWriter) {
  store.delete(accessCookie);
  store.delete(refreshCookie);
}

export function writeTenant(store: CookieWriter, tenantId: string) {
  store.set(tenantCookie, tenantId, { ...base, maxAge: 60 * 60 * 24 * 365 });
}
