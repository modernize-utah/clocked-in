"use client";

import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { InboxIcon, Loader2Icon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { deleteEntryAction } from "@/app/actions/entries";
import { TimeEntryDialog } from "@/components/entity-forms/time-entry-form";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DateRangeFilter, rangeFromSearch, useUrlParams } from "@/components/date-range-filter";
import { CardSkeleton } from "@/components/skeletons";
import { EmptyState } from "@/components/empty-state";
import { EntryList, EntryRow } from "@/components/entry-row";
import { PageHeader } from "@/components/page-header";
import { PersonSelect } from "@/components/person-select";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useEntries } from "@/hooks/use-entries";
import { useTenant, useWorkspace } from "@/hooks/use-workspace";
import { dayLabel, formatCurrency, formatMinutes } from "@/lib/format";
import { keys, type EntriesListFilter } from "@/lib/queries";
import type { Paged, TimeEntry } from "@/lib/types";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readId(search: { get: (key: string) => string | null }, key: string) {
  const value = search.get(key);
  return value && uuid.test(value) ? value : undefined;
}

export function EntriesView() {
  const tenant = useTenant();
  const { viewer, isAdmin, isCoordinator } = useWorkspace();
  const search = useSearchParams();
  const range = rangeFromSearch(search);
  const person = readId(search, "person");
  const canSeeOthers = isAdmin || isCoordinator;
  const everyone = canSeeOthers && search.get("everyone") === "1" && !person;
  const personId = everyone ? "" : person && canSeeOthers ? person : viewer.id;
  const filter: EntriesListFilter = {
    ...range,
    projectId: readId(search, "projectId"),
    taskCategoryId: readId(search, "taskCategoryId"),
    organizationId: readId(search, "organizationId"),
    unclassified: search.get("unclassified") === "1",
    everyone,
  };
  const queryClient = useQueryClient();
  const { entries, fetchNextPage, hasNextPage, isFetchingNextPage, isPending } = useEntries(personId, filter);
  const [pendingEdit, setPendingEdit] = useState<TimeEntry | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TimeEntry | null>(null);
  const urlParams = {
    from: range.from,
    to: range.to,
    person: everyone ? undefined : personId === viewer.id ? undefined : personId,
    everyone: everyone ? "1" : undefined,
    projectId: filter.projectId,
    taskCategoryId: filter.taskCategoryId,
    organizationId: filter.organizationId,
    unclassified: filter.unclassified ? "1" : undefined,
  };
  const { update } = useUrlParams(urlParams);
  const entriesKey = keys.entries(tenant.id, personId, filter);

  const remove = useActionMutation((entry: TimeEntry) => deleteEntryAction(entry.id), {
    invalidate: [keys.tenant(tenant.id)],
    onMutate: (entry) => {
      queryClient.setQueryData<InfiniteData<Paged<TimeEntry>>>(entriesKey, (data) =>
        data
          ? { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.filter((item) => item.id !== entry.id) })) }
          : data,
      );
    },
  });

  const days = useMemo(() => {
    const groups = new Map<string, TimeEntry[]>();
    for (const entry of entries) {
      groups.set(entry.occurredOn, [...(groups.get(entry.occurredOn) ?? []), entry]);
    }
    return [...groups.entries()];
  }, [entries]);

  const totalMinutes = entries.reduce((sum, entry) => sum + (entry.durationMinutes ?? 0), 0);
  const totalValue = entries.reduce((sum, entry) => sum + (entry.inKindValue ?? 0), 0);

  return (
    <>
      <PageHeader
        description={
          entries.length
            ? `${formatMinutes(totalMinutes)} hours · ${formatCurrency(totalValue)} in-kind${hasNextPage ? " (loaded so far)" : ""}`
            : undefined
        }
        actions={
          <Link href="/log/own" className={buttonVariants({ className: "h-9" })}>
            <PlusIcon />
            Log time
          </Link>
        }
      />
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <DateRangeFilter range={range} params={urlParams} />
        <div className="sm:ml-auto">
          <PersonSelect
            value={everyone ? "everyone" : personId}
            onValueChange={(value) =>
              update(
                value === "everyone"
                  ? { person: undefined, everyone: "1" }
                  : { person: value === viewer.id ? undefined : value, everyone: undefined },
              )
            }
            allOption={canSeeOthers ? { value: "everyone", label: "Everyone" } : undefined}
            className="sm:w-52"
          />
        </div>
      </div>

      {isPending ? (
        <CardSkeleton rows={8} />
      ) : days.length === 0 ? (
        <EmptyState
          icon={InboxIcon}
          title="No entries for this period"
          description="Try a wider date range, or log some time."
          action={
            <Link href="/log/own" className={buttonVariants()}>
              Log time
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          {days.map(([day, items]) => {
            const minutes = items.reduce((sum, entry) => sum + (entry.durationMinutes ?? 0), 0);
            return (
              <Card key={day} className="gap-0 py-0">
                <div className="flex items-center justify-between bg-primary px-4 py-2.5 text-primary-foreground">
                  <h2 className="text-xs font-semibold tracking-widest uppercase" suppressHydrationWarning>
                    {dayLabel(day)}
                  </h2>
                  <p className="text-xs tracking-wide uppercase">
                    Total <span className="ml-1 font-mono text-base font-semibold tabular-nums">{formatMinutes(minutes)}</span>
                  </p>
                </div>
                <EntryList>
                  {items.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} onEdit={setPendingEdit} onDelete={setPendingDelete} />
                  ))}
                </EntryList>
              </Card>
            );
          })}
          {hasNextPage ? (
            <Button variant="outline" className="self-center" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage ? <Loader2Icon className="animate-spin" /> : null}
              Load more
            </Button>
          ) : null}
        </div>
      )}

      <TimeEntryDialog open={pendingEdit !== null} entry={pendingEdit} onOpenChange={(open) => !open && setPendingEdit(null)} />
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this entry?"
        description="The hours and in-kind value are removed from every report. This cannot be undone."
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete)}
      />
    </>
  );
}
