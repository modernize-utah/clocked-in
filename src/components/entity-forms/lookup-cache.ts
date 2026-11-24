import type { QueryClient } from "@tanstack/react-query";
import { keys } from "@/lib/queries";
import type { Lookups, Project } from "@/lib/types";

export type NamedEntity = { id: string; name: string };

export function namedEntity(value: unknown): value is NamedEntity {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.name === "string";
}

export function savedProject(value: unknown): value is Project {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.title === "string" && typeof record.tenantId === "string";
}

export function rememberLookup(queryClient: QueryClient, tenantId: string, update: (current: Lookups) => Lookups) {
  queryClient.setQueriesData<Lookups>({ queryKey: keys.lookups(tenantId) }, (current) =>
    current ? update(current) : current,
  );
}

export function upsertNamed<T extends { id: string; name: string }>(items: T[], item: T) {
  const next = items.some((current) => current.id === item.id)
    ? items.map((current) => (current.id === item.id ? { ...current, ...item } : current))
    : [...items, item];
  return next.sort((a, b) => a.name.localeCompare(b.name));
}

export function upsertProject(items: Project[], item: Project) {
  const next = items.some((current) => current.id === item.id)
    ? items.map((current) => (current.id === item.id ? item : current))
    : [...items, item];
  return next.sort((a, b) => a.title.localeCompare(b.title));
}
