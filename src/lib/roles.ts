import type { Permission } from "@/lib/permissions";
import type { GroupOrganizations } from "@/lib/types";

export function canLogGroupTime(groupOrganizations: GroupOrganizations, permissions?: Iterable<string>) {
  if (permissions && new Set(permissions).has("log_group_sessions")) {
    return true;
  }
  return groupOrganizations === "all" || groupOrganizations.length > 0;
}

export function isCoordinator(groupOrganizations: GroupOrganizations) {
  return groupOrganizations !== "all" && groupOrganizations.length > 0;
}

export function canLogMemberTime(isAdmin: boolean, groupOrganizations: GroupOrganizations, permissions?: Iterable<string>) {
  if (permissions && new Set(permissions).has("log_member_time")) {
    return true;
  }
  return isAdmin || isCoordinator(groupOrganizations);
}

export function canLogConnectionTime(input: {
  role: string | null;
  isAdmin: boolean;
  allowVolunteersToAddVolunteers: boolean;
  connectionCount: number;
}) {
  if (input.role === "VOLUNTEER" && (input.allowVolunteersToAddVolunteers || input.connectionCount > 0)) {
    return true;
  }

  return input.isAdmin && input.connectionCount > 0;
}

export function canSeeReports(input: {
  role: string | null;
  isAdmin: boolean;
  isCoordinator: boolean;
  permissions?: Iterable<string>;
}) {
  if (input.permissions && new Set(input.permissions).has("view_reports")) {
    return true;
  }
  return input.isAdmin || input.isCoordinator || input.role === "MEMBER";
}

export function workspaceCan(permissions: Iterable<string>, permission: Permission) {
  return new Set(permissions).has(permission);
}
