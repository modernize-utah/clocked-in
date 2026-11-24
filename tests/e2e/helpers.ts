import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { caswjSourceRefPrefix, orgName } from "../../scripts/caswj-workbook";

export const extraNotes = "e2e-extra";

export type ReportGroup = {
  id: string;
  label: string;
  hours: number;
  volunteers: number;
  entries: number;
  inKind: number;
};

export type ReportSide = {
  hours: number;
  volunteers?: number;
  entries: number;
  inKind: number;
  byOrganization: ReportGroup[];
  byCategory: ReportGroup[];
  byPerson?: ReportGroup[];
  byVolunteer?: ReportGroup[];
  byProject: ReportGroup[];
  byMonth?: ReportGroup[];
};

export type UserReportSide = ReportSide & {
  volunteers: number;
  byPerson: ReportGroup[];
  byVolunteer: ReportGroup[];
  byMonth: ReportGroup[];
};

export type ReportPayload = { user: UserReportSide; staff: UserReportSide; collective: ReportSide };

export type Tenant = { id: string; name: string };

export function adminPassword() {
  const password = process.env.SEED_SUPERADMIN_PASSWORD?.trim();
  if (!password) {
    throw new Error("SEED_SUPERADMIN_PASSWORD is required.");
  }

  return password;
}

export async function loginAs(page: Page, username: string, password: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.locator("#username").filter({ visible: true }).fill(username);
  await page.locator("#password").filter({ visible: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  const formError = page.locator("form").getByRole("alert").filter({ hasText: /.+/ });
  await Promise.race([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { waitUntil: "commit" }),
    formError.waitFor({ state: "visible" }).then(async () => {
      throw new Error((await formError.innerText()).trim());
    }),
  ]);
  const tenant = await sessionTenant(page.request);
  await page.context().addCookies([
    {
      name: "clocked-in-org",
      value: tenant.id,
      url: page.url(),
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  return tenant;
}

export async function loginAsAdmin(page: Page) {
  return loginAs(page, "jbaddley", adminPassword());
}

export async function createOrgPerson(
  request: APIRequestContext,
  input: {
    firstName: string;
    lastName: string;
    email: string;
    username: string;
    password: string;
    role?: "VOLUNTEER" | "MEMBER" | "ADMIN";
    organizationIds?: string[];
  },
) {
  const session = await loginBearer(request);
  const headers = { authorization: `Bearer ${session.accessToken}` };
  const tenant = await caswjTenant(request, session.accessToken);
  const created = await request.post(`/tenants/${tenant.id}/memberships`, {
    headers,
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      displayName: `${input.firstName} ${input.lastName}`,
      email: input.email,
      username: input.username,
      password: `${input.password}-temporary`,
      role: input.role ?? "VOLUNTEER",
      organizationIds: input.organizationIds ?? [],
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const initialLogin = await request.post("/auth/login", {
    data: { username: input.username, password: `${input.password}-temporary` },
  });
  expect(initialLogin.ok(), await initialLogin.text()).toBeTruthy();
  const initialSession = (await initialLogin.json()) as { accessToken: string };
  const activated = await request.patch("/users/me", {
    headers: { authorization: `Bearer ${initialSession.accessToken}` },
    data: { currentPassword: `${input.password}-temporary`, password: input.password },
  });
  expect(activated.ok(), await activated.text()).toBeTruthy();
  return {
    membership: (await created.json()) as { id: string; userId: string; user: { email: string } },
    tenant,
    session,
  };
}

export async function makeCoordinator(request: APIRequestContext, userId: string, organizationId: string) {
  const session = await loginBearer(request);
  const headers = { authorization: `Bearer ${session.accessToken}` };
  let membership: { id: string; userId: string } | undefined;
  for (let offset = 0; !membership; offset += 100) {
    const listed = await request.get(`/tenants/${organizationId}/memberships?limit=100&offset=${offset}`, {
      headers,
    });
    expect(listed.ok(), await listed.text()).toBeTruthy();
    const body = (await listed.json()) as { items: { id: string; userId: string }[] };
    membership = body.items.find((item) => item.userId === userId);
    if (body.items.length < 100) break;
  }
  expect(membership, "organization membership").toBeTruthy();
  const updated = await request.patch(`/tenants/${organizationId}/memberships/${membership!.id}`, {
    headers,
    data: { role: "ADMIN" },
  });
  expect(updated.ok(), await updated.text()).toBeTruthy();
}

export async function caswjTenant(request: APIRequestContext, token?: string) {
  const tenant = (await tenants(request, token)).find((item) => item.name === orgName);
  if (!tenant) {
    throw new Error("CASWJ tenant was not found. Run npm run db:seed:caswj.");
  }

  return tenant;
}

export async function sessionTenant(request: APIRequestContext, token?: string) {
  if (process.env.E2E_ENV?.toUpperCase() !== "STAGING") {
    return caswjTenant(request, token);
  }

  try {
    return await caswjTenant(request, token);
  } catch {
    const tenant = (await tenants(request, token))[0];
    if (!tenant) {
      throw new Error("The signed-in user has no tenant.");
    }

    return tenant;
  }
}

async function tenants(request: APIRequestContext, token?: string) {
  const headers = token ? { authorization: `Bearer ${token}` } : undefined;
  const response = await request.get("/tenants?limit=100", { headers });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as { items: Tenant[] };
  return body.items;
}

export async function getReport(request: APIRequestContext, tenantId: string, token?: string) {
  const headers = token ? { authorization: `Bearer ${token}` } : undefined;
  const response = await request.get(`/tenants/${tenantId}/report?_=${Date.now()}`, { headers });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as ReportPayload;
}

export async function getCsv(request: APIRequestContext, tenantId: string, kind: "log" | "summary") {
  const path = kind === "log" ? "time-entries.csv" : "summary.csv";
  const response = await request.get(`/tenants/${tenantId}/${path}`);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.text();
}

export async function loginBearer(request: APIRequestContext) {
  const response = await request.post("/auth/login", {
    data: { username: "jbaddley", password: adminPassword() },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = (await response.json()) as { accessToken: string; user: { id: string } };
  return body;
}

export async function deleteMembershipByEmail(request: APIRequestContext, email: string) {
  const session = await loginBearer(request);
  const headers = { authorization: `Bearer ${session.accessToken}` };
  const tenant = await caswjTenant(request, session.accessToken);
  const needle = email.trim().toLowerCase();
  for (let offset = 0; ; offset += 100) {
    const listed = await request.get(`/tenants/${tenant.id}/memberships?limit=100&offset=${offset}`, {
      headers,
    });
    expect(listed.ok(), await listed.text()).toBeTruthy();
    const body = (await listed.json()) as { items: { id: string; user: { email: string } }[] };
    const match = body.items.find((item) => item.user.email.toLowerCase() === needle);
    if (match) {
      const deleted = await request.delete(`/tenants/${tenant.id}/memberships/${match.id}`, { headers });
      expect(deleted.ok(), await deleted.text()).toBeTruthy();
      return;
    }

    if (body.items.length < 100) {
      return;
    }
  }
}

export async function deleteE2eEntries(request: APIRequestContext) {
  const session = await loginBearer(request);
  const headers = { authorization: `Bearer ${session.accessToken}` };
  const tenant = await sessionTenant(request, session.accessToken);
  const entryIds: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const listed = await request.get(`/tenants/${tenant.id}/time-entries?limit=100&offset=${offset}`, {
      headers,
    });
    expect(listed.ok(), await listed.text()).toBeTruthy();
    const body = (await listed.json()) as {
      items: { id: string; description: string | null; sourceRef: string | null }[];
    };
    for (const entry of body.items) {
      if (!entry.sourceRef?.startsWith(caswjSourceRefPrefix) && (entry.description ?? "").startsWith("e2e-"))
        entryIds.push(entry.id);
    }
    if (body.items.length < 100) break;
  }
  for (const id of entryIds) {
    const deleted = await request.delete(`/time-entries/${id}`, { headers });
    expect(deleted.ok(), await deleted.text()).toBeTruthy();
  }
}

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

export function groupsByLabel(rows: ReportGroup[]) {
  return new Map(rows.map((row) => [row.label, row]));
}

export function expectGroups(
  actual: ReportGroup[],
  expected: ReportGroup[],
  options: { volunteers?: boolean; id?: "label" | "month" | "organization" } = {},
) {
  expect(actual, "group count").toHaveLength(expected.length);
  const found = groupsByLabel(actual);
  for (const row of expected) {
    const match = found.get(row.label);
    expect(match, `missing group ${row.label}`).toBeTruthy();
    if (!match) {
      continue;
    }

    expect(match.hours, `${row.label} hours`).toBe(row.hours);
    expect(match.entries, `${row.label} entries`).toBe(row.entries);
    expect(match.inKind, `${row.label} in-kind`).toBeCloseTo(row.inKind, 2);
    if (options.volunteers) {
      expect(match.volunteers, `${row.label} volunteers`).toBe(row.volunteers);
    }

    if (options.id === "month") {
      expect(match.id, `${row.label} month id`).toBe(row.id);
    }

    if (options.id === "organization" && row.id === "tenant") {
      expect(match.id).toBe("tenant");
    }
  }
}

export async function openReports(page: Page) {
  const tenant = await loginAsAdmin(page);
  await page.goto("/reports/summary");
  await expect(page.getByRole("button", { name: "Choose report" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reports menu" })).toBeVisible();
  await expect(page.getByText("Updating…")).toHaveCount(0);
  return tenant;
}

export function cardNamed(page: Page, title: string) {
  return page
    .locator("[data-slot='card']")
    .filter({ has: page.locator("[data-slot='card-title']", { hasText: title }) })
    .first();
}

export function cardTitle(page: Page, title: string) {
  return page.locator("[data-slot='card-title']", { hasText: title });
}

export async function selectReportsTab(page: Page, name: string) {
  const slugs: Record<string, string> = {
    Summary: "summary",
    People: "people",
    "Group sessions": "group-sessions",
    Staff: "staff",
  };
  await page.goto(`/reports/${slugs[name] ?? name}`);
  await expect(page.getByRole("button", { name: "Reports menu" })).toBeVisible();
}
