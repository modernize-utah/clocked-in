"use client";

import { CalendarClockIcon, UsersIcon } from "lucide-react";
import { TimeEntryForm } from "@/components/entity-forms/time-entry-form";
import { selectableMembers } from "@/components/person-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useClientRedirect } from "@/hooks/use-client-redirect";
import { useMembers } from "@/hooks/use-members";
import { useWorkspace } from "@/hooks/use-workspace";
import { canLogMemberTime } from "@/lib/roles";
import { EmptyState } from "@/components/empty-state";
import { PageSkeleton } from "@/components/skeletons";
import { logScrollClass } from "../pane";

export function MemberTimeView() {
  const { viewer, isAdmin, isCoordinator, groupDepartments } = useWorkspace();
  const canLog = canLogMemberTime(isAdmin, groupDepartments);
  useClientRedirect(!canLog, "/log/own");
  const { members, isPending } = useMembers({ enabled: canLog });
  if (!canLog) return null;
  const scoped = isCoordinator
    ? members.filter((member) => (member.departmentIds ?? []).some((id) => groupDepartments.includes(id)))
    : members;
  const eligible = selectableMembers(scoped, viewer.id, { excludeSelf: true, activeOnly: true });

  return (
    <div className={logScrollClass}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClockIcon className="size-4 text-muted-foreground" />
            Add time for a member
          </CardTitle>
          <CardDescription>Choose an active member, then log a start time and duration or a total as HH:MM. Add days to save that same entry on each one.</CardDescription>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <PageSkeleton className="min-h-60" />
          ) : eligible.length === 0 ? (
            <EmptyState icon={UsersIcon} title="No other active members" description="Add or reactivate someone on People to log time for them." />
          ) : (
            <TimeEntryForm people={{ excludeSelf: true, activeOnly: true }} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
