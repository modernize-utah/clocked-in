import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { resolveRequestTenantSlug } from "@/lib/portal";
import { prisma } from "@/lib/prisma";

export const getTenantSlug = cache(async (): Promise<string | null> => {
  const store = await headers();
  return resolveRequestTenantSlug(store);
});

export const getPinnedTenant = cache(async () => {
  const slug = await getTenantSlug();
  if (!slug) {
    return { pinned: false as const, slug: null, tenant: null };
  }

  const tenant = await prisma.tenant.findFirst({
    where: { slug },
    include: { theme: true },
  });
  return { pinned: true as const, slug, tenant };
});

export async function requirePinnedTenantOrApex() {
  const state = await getPinnedTenant();
  if (state.pinned && !state.tenant) {
    notFound();
  }

  return state;
}
