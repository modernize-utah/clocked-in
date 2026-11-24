import { formatDate, formatPersonName } from "@/lib/format";
import type { ReportFilters } from "@/lib/report-layout";

export type FilterNames = {
  organization: Map<string, string>;
  project: Map<string, string>;
  category: Map<string, string>;
  person: Map<string, string>;
};

export function personLabel(person: {
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  username: string;
}) {
  return formatPersonName(person);
}

function datePart(filters: ReportFilters) {
  if (filters.from && filters.to && filters.from === filters.to) return formatDate(filters.from);
  if (filters.from && filters.to) return `${formatDate(filters.from)} – ${formatDate(filters.to)}`;
  if (filters.from) return `Since ${formatDate(filters.from)}`;
  if (filters.to) return `Through ${formatDate(filters.to)}`;
  return "All time";
}

export function reportFilterSummary(
  filters: ReportFilters,
  names: FilterNames,
  copy: { organization: string; project: string; taskCategory: string; organizations: string },
) {
  const parts = [datePart(filters)];
  const named = (ids: string[] | undefined, lookup: Map<string, string>, fallback: string) => {
    if (!ids || ids.length === 0) return;
    parts.push(ids.map((id) => lookup.get(id) ?? fallback).join(", "));
  };
  named(filters.organizationId, names.organization, copy.organization);
  named(filters.taskCategoryId, names.category, copy.taskCategory);
  named(filters.projectId, names.project, copy.project);
  named(filters.userId, names.person, "Person");
  if (parts.length === 1 && parts[0] === "All time") {
    parts.push(`All ${copy.organizations.toLowerCase()}`);
  }
  return parts.join(" · ");
}
