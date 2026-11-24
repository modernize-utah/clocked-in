"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTenant, useWorkspace } from "@/hooks/use-workspace";
import { lookupsQuery } from "@/lib/queries";
import type { Lookups } from "@/lib/types";

const empty: Lookups = { organizations: [], projects: [], categories: [], tags: [], hourlyRates: [] };

export function useLookups() {
  const { viewer } = useWorkspace();
  const tenant = useTenant();
  const query = useQuery(lookupsQuery(tenant.id, viewer.id));
  const lookups = query.data ?? empty;
  const names = useMemo(
    () => ({
      organization: new Map(lookups.organizations.map((item) => [item.id, item.name])),
      project: new Map(lookups.projects.map((item) => [item.id, item.title])),
      category: new Map(lookups.categories.map((item) => [item.id, item.name])),
      tag: new Map(lookups.tags.map((item) => [item.id, item.name])),
    }),
    [lookups],
  );
  return { ...query, lookups, names };
}
