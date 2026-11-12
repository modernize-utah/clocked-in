import { Access, accessForSubject } from "@/lib/api/access";
import { unauthorized } from "@/lib/api/errors";
import { listOrganizations } from "@/lib/api/features/organizations";
import { isCoordinator } from "@/lib/roles";
import type { GroupDepartments } from "@/lib/types";

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
export async function getUserWorkspace(access: Access, requestedOrganizationId: string | null) {
  access.requireHuman();
  const apex = access.tenantSlug ? await accessForSubject(access.caller.id, null) : access;
  if (!apex) {
    unauthorized("This token is not valid for this server.");
  }

  const organizations = (await listOrganizations(apex, new URLSearchParams({ limit: "100" }))).items;
  const requested = requestedOrganizationId?.trim() || null;
  const organization =
    (requested ? organizations.find((item) => item.id === requested) : undefined) ?? organizations[0] ?? null;
  const viewer = viewerFor(apex);
  const role = organization ? await apex.organizationRole(organization.id) : null;
  const permissions = organization ? [...(await apex.permissionsFor(organization.id))] : [];
  const isAdmin = organization ? viewer.isSuperAdmin || (await apex.can(organization.id, "manage_organization")) : false;
  const canSelectRate = organization ? role === "ADMIN" || role === "MEMBER" || isAdmin : false;
  const groupDepartments: GroupDepartments = !organization
    ? []
    : isAdmin
      ? "all"
      : await apex.adminDepartmentIds(organization.id);

  return {
    viewer,
    organizations,
    organization,
    isAdmin,
    isCoordinator: isCoordinator(groupDepartments),
    canSelectRate,
    role,
    permissions,
    groupDepartments,
  };
}
