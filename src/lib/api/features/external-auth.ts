import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { accountInclude, type Account } from "@/lib/api/access";
import { unauthorized, validation } from "@/lib/api/errors";
import { normalizeEmail } from "@/lib/api/json";
import { portalSignInEnabled, readPreferences } from "@/lib/api/features/tenants";
import { userJson } from "@/lib/api/features/users";
import { decryptSecret } from "@/lib/external-sync/crypto";
import {
  hashCode,
  randomCode,
  refreshTokenMs,
  signAccessToken,
} from "@/lib/api/security";
import { prisma } from "@/lib/prisma";

const stateTtlMs = 10 * 60 * 1000;

type OidcDiscovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
};

function stateSecret() {
  const value = process.env.JWT_SIGNING_KEY ?? "";
  if (value.length < 32) {
    throw new Error("JWT_SIGNING_KEY must be set.");
  }
  return value;
}

function base64url(buf: Buffer) {
  return buf.toString("base64url");
}

export function createPkcePair() {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function createExternalAuthState(payload: {
  tenantId: string;
  next: string;
  codeVerifier: string;
}) {
  const body = Buffer.from(
    JSON.stringify({
      tenantId: payload.tenantId,
      next: payload.next,
      codeVerifier: payload.codeVerifier,
      exp: Date.now() + stateTtlMs,
      nonce: randomBytes(8).toString("base64url"),
    }),
    "utf8",
  ).toString("base64url");
  const sig = createHmac("sha256", stateSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function parseExternalAuthState(state: string) {
  const [body, sig] = state.split(".");
  if (!body || !sig) {
    validation("Invalid auth state.");
  }
  const expected = createHmac("sha256", stateSecret()).update(body).digest("base64url");
  const actualBuf = Buffer.from(sig, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
    validation("Invalid auth state.");
  }

  let parsed: { tenantId?: string; next?: string; exp?: number; codeVerifier?: string };
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    validation("Invalid auth state.");
  }

  if (!parsed.tenantId || !parsed.exp || parsed.exp < Date.now() || !parsed.codeVerifier) {
    validation("Auth state expired.");
  }

  return {
    tenantId: parsed.tenantId,
    codeVerifier: parsed.codeVerifier,
    next: typeof parsed.next === "string" && parsed.next.startsWith("/") ? parsed.next : "/dashboard",
  };
}

async function issueSession(user: Account) {
  const { accessToken, expiresAt } = await signAccessToken(user);
  const refreshToken = randomCode();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashCode(refreshToken),
      expiresAt: new Date(Date.now() + refreshTokenMs),
    },
  });
  return { accessToken, refreshToken, expiresAt: expiresAt.toISOString(), user: userJson(user) };
}

export async function fetchOidcDiscovery(portalOrigin: string): Promise<OidcDiscovery> {
  const origin = portalOrigin.replace(/\/$/, "");
  const res = await fetch(`${origin}/.well-known/openid-configuration`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    validation("Portal OpenID discovery failed.");
  }
  const json = (await res.json()) as Partial<OidcDiscovery>;
  if (!json.authorization_endpoint || !json.token_endpoint || !json.jwks_uri) {
    validation("Portal OpenID discovery document is incomplete.");
  }
  return json as OidcDiscovery;
}

export async function buildPortalAuthorizeUrl(input: {
  tenantId: string;
  redirectUri: string;
  next?: string;
}) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
    select: {
      id: true,
      preferences: true,
      portalClientId: true,
    },
  });
  if (!tenant) {
    unauthorized("Tenant not found.");
  }
  const preferences = readPreferences(tenant.preferences);
  if (!portalSignInEnabled(preferences) || !preferences.portalOrigin || !tenant.portalClientId) {
    validation("Portal sign-in is not configured for this tenant.");
  }

  const discovery = await fetchOidcDiscovery(preferences.portalOrigin);
  const { verifier, challenge } = createPkcePair();
  const state = createExternalAuthState({
    tenantId: tenant.id,
    next: input.next ?? "/dashboard",
    codeVerifier: verifier,
  });

  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", tenant.portalClientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", "openid profile email memberships");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return { url: url.toString(), state };
}

/**
 * Complete portal OIDC authorization-code login: exchange code, verify id_token via JWKS,
 * map sub → User.externalId, ensure tenant membership, issue VolunTime session.
 */
export async function completePortalAuth(input: {
  tenantId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
    select: {
      id: true,
      preferences: true,
      portalClientId: true,
      portalClientSecretEnc: true,
    },
  });
  if (!tenant) {
    unauthorized("Tenant not found.");
  }

  const preferences = readPreferences(tenant.preferences);
  if (!portalSignInEnabled(preferences) || !preferences.portalOrigin || !tenant.portalClientId) {
    validation("Portal sign-in is not configured for this tenant.");
  }

  const discovery = await fetchOidcDiscovery(preferences.portalOrigin);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: tenant.portalClientId,
    code_verifier: input.codeVerifier,
  });
  if (tenant.portalClientSecretEnc) {
    body.set("client_secret", decryptSecret(tenant.portalClientSecretEnc));
  }

  const tokenRes = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    cache: "no-store",
  });
  if (!tokenRes.ok) {
    unauthorized("Portal token exchange failed.");
  }
  const tokenJson = (await tokenRes.json()) as { id_token?: string };
  if (!tokenJson.id_token) {
    unauthorized("Portal token response missing id_token.");
  }

  const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(tokenJson.id_token, jwks, {
      algorithms: ["RS256"],
      issuer: preferences.portalOrigin.replace(/\/$/, ""),
      audience: tenant.portalClientId,
    });
    payload = verified.payload as Record<string, unknown>;
  } catch {
    unauthorized("Portal ID token is invalid.");
  }

  const sub = typeof payload.sub === "string" ? payload.sub : null;
  if (!sub) {
    unauthorized("Portal ID token missing sub.");
  }

  const emailRaw = typeof payload.email === "string" ? payload.email : null;
  const email = emailRaw ? normalizeEmail(emailRaw) : null;
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const [firstName, ...rest] = name ? name.split(/\s+/) : ["Portal", "User"];
  const lastName = rest.length ? rest.join(" ") : "User";

  const memberRole = await prisma.role.findFirst({
    where: { code: "MEMBER", tenantId: null },
  });
  if (!memberRole) {
    throw new Error("System MEMBER role is missing.");
  }

  const user = await prisma.$transaction(async (tx) => {
    let existing = await tx.user.findFirst({
      where: { externalId: sub },
      include: accountInclude,
    });

    if (!existing && email) {
      existing = await tx.user.findFirst({
        where: { email },
        include: accountInclude,
      });
      if (existing && !existing.externalId) {
        existing = await tx.user.update({
          where: { id: existing.id },
          data: { externalId: sub },
          include: accountInclude,
        });
      }
    }

    if (!existing) {
      const usernameBase = (email?.split("@")[0] || `portal-${sub.slice(0, 8)}`)
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, "")
        .slice(0, 40);
      let username = usernameBase || `portal-${sub.slice(0, 8)}`;
      let n = 0;
      while (await tx.user.findUnique({ where: { username } })) {
        n += 1;
        username = `${usernameBase.slice(0, 36)}${n}`;
      }
      const passwordHash = await bcrypt.hash(randomBytes(32).toString("base64url"), 10);
      existing = await tx.user.create({
        data: {
          username,
          email: email ?? `${username}@portal.local`,
          passwordHash,
          externalId: sub,
          mustChangePassword: false,
          profile: {
            create: {
              firstName: firstName || "Portal",
              lastName: lastName || "User",
              displayName: name || null,
            },
          },
        },
        include: accountInclude,
      });
    } else if (name || email) {
      await tx.userProfile.update({
        where: { userId: existing.id },
        data: {
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          displayName: name || undefined,
        },
      });
      if (email && email !== existing.email) {
        existing = await tx.user.update({
          where: { id: existing.id },
          data: { email },
          include: accountInclude,
        });
      } else {
        existing = await tx.user.findUniqueOrThrow({
          where: { id: existing.id },
          include: accountInclude,
        });
      }
    }

    const membership = await tx.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: existing.id, tenantId: tenant.id } },
    });
    if (!membership) {
      await tx.tenantMembership.create({
        data: {
          userId: existing.id,
          tenantId: tenant.id,
          roleId: memberRole.id,
          isActive: true,
        },
      });
    } else if (!membership.isActive) {
      await tx.tenantMembership.update({
        where: { id: membership.id },
        data: { isActive: true },
      });
    }

    return tx.user.findUniqueOrThrow({
      where: { id: existing.id },
      include: accountInclude,
    });
  });

  return issueSession(user);
}

/** @deprecated Use completePortalAuth. Kept for transitional call sites. */
export async function completeExternalAuth(input: {
  tenantId: string;
  token: string;
}) {
  void input;
  unauthorized("Use the portal authorization-code callback.");
}

/** @deprecated Prefer buildPortalAuthorizeUrl. */
export function buildAuthorityRedirectUrl(input: {
  authorityUrl: string;
  clientId: string;
  redirectUri: string;
  state: string;
  scope?: string;
}) {
  const url = new URL(input.authorityUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", input.scope ?? "openid profile email memberships");
  url.searchParams.set("state", input.state);
  return url.toString();
}
