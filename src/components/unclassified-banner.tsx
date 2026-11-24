"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/fetch-json";
import { useTenant } from "@/hooks/use-workspace";

export function UnclassifiedBanner() {
  const tenant = useTenant();
  const { data } = useQuery({
    queryKey: ["org", tenant.id, "unclassified-count"],
    queryFn: ({ signal }) => fetchJson<{ count: number }>(`/tenants/${tenant.id}/unclassified-count`, signal),
  });
  const count = data?.count ?? 0;
  if (count === 0) return null;
  return (
    <div className="shrink-0 rounded-lg border border-highlight/40 bg-highlight/10 px-4 py-3 text-sm">
      <p>
        {count === 1 ? "1 time entry needs" : `${count} time entries need`} a project, task category, or group.{" "}
        <Link href="/entries?unclassified=1" className="font-medium underline underline-offset-2">
          Review unclassified entries
        </Link>
      </p>
    </div>
  );
}
