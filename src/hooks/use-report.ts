"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTenant } from "@/hooks/use-workspace";
import { reportQuery } from "@/lib/queries";
import type { ReportFilters } from "@/lib/report-layout";

export function useReport(filter: ReportFilters) {
  const tenant = useTenant();
  return useQuery({
    ...reportQuery(tenant.id, filter),
    placeholderData: keepPreviousData,
  });
}
