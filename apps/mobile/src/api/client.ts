import type {
  AccessRequest,
  CollectiveEntry,
  Connection,
  HourlyRate,
  Invitation,
  Lookups,
  Membership,
  Organization,
  OrgRole,
  Page,
  Payroll,
  Placement,
  Project,
  Report,
  ReportFilters,
  SavedReport,
  Session,
  NeedSignup,
  Theme,
  TimeEntry,
  User,
  VolunteerNeed,
  Workspace,
} from "@/api/types";

const baseUrl = (process.env.EXPO_PUBLIC_API_URL || "http://127.0.0.1:3025").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  auth?: boolean;
};

export class Api {
  accessToken: string | null = null;
  refreshToken: string | null = null;
  onSession: ((session: Session) => void) | null = null;
  private refreshing: Promise<Session> | null = null;

  setSession(session: Pick<Session, "accessToken" | "refreshToken"> | null) {
    this.accessToken = session?.accessToken ?? null;
    this.refreshToken = session?.refreshToken ?? null;
  }

  login(username: string, password: string) {
    return this.request<Session>("/auth/login", { method: "POST", auth: false, body: { username, password } });
  }

  signUp(body: Record<string, unknown>) {
    return this.request<Session>("/auth/user", { method: "POST", auth: false, body });
  }

  requestPasswordReset(email: string) {
    return this.request<{ ok: true }>(`/auth/user/forgot-password?email=${encodeURIComponent(email)}`, { auth: false });
  }

  confirmPasswordReset(body: { email: string; code: string; password: string }) {
    return this.request<{ ok: true }>("/auth/user/forgot-password", { method: "POST", auth: false, body });
  }

  acceptInvitation(code: string) {
    return this.request<unknown>("/invitations/accept", { method: "POST", body: { code } });
  }

  createFeedback(fields: Record<string, string>, files: { uri: string; name: string; type: string }[]) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    for (const file of files) {
      form.append("screenshots", { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
    }
    return this.upload<{ id: string }>("/api/feedback", form);
  }

  refresh(refreshToken = this.refreshToken) {
    return this.request<Session>("/auth/refresh", { method: "POST", auth: false, body: { refreshToken } });
  }

  logout() {
    return this.request<{ ok: true }>("/auth/logout", {
      method: "POST",
      body: { refreshToken: this.refreshToken },
    });
  }

  patchMe(body: Record<string, unknown>) {
    return this.request<User>("/users/me", { method: "PATCH", body });
  }

  workspace(organizationId?: string | null) {
    return this.request<Workspace>("/users/me/workspace", {
      query: organizationId ? { organizationId } : undefined,
    });
  }

  createOrganization(name: string) {
    return this.request<Organization>("/organizations", { method: "POST", body: { name } });
  }

  updateOrganization(organizationId: string, body: Record<string, unknown>) {
    return this.request<Organization>(`/organizations/${organizationId}`, { method: "PATCH", body });
  }

  lookups(organizationId: string) {
    return this.request<Lookups>(`/organizations/${organizationId}/lookups`);
  }

  entries(userId: string, query?: Record<string, string | number | undefined>) {
    return this.request<Page<TimeEntry>>(`/users/${userId}/time-entries`, { query });
  }

  clockIn(body: Placement) {
    return this.request<TimeEntry>("/time/clock-in", { method: "POST", body });
  }

  clockOut(body: Record<string, unknown> = {}) {
    return this.request<TimeEntry>("/time/clock-out", { method: "POST", body });
  }

  cancelClock() {
    return this.request<void>("/time/clock-cancel", { method: "POST", body: {} });
  }

  resetClock() {
    return this.request<TimeEntry>("/time/clock-reset", { method: "POST", body: {} });
  }

  logDuration(body: Placement & { occurredOn: string; durationMinutes: number; startedAt?: string }) {
    return this.request<TimeEntry>("/time/duration", { method: "POST", body });
  }

  logTotal(body: Placement & { occurredOn: string; durationMinutes: number }) {
    return this.request<TimeEntry>("/time/total", { method: "POST", body });
  }

  logForUser(userId: string, body: Record<string, unknown>) {
    return this.request<TimeEntry>(`/users/${userId}/time-entries`, { method: "POST", body });
  }

  updateEntry(entryId: string, body: Record<string, unknown>) {
    return this.request<TimeEntry>(`/time-entries/${entryId}`, { method: "PATCH", body });
  }

  deleteEntry(entryId: string) {
    return this.request<void>(`/time-entries/${entryId}`, { method: "DELETE" });
  }

  report(organizationId: string, query?: Record<string, string | undefined>) {
    return this.request<Report>(`/organizations/${organizationId}/report`, { query });
  }

  savedReports(organizationId: string) {
    return this.request<Page<SavedReport>>(`/organizations/${organizationId}/reports`, { query: { limit: 100 } });
  }

  updateSavedReport(organizationId: string, reportId: string, body: { filters?: ReportFilters; name?: string }) {
    return this.request<SavedReport>(`/organizations/${organizationId}/reports/${reportId}`, { method: "PATCH", body });
  }

  deleteSavedReport(organizationId: string, reportId: string) {
    return this.request<void>(`/organizations/${organizationId}/reports/${reportId}`, { method: "DELETE" });
  }

  async download(path: string, query?: Record<string, string | undefined>) {
    const response = await this.send(path, { query }, true);
    if (response.status === 401 && this.refreshToken) {
      await this.rotate();
      const retried = await this.send(path, { query }, true);
      return this.readText(retried);
    }
    return this.readText(response);
  }

  payroll(organizationId: string) {
    return this.request<Payroll>(`/organizations/${organizationId}/payroll`);
  }

  memberships(organizationId: string) {
    return this.request<Page<Membership>>(`/organizations/${organizationId}/memberships`, { query: { limit: 100 } });
  }

  createMembership(organizationId: string, body: Record<string, unknown>) {
    return this.request<Membership>(`/organizations/${organizationId}/memberships`, { method: "POST", body });
  }

  invitations(organizationId: string) {
    return this.request<Page<Invitation>>(`/organizations/${organizationId}/invitations`, { query: { limit: 100 } });
  }

  createInvitation(organizationId: string, body: Record<string, unknown>) {
    return this.request<Invitation>(`/organizations/${organizationId}/invitations`, { method: "POST", body });
  }

  revokeInvitation(organizationId: string, invitationId: string) {
    return this.request<Invitation>(`/organizations/${organizationId}/invitations/${invitationId}`, { method: "DELETE" });
  }

  departmentInvitations(departmentId: string) {
    return this.request<Page<Invitation>>(`/departments/${departmentId}/invitations`, { query: { limit: 100 } });
  }

  createDepartmentInvitation(departmentId: string, body: Record<string, unknown>) {
    return this.request<Invitation>(`/departments/${departmentId}/invitations`, { method: "POST", body });
  }

  revokeDepartmentInvitation(departmentId: string, invitationId: string) {
    return this.request<Invitation>(`/departments/${departmentId}/invitations/${invitationId}`, { method: "DELETE" });
  }

  connections(organizationId: string) {
    return this.request<Page<Connection>>(`/organizations/${organizationId}/connections`, { query: { limit: 100 } });
  }

  createConnection(organizationId: string, body: { userId: string; connectedUserId: string; relationship: string }) {
    return this.request<Connection>(`/organizations/${organizationId}/connections`, { method: "POST", body });
  }

  roles(organizationId: string) {
    return this.request<Page<OrgRole>>(`/organizations/${organizationId}/roles`, { query: { limit: 100 } });
  }

  createRole(organizationId: string, body: { name: string; scope: string; permissions: string[] }) {
    return this.request<OrgRole>(`/organizations/${organizationId}/roles`, { method: "POST", body });
  }

  updateRole(organizationId: string, roleId: string, body: { name?: string; scope?: string; permissions?: string[] }) {
    return this.request<OrgRole>(`/organizations/${organizationId}/roles/${roleId}`, { method: "PATCH", body });
  }

  needs(organizationId: string, query?: Record<string, string | number | undefined>) {
    return this.request<Page<VolunteerNeed>>(`/organizations/${organizationId}/volunteer-needs`, { query: { limit: 100, ...query } });
  }

  createNeed(organizationId: string, body: Record<string, unknown>) {
    return this.request<VolunteerNeed>(`/organizations/${organizationId}/volunteer-needs`, { method: "POST", body });
  }

  getNeed(needId: string) {
    return this.request<VolunteerNeed>(`/volunteer-needs/${needId}`);
  }

  updateNeed(needId: string, body: Record<string, unknown>) {
    return this.request<VolunteerNeed>(`/volunteer-needs/${needId}`, { method: "PATCH", body });
  }

  deleteNeed(needId: string) {
    return this.request<void>(`/volunteer-needs/${needId}`, { method: "DELETE" });
  }

  decideNeed(needId: string, status: "published" | "rejected") {
    return this.request<VolunteerNeed>(`/volunteer-needs/${needId}/decision`, { method: "POST", body: { status } });
  }

  signups(needId: string) {
    return this.request<Page<NeedSignup>>(`/volunteer-needs/${needId}/signups`);
  }

  vetSignup(needId: string, signupId: string, vetted: boolean) {
    return this.request<NeedSignup>(`/volunteer-needs/${needId}/signups/${signupId}/${vetted ? "vet" : "unvet"}`, { method: "POST" });
  }

  deleteSignup(needId: string, signupId: string) {
    return this.request<void>(`/volunteer-needs/${needId}/signups/${signupId}`, { method: "DELETE" });
  }

  emailVolunteers(needId: string, body: { signupIds: string[]; subject: string; body: string }) {
    return this.request<{ sent: number }>(`/volunteer-needs/${needId}/emails`, { method: "POST", body });
  }

  departments(organizationId: string) {
    return this.request<Page<{ id: string; name: string }>>(`/organizations/${organizationId}/departments`, {
      query: { limit: 100 },
    });
  }

  createDepartment(organizationId: string, name: string) {
    return this.request<{ id: string; name: string }>(`/organizations/${organizationId}/departments`, {
      method: "POST",
      body: { name },
    });
  }

  projects(organizationId: string) {
    return this.request<Page<Project>>(`/organizations/${organizationId}/projects`, { query: { limit: 100 } });
  }

  createProject(organizationId: string, body: { title: string; accessType: string; projectType?: string; departmentId?: string | null }) {
    return this.request<{ id: string; title: string }>(`/organizations/${organizationId}/projects`, { method: "POST", body });
  }

  categories(organizationId: string) {
    return this.request<Page<{ id: string; name: string }>>(`/organizations/${organizationId}/task-categories`, {
      query: { limit: 100 },
    });
  }

  createCategory(organizationId: string, name: string) {
    return this.request<{ id: string; name: string }>(`/organizations/${organizationId}/task-categories`, {
      method: "POST",
      body: { name },
    });
  }

  tags(organizationId: string) {
    return this.request<Page<{ id: string; name: string }>>(`/organizations/${organizationId}/tags`, { query: { limit: 100 } });
  }

  createTag(organizationId: string, name: string) {
    return this.request<{ id: string; name: string }>(`/organizations/${organizationId}/tags`, { method: "POST", body: { name } });
  }

  updateDepartment(departmentId: string, name: string) {
    return this.request(`/departments/${departmentId}`, { method: "PATCH", body: { name } });
  }

  deleteDepartment(departmentId: string) {
    return this.request<void>(`/departments/${departmentId}`, { method: "DELETE" });
  }

  updateProject(projectId: string, body: Record<string, unknown>) {
    return this.request(`/projects/${projectId}`, { method: "PATCH", body });
  }

  deleteProject(projectId: string) {
    return this.request<void>(`/projects/${projectId}`, { method: "DELETE" });
  }

  updateCategory(categoryId: string, name: string) {
    return this.request(`/task-categories/${categoryId}`, { method: "PATCH", body: { name } });
  }

  deleteCategory(categoryId: string) {
    return this.request<void>(`/task-categories/${categoryId}`, { method: "DELETE" });
  }

  updateTag(tagId: string, name: string) {
    return this.request(`/tags/${tagId}`, { method: "PATCH", body: { name } });
  }

  deleteTag(tagId: string) {
    return this.request<void>(`/tags/${tagId}`, { method: "DELETE" });
  }

  hourlyRates(organizationId: string) {
    return this.request<Page<HourlyRate>>(`/organizations/${organizationId}/hourly-rates`, { query: { limit: 100 } });
  }

  createHourlyRate(organizationId: string, body: { name: string; type: string; perHourRate: number; isDefault?: boolean }) {
    return this.request<HourlyRate>(`/organizations/${organizationId}/hourly-rates`, { method: "POST", body });
  }

  updateHourlyRate(rateId: string, body: Record<string, unknown>) {
    return this.request<HourlyRate>(`/hourly-rates/${rateId}`, { method: "PATCH", body });
  }

  deleteHourlyRate(rateId: string) {
    return this.request<void>(`/hourly-rates/${rateId}`, { method: "DELETE" });
  }

  themes(organizationId: string) {
    return this.request<Page<Theme>>(`/organizations/${organizationId}/themes`);
  }

  deleteTheme(organizationId: string, themeId: string) {
    return this.request<void>(`/organizations/${organizationId}/themes/${themeId}`, { method: "DELETE" });
  }

  uploadBrand(organizationId: string, kind: "mark" | "wordmark" | "wordmarkOnLight", file: { uri: string; name: string; type: string }) {
    const form = new FormData();
    form.append("kind", kind);
    form.append("file", { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
    return this.upload<Organization>(`/organizations/${organizationId}/brand`, form);
  }

  deleteBrand(organizationId: string, kind: "mark" | "wordmark" | "wordmarkOnLight") {
    return this.request<Organization>(`/organizations/${organizationId}/brand/${kind}`, { method: "DELETE" });
  }

  uploadAvatar(file: { uri: string; name: string; type: string }) {
    const form = new FormData();
    form.append("file", { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
    return this.upload<User>("/users/me/avatar", form);
  }

  deleteAvatar() {
    return this.request<User>("/users/me/avatar", { method: "DELETE" });
  }

  saveTheme(organizationId: string, themeId: string, organizationOwnsTheme: boolean, body: Record<string, unknown>) {
    if (organizationOwnsTheme) {
      return this.request(`/organizations/${organizationId}/themes/${themeId}`, { method: "PATCH", body });
    }
    return this.request<{ id: string }>(`/organizations/${organizationId}/themes`, { method: "POST", body }).then((created) =>
      this.updateOrganization(organizationId, { themeId: created.id }),
    );
  }

  collective(organizationId: string) {
    return this.request<Page<CollectiveEntry>>("/collective-time-entries", { query: { organizationId, limit: 50 } });
  }

  createCollective(body: Record<string, unknown>) {
    return this.request<CollectiveEntry>("/collective-time-entries", { method: "POST", body });
  }

  updateCollective(entryId: string, body: Record<string, unknown>) {
    return this.request<CollectiveEntry>(`/collective-time-entries/${entryId}`, { method: "PATCH", body });
  }

  deleteCollective(entryId: string) {
    return this.request<void>(`/collective-time-entries/${entryId}`, { method: "DELETE" });
  }

  unclassifiedCount(organizationId: string) {
    return this.request<{ count: number }>(`/organizations/${organizationId}/unclassified-count`);
  }

  orgEntries(organizationId: string, query?: Record<string, string | number | undefined>) {
    return this.request<Page<TimeEntry>>(`/organizations/${organizationId}/time-entries`, { query });
  }

  logDays(userId: string, body: Record<string, unknown>) {
    return this.request<{ items: TimeEntry[] }>(`/users/${userId}/time-entries/batch`, { method: "POST", body });
  }

  resendInvitation(organizationId: string, invitationId: string) {
    return this.request<Invitation>(`/organizations/${organizationId}/invitations/${invitationId}/resend`, { method: "POST" });
  }

  updateMembership(organizationId: string, membershipId: string, body: Record<string, unknown>) {
    return this.request<Membership>(`/organizations/${organizationId}/memberships/${membershipId}`, { method: "PATCH", body });
  }

  deleteMembership(organizationId: string, membershipId: string) {
    return this.request<void>(`/organizations/${organizationId}/memberships/${membershipId}`, { method: "DELETE" });
  }

  deleteMemberships(organizationId: string, ids: string[]) {
    return this.request<void>(`/organizations/${organizationId}/memberships`, { method: "DELETE", body: { ids } });
  }

  updateConnection(connectionId: string, relationship: string) {
    return this.request<Connection>(`/connections/${connectionId}`, { method: "PATCH", body: { relationship } });
  }

  deleteConnection(connectionId: string) {
    return this.request<void>(`/connections/${connectionId}`, { method: "DELETE" });
  }

  deleteRole(organizationId: string, roleId: string) {
    return this.request<void>(`/organizations/${organizationId}/roles/${roleId}`, { method: "DELETE" });
  }

  accessRequests(organizationId: string) {
    return this.request<{ items: AccessRequest[] }>(`/organizations/${organizationId}/access-requests`);
  }

  decideAccessRequest(organizationId: string, requestId: string, status: "approved" | "declined") {
    return this.request<AccessRequest>(`/organizations/${organizationId}/access-requests/${requestId}`, {
      method: "PATCH",
      body: { status },
    });
  }

  createAccessRequest(organizationId: string, message: string) {
    return this.request<AccessRequest>(`/organizations/${organizationId}/access-requests`, {
      method: "POST",
      body: { message, requestedRole: "GROUP_MANAGER" },
    });
  }

  usernamePreview(firstName: string, lastName: string) {
    return this.request<{ username: string }>(
      `/usernames/preview?firstName=${encodeURIComponent(firstName)}&lastName=${encodeURIComponent(lastName)}`,
    );
  }

  private async upload<T>(path: string, form: FormData): Promise<T> {
    const send = (token: string | null) => {
      const headers: Record<string, string> = {};
      if (token) headers.authorization = `Bearer ${token}`;
      return fetch(new URL(path, `${baseUrl}/`), { method: "POST", headers, body: form });
    };
    let response = await send(this.accessToken);
    if (response.status === 401 && this.refreshToken) {
      await this.rotate();
      response = await send(this.accessToken);
    }
    return this.read<T>(response);
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.send(path, options, options.auth !== false);
    if (response.status === 401 && options.auth !== false && this.refreshToken) {
      await this.rotate();
      const retried = await this.send(path, options, true);
      return this.read<T>(retried);
    }
    return this.read<T>(response);
  }

  private async rotate() {
    if (!this.refreshToken) {
      throw new ApiError(401, "unauthorized", "Authentication is required.");
    }
    this.refreshing ??= this.refresh(this.refreshToken)
      .then((session) => {
        this.setSession(session);
        this.onSession?.(session);
        return session;
      })
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  }

  private async send(path: string, options: RequestOptions, auth: boolean) {
    const url = new URL(path, `${baseUrl}/`);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, String(value));
        }
      }
    }
    const headers: Record<string, string> = {};
    if (options.body !== undefined) {
      headers["content-type"] = "application/json";
    }
    if (auth && this.accessToken) {
      headers.authorization = `Bearer ${this.accessToken}`;
    }
    return fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  }

  private async readText(response: Response) {
    const text = await response.text();
    if (!response.ok) {
      let message = "Something went wrong.";
      try {
        const body = JSON.parse(text) as { message?: string; code?: string };
        throw new ApiError(response.status, body.code ?? "server_error", body.message ?? message);
      } catch (error) {
        if (error instanceof ApiError) throw error;
      }
      throw new ApiError(response.status, "server_error", message);
    }
    return text;
  }

  private async read<T>(response: Response): Promise<T> {
    if (response.status === 204) {
      return undefined as T;
    }
    const text = await response.text();
    const json = text ? (JSON.parse(text) as unknown) : null;
    if (!response.ok) {
      const body = json && typeof json === "object" ? (json as { code?: string; message?: string }) : {};
      throw new ApiError(response.status, body.code ?? "server_error", body.message ?? "Something went wrong.");
    }
    return json as T;
  }
}

export const api = new Api();
