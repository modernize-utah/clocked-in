import type { Workspace } from "@/api/types";

function has(permissions: string[], permission: string) {
  return permissions.includes(permission);
}

export function canSeeReports(workspace: Workspace) {
  return (
    workspace.isAdmin ||
    workspace.isCoordinator ||
    workspace.role === "MEMBER" ||
    has(workspace.permissions, "view_reports")
  );
}

export function canLogMemberTime(workspace: Workspace) {
  return workspace.isAdmin || workspace.isCoordinator || has(workspace.permissions, "log_member_time");
}

export function canLogGroupTime(workspace: Workspace) {
  return (
    has(workspace.permissions, "log_group_sessions") ||
    workspace.groupDepartments === "all" ||
    workspace.groupDepartments.length > 0
  );
}

export function canLogConnectionTime(workspace: Workspace, connectionCount: number) {
  if (workspace.role === "VOLUNTEER" && (workspace.organization?.preferences.allowVolunteersToAddVolunteers || connectionCount > 0)) {
    return true;
  }
  return workspace.isAdmin && connectionCount > 0;
}

export function canManageNeeds(workspace: Workspace) {
  return (
    workspace.isAdmin ||
    workspace.isCoordinator ||
    has(workspace.permissions, "create_needs") ||
    has(workspace.permissions, "approve_needs")
  );
}

export function canManagePeople(workspace: Workspace) {
  return (
    workspace.isAdmin ||
    workspace.isCoordinator ||
    has(workspace.permissions, "manage_members") ||
    has(workspace.permissions, "invite_members")
  );
}

export function canManageSettings(workspace: Workspace) {
  return workspace.isAdmin || workspace.isCoordinator;
}

export function canViewPayroll(workspace: Workspace) {
  return has(workspace.permissions, "view_payroll");
}

export const permissionGroups: { label: string; items: { key: string; label: string }[] }[] = [
  {
    label: "Organization",
    items: [
      { key: "manage_organization", label: "Manage organization settings" },
      { key: "manage_roles", label: "Create and edit roles" },
      { key: "manage_members", label: "Manage people" },
      { key: "invite_members", label: "Invite people" },
      { key: "import_people", label: "Import people and projects" },
      { key: "approve_access_requests", label: "Approve access requests" },
      { key: "manage_connections", label: "Manage connections" },
      { key: "manage_api_keys", label: "Manage API keys" },
    ],
  },
  {
    label: "Time",
    items: [
      { key: "log_own_time", label: "Log own time" },
      { key: "log_member_time", label: "Log time for others" },
      { key: "log_group_sessions", label: "Log group sessions" },
      { key: "log_event_totals", label: "Log event totals" },
    ],
  },
  {
    label: "Reports",
    items: [
      { key: "view_reports", label: "View reports" },
      { key: "export_reports", label: "Export reports" },
      { key: "design_reports", label: "Design custom reports" },
      { key: "view_payroll", label: "View payroll" },
    ],
  },
  {
    label: "Needs and lists",
    items: [
      { key: "create_needs", label: "Create needs" },
      { key: "approve_needs", label: "Approve needs" },
      { key: "create_projects", label: "Create projects and events" },
      { key: "archive_projects", label: "Archive projects and events" },
      { key: "manage_lists", label: "Manage groups, categories, and tags" },
    ],
  },
];

export const rolePermissions = permissionGroups.flatMap((group) => group.items.map((item) => item.key));
