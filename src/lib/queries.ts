import { infiniteQueryOptions, queryOptions, type QueryClient } from "@tanstack/react-query";
import { isActiveFeedback } from "@/lib/api/json";
import { fetchJson } from "@/lib/fetch-json";
import type { MemberConnectionRecord } from "@/lib/member-connection";
import type { ReportFilters } from "@/lib/report-layout";
import type { EmailTemplateJson } from "@/lib/api/features/email-templates";
import type { ReportTemplate } from "@/lib/api/features/report-templates";
import type { SavedReport } from "@/lib/api/features/saved-reports";
import type {
  DateRange,
  GroupSession,
  Lookups,
  Feedback,
  VolunteerNeed,
  VolunteerSignup,
  Invitation,
  Membership,
  TenantApiKey,
  Paged,
  Report,
  Theme,
  TimeEntry,
} from "@/lib/types";

export const entriesPageSize = 50;

export type EntriesListFilter = DateRange & {
  projectId?: string;
  taskCategoryId?: string;
  organizationId?: string;
  unclassified?: boolean;
  everyone?: boolean;
};

function query(values: Record<string, string | number | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    const text = Array.isArray(value) ? value.join(",") : value;
    if (text !== undefined && text !== "") params.set(key, String(text));
  }

  const text = params.toString();
  return text ? `?${text}` : "";
}

export const keys = {
  tenant: (tenantId: string) => ["org", tenantId] as const,
  lookups: (tenantId: string) => ["org", tenantId, "lookups"] as const,
  members: (tenantId: string) => ["org", tenantId, "members"] as const,
  connections: (tenantId: string) => ["org", tenantId, "connections"] as const,
  invitations: (tenantId: string) => ["org", tenantId, "invitations"] as const,
  organizationInvitations: (organizationId: string) => ["organization", organizationId, "invitations"] as const,
  apiKeys: (tenantId: string) => ["org", tenantId, "api-keys"] as const,
  entries: (tenantId: string, userId: string, filter: EntriesListFilter = {}) =>
    [
      "org",
      tenantId,
      "entries",
      userId,
      filter.from ?? "",
      filter.to ?? "",
      filter.projectId ?? "",
      filter.taskCategoryId ?? "",
      filter.organizationId ?? "",
      filter.unclassified ?? false,
      filter.everyone ?? false,
    ] as const,
  tenantEntries: (tenantId: string) => ["org", tenantId, "recent-entries"] as const,
  groupSessions: (tenantId: string) => ["org", tenantId, "group-sessions"] as const,
  report: (tenantId: string, filter: ReportFilters) => ["org", tenantId, "report", filter] as const,
  savedReports: (tenantId: string) => ["org", tenantId, "saved-reports"] as const,
  savedReport: (tenantId: string, reportId: string) => ["org", tenantId, "saved-reports", reportId] as const,
  reportTemplates: (tenantId: string) => ["org", tenantId, "report-templates"] as const,
  reportTemplate: (tenantId: string, templateId: string) =>
    ["org", tenantId, "report-templates", templateId] as const,
  savedReportData: (tenantId: string, reportId: string, filter: ReportFilters) =>
    ["org", tenantId, "saved-report-data", reportId, filter] as const,
  themes: (tenantId: string) => ["org", tenantId, "themes"] as const,
  emailTemplates: (tenantId: string) => ["org", tenantId, "email-templates"] as const,
  emailTemplate: (tenantId: string, templateId: string) =>
    ["org", tenantId, "email-templates", templateId] as const,
  openPunch: (userId: string) => ["user", userId, "open-punch"] as const,
  me: () => ["user", "me"] as const,
  user: (userId: string) => ["user", userId, "detail"] as const,
  feedback: (active?: boolean) => (active === undefined ? (["feedback"] as const) : (["feedback", active] as const)),
  feedbackItem: (id: string) => ["feedback", "item", id] as const,
  needs: (tenantId: string) => ["org", tenantId, "needs"] as const,
  need: (needId: string) => ["need", needId] as const,
  signups: (needId: string) => ["need", needId, "signups"] as const,
};

export const lookupStaleTime = 5 * 60 * 1000;
export const lookupGcTime = 24 * 60 * 60 * 1000;

export function lookupsQuery(tenantId: string, userId: string) {
  return queryOptions({
    queryKey: [...keys.lookups(tenantId), userId] as const,
    staleTime: lookupStaleTime,
    gcTime: lookupGcTime,
    queryFn: ({ signal }) => fetchJson<Lookups>(`/tenants/${tenantId}/lookups`, signal),
  });
}

export function membersQuery(tenantId: string) {
  return queryOptions({
    queryKey: keys.members(tenantId),
    queryFn: async ({ signal }) =>
      (await fetchJson<Paged<Membership>>(`/tenants/${tenantId}/memberships?limit=100`, signal)).items,
  });
}

export function connectionsQuery(tenantId: string) {
  return queryOptions({
    queryKey: keys.connections(tenantId),
    queryFn: async ({ signal }) =>
      (await fetchJson<Paged<MemberConnectionRecord>>(`/tenants/${tenantId}/connections?limit=100`, signal))
        .items,
  });
}

export function apiKeysQuery(tenantId: string) {
  return queryOptions({
    queryKey: keys.apiKeys(tenantId),
    queryFn: async ({ signal }) =>
      (await fetchJson<Paged<TenantApiKey>>(`/tenants/${tenantId}/api-keys?limit=100`, signal)).items,
  });
}

export function invitationsQuery(tenantId: string) {
  return queryOptions({
    queryKey: keys.invitations(tenantId),
    queryFn: async ({ signal }) =>
      (await fetchJson<Paged<Invitation>>(`/tenants/${tenantId}/invitations?limit=100`, signal)).items,
  });
}

export function organizationInvitationsQuery(organizationId: string) {
  return queryOptions({
    queryKey: keys.organizationInvitations(organizationId),
    queryFn: async ({ signal }) =>
      (await fetchJson<Paged<Invitation>>(`/tenants/${organizationId}/invitations?limit=100`, signal)).items,
  });
}

export function tenantEntriesQuery(tenantId: string) {
  return queryOptions({
    queryKey: keys.tenantEntries(tenantId),
    queryFn: ({ signal }) =>
      fetchJson<Paged<TimeEntry>>(`/tenants/${tenantId}/time-entries${query({ limit: 20 })}`, signal),
  });
}

export function entriesQuery(tenantId: string, userId: string, filter: EntriesListFilter = {}) {
  const placement = {
    from: filter.from,
    to: filter.to,
    projectId: filter.projectId,
    taskCategoryId: filter.taskCategoryId,
    organizationId: filter.organizationId,
    unclassified: filter.unclassified ? "1" : undefined,
  };
  return infiniteQueryOptions({
    queryKey: keys.entries(tenantId, userId, filter),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      fetchJson<Paged<TimeEntry>>(
        filter.everyone
          ? `/tenants/${tenantId}/time-entries${query({ ...placement, userId: userId || undefined, offset: pageParam, limit: entriesPageSize })}`
          : `/users/${userId}/time-entries${query({ tenantId, ...placement, offset: pageParam, limit: entriesPageSize })}`,
        signal,
      ),
    getNextPageParam: (last) => (last.items.length < last.limit ? undefined : last.offset + last.limit),
  });
}

export function groupSessionsQuery(tenantId: string) {
  return infiniteQueryOptions({
    queryKey: keys.groupSessions(tenantId),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      fetchJson<Paged<GroupSession>>(
        `/collective-time-entries${query({ tenantId, offset: pageParam, limit: entriesPageSize })}`,
        signal,
      ),
    getNextPageParam: (last) => (last.items.length < last.limit ? undefined : last.offset + last.limit),
  });
}

export function themesQuery(tenantId: string) {
  return queryOptions({
    queryKey: keys.themes(tenantId),
    queryFn: ({ signal }) =>
      fetchJson<Paged<Theme>>(`/tenants/${tenantId}/themes`, signal).then((page) => page.items),
  });
}

export function reportQuery(tenantId: string, filter: ReportFilters) {
  return queryOptions({
    queryKey: keys.report(tenantId, filter),
    queryFn: ({ signal }) => fetchJson<Report>(`/tenants/${tenantId}/report${query({ ...filter })}`, signal),
  });
}

export function savedReportsQuery(tenantId: string) {
  return queryOptions({
    queryKey: keys.savedReports(tenantId),
    queryFn: async ({ signal }) =>
      (await fetchJson<Paged<SavedReport>>(`/tenants/${tenantId}/reports?limit=100`, signal)).items,
  });
}

export function reportTemplatesQuery(tenantId: string) {
  return queryOptions({
    queryKey: keys.reportTemplates(tenantId),
    queryFn: async ({ signal }) =>
      (await fetchJson<Paged<ReportTemplate>>(`/tenants/${tenantId}/report-templates?limit=100`, signal)).items,
  });
}

export function emailTemplatesQuery(tenantId: string) {
  return queryOptions({
    queryKey: keys.emailTemplates(tenantId),
    queryFn: async ({ signal }) =>
      (await fetchJson<Paged<EmailTemplateJson>>(`/tenants/${tenantId}/email-templates`, signal)).items,
  });
}

export function emailTemplateQuery(tenantId: string, templateId: string) {
  return queryOptions({
    queryKey: keys.emailTemplate(tenantId, templateId),
    queryFn: ({ signal }) =>
      fetchJson<EmailTemplateJson>(`/tenants/${tenantId}/email-templates/${templateId}`, signal),
  });
}

export function reportTemplateQuery(tenantId: string, templateId: string) {
  return queryOptions({
    queryKey: keys.reportTemplate(tenantId, templateId),
    queryFn: ({ signal }) =>
      fetchJson<ReportTemplate>(`/tenants/${tenantId}/report-templates/${templateId}`, signal),
  });
}

export function savedReportQuery(tenantId: string, reportId: string) {
  return queryOptions({
    queryKey: keys.savedReport(tenantId, reportId),
    queryFn: ({ signal }) => fetchJson<SavedReport>(`/tenants/${tenantId}/reports/${reportId}`, signal),
  });
}

export function savedReportDataQuery(tenantId: string, reportId: string, filter: Pick<ReportFilters, "from" | "to">) {
  return queryOptions({
    queryKey: keys.savedReportData(tenantId, reportId, filter),
    queryFn: ({ signal }) =>
      fetchJson<Report>(
        `/tenants/${tenantId}/reports/${reportId}/data${query({ ...filter, clearDates: "true" })}`,
        signal,
      ),
  });
}

export function openPunchQuery(userId: string) {
  return queryOptions({
    queryKey: keys.openPunch(userId),
    queryFn: async ({ signal }) => {
      const recent = await fetchJson<Paged<TimeEntry>>(`/users/${userId}/time-entries?limit=20`, signal);
      return recent.items.find((entry) => entry.mode === "Punch" && !entry.endedAt) ?? null;
    },
  });
}

export type MeUser = {
  id: string;
  username: string;
  email: string;
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
    memberNumber: string | null;
  } | null;
};

export function userQuery(userId: string) {
  return queryOptions({
    queryKey: keys.user(userId),
    queryFn: ({ signal }) => fetchJson<MeUser>(`/users/${userId}`, signal),
  });
}

export function meQuery() {
  return queryOptions({
    queryKey: keys.me(),
    queryFn: ({ signal }) => fetchJson<MeUser>("/users/me", signal),
  });
}

export function feedbackQuery(active: boolean) {
  return queryOptions({
    queryKey: keys.feedback(active),
    staleTime: 0,
    gcTime: lookupGcTime,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: ({ signal }) =>
      fetchJson<Paged<Feedback>>(`/api/feedback${query({ active: String(active), limit: 100 })}`, signal),
  });
}

export function feedbackItemQuery(id: string) {
  return queryOptions({
    queryKey: keys.feedbackItem(id),
    staleTime: 0,
    gcTime: lookupGcTime,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: ({ signal }) => fetchJson<Feedback>(`/api/feedback/${id}`, signal),
  });
}

export function syncFeedbackInCache(queryClient: QueryClient, item: Feedback) {
  queryClient.setQueryData<Feedback>(keys.feedbackItem(item.id), (current) => {
    if (current === item) return current;
    return item.actions.length > 0 || !current ? item : { ...item, actions: current.actions };
  });

  for (const active of [true, false]) {
    const shouldInclude = isActiveFeedback(item.status) === active;
    queryClient.setQueryData<Paged<Feedback>>(keys.feedback(active), (current) => {
      if (!current) return current;
      const without = current.items.filter((row) => row.id !== item.id);
      const existed = without.length !== current.items.length;
      if (!shouldInclude) {
        return existed ? { ...current, items: without } : current;
      }
      const items = existed
        ? current.items.map((row) => (row.id === item.id ? { ...row, ...item } : row))
        : [item, ...current.items];
      return {
        ...current,
        items,
      };
    });
  }
}

export function needsQuery(tenantId: string) {
  return queryOptions({
    queryKey: keys.needs(tenantId),
    queryFn: ({ signal }) => fetchJson<Paged<VolunteerNeed>>(`/tenants/${tenantId}/volunteer-needs?limit=100`, signal),
  });
}

export function needQuery(needId: string) {
  return queryOptions({
    queryKey: keys.need(needId),
    queryFn: ({ signal }) => fetchJson<VolunteerNeed>(`/volunteer-needs/${needId}`, signal),
  });
}

export function signupsQuery(needId: string) {
  return queryOptions({
    queryKey: keys.signups(needId),
    queryFn: ({ signal }) => fetchJson<Paged<VolunteerSignup>>(`/volunteer-needs/${needId}/signups`, signal),
  });
}

export function csvUrl(tenantId: string, filter: ReportFilters) {
  return `/tenants/${tenantId}/time-entries.csv${query({ ...filter })}`;
}

export function summaryCsvUrl(tenantId: string, filter: ReportFilters) {
  return `/tenants/${tenantId}/summary.csv${query({ ...filter })}`;
}

export function payrollCsvUrl(tenantId: string, filter: ReportFilters) {
  return `/tenants/${tenantId}/payroll.csv${query({ ...filter })}`;
}

export function payrollQuery(tenantId: string, filter: ReportFilters) {
  return queryOptions({
    queryKey: ["org", tenantId, "payroll", filter] as const,
    queryFn: ({ signal }) =>
      fetchJson<{
        hours: number;
        grossPay: number;
        people: number;
        entries: number;
        rows: {
          id: string;
          userId: string;
          person: string;
          group: string;
          hours: number;
          payRate: number;
          grossPay: number;
          entries: number;
        }[];
      }>(`/tenants/${tenantId}/payroll${query({ ...filter })}`, signal),
  });
}

export function viewCsvUrl(tenantId: string, filter: ReportFilters) {
  return `/tenants/${tenantId}/view.csv${query({ ...filter })}`;
}
