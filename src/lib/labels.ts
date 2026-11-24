import type { TenantPreferences } from "@/lib/api/features/tenants";

export type EntityLabels = {
  tenant: string;
  project: string;
  organization: string;
  taskCategory: string;
};

export const defaultEntityLabels: EntityLabels = {
  tenant: "Community",
  project: "Project",
  organization: "Organization",
  taskCategory: "Task category",
};

export function readEntityLabels(preferences?: Pick<TenantPreferences, "entityLabels"> | null): EntityLabels {
  return { ...defaultEntityLabels, ...preferences?.entityLabels };
}

function pluralize(label: string) {
  if (label.endsWith("s") || label.endsWith("S")) {
    return label;
  }

  if (/[yY]$/.test(label) && !/[aeiouAEIOU][yY]$/.test(label)) {
    return `${label.slice(0, -1)}ies`;
  }

  return `${label}s`;
}

export function labels(preferences?: Pick<TenantPreferences, "entityLabels"> | null) {
  const entity = readEntityLabels(preferences);
  return {
    ...entity,
    tenants: pluralize(entity.tenant),
    projects: pluralize(entity.project),
    organizations: pluralize(entity.organization),
    taskCategories: pluralize(entity.taskCategory),
  };
}
