"use client";

import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/hooks/use-workspace";
import type { SavedReport } from "@/lib/api/features/saved-reports";
import { savedReportsQuery } from "@/lib/queries";

const emptyReports: SavedReport[] = [];

export function useSavedReports() {
  const tenant = useTenant();
  const query = useQuery(savedReportsQuery(tenant.id));
  return { ...query, reports: query.data ?? emptyReports };
}
