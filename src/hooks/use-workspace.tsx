"use client";

import { createContext, useContext } from "react";
import type { RoleCode } from "@/lib/api/json";
import { isCoordinator } from "@/lib/roles";
import type { GroupOrganizations, Tenant, Viewer } from "@/lib/types";

export type Workspace = {
  viewer: Viewer;
  tenants: Tenant[];
  tenant: Tenant | null;
  isAdmin: boolean;
  isCoordinator: boolean;
  canSelectRate: boolean;
  role: RoleCode | null;
  permissions: string[];
  groupOrganizations: GroupOrganizations;
  isTenantHost?: boolean;
  pinnedTenantName?: string | null;
  appOrigin?: string;
};

const WorkspaceContext = createContext<Workspace | null>(null);

export function WorkspaceProvider({ value, children }: { value: Workspace; children: React.ReactNode }) {
  return (
    <WorkspaceContext
      value={{
        ...value,
        isCoordinator: value.isCoordinator || isCoordinator(value.groupOrganizations),
        permissions: value.permissions ?? [],
      }}
    >
      {children}
    </WorkspaceContext>
  );
}

export function useWorkspace() {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) {
    throw new Error("useWorkspace must be used inside the workspace layout.");
  }

  return workspace;
}

export function useTenant() {
  const { tenant } = useWorkspace();
  if (!tenant) {
    throw new Error("This view needs an active tenant.");
  }

  return tenant;
}
