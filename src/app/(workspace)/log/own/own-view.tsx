"use client";

import { CalendarClockIcon, Loader2Icon, PlayIcon, SquareIcon, TimerIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { TimeEntryDialog, TimeEntryForm } from "@/components/entity-forms/time-entry-form";
import { DateRangeFilter, rangeLabel } from "@/components/date-range-filter";
import { EntryList, EntryRow } from "@/components/entry-row";
import { PlacementFields } from "@/components/placement-fields";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClock } from "@/hooks/use-clock";
import { useEntries } from "@/hooks/use-entries";
import { useLookups } from "@/hooks/use-lookups";
import { useElapsed, useOpenPunch } from "@/hooks/use-open-punch";
import { usePlacement } from "@/hooks/use-placement";
import { useWorkspace } from "@/hooks/use-workspace";
import { dayLabel, formatClock, formatMinutes, formatTime } from "@/lib/format";
import type { DateRange, TimeEntry } from "@/lib/types";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { UnclassifiedBanner } from "@/components/unclassified-banner";
import { logPaneClass, logScrollClass } from "../pane";

export function OwnTimeView({ range }: { range: DateRange }) {
  return (
    <div className={logPaneClass}>
      <UnclassifiedBanner />
      <Tabs defaultValue={range.from || range.to ? "entries" : "timer"} className="min-h-0 flex-1">
        <TabsList variant="line" className="shrink-0">
          <TabsTrigger value="timer">Timer</TabsTrigger>
          <TabsTrigger value="manual">Manual</TabsTrigger>
          <TabsTrigger value="entries">Entries</TabsTrigger>
        </TabsList>
        <TabsContent value="timer" className={`mt-4 ${logScrollClass}`}>
          <TimerCard />
        </TabsContent>
        <TabsContent value="manual" className={`mt-4 ${logScrollClass}`}>
          <ManualEntryCard />
        </TabsContent>
        <TabsContent value="entries" className={`mt-4 ${logScrollClass}`}>
          <EntriesCard range={range} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TimerCard() {
  const { punch } = useOpenPunch();
  const elapsed = useElapsed(punch?.startedAt);
  const { names } = useLookups();
  const { clockIn, clockOut, cancelClock, resetClock } = useClock();
  const placement = usePlacement();
  const [description, setDescription] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const running = Boolean(punch);
  const canStart = placement.punchReady;
  const longerThanADay = elapsed >= 24 * 60 * 60 * 1000;

  return (
    <Card className="gap-0 py-0">
      <form
        className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          if (running) {
            setConfirming(true);
          } else if (canStart) {
            clockIn.mutate(placement.placement(description));
          }
        }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <TimerIcon className="size-5 shrink-0 text-muted-foreground" />
          {running && punch ? (
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{punch.description || (punch.projectId && names.project.get(punch.projectId)) || "Running timer"}</p>
              <p className="truncate text-xs text-muted-foreground" suppressHydrationWarning>
                Started {formatTime(punch.startedAt)} · {punch.taskCategoryId ? names.category.get(punch.taskCategoryId) : null}
              </p>
            </div>
          ) : (
            <Input
              aria-label="What are you working on?"
              placeholder="What are you working on?"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="h-10 border-0 px-0 text-base shadow-none focus-visible:ring-0 md:text-base"
            />
          )}
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span className="font-mono text-2xl font-semibold tabular-nums" suppressHydrationWarning>
            {formatClock(elapsed)}
          </span>
          <Button
            type="submit"
            size="lg"
            variant={running ? "destructive" : "default"}
            className="h-10 min-w-32"
            disabled={clockIn.isPending || clockOut.isPending || cancelClock.isPending || resetClock.isPending || (!running && !canStart)}
          >
            {running ? <SquareIcon className="fill-current" /> : <PlayIcon className="fill-current" />}
            {running ? "Stop" : "Start timer"}
          </Button>
        </div>
      </form>
      <div className="flex flex-col gap-4 border-t bg-muted/30 p-4">
        <PlacementFields state={placement} compact optional />
        {running ? (
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setResetting(true)} disabled={resetClock.isPending || cancelClock.isPending}>
              Reset start
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDiscarding(true)} disabled={resetClock.isPending || cancelClock.isPending}>
              Cancel timer
            </Button>
          </div>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Check this time before saving"
        description={
          longerThanADay
            ? "This timer has been running longer than 24 hours. Saving keeps the first 24 hours, the most one entry can hold. You can leave the project, task category, and group blank and classify later."
            : "Confirm the project, task category, and group are right, then save. You can leave them blank and classify later."
        }
        confirmLabel="Save time"
        onConfirm={() => {
          const next = placement.placement(description);
          clockOut.mutate(
            {
              description: next.description,
              tagIds: next.tagIds,
              projectId: next.projectId,
              taskCategoryId: next.taskCategoryId,
              departmentId: next.departmentId,
            },
            {
              onSuccess: () => {
                setDescription("");
                setConfirming(false);
              },
            },
          );
        }}
      />
      <ConfirmDialog
        open={resetting}
        onOpenChange={setResetting}
        title="Reset this timer?"
        description="The clock starts over from now. The time so far is not saved."
        confirmLabel="Reset start"
        onConfirm={() => {
          setResetting(false);
          resetClock.mutate();
        }}
      />
      <ConfirmDialog
        open={discarding}
        onOpenChange={setDiscarding}
        title="Cancel this timer?"
        description="This discards the running timer. Nothing is saved."
        confirmLabel="Cancel timer"
        onConfirm={() => {
          setDiscarding(false);
          cancelClock.mutate();
        }}
      />
    </Card>
  );
}

function ManualEntryCard() {
  const { viewer } = useWorkspace();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClockIcon className="size-4 text-muted-foreground" />
          Add time manually
        </CardTitle>
        <CardDescription>A start time and duration, or a total as HH:MM. Add days to save that same entry on each one.</CardDescription>
      </CardHeader>
      <CardContent>
        <TimeEntryForm userId={viewer.id} />
      </CardContent>
    </Card>
  );
}

function EntriesCard({ range }: { range: DateRange }) {
  const { viewer } = useWorkspace();
  const { entries, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } = useEntries(viewer.id, range);
  const [pendingEdit, setPendingEdit] = useState<TimeEntry | null>(null);
  const total = entries.reduce((sum, entry) => sum + (entry.durationMinutes ?? 0), 0);
  const filtered = Boolean(range.from || range.to);
  const days = useMemo(() => {
    const groups = new Map<string, TimeEntry[]>();
    for (const entry of entries) {
      groups.set(entry.occurredOn, [...(groups.get(entry.occurredOn) ?? []), entry]);
    }
    return [...groups.entries()];
  }, [entries]);

  return (
    <Card className="h-fit pb-0">
      <CardHeader>
        <CardTitle>Your entries</CardTitle>
        <CardDescription>
          {rangeLabel(range)}
          {hasNextPage ? " · loaded so far" : ""}
        </CardDescription>
        <CardAction className="font-mono text-lg font-semibold tabular-nums">{formatMinutes(total)}</CardAction>
      </CardHeader>
      <div className="border-t px-4 py-3">
        <DateRangeFilter range={range} stacked />
      </div>
      {days.length ? (
        <div className="border-t">
          {days.map(([day, items]) => {
            const minutes = items.reduce((sum, entry) => sum + (entry.durationMinutes ?? 0), 0);
            return (
              <div key={day} className="border-t first:border-t-0">
                <div className="flex items-center justify-between bg-muted/40 px-4 py-2">
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase" suppressHydrationWarning>
                    {dayLabel(day)}
                  </p>
                  <p className="font-mono text-xs tabular-nums">{formatMinutes(minutes)}</p>
                </div>
                <EntryList>
                  {items.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} onEdit={setPendingEdit} />
                  ))}
                </EntryList>
              </div>
            );
          })}
          {hasNextPage ? (
            <div className="border-t p-3">
              <Button variant="outline" className="w-full" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? <Loader2Icon className="animate-spin" /> : null}
                Load more
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <CardContent className="border-t pb-4 text-sm text-muted-foreground">
          {isPending ? "Loading…" : filtered ? "No entries in this range." : "Nothing logged yet."}
        </CardContent>
      )}
      <TimeEntryDialog open={pendingEdit !== null} entry={pendingEdit} onOpenChange={(open) => !open && setPendingEdit(null)} />
    </Card>
  );
}
