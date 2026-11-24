import type { Access } from "@/lib/api/access";
import { listOrganizations } from "@/lib/api/features/organizations";
import { listHourlyRates } from "@/lib/api/features/hourly-rates";
import { listProjects } from "@/lib/api/features/projects";
import { listTags } from "@/lib/api/features/tags";
import { listTaskCategories } from "@/lib/api/features/task-categories";
import type { Lookups } from "@/lib/types";

function limit(extra?: Record<string, string>) {
  return new URLSearchParams({ limit: "100", ...extra });
}

export async function loadLookups(access: Access, tenantId: string): Promise<Lookups> {
  const [organizations, projects, categories, tags, hourlyRates] = await Promise.all([
    listOrganizations(access, tenantId, limit()),
    listProjects(access, tenantId, limit({ includeInactive: "true" })),
    listTaskCategories(access, tenantId, limit()),
    listTags(access, tenantId, limit({ includeArchived: "true" })),
    listHourlyRates(access, tenantId, limit()),
  ]);
  return {
    organizations: organizations.items,
    projects: projects.items,
    categories: categories.items,
    tags: tags.items.filter((tag) => !("isArchived" in tag) || tag.isArchived !== true),
    hourlyRates: hourlyRates.items,
  };
}
