import "server-only";
import type { QueryClient } from "@tanstack/react-query";
import {
  entriesPageSize,
  entriesQuery,
  groupSessionsQuery,
  invitationsQuery,
  lookupsQuery,
  membersQuery,
  openPunchQuery,
  reportQuery,
} from "@/lib/queries";
import { getEntries, getGroupSessions, getInvitations, getLookups, getMembers, getOpenPunch, getReport } from "@/lib/server/dal";
import type { DateRange } from "@/lib/types";

export function prefetchLookups(client: QueryClient, tenantId: string, userId: string) {
  return client.prefetchQuery({
    ...lookupsQuery(tenantId, userId),
    queryFn: () => getLookups(tenantId),
  });
}

export function prefetchMembers(client: QueryClient, tenantId: string) {
  return client.prefetchQuery({ ...membersQuery(tenantId), queryFn: () => getMembers(tenantId) });
}

export function prefetchInvitations(client: QueryClient, tenantId: string) {
  return client.prefetchQuery({ ...invitationsQuery(tenantId), queryFn: () => getInvitations(tenantId) });
}

export function prefetchEntries(client: QueryClient, tenantId: string, userId: string, range: DateRange) {
  return client.prefetchInfiniteQuery({
    ...entriesQuery(tenantId, userId, range),
    queryFn: ({ pageParam }) => getEntries(tenantId, userId, range, pageParam, entriesPageSize),
  });
}

export function prefetchGroupSessions(client: QueryClient, tenantId: string) {
  return client.prefetchInfiniteQuery({
    ...groupSessionsQuery(tenantId),
    queryFn: ({ pageParam }) => getGroupSessions(tenantId, pageParam, entriesPageSize),
  });
}

export function prefetchReport(client: QueryClient, tenantId: string, range: DateRange) {
  return client.prefetchQuery({
    ...reportQuery(tenantId, range),
    queryFn: () => getReport(tenantId, range.from, range.to),
  });
}

export function prefetchOpenPunch(client: QueryClient, userId: string) {
  return client.prefetchQuery({ ...openPunchQuery(userId), queryFn: () => getOpenPunch() });
}
