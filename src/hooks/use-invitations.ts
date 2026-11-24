"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { useTenant, useWorkspace } from "@/hooks/use-workspace";
import { organizationInvitationsQuery, invitationsQuery } from "@/lib/queries";
import type { Invitation } from "@/lib/types";

export function useInvitations() {
  const tenant = useTenant();
  const { isAdmin, isCoordinator, groupOrganizations } = useWorkspace();
  const organizationIds = isCoordinator && groupOrganizations !== "all" ? groupOrganizations : [];
  const orgQuery = useQuery({ ...invitationsQuery(tenant.id), enabled: isAdmin });
  const organizationQueries = useQueries({
    queries: organizationIds.map((organizationId) => ({
      ...organizationInvitationsQuery(organizationId),
      enabled: isCoordinator,
    })),
  });
  const invitations: Invitation[] = isAdmin
    ? (orgQuery.data ?? [])
    : organizationQueries.flatMap((query) => query.data ?? []);
  return { invitations, isPending: isAdmin ? orgQuery.isPending : organizationQueries.some((query) => query.isPending) };
}
