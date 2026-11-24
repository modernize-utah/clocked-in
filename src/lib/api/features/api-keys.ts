import { randomUUID } from "node:crypto";
import { Access } from "@/lib/api/access";
import { combineApiKey, formatScopes, hashApiKey, isKnownScope, issueApiKey, parseScopes } from "@/lib/api/api-key";
import { guard } from "@/lib/api/db";
import { notFound, validation } from "@/lib/api/errors";
import { Body, has, list, optional, page, requireInstant, requireString } from "@/lib/api/json";
import { prisma } from "@/lib/prisma";

type KeyRow = {
  id: string;
  tenantId: string;
  name: string;
  prefix: string;
  scopes: string;
  createdByUserId: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
};

function keyJson(key: KeyRow, secret?: string) {
  return {
    id: key.id,
    tenantId: key.tenantId,
    name: key.name,
    prefix: key.prefix,
    scopes: parseScopes(key.scopes),
    createdByUserId: key.createdByUserId,
    createdAt: key.createdAt.toISOString(),
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    ...(secret ? { key: combineApiKey(key.prefix, secret) } : {}),
  };
}

function requireKeyName(body: Body) {
  const name = requireString(body, "name").trim();
  if (name.length < 1 || name.length > 80) {
    validation("name must be 1 to 80 characters.");
  }

  return name;
}

function requireScopes(body: Body) {
  const value = body.scopes;
  if (!Array.isArray(value) || value.length === 0) {
    validation("scopes must be a non-empty array.");
  }

  return [
    ...new Set(
      value.map((item, index) => {
        if (typeof item !== "string") {
          validation(`scopes[${index}] must be a string.`);
        }

        if (!isKnownScope(item)) {
          validation("scopes must be org:read, org:write, or org:admin.");
        }

        return item;
      }),
    ),
  ];
}

function optionalExpiry(body: Body) {
  if (!has(body, "expiresAt") || body.expiresAt === null) {
    return null;
  }

  return requireInstant(body, "expiresAt");
}

export function parseCreateApiKey(body: Body) {
  return {
    name: requireKeyName(body),
    scopes: requireScopes(body),
    expiresAt: optionalExpiry(body),
  };
}

export function parseUpdateApiKey(body: Body) {
  const request = {
    name: optional(body, "name", (source) => requireKeyName(source)),
    scopes: optional(body, "scopes", (source) => requireScopes(source)),
    expiresAt: optional(body, "expiresAt", (source) => optionalExpiry(source)),
  };
  if (!request.name.set && !request.scopes.set && !request.expiresAt.set) {
    validation("Provide at least one field to update.");
  }

  return request;
}

async function managed(access: Access, tenantId: string, keyId: string) {
  await access.requireTenantAdmin(tenantId);
  const key = await prisma.tenantApiKey.findFirst({ where: { id: keyId, tenantId } });
  if (!key || key.revokedAt) {
    notFound();
  }

  return key;
}

export async function listApiKeys(access: Access, tenantId: string, params: URLSearchParams) {
  access.requireHuman();
  await access.requireTenantAdmin(tenantId);
  const paging = page(params);
  const keys = await prisma.tenantApiKey.findMany({
    where: { tenantId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    skip: paging.offset,
    take: paging.limit,
  });
  return list(keys.map((key) => keyJson(key)), paging);
}

export async function createApiKey(access: Access, tenantId: string, request: ReturnType<typeof parseCreateApiKey>) {
  const user = access.requireHuman();
  await access.requireTenantAdmin(tenantId);
  const issued = issueApiKey();
  const key = await guard(
    prisma.tenantApiKey.create({
      data: {
        id: randomUUID(),
        tenantId,
        name: request.name,
        prefix: issued.prefix,
        keyHash: hashApiKey(combineApiKey(issued.prefix, issued.secret)),
        scopes: formatScopes(request.scopes),
        createdByUserId: user.id,
        createdAt: new Date(),
        expiresAt: request.expiresAt,
      },
    }),
  );
  return keyJson(key, issued.secret);
}

export async function updateApiKey(
  access: Access,
  tenantId: string,
  keyId: string,
  request: ReturnType<typeof parseUpdateApiKey>,
) {
  access.requireHuman();
  const key = await managed(access, tenantId, keyId);
  const updated = await guard(
    prisma.tenantApiKey.update({
      where: { id: key.id },
      data: {
        name: request.name.set ? request.name.value : undefined,
        scopes: request.scopes.set ? formatScopes(request.scopes.value) : undefined,
        expiresAt: request.expiresAt.set ? request.expiresAt.value : undefined,
      },
    }),
  );
  return keyJson(updated);
}

export async function rotateApiKey(access: Access, tenantId: string, keyId: string) {
  access.requireHuman();
  const key = await managed(access, tenantId, keyId);
  const issued = issueApiKey();
  const updated = await guard(
    prisma.tenantApiKey.update({
      where: { id: key.id },
      data: {
        prefix: issued.prefix,
        keyHash: hashApiKey(combineApiKey(issued.prefix, issued.secret)),
      },
    }),
  );
  return keyJson(updated, issued.secret);
}

export async function revokeApiKey(access: Access, tenantId: string, keyId: string) {
  access.requireHuman();
  const key = await managed(access, tenantId, keyId);
  await guard(
    prisma.tenantApiKey.update({
      where: { id: key.id },
      data: { revokedAt: new Date() },
    }),
  );
}
