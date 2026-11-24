import type { listApiKeys } from "@/lib/api/features/api-keys";
import type { listCollective } from "@/lib/api/features/collective";
import type { listFeedback } from "@/lib/api/features/feedback";
import type { listOrganizations } from "@/lib/api/features/organizations";
import type { listHourlyRates } from "@/lib/api/features/hourly-rates";
import type { listTenantInvitations } from "@/lib/api/features/invitations";
import type { listOrgMemberships } from "@/lib/api/features/memberships";
import type { getTenant } from "@/lib/api/features/tenants";
import type { listProjects } from "@/lib/api/features/projects";
import type { report } from "@/lib/api/features/reports";
import type { listTags } from "@/lib/api/features/tags";
import type { listSignups, listVolunteerNeeds } from "@/lib/api/features/volunteer-needs";
import type { listTaskCategories } from "@/lib/api/features/task-categories";
import type { listTimeEntries } from "@/lib/api/features/time-entries";

type Items<T extends (...args: never[]) => Promise<{ items: unknown[] }>> = Awaited<ReturnType<T>>["items"];

export type Paged<T> = { items: T[]; limit: number; offset: number };

export type Tenant = Awaited<ReturnType<typeof getTenant>>;
export type { TenantPreferences } from "@/lib/api/features/tenants";
export type Theme = Tenant["theme"];
export type Membership = Items<typeof listOrgMemberships>[number];
export type Invitation = Items<typeof listTenantInvitations>[number];
export type TenantApiKey = Items<typeof listApiKeys>[number];
export type Organization = Items<typeof listOrganizations>[number];
export type Project = Items<typeof listProjects>[number];
export type TaskCategory = Items<typeof listTaskCategories>[number];
export type Tag = Items<typeof listTags>[number];
export type HourlyRate = Items<typeof listHourlyRates>[number];
export type TimeEntry = Items<typeof listTimeEntries>[number];
export type GroupSession = Items<typeof listCollective>[number];
export type GroupOrganizations = "all" | string[];
export type Report = Awaited<ReturnType<typeof report>>;
export type ReportSide = Report["user"] | Report["collective"];
export type ReportGroup = Report["user"]["byOrganization"][number];
export type Feedback = Items<typeof listFeedback>[number];
export type VolunteerNeed = Items<typeof listVolunteerNeeds>[number];
export type VolunteerSignup = Items<typeof listSignups>[number];

export type Lookups = {
  organizations: Organization[];
  projects: Project[];
  categories: TaskCategory[];
  tags: Tag[];
  hourlyRates: HourlyRate[];
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

export type DateRange = { from?: string; to?: string };

export type ActionResult<T = unknown> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; reason?: "email_mismatch" };
