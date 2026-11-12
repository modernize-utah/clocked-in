"use client";

import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { Loader2Icon, MoreHorizontalIcon, PencilIcon, Trash2Icon, UsersIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { deleteGroupSessionAction } from "@/app/actions/collective";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { GroupSessionDialog, GroupSessionForm } from "@/components/entity-forms/group-session-form";
import { EntryList } from "@/components/entry-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useClientRedirect } from "@/hooks/use-client-redirect";
import { useGroupSessions } from "@/hooks/use-group-sessions";
import { useLabels } from "@/hooks/use-labels";
import { useLookups } from "@/hooks/use-lookups";
import { useOrganization, useWorkspace } from "@/hooks/use-workspace";
import { dayLabel, formatCurrency, formatMinutes, formatTime, toDateOnly } from "@/lib/format";
import { keys } from "@/lib/queries";
import { canLogGroupTime } from "@/lib/roles";
import type { GroupSession, Paged } from "@/lib/types";
import { logPaneClass, logScrollClass } from "../pane";
import { SetupAlert } from "../setup-alert";

function sessionMinutes(session: GroupSession) {
  return Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 60000);
}

export function GroupTimeView() {
  const organization = useOrganization();
  const { isAdmin, groupDepartments, permissions } = useWorkspace();
  const allowed = canLogGroupTime(groupDepartments, permissions) || permissions.includes("log_event_totals");
  useClientRedirect(!allowed, "/log/own");
  const { lookups, isSuccess } = useLookups();
  const queryClient = useQueryClient();
  const { sessions, fetchNextPage, hasNextPage, isFetchingNextPage, isPending } = useGroupSessions();
  const [pendingEdit, setPendingEdit] = useState<GroupSession | null>(null);
  const [pendingDelete, setPendingDelete] = useState<GroupSession | null>(null);
  const departmentIds = groupDepartments === "all" ? undefined : groupDepartments;
  const missingProject = isSuccess && lookups.projects.length === 0;
  const missingCategory = isSuccess && lookups.categories.length === 0;
  const sessionsKey = keys.groupSessions(organization.id);

  function canEdit(session: GroupSession) {
    if (groupDepartments === "all") return true;
    return session.departmentId !== null && groupDepartments.includes(session.departmentId);
  }

  const remove = useActionMutation((session: GroupSession) => deleteGroupSessionAction(session.id), {
    invalidate: [keys.organization(organization.id)],
    onMutate: (session) => {
      queryClient.setQueryData<InfiniteData<Paged<GroupSession>>>(sessionsKey, (data) =>
        data
          ? { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.filter((item) => item.id !== session.id) })) }
          : data,
      );
    },
  });

  const days = useMemo(() => {
    const groups = new Map<string, GroupSession[]>();
    for (const session of sessions) {
      const day = toDateOnly(new Date(session.startedAt));
      groups.set(day, [...(groups.get(day) ?? []), session]);
    }
    return [...groups.entries()];
  }, [sessions]);

  const totalValue = sessions.reduce((sum, session) => sum + session.inKindValue, 0);
  if (!allowed) return null;

  return (
    <div className={logPaneClass}>
      {missingProject || missingCategory ? (
        <SetupAlert isAdmin={isAdmin} missingProject={missingProject} missingCategory={missingCategory} action="save group time" />
      ) : null}
      <Tabs defaultValue="record" className="min-h-0 flex-1">
        <TabsList variant="line" className="shrink-0">
          <TabsTrigger value="record">Record</TabsTrigger>
          <TabsTrigger value="entries">Entries</TabsTrigger>
        </TabsList>
        <TabsContent value="record" className={`mt-4 ${logScrollClass}`}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UsersIcon className="size-4 text-muted-foreground" />
                Record a session
              </CardTitle>
              <CardDescription>
                Log a group session or an event total. In-kind value is the session length times the number of people, at the volunteer rate.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GroupSessionForm key={departmentIds?.join(",") ?? "all"} departmentIds={departmentIds} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="entries" className={`mt-4 flex flex-col gap-6 ${logScrollClass}`}>
          {sessions.length ? (
            <p className="text-sm text-muted-foreground">
              {sessions.length} session{sessions.length === 1 ? "" : "s"} · {formatCurrency(totalValue)} in-kind
              {hasNextPage ? " (loaded so far)" : ""}
            </p>
          ) : null}

          {days.length === 0 ? (
            <EmptyState
              icon={UsersIcon}
              title="No group sessions yet"
              description={isPending ? "Loading…" : "Sessions you record show up here and on the group tab of Reports."}
            />
          ) : (
            <div className="flex flex-col gap-5">
              {days.map(([day, items]) => (
                <Card key={day} className="gap-0 py-0">
                  <div className="flex items-center justify-between bg-primary px-4 py-2.5 text-primary-foreground">
                    <h2 className="text-xs font-semibold tracking-widest uppercase" suppressHydrationWarning>
                      {dayLabel(day)}
                    </h2>
                    <p className="text-xs tracking-wide uppercase">
                      {items.length} session{items.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <EntryList>
                    {items.map((session) => (
                      <SessionRow
                        key={session.id}
                        session={session}
                        onEdit={canEdit(session) ? setPendingEdit : undefined}
                        onDelete={canEdit(session) ? setPendingDelete : undefined}
                      />
                    ))}
                  </EntryList>
                </Card>
              ))}
              {hasNextPage ? (
                <Button variant="outline" className="self-center" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                  {isFetchingNextPage ? <Loader2Icon className="animate-spin" /> : null}
                  Load more
                </Button>
              ) : null}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <GroupSessionDialog
        open={pendingEdit !== null}
        session={pendingEdit}
        departmentIds={departmentIds}
        onOpenChange={(open) => !open && setPendingEdit(null)}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this session?"
        description="The hours and in-kind value are removed from group reports. This cannot be undone."
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete)}
      />
    </div>
  );
}

function SessionRow({
  session,
  onEdit,
  onDelete,
}: {
  session: GroupSession;
  onEdit?: (session: GroupSession) => void;
  onDelete?: (session: GroupSession) => void;
}) {
  const { names } = useLookups();
  const copy = useLabels();
  const project = names.project.get(session.projectId) ?? copy.project;
  const category = names.category.get(session.taskCategoryId);
  const department = session.departmentId
    ? (names.department.get(session.departmentId) ?? copy.department)
    : `Whole ${copy.organization.toLowerCase()}`;
  const when = `${formatTime(session.startedAt)} – ${formatTime(session.endedAt)}`;

  return (
    <li className="flex items-center gap-3 px-4 py-3 @3xl:gap-4">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{session.description || project}</p>
        <p className="truncate text-xs text-muted-foreground" suppressHydrationWarning>
          {[session.description ? project : null, category, department, when].filter(Boolean).join(" · ")}
          <span className="@md:hidden">
            {" · "}
            {session.participantCount} {session.participantCount === 1 ? "person" : "people"}
          </span>
        </p>
      </div>
      <div className="hidden w-44 shrink-0 flex-wrap gap-1 @3xl:flex">
        {session.tagIds.map((id) => (
          <Badge key={id} variant="outline" className="font-normal">
            {names.tag.get(id) ?? "tag"}
          </Badge>
        ))}
      </div>
      <p className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground @md:block">
        {session.participantCount} {session.participantCount === 1 ? "person" : "people"}
      </p>
      <p className="w-16 shrink-0 text-right font-mono text-sm font-medium tabular-nums">{formatMinutes(sessionMinutes(session))}</p>
      <p className="hidden w-20 shrink-0 text-right text-sm text-muted-foreground tabular-nums @md:block">
        {formatCurrency(session.inKindValue)}
      </p>
      {onEdit || onDelete ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="shrink-0" aria-label="Session actions" />}>
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onEdit ? (
              <DropdownMenuItem onClick={() => onEdit(session)}>
                <PencilIcon />
                Edit session
              </DropdownMenuItem>
            ) : null}
            {onDelete ? (
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(session)}>
                <Trash2Icon />
                Delete session
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </li>
  );
}
