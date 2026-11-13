import "server-only";
import { cookies } from "next/headers";
import { themeJson } from "@/lib/api/features/themes";
import { prisma } from "@/lib/prisma";
import { organizationCookie } from "@/lib/server/session-cookies";
import { getPinnedOrganization } from "@/lib/server/tenant";

export async function getAuthBrand() {
  const pinned = await getPinnedOrganization();
  if (pinned.pinned) {
    const org = pinned.organization;
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
  const id = store.get(organizationCookie)?.value;
  if (!id) {
    return null;
  }

  const organization = await prisma.organization.findUnique({
    where: { id },
    include: { theme: true },
  });
  if (!organization) {
    return null;
  }

  return {
    id: organization.id,
    name: organization.name,
    markUrl: organization.markUrl,
    wordmarkUrl: organization.wordmarkUrl,
    wordmarkOnLightUrl: organization.wordmarkOnLightUrl,
    theme: organization.theme ? themeJson(organization.theme) : null,
    isTenantHost: false,
  };
}
