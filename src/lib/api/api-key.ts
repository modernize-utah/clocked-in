import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const livePrefix = "cki_live_";
export const testPrefix = "cki_test_";

const knownScopes = ["org:read", "org:write", "org:admin"] as const;

export type ApiKeyPrincipal = {
  id: string;
  tenantId: string;
  createdByUserId: string;
  scopes: string[];
  isAdmin: boolean;
  canWrite: boolean;
  canRead: boolean;
};

export function looksLikeApiKey(value: string) {
  return value.startsWith(livePrefix) || value.startsWith(testPrefix);
}

export function presentedApiKey(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(\S+)$/i.exec(header)?.[1];
  if (bearer && looksLikeApiKey(bearer)) {
    return bearer;
  }

  const apiKey = request.headers.get("x-api-key")?.trim();
  return apiKey ? apiKey : null;
}

export function prefixOf(key: string) {
  if (!looksLikeApiKey(key)) {
    return null;
  }

  const kindLength = key.startsWith(livePrefix) ? livePrefix.length : testPrefix.length;
  const separator = kindLength + 8;
  if (key.length <= separator + 1 || key[separator] !== "_") {
    return null;
  }

  return key.slice(0, separator);
}

export function combineApiKey(prefix: string, secret: string) {
  return `${prefix}_${secret}`;
}

function pepper() {
  const value = process.env.API_KEY_PEPPER ?? "";
  if (value.length < 32) {
    throw new Error("API_KEY_PEPPER must be at least 32 characters.");
  }

  return Buffer.from(value);
}

export function hashApiKey(key: string) {
  return createHmac("sha256", pepper()).update(key, "utf8").digest("hex");
}

export function apiKeyMatches(key: string, keyHash: string) {
  const actual = Buffer.from(hashApiKey(key), "utf8");
  const expected = Buffer.from(keyHash, "utf8");
  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}

let dummyHash: string | undefined;

export function verifyDummyApiKey(key: string) {
  dummyHash ??= hashApiKey("clocked-in-dummy-api-key");
  apiKeyMatches(key, dummyHash);
}

export function issueApiKey() {
  const env = process.env.APP_ENV?.trim().toLowerCase();
  const kind = env === "production" || env === "staging" ? livePrefix : testPrefix;
  const prefix = kind + randomBytes(4).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  return { prefix, secret };
}

export function parseScopes(json: string) {
  try {
    const value = JSON.parse(json) as unknown;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function formatScopes(scopes: string[]) {
  return JSON.stringify([...new Set(scopes)].sort());
}

export function principalFromScopes(
  key: { id: string; tenantId: string; createdByUserId: string },
  scopes: string[],
): ApiKeyPrincipal {
  const isAdmin = scopes.includes("org:admin");
  const canWrite = isAdmin || scopes.includes("org:write");
  return {
    id: key.id,
    tenantId: key.tenantId,
    createdByUserId: key.createdByUserId,
    scopes,
    isAdmin,
    canWrite,
    canRead: canWrite || scopes.includes("org:read"),
  };
}

export function isKnownScope(value: string): value is (typeof knownScopes)[number] {
  return (knownScopes as readonly string[]).includes(value);
}
