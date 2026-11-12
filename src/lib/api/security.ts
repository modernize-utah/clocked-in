import { createHash, randomBytes, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { fail } from "@/lib/api/errors";
import { tenantOrigin } from "@/lib/portal";

const accessTokenMs = 15 * 60 * 1000;
export const refreshTokenMs = 30 * 24 * 60 * 60 * 1000;
// Parallel requests after the access cookie expires present the same refresh token.
// The first use rotates it. Later uses inside this window still sign in.
export const refreshReuseMs = 2 * 60 * 1000;
export const resetCodeMs = 15 * 60 * 1000;
export const resetCooldownMs = 60 * 1000;
export const inviteMs = 7 * 24 * 60 * 60 * 1000;

export function randomCode() {
  return randomBytes(32).toString("base64url");
}

export function numericCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export async function allocateNumericCode(isTaken: (codeHash: string) => Promise<boolean>) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = numericCode();
    if (!(await isTaken(hashCode(code)))) {
      return code;
    }
  }

  throw new Error("Could not allocate a one-time code.");
}

export function appUrl(path: string, slug?: string | null) {
  const base = tenantOrigin(slug);
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

// No 0/O, 1/I/L, or U, so a code read from an email is easy to type.
const inviteAlphabet = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

/** About 59 bits, shown as ABCD-EFGH-JKMN. Invites last a week, so they cannot be short like reset codes. */
export function inviteCode() {
  const characters = Array.from({ length: 12 }, () => inviteAlphabet[randomInt(0, inviteAlphabet.length)]);
  return [0, 4, 8].map((start) => characters.slice(start, start + 4).join("")).join("-");
}

/** Typed codes may differ in case, spacing, and dashes. Older 6-digit invites still match. */
export function normalizeInviteCode(code: string) {
  return code.trim().toUpperCase().replace(/[\s-]/g, "");
}

export function hashCode(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

let dummyHash: Promise<string> | undefined;

export async function verifyDummy(password: string) {
  dummyHash ??= bcrypt.hash("clocked-in-dummy-password", 12);
  await bcrypt.compare(password, await dummyHash);
}

function jwtConfig() {
  const signingKey = process.env.JWT_SIGNING_KEY;
  const issuer = process.env.JWT_ISSUER;
  const audience = process.env.JWT_AUDIENCE;
  if (!signingKey || signingKey.length < 32 || !issuer || !audience) {
    throw new Error("JWT_SIGNING_KEY, JWT_ISSUER, and JWT_AUDIENCE must be set.");
  }

  return { key: new TextEncoder().encode(signingKey), issuer, audience };
}

export async function signAccessToken(user: {
  id: string;
  email: string;
  username: string;
  isSuperAdmin: boolean;
}) {
  const { key, issuer, audience } = jwtConfig();
  const expiresAt = new Date(Date.now() + accessTokenMs);
  const accessToken = await new SignJWT({
    email: user.email,
    username: user.username,
    isSuperAdmin: user.isSuperAdmin,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(key);

  return { accessToken, expiresAt };
}

export const accessCookie = "ci_access";
export const refreshCookie = "ci_refresh";
export const accessCookieSeconds = accessTokenMs / 1000;
export const refreshCookieSeconds = refreshTokenMs / 1000;

export async function verifyAccessToken(token: string) {
  try {
    const { key, issuer, audience } = jwtConfig();
    const { payload } = await jwtVerify(token, key, {
      issuer,
      audience,
      algorithms: ["HS256"],
      requiredClaims: ["exp"],
    });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export function cookieValue(header: string | null, name: string) {
  for (const part of (header ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return null;
}

// Cookie sessions only authorize safe methods; writes from the web UI go through server actions.
function requestToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  if (header) {
    return /^Bearer\s+(\S+)$/i.exec(header)?.[1] ?? null;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    return cookieValue(request.headers.get("cookie"), accessCookie);
  }

  return null;
}

export async function readAccessSubject(request: Request) {
  const token = requestToken(request);
  const subject = token ? await verifyAccessToken(token) : null;
  if (!subject) {
    fail(401, "unauthorized", "Authentication is required.");
  }

  return subject;
}
