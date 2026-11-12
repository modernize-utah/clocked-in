import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import { api } from "@/api/client";
import type { Lookups, Workspace } from "@/api/types";
import { useSession } from "@/session";
import { colorsFromTheme, entityLabels, ThemeProvider } from "@/theme";
import { ErrorText, Loading } from "@/ui";

type WorkspaceValue = Workspace & { switching: boolean; switchOrganization: (organizationId: string) => Promise<void> };

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function useWorkspace() {
  const workspace = useContext(WorkspaceContext);
  if (!workspace?.organization) throw new Error("This screen needs an organization.");
  return { ...workspace, organization: workspace.organization, labels: entityLabels(workspace.organization) };
}

/** Loads the workspace once, then keeps children mounted while another organization loads. */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { organizationId, setOrganizationId } = useSession();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["workspace", organizationId],
    queryFn: () => api.workspace(organizationId),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    const selected = query.data?.organization?.id;
    if (selected && selected !== organizationId && !query.isPlaceholderData) {
      void setOrganizationId(selected);
    }
  }, [organizationId, query.data?.organization?.id, query.isPlaceholderData, setOrganizationId]);

  const switchOrganization = useCallback(
    async (next: string) => {
      await setOrganizationId(next);
      await queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
    [queryClient, setOrganizationId],
  );

  const value = useMemo<WorkspaceValue | null>(
    () => (query.data ? { ...query.data, switching: query.isPlaceholderData, switchOrganization } : null),
    [query.data, query.isPlaceholderData, switchOrganization],
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
  if (!value.organization) return <Redirect href="/empty" />;

  return (
    <ThemeProvider colors={colorsFromTheme(value.organization.theme)}>
      <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
    </ThemeProvider>
  );
}

export function useOrgQuery<T>(key: string, queryFn: (organizationId: string) => Promise<T>, enabled = true) {
  const { organization } = useWorkspace();
  return useQuery({ queryKey: [key, organization.id], queryFn: () => queryFn(organization.id), enabled });
}

const noLookups: Lookups = { departments: [], projects: [], categories: [], tags: [], hourlyRates: [] };

export function useLookups() {
  const query = useOrgQuery("lookups", (organizationId) => api.lookups(organizationId));
  const lookups = query.data ?? noLookups;
  const names = useMemo(
    () => ({
      project: new Map(lookups.projects.map((item) => [item.id, item.title])),
      category: new Map(lookups.categories.map((item) => [item.id, item.name])),
      department: new Map(lookups.departments.map((item) => [item.id, item.name])),
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
