import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import { api } from "@/api/client";
import type { Lookups, Workspace } from "@/api/types";
import { useSession } from "@/session";
import { colorsFromTheme, entityLabels, ThemeProvider } from "@/theme";
import { ErrorText, Loading } from "@/ui";

type WorkspaceValue = Workspace & { switching: boolean; switchTenant: (tenantId: string) => Promise<void> };

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function useWorkspace() {
  const workspace = useContext(WorkspaceContext);
  if (!workspace?.tenant) throw new Error("This screen needs an tenant.");
  return { ...workspace, tenant: workspace.tenant, labels: entityLabels(workspace.tenant) };
}

/** Loads the workspace once, then keeps children mounted while another tenant loads. */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { tenantId, setTenantId } = useSession();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["workspace", tenantId],
    queryFn: () => api.workspace(tenantId),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    const selected = query.data?.tenant?.id;
    if (selected && selected !== tenantId && !query.isPlaceholderData) {
      void setTenantId(selected);
    }
  }, [tenantId, query.data?.tenant?.id, query.isPlaceholderData, setTenantId]);

  const switchTenant = useCallback(
    async (next: string) => {
      await setTenantId(next);
      await queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    [queryClient, setTenantId],
  );

  const value = useMemo<WorkspaceValue | null>(
    () => (query.data ? { ...query.data, switching: query.isPlaceholderData, switchTenant } : null),
    [query.data, query.isPlaceholderData, switchTenant],
  );

  if (!value) {
    if (query.error) {
      return (
        <View style={{ padding: 20 }}>
          <ErrorText error={query.error} />
        </View>
      );
    }
    return <Loading />;
  }
  if (!value.tenant) return <Redirect href="/empty" />;

  return (
    <ThemeProvider colors={colorsFromTheme(value.tenant.theme)}>
      <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
    </ThemeProvider>
  );
}

export function useOrgQuery<T>(key: string, queryFn: (tenantId: string) => Promise<T>, enabled = true) {
  const { tenant } = useWorkspace();
  return useQuery({ queryKey: [key, tenant.id], queryFn: () => queryFn(tenant.id), enabled });
}

const noLookups: Lookups = { organizations: [], projects: [], categories: [], tags: [], hourlyRates: [] };

export function useLookups() {
  const query = useOrgQuery("lookups", (tenantId) => api.lookups(tenantId));
  const lookups = query.data ?? noLookups;
  const names = useMemo(
    () => ({
      project: new Map(lookups.projects.map((item) => [item.id, item.title])),
      category: new Map(lookups.categories.map((item) => [item.id, item.name])),
      organization: new Map(lookups.organizations.map((item) => [item.id, item.name])),
      tag: new Map(lookups.tags.map((item) => [item.id, item.name])),
    }),
    [lookups],
  );
  return { lookups, names, isSuccess: query.isSuccess };
}

export function ownEntriesKey(userId: string) {
  return ["own-entries", userId] as const;
}

/** The caller's running timer, read from recent entries like the website does. */
export function useOpenPunch() {
  const { viewer } = useWorkspace();
  const query = useQuery({
    queryKey: ["open-punch", viewer.id],
    queryFn: async () => {
      const recent = await api.entries(viewer.id, { limit: 20 });
      return recent.items.find((entry) => entry.mode === "Punch" && !entry.endedAt) ?? null;
    },
  });
  return { ...query, punch: query.data ?? null };
}

export function useElapsed(startedAt: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return startedAt ? Math.max(0, now - new Date(startedAt).getTime()) : 0;
}

/** Invalidates everything that shows the caller's time after a change. */
export function useRefreshTime() {
  const client = useQueryClient();
  return useCallback(
    () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ["open-punch"] }),
        client.invalidateQueries({ queryKey: ["own-entries"] }),
        client.invalidateQueries({ queryKey: ["report"] }),
        client.invalidateQueries({ queryKey: ["unclassified-count"] }),
      ]),
    [client],
  );
}
