import { z } from "zod";

const pageSchema = z.object({
  data: z.array(z.unknown()),
  next_cursor: z.string().nullable().optional(),
  complete: z.boolean().optional(),
});

export const portalPersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email().or(z.string()),
  active: z.boolean(),
});

export const portalOrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  short_name: z.string().optional(),
  kind: z.enum(["society", "ao"]),
  active: z.boolean(),
});

export const portalRoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional().nullable(),
  scope: z.string().optional().nullable(),
  active: z.boolean(),
});

export const portalMembershipSchema = z.object({
  id: z.string(),
  person_id: z.string(),
  organization_id: z.string(),
  organization: z.string().optional(),
  role_id: z.string(),
  role: z.string().optional(),
  starts_on: z.string().nullable().optional(),
  ends_on: z.string().nullable().optional(),
  suspended: z.boolean().optional(),
});

export const portalPositionSchema = z.object({
  id: z.string(),
  person_id: z.string(),
  organization_id: z.string(),
  organization: z.string().optional(),
  position_id: z.string().optional(),
  position: z.string(),
  starts_on: z.string().nullable().optional(),
  ends_on: z.string().nullable().optional(),
});

export type PortalPerson = z.infer<typeof portalPersonSchema>;
export type PortalOrganization = z.infer<typeof portalOrganizationSchema>;
export type PortalRole = z.infer<typeof portalRoleSchema>;
export type PortalMembership = z.infer<typeof portalMembershipSchema>;
export type PortalPosition = z.infer<typeof portalPositionSchema>;

export type PortalDirectorySnapshot = {
  people: PortalPerson[];
  organizations: PortalOrganization[];
  roles: PortalRole[];
  memberships: PortalMembership[];
  positions: PortalPosition[];
};

async function fetchPage(
  origin: string,
  path: string,
  apiToken: string,
  cursor: string | null,
): Promise<{ data: unknown[]; next: string | null; complete: boolean }> {
  const url = new URL(`${origin.replace(/\/$/, "")}/api/v1/${path}`);
  url.searchParams.set("limit", "200");
  url.searchParams.set("snapshot", "1");
  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Portal ${path} returned ${res.status}`);
  }
  const json = pageSchema.parse(await res.json());
  return {
    data: json.data,
    next: json.next_cursor ?? null,
    complete: json.complete === true || !json.next_cursor,
  };
}

async function fetchAll<T>(
  origin: string,
  path: string,
  apiToken: string,
  schema: z.ZodType<T>,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 100; i += 1) {
    const page = await fetchPage(origin, path, apiToken, cursor);
    for (const row of page.data) {
      const parsed = schema.safeParse(row);
      if (parsed.success) {
        items.push(parsed.data);
      }
    }
    if (page.complete || !page.next) {
      break;
    }
    cursor = page.next;
  }
  return items;
}

export async function pullPortalDirectory(input: {
  portalOrigin: string;
  apiToken: string;
}): Promise<PortalDirectorySnapshot> {
  const { portalOrigin, apiToken } = input;
  const [people, organizations, roles, memberships, positions] = await Promise.all([
    fetchAll(portalOrigin, "people", apiToken, portalPersonSchema),
    fetchAll(portalOrigin, "organizations", apiToken, portalOrganizationSchema),
    fetchAll(portalOrigin, "roles", apiToken, portalRoleSchema),
    fetchAll(portalOrigin, "memberships", apiToken, portalMembershipSchema),
    fetchAll(portalOrigin, "positions", apiToken, portalPositionSchema),
  ]);
  return { people, organizations, roles, memberships, positions };
}

export const portalEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  occurred_at: z.string().optional(),
  data: z.unknown(),
});

export type PortalEvent = z.infer<typeof portalEventSchema>;
