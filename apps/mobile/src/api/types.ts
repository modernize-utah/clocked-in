export type User = {
  id: string;
  username: string;
  email: string;
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
  profile: {
    firstName: string;
    lastName: string;
    displayName: string | null;
    timezone: string;
    phone: string | null;
    zipCode: string | null;
    notes: string | null;
    avatarUrl: string | null;
    description: string | null;
  } | null;
};

export type Session = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: User;
};

export type Theme = {
  id: string;
  name: string;
  organizationId: string | null;
  primary: string;
  primaryForeground: string;
  highlight: string;
  accent: string;
  success: string;
  surface: string;
  surfaceForeground: string;
  foreground: string;
  chartColor: string;
  headingFont: string;
  bodyFont: string;
  categoricalPalette: string[];
  sequentialPalette: string[];
  divergingPalette: string[];
};

export type EntityLabels = {
  organization: string;
  project: string;
  department: string;
  taskCategory: string;
};

export type OrganizationPreferences = {
  allowTimeEntryEditing: boolean;
  allowVolunteersToAddVolunteers: boolean;
  entityLabels: EntityLabels;
  feedbackNotifyUserIds: string[];
  emailSettings: Record<string, string | boolean>;
};

export type Organization = {
  id: string;
  name: string;
  slug: string | null;
  volunteerHourlyRate: number;
  defaultRateType: string;
  preferences: OrganizationPreferences;
  themeId: string;
  theme: Theme;
  wordmarkUrl: string | null;
  wordmarkOnLightUrl: string | null;
  markUrl: string | null;
  accentImageUrl: string | null;
  description: string | null;
  websiteUrl: string | null;
  publicSlug: string | null;
};

export type Viewer = {
  id: string;
  username: string;
  email: string;
  isSuperAdmin: boolean;
  name: string;
  initials: string;
  avatarUrl: string | null;
  timezone: string;
};

export type Workspace = {
  viewer: Viewer;
  organizations: Organization[];
  organization: Organization | null;
  isAdmin: boolean;
  isCoordinator: boolean;
  canSelectRate: boolean;
  role: string | null;
  permissions: string[];
  groupDepartments: "all" | string[];
};

export type Page<T> = { items: T[]; limit: number; offset: number };

export type Named = { id: string; name: string };
export type Project = {
  id: string;
  title: string;
  accessType: string;
  projectType: string;
  departmentId: string | null;
  isActive: boolean;
  description: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

export type HourlyRate = { id: string; name: string; type: string; perHourRate: number; isDefault: boolean; isArchived: boolean };

export type Lookups = {
  departments: Named[];
  projects: Project[];
  categories: Named[];
  tags: Named[];
  hourlyRates: HourlyRate[];
};

export type TimeEntry = {
  id: string;
  userId: string;
  enteredByUserId: string;
  organizationId: string;
  departmentId: string | null;
  projectId: string | null;
  taskCategoryId: string | null;
  mode: "Punch" | "Duration" | "Total";
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number | null;
  occurredOn: string;
  description: string | null;
  hourlyRate: number;
  hourlyRateId?: string | null;
  inKindValue: number | null;
  tagIds: string[];
};

export type Membership = {
  id: string;
  userId: string;
  organizationId: string;
  role: { id: string; code: string; name: string };
  isActive: boolean;
  departmentIds?: string[];
  primaryDepartmentId?: string | null;
  orgUserTitle?: string | null;
  /** The organization's private notes. Null unless the caller has manage_members. */
  notes?: string | null;
  user: {
    id: string;
    username: string;
    /** Null unless the caller may manage people. */
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
  };
};

export type Invitation = {
  id: string;
  email: string;
  organizationId: string;
  role: { id: string; code: string; name: string };
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  departmentId?: string | null;
};

export type Connection = {
  id: string;
  userAId: string;
  userBId: string;
  relationship: string;
  userA: Membership["user"];
  userB: Membership["user"];
};

export type AccessRequest = {
  id: string;
  status: string;
  message: string | null;
  email: string;
  name: string;
  requestedRole: { code: string; name: string } | null;
};

export type OrgRole = {
  id: string;
  code: string;
  name: string;
  organizationId: string | null;
  isSystem: boolean;
  scope: string;
  permissions: string[];
};

export type NeedChoice = { id: string; label: string };
export type NeedQuestion = { id: string; prompt: string; kind: "single" | "multi"; choices: NeedChoice[]; correctChoiceIds: string[] };
export type NeedQuestions = { version: 1; items: NeedQuestion[] };
export type VolunteerNeed = {
  id: string;
  name: string;
  description: string | null;
  type: "Position" | "Task";
  countNeeded: number;
  countVetted: number;
  allowPublic: boolean;
  requireVetting?: boolean;
  status?: string;
  publicToken?: string;
  startDate?: string | null;
  endDate?: string | null;
  requiredBy?: string | null;
  projectId?: string | null;
  taskCategoryId?: string | null;
  departmentId?: string | null;
  questions?: NeedQuestions;
};
export type NeedSignup = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  kind: "member" | "guest";
  comment: string | null;
  passed: boolean;
  vetted: boolean;
  answers: { prompt: string; labels: string[] }[];
};

export type ReportBucket = {
  id: string;
  label: string;
  hours: number;
  volunteers: number;
  entries: number;
  inKind: number;
};

export type ReportSide = {
  hours: number;
  volunteers: number;
  entries: number;
  inKind: number;
  byDepartment: ReportBucket[];
  byCategory: ReportBucket[];
  byPerson: ReportBucket[];
  byProject: ReportBucket[];
  byMonth: ReportBucket[];
};

export type SavedReport = {
  id: string;
  organizationId: string;
  name: string;
  isDefault: boolean;
  isDashboard: boolean;
  layout: { version: 1; cards: ReportCard[] };
  filters: ReportFilters;
  createdAt: string;
  updatedAt: string;
};

export type ReportFilters = {
  departmentId?: string[];
  taskCategoryId?: string[];
  projectId?: string[];
  userId?: string[];
  from?: string;
  to?: string;
};

export type ReportCard = {
  id: string;
  kind: "value" | "chart" | "list" | "entries";
  title: string;
  description: string;
  accessor: string;
  color?: string;
  format?: string;
  icon?: string | null;
  chartType?: string;
  palette?: string;
  valueKey?: string;
  visibleColumns?: string[];
  sortKey?: string;
  sortDir?: string;
  limit?: number;
  scope?: string;
};

export type Report = {
  user: ReportSide;
  staff: ReportSide;
  collective: { hours: number; entries: number; inKind: number; byDepartment: ReportBucket[]; byProject: ReportBucket[] };
};

export type Payroll = {
  hours: number;
  grossPay: number;
  people: number;
  entries: number;
  rows: { id: string; person: string; group: string; hours: number; payRate: number; grossPay: number; entries: number }[];
};

export type CollectiveEntry = {
  id: string;
  organizationId: string;
  departmentId: string | null;
  projectId: string;
  taskCategoryId: string;
  startedAt: string;
  endedAt: string;
  participantCount: number;
  description: string | null;
  inKindValue?: number;
  tagIds?: string[];
};

export type Placement = {
  organizationId: string;
  departmentId?: string | null;
  projectId?: string | null;
  taskCategoryId?: string | null;
  description?: string | null;
  hourlyRateId?: string | null;
  tagIds?: string[];
};
