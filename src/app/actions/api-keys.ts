"use server";

import { createApiKey, parseCreateApiKey, parseUpdateApiKey, revokeApiKey, rotateApiKey, updateApiKey } from "@/lib/api/features/api-keys";
import { run } from "@/lib/server/action";
import { requireAccess } from "@/lib/server/session";

export async function createApiKeyAction(
  tenantId: string,
  input: { name: string; scopes: string[]; expiresAt: string | null },
) {
  return run(async () => {
    const access = await requireAccess();
    return createApiKey(
      access,
      tenantId,
      parseCreateApiKey({
        name: input.name,
        scopes: input.scopes,
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      }),
    );
  }, "API key created.");
}

export async function updateApiKeyAction(
  tenantId: string,
  keyId: string,
  input: { name: string; scopes: string[]; expiresAt: string | null },
) {
  return run(async () => {
    const access = await requireAccess();
    return updateApiKey(
      access,
      tenantId,
      keyId,
      parseUpdateApiKey({ name: input.name, scopes: input.scopes, expiresAt: input.expiresAt }),
    );
  }, "API key saved.");
}

export async function rotateApiKeyAction(tenantId: string, keyId: string) {
  return run(async () => {
    const access = await requireAccess();
    return rotateApiKey(access, tenantId, keyId);
  }, "API key rotated.");
}

export async function revokeApiKeyAction(tenantId: string, keyId: string) {
  return run(async () => {
    const access = await requireAccess();
    await revokeApiKey(access, tenantId, keyId);
  }, "API key revoked.");
}
