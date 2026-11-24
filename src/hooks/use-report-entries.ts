"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useEntries } from "@/hooks/use-entries";
import { useTenant, useWorkspace } from "@/hooks/use-workspace";
import { tenantEntriesQuery } from "@/lib/queries";
import type { TimeEntry } from "@/lib/types";

export function useReportEntries() {
  const tenant = useTenant();
  const { viewer } = useWorkspace();
  const mine = useEntries(viewer.id, {});
  const tenantEntries = useQuery(tenantEntriesQuery(tenant.id));
  const entries = useMemo(
    () => ({
      mine: mine.entries,
      tenant: tenantEntries.data?.items ?? [],
    }),
    [mine.entries, tenantEntries.data],
  );
  return {
    entries,
    isPending: mine.isPending || tenantEntries.isPending,
  };
}

export function withEntries<T extends object>(data: T | undefined, entries: { mine: TimeEntry[]; tenant: TimeEntry[] }) {
  if (!data) return undefined;
  return { ...data, entries };
}
