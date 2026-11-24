"use client";

import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/hooks/use-workspace";
import { apiKeysQuery } from "@/lib/queries";

export function useApiKeys() {
  const tenant = useTenant();
  const query = useQuery(apiKeysQuery(tenant.id));
  return { ...query, apiKeys: query.data ?? [] };
}
