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
  tenantId: string | null;
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
  tenant: string;
  project: string;
  organization: string;
  taskCategory: string;
};

export type TenantPreferences = {
  allowTimeEntryEditing: boolean;
  allowVolunteersToAddVolunteers: boolean;
  entityLabels: EntityLabels;
  feedbackNotifyUserIds: string[];
  emailSettings: Record<string, string | boolean>;
};

export type Tenant = {
  id: string;
  name: string;
  slug: string | null;
  volunteerHourlyRate: number;
  defaultRateType: string;
  preferences: TenantPreferences;
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
  tenants: Tenant[];
  tenant: Tenant | null;
  isAdmin: boolean;
  isCoordinator: boolean;
  canSelectRate: boolean;
  role: string | null;
  permissions: string[];
  groupOrganizations: "all" | string[];
};

export type Page<T> = { items: T[]; limit: number; offset: number };

export type Named = { id: string; name: string };
export type Project = {
  id: string;
  title: string;
  accessType: string;
  projectType: string;
  organizationId: string | null;
  isActive: boolean;
  description: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

export type HourlyRate = { id: string; name: string; type: string; perHourRate: number; isDefault: boolean; isArchived: boolean };

export type Lookups = {
  organizations: Named[];
  projects: Project[];
  categories: Named[];
  tags: Named[];
  hourlyRates: HourlyRate[];
};

export type TimeEntry = {
  id: string;
  userId: string;
  enteredByUserId: string;
  tenantId: string;
  organizationId: string | null;
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
  tenantId: string;
  role: { id: string; code: string; name: string };
  isActive: boolean;
  organizationIds?: string[];
  primaryOrganizationId?: string | null;
  title?: string | null;
  /** The tenant's private notes. Null unless the caller has manage_members. */
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
  tenantId: string;
  role: { id: string; code: string; name: string };
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  organizationId?: string | null;
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
  tenantId: string | null;
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
  organizationId?: string | null;
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
  byOrganization: ReportBucket[];
  byCategory: ReportBucket[];
  byPerson: ReportBucket[];
  byProject: ReportBucket[];
  byMonth: ReportBucket[];
};

export type SavedReport = {
  id: string;
  tenantId: string;
  name: string;
  isDefault: boolean;
  isDashboard: boolean;
  layout: { version: 1; cards: ReportCard[] };
  filters: ReportFilters;
  createdAt: string;
  updatedAt: string;
};

export type ReportFilters = {
  organizationId?: string[];
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
  collective: { hours: number; entries: number; inKind: number; byOrganization: ReportBucket[]; byProject: ReportBucket[] };
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
  tenantId: string;
  organizationId: string | null;
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
  tenantId: string;
  organizationId?: string | null;
  projectId?: string | null;
  taskCategoryId?: string | null;
  description?: string | null;
  hourlyRateId?: string | null;
  tagIds?: string[];
};
