import "server-only";
import { cookies } from "next/headers";
import { themeJson } from "@/lib/api/features/themes";
import { prisma } from "@/lib/prisma";
import { tenantCookie } from "@/lib/server/session-cookies";
import { getPinnedTenant } from "@/lib/server/tenant";

export async function getAuthBrand() {
  const pinned = await getPinnedTenant();
  if (pinned.pinned) {
    const org = pinned.tenant;
    if (!org) {
      return null;
    }

    return {
      id: org.id,
      name: org.name,
      markUrl: org.markUrl,
      wordmarkUrl: org.wordmarkUrl,
      wordmarkOnLightUrl: org.wordmarkOnLightUrl,
      theme: org.theme ? themeJson(org.theme) : null,
      isTenantHost: true,
    };
  }

  const store = await cookies();
  const id = store.get(tenantCookie)?.value;
  if (!id) {
    return null;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: { theme: true },
  });
  if (!tenant) {
    return null;
  }

  return {
    id: tenant.id,
    name: tenant.name,
    markUrl: tenant.markUrl,
    wordmarkUrl: tenant.wordmarkUrl,
    wordmarkOnLightUrl: tenant.wordmarkOnLightUrl,
    theme: tenant.theme ? themeJson(tenant.theme) : null,
    isTenantHost: false,
  };
}
