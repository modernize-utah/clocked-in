import { Access, accessForSubject } from "@/lib/api/access";
import { unauthorized } from "@/lib/api/errors";
import { listTenants } from "@/lib/api/features/tenants";
import { isCoordinator } from "@/lib/roles";
import type { GroupOrganizations } from "@/lib/types";

function viewerFor(access: Access) {
  const caller = access.caller;
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
}

/** Apex workspace for a signed-in person. Tenant host headers do not pin this payload. */
export async function getUserWorkspace(access: Access, requestedTenantId: string | null) {
  access.requireHuman();
  const apex = access.tenantSlug ? await accessForSubject(access.caller.id, null) : access;
  if (!apex) {
    unauthorized("This token is not valid for this server.");
  }

  const tenants = (await listTenants(apex, new URLSearchParams({ limit: "100" }))).items;
  const requested = requestedTenantId?.trim() || null;
  const tenant =
    (requested ? tenants.find((item) => item.id === requested) : undefined) ?? tenants[0] ?? null;
  const viewer = viewerFor(apex);
  const role = tenant ? await apex.tenantRole(tenant.id) : null;
  const permissions = tenant ? [...(await apex.permissionsFor(tenant.id))] : [];
  const isAdmin = tenant ? viewer.isSuperAdmin || (await apex.can(tenant.id, "manage_tenant")) : false;
  const canSelectRate = tenant ? role === "ADMIN" || role === "MEMBER" || isAdmin : false;
  const groupOrganizations: GroupOrganizations = !tenant
    ? []
    : isAdmin
      ? "all"
      : await apex.adminOrganizationIds(tenant.id);

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
  };
}
