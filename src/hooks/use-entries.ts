"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTenant } from "@/hooks/use-workspace";
import { entriesQuery, type EntriesListFilter } from "@/lib/queries";

export function useEntries(userId: string, filter: EntriesListFilter = {}) {
  const tenant = useTenant();
  const query = useInfiniteQuery(entriesQuery(tenant.id, userId, filter));
  const entries = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  return { ...query, entries };
}
