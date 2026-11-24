import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { listCollective } from "@/lib/api/features/collective";
import { listTenantInvitations } from "@/lib/api/features/invitations";
import { loadLookups } from "@/lib/api/features/lookups";
import { listOrgMemberships } from "@/lib/api/features/memberships";
import { listTenants } from "@/lib/api/features/tenants";
import { report } from "@/lib/api/features/reports";
import { listTimeEntries } from "@/lib/api/features/time-entries";
import { displayAppOrigin } from "@/lib/portal";
import { tenantCookie } from "@/lib/server/session-cookies";
import { getAccess, requireAccess } from "@/lib/server/session";
import { getPinnedTenant, requirePinnedTenantOrApex } from "@/lib/server/tenant";
import { isCoordinator } from "@/lib/roles";
import type { DateRange, GroupOrganizations, Lookups, Viewer } from "@/lib/types";

export function searchParamsFor(values: Record<string, string | number | undefined | null>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }

  return params;
}

export const getViewer = cache(async (): Promise<Viewer> => {
  const { caller } = await requireAccess();
  const profile = caller.profile;
  const name =
    profile?.displayName?.trim() || (profile ? `${profile.firstName} ${profile.lastName}`.trim() : "") || caller.username;
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return {
    id: caller.id,
    username: caller.username,
    email: caller.email,
    isSuperAdmin: caller.isSuperAdmin,
    name,
    initials,
    avatarUrl: profile?.avatarUrl?.trim() || null,
    timezone: profile?.timezone?.trim() || "UTC",
  };
});

export const getTenants = cache(async () => {
  await requirePinnedTenantOrApex();
  const access = await requireAccess();
  return (await listTenants(access, searchParamsFor({ limit: 100 }))).items;
});

export const getWorkspace = cache(async () => {
  const access = await requireAccess();
  const [viewer, tenants, store, pinned, headerList] = await Promise.all([
    getViewer(),
    getTenants(),
    cookies(),
    requirePinnedTenantOrApex(),
    headers(),
  ]);
  const stored = store.get(tenantCookie)?.value;
  const tenant = pinned.pinned
    ? (tenants.find((item) => item.id === pinned.tenant?.id) ?? null)
    : (tenants.find((item) => item.id === stored) ?? tenants[0] ?? null);
  const role = tenant ? await access.tenantRole(tenant.id) : null;
  const permissions = tenant ? [...(await access.permissionsFor(tenant.id))] : [];
  const isAdmin = tenant
    ? (!pinned.pinned && viewer.isSuperAdmin) || (await access.can(tenant.id, "manage_tenant"))
    : false;
  const canSelectRate = tenant ? role === "ADMIN" || role === "MEMBER" || isAdmin : false;
  const groupOrganizations: GroupOrganizations = !tenant
    ? []
    : isAdmin
      ? "all"
      : await access.adminOrganizationIds(tenant.id);
  return {
    viewer,
    tenants,
    tenant,
    isAdmin,
    isCoordinator: isCoordinator(groupOrganizations),
    canSelectRate,
    role,
    permissions,
    groupOrganizations,
    isTenantHost: pinned.pinned,
    pinnedTenantName: pinned.tenant?.name ?? null,
    appOrigin: displayAppOrigin({
      requestHost: headerList.get("x-forwarded-host") ?? headerList.get("host"),
      requestProtocol: headerList.get("x-forwarded-proto"),
    }),
  };
});

export const getCurrentTenant = cache(async () => {
  const access = await getAccess();
  if (!access) {
    return null;
  }

  const [tenants, store, pinned] = await Promise.all([
    listTenants(access, searchParamsFor({ limit: 100 })),
    cookies(),
    getPinnedTenant(),
  ]);
  if (pinned.pinned) {
    if (!pinned.tenant) {
      return null;
    }

    return tenants.items.find((item) => item.id === pinned.tenant?.id) ?? null;
  }

  const stored = store.get(tenantCookie)?.value;
  return tenants.items.find((item) => item.id === stored) ?? tenants.items[0] ?? null;
});

export const getLookups = cache(async (tenantId: string): Promise<Lookups> =>
  loadLookups(await requireAccess(), tenantId),
);

export const getMembers = cache(async (tenantId: string) => {
  const access = await requireAccess();
  return (await listOrgMemberships(access, tenantId, searchParamsFor({ limit: 100 }))).items;
});

export const getInvitations = cache(async (tenantId: string) => {
  const access = await requireAccess();
  return (await listTenantInvitations(access, tenantId, searchParamsFor({ limit: 100 }))).items;
});

export async function getEntries(
  tenantId: string,
  userId: string,
  range: DateRange = {},
  offset = 0,
  limit = 50,
) {
  const access = await requireAccess();
  return listTimeEntries(access, userId, searchParamsFor({ tenantId, ...range, offset, limit }));
}

export async function getGroupSessions(tenantId: string, offset = 0, limit = 50) {
  const access = await requireAccess();
  return listCollective(access, searchParamsFor({ tenantId, offset, limit }));
}

export async function getOpenPunch() {
  const access = await requireAccess();
  const recent = await listTimeEntries(access, access.caller.id, searchParamsFor({ limit: 20 }));
  return recent.items.find((entry) => entry.mode === "Punch" && !entry.endedAt) ?? null;
}

export const getReport = cache(async (tenantId: string, from?: string, to?: string) => {
  const access = await requireAccess();
  return report(access, tenantId, searchParamsFor({ from, to }));
});
