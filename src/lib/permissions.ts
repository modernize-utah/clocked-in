export const permissions = [
  "manage_organization",
  "manage_roles",
  "manage_members",
  "invite_members",
  "import_people",
  "approve_access_requests",
  "log_own_time",
  "log_member_time",
  "log_group_sessions",
  "log_event_totals",
  "view_reports",
  "export_reports",
  "design_reports",
  "view_payroll",
  "create_needs",
  "approve_needs",
  "create_projects",
  "archive_projects",
  "manage_lists",
  "manage_connections",
  "manage_api_keys",
] as const;

export type Permission = (typeof permissions)[number];
export type RoleScope = "organization" | "assigned_groups" | "self";

export const permissionGroups: { label: string; items: { key: Permission; label: string }[] }[] = [
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

export const allPermissions: Permission[] = [...permissions];

export const adminPermissions: Permission[] = [...permissions];

export const staffPermissions: Permission[] = [
  "log_own_time",
  "view_reports",
  "export_reports",
];

export const volunteerPermissions: Permission[] = ["log_own_time"];

export const groupManagerPermissions: Permission[] = [
  "invite_members",
  "log_own_time",
  "log_member_time",
  "log_group_sessions",
  "log_event_totals",
  "view_reports",
  "export_reports",
  "create_needs",
  "create_projects",
];

const writeKeyPermissions: Permission[] = [
  "log_own_time",
  "log_member_time",
  "log_group_sessions",
  "log_event_totals",
  "view_reports",
  "export_reports",
  "create_needs",
  "create_projects",
  "manage_lists",
];

const readKeyPermissions: Permission[] = ["view_reports", "export_reports"];

export function defaultPermissionsForCode(code: string | null | undefined): Permission[] {
  if (code === "ADMIN") return adminPermissions;
  if (code === "MEMBER") return staffPermissions;
  if (code === "VOLUNTEER") return volunteerPermissions;
  return volunteerPermissions;
}

export function defaultScopeForCode(code: string | null | undefined): RoleScope {
  if (code === "VOLUNTEER") return "self";
  return "organization";
}

export function apiKeyPermissions(isAdmin: boolean, canWrite: boolean): Permission[] {
  if (isAdmin) return adminPermissions;
  if (canWrite) return writeKeyPermissions;
  return readKeyPermissions;
}

export function isRoleScope(value: string): value is RoleScope {
  return value === "organization" || value === "assigned_groups" || value === "self";
}

export function isPermission(value: string): value is Permission {
  return (permissions as readonly string[]).includes(value);
}

export function hasPermission(granted: Iterable<string>, permission: Permission) {
  return new Set(granted).has(permission);
}
