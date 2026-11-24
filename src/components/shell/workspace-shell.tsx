import { cookies } from "next/headers";
import { TenantGate } from "@/components/tenant-gate";
import { AppShell } from "@/components/shell/app-shell";
import { UserQueryCache } from "@/components/user-query-cache";
import { WorkspaceProvider } from "@/hooks/use-workspace";
import { canSeeReports } from "@/lib/roles";
import { getWorkspace } from "@/lib/server/dal";

export async function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const [workspace, store] = await Promise.all([getWorkspace(), cookies()]);

  return (
    <WorkspaceProvider value={workspace}>
      <UserQueryCache userId={workspace.viewer.id}>
        {workspace.isTenantHost && workspace.pinnedTenantName ? (
          <title>{workspace.pinnedTenantName}</title>
        ) : null}
        <AppShell
          tenant={workspace.tenant}
          isAdmin={workspace.isAdmin}
          isCoordinator={workspace.isCoordinator}
          isSuperAdmin={workspace.viewer.isSuperAdmin && !workspace.isTenantHost}
          showReports={canSeeReports(workspace)}
          sidebarOpen={store.get("sidebar_state")?.value !== "false"}
        >
          <TenantGate>{children}</TenantGate>
        </AppShell>
      </UserQueryCache>
    </WorkspaceProvider>
  );
}
