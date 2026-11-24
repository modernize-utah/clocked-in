"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTenant } from "@/hooks/use-workspace";
import { groupSessionsQuery } from "@/lib/queries";

export function useGroupSessions() {
  const tenant = useTenant();
  const query = useInfiniteQuery(groupSessionsQuery(tenant.id));
  const sessions = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  return { ...query, sessions };
}
