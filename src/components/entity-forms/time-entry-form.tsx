"use client";

import { PlusIcon, XIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";
import {
  createDayEntriesAction,
  createEntriesAction,
  createEntryAction,
  updateEntryAction,
  type DayEntry,
  type EntryPatch,
  type NewEntry,
} from "@/app/actions/entries";
import { HourlyRateSelect, defaultVolunteerRateId } from "@/components/hourly-rate-select";
import { useLookups } from "@/hooks/use-lookups";
import { DialogActions } from "@/components/dialog-actions";
import { EntityFormDialog } from "@/components/entity-forms/entity-form-dialog";
import { Field } from "@/components/field";
import { PersonSelect, selectableMembers } from "@/components/person-select";
import { SelectField } from "@/components/select-field";
import { PlacementFields } from "@/components/placement-fields";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useMembers } from "@/hooks/use-members";
import { tenantWide, usePlacement, type PlacementPreference } from "@/hooks/use-placement";
import { useTenant, useWorkspace } from "@/hooks/use-workspace";
import { formatDurationInput, minutesFromDurationInput, today } from "@/lib/format";
import { keys } from "@/lib/queries";
import type { TimeEntry } from "@/lib/types";

function localTime(value: string | null, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function durationFieldValue(minutes: number | null) {
  if (!minutes) return "";
  return formatDurationInput(minutes);
}

function localDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const maxDays = 31;
const entryGridClass = "grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]";

function previousOpenDay(dates: string[]) {
  const used = new Set(dates.filter(Boolean));
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  for (let i = 0; i < 366; i += 1) {
    cursor.setDate(cursor.getDate() - 1);
    const value = localDateValue(cursor);
    if (!used.has(value)) return value;
  }

  return "";
}

function shiftDay(template: DayEntry & { startedAt?: string; endedAt?: string }, date: string) {
  if (date === template.occurredOn) return template;
  if (!template.startedAt || !template.endedAt) {
    return { occurredOn: date, durationMinutes: template.durationMinutes };
  }

  const [fromYear, fromMonth, fromDay] = template.occurredOn.split("-").map(Number);
  const [toYear, toMonth, toDay] = date.split("-").map(Number);
  const delta = new Date(toYear, toMonth - 1, toDay).getTime() - new Date(fromYear, fromMonth - 1, fromDay).getTime();
  return {
    occurredOn: date,
    durationMinutes: template.durationMinutes,
    startedAt: new Date(new Date(template.startedAt).getTime() + delta).toISOString(),
    endedAt: new Date(new Date(template.endedAt).getTime() + delta).toISOString(),
  };
}

export function TimeEntryForm({
  entry,
  preferred,
  onCancel,
  onSaved,
  submitLabel,
  userId: lockedUserId,
  userIds,
  people,
  candidates,
}: {
  entry?: TimeEntry;
  preferred?: PlacementPreference;
  onCancel?: () => void;
  onSaved?: () => void;
  submitLabel?: string;
  userId?: string;
  userIds?: string[];
  people?: { excludeSelf?: boolean; activeOnly?: boolean };
  candidates?: { userId: string; label: string }[];
}) {
  const tenant = useTenant();
  const { viewer, isAdmin, isCoordinator, canSelectRate, groupOrganizations } = useWorkspace();
  const { lookups } = useLookups();
  const idPrefix = useId();
  const excludeSelf = people?.excludeSelf ?? false;
  const activeOnly = people?.activeOnly ?? false;
  const batch = Boolean(userIds && userIds.length > 0);
  const { members } = useMembers({
    enabled: !candidates && (isAdmin || isCoordinator) && !entry && !lockedUserId && !batch,
  });
  const eligible = useMemo(() => {
    if (candidates) {
      return candidates.map((candidate) => ({ userId: candidate.userId }));
    }

    const scoped = isCoordinator
      ? members.filter((member) => (member.organizationIds ?? []).some((id) => groupOrganizations.includes(id)))
      : members;
    return selectableMembers(scoped, viewer.id, { excludeSelf, activeOnly });
  }, [activeOnly, candidates, excludeSelf, groupOrganizations, isCoordinator, members, viewer.id]);
  const punch = entry?.mode === "Punch";
  const [method, setMethod] = useState<"Duration" | "Total">(entry?.mode === "Total" ? "Total" : "Duration");
  const total = entry ? entry.mode === "Total" : method === "Total";
  const canEditTimes = !entry || tenant.preferences.allowTimeEntryEditing;
  const placement = usePlacement(
    entry
      ? {
          organizationId: entry.organizationId ?? tenantWide,
          projectId: entry.projectId ?? undefined,
          taskCategoryId: entry.taskCategoryId ?? undefined,
          tagIds: entry.tagIds,
        }
      : preferred,
  );
  const pickingSomeoneElse = Boolean(candidates) || excludeSelf || activeOnly;
  const [personId, setPersonId] = useState(lockedUserId ?? entry?.userId ?? (pickingSomeoneElse ? "" : viewer.id));
  const selectedPersonId = pickingSomeoneElse
    ? eligible.some((member) => member.userId === personId)
      ? personId
      : (eligible[0]?.userId ?? "")
    : personId;
  const [chosenRateId, setChosenRateId] = useState<string | null>(entry?.hourlyRateId ?? null);
  const hourlyRateId = chosenRateId ?? defaultVolunteerRateId(lookups.hourlyRates);
  const [occurredOn, setOccurredOn] = useState(entry?.occurredOn ?? today());
  const [extraDates, setExtraDates] = useState<string[]>([]);
  const [hours, setHours] = useState(entry ? durationFieldValue(entry.durationMinutes) : "1:00");
  const [start, setStart] = useState(localTime(entry?.startedAt ?? null, entry ? "" : "09:00"));
  const [notes, setNotes] = useState(entry?.description ?? "");
  const [error, setError] = useState("");

  const create = useActionMutation(
    async ({ userId, next, entries }: { userId: string; next: NewEntry; entries?: DayEntry[] }) => {
      if (entries && entries.length > 1) {
        return createDayEntriesAction(batch ? userIds! : [userId], {
          tenantId: next.tenantId,
          organizationId: next.organizationId,
          projectId: next.projectId,
          taskCategoryId: next.taskCategoryId,
          description: next.description,
          tagIds: next.tagIds,
          mode: next.mode,
          hourlyRateId: next.hourlyRateId,
          entries,
        });
      }

      if (batch) return createEntriesAction(userIds!, next);
      const result = await createEntryAction(userId, next);
      return result.ok ? { ok: true as const, message: result.message } : result;
    },
    {
      invalidate: [keys.tenant(tenant.id)],
      onSuccess: () => {
        setNotes("");
        setExtraDates([]);
        setError("");
        onSaved?.();
      },
    },
  );
  const update = useActionMutation(({ id, patch }: { id: string; patch: EntryPatch }) => updateEntryAction(id, patch), {
    invalidate: entry?.mode === "Punch" ? [keys.tenant(tenant.id), keys.openPunch(entry.userId)] : [keys.tenant(tenant.id)],
    onSuccess: () => {
      setError("");
      onSaved?.();
    },
  });

  function span(): { occurredOn: string; durationMinutes: number; startedAt: string; endedAt: string } | null {
    if (!start) {
      setError("Start time is required.");
      return null;
    }

    const startedAt = new Date(`${occurredOn}T${start}`);
    if (Number.isNaN(startedAt.getTime())) {
      setError("Start time is required.");
      return null;
    }

    const minutes = minutesFromDurationInput(hours);
    if (minutes === null) {
      setError("Enter a duration as HH:MM.");
      return null;
    }
    if (minutes < 1 || minutes > 1440) {
      setError("Duration must be from 1 minute to 24 hours.");
      return null;
    }

    setError("");
    return {
      occurredOn,
      durationMinutes: minutes,
      startedAt: startedAt.toISOString(),
      endedAt: new Date(startedAt.getTime() + minutes * 60000).toISOString(),
    };
  }

  function collectDays(): DayEntry[] | null {
    const dates = [occurredOn, ...extraDates];
    if (dates.some((date) => !date)) {
      setError("Each day needs a date.");
      return null;
    }

    if (dates.some((date) => date > today())) {
      setError("Days must be today or earlier.");
      return null;
    }

    if (new Set(dates).size !== dates.length) {
      setError("Each day can only be saved once.");
      return null;
    }

    if (total) {
      const minutes = minutesFromDurationInput(hours);
      if (minutes === null) {
        setError("Enter a duration as HH:MM.");
        return null;
      }
      if (minutes < 1 || minutes > 59940) {
        setError("Duration must be from 1 minute to 999 hours.");
        return null;
      }

      setError("");
      return dates.map((date) => ({ occurredOn: date, durationMinutes: minutes }));
    }

    const template = span();
    if (!template) return null;
    return dates.map((date) => shiftDay(template, date));
  }

  function timePatch(): EntryPatch | null {
    if (!canEditTimes) return {};
    if (total) {
      const minutes = minutesFromDurationInput(hours);
      if (minutes === null) {
        setError("Enter a duration as HH:MM.");
        return null;
      }
      if (minutes < 1 || minutes > 59940) {
        setError("Duration must be from 1 minute to 999 hours.");
        return null;
      }

      setError("");
      return { occurredOn, durationMinutes: minutes };
    }

    if (punch && !hours.trim()) {
      if (!start) {
        setError("Start time is required.");
        return null;
      }

      const startedAt = new Date(`${occurredOn}T${start}`);
      if (Number.isNaN(startedAt.getTime())) {
        setError("Start time is required.");
        return null;
      }

      setError("");
      return { startedAt: startedAt.toISOString() };
    }

    if (!start && entry?.mode === "Duration" && !entry.startedAt) {
      const minutes = minutesFromDurationInput(hours);
      if (minutes === null) {
        setError("Enter a duration as HH:MM.");
        return null;
      }
      if (minutes < 1 || minutes > 1440) {
        setError("Duration must be from 1 minute to 24 hours.");
        return null;
      }

      setError("");
      return { occurredOn, durationMinutes: minutes };
    }

    return span();
  }

  const showPerson = Boolean(candidates) ? !(entry || lockedUserId || batch) : !(entry || !(isAdmin || isCoordinator) || lockedUserId || batch);
  const showRate = canSelectRate || lookups.hourlyRates.some((rate) => rate.isDefault);
  const typedMinutes = minutesFromDurationInput(hours);
  const endsNextDay = Boolean(start) && typedMinutes !== null && typedMinutes >= 1 && (() => {
    const startedAt = new Date(`${occurredOn}T${start}`);
    if (Number.isNaN(startedAt.getTime())) return false;
    return localDateValue(new Date(startedAt.getTime() + typedMinutes * 60000)) !== occurredOn;
  })();

  const formId = `${idPrefix}-form`;

  return (
    <form
      id={formId}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!entry && showPerson && !selectedPersonId) return;
        if (!punch && !placement.ready) {
          setError("Choose a project and a task category.");
          return;
        }
        const base = placement.placement(notes);
        if (entry) {
          const times = timePatch();
          if (!times) return;
          update.mutate({
            id: entry.id,
            patch: {
              organizationId: base.organizationId,
              projectId: base.projectId,
              taskCategoryId: base.taskCategoryId,
              description: base.description,
              tagIds: base.tagIds,
              hourlyRateId: canSelectRate ? hourlyRateId || null : undefined,
              ...times,
            },
          });
          return;
        }

        const entries = collectDays();
        if (!entries) return;
        create.mutate({
          userId: selectedPersonId,
          next: { ...base, mode: total ? "Total" : "Duration", hourlyRateId: canSelectRate ? hourlyRateId || null : null, ...entries[0] },
          entries,
        });
      }}
    >
      {showPerson || showRate ? (
        <div className={showPerson && showRate ? "grid gap-4 sm:grid-cols-2" : "grid gap-4"}>
          {showPerson ? (
            <Field label="Person">
              {candidates ? (
                <SelectField
                  aria-label="Person"
                  value={selectedPersonId}
                  onValueChange={setPersonId}
                  options={candidates.map((candidate) => ({ value: candidate.userId, label: candidate.label }))}
                  placeholder="Select a person"
                />
              ) : (
                <PersonSelect
                  value={selectedPersonId}
                  onValueChange={setPersonId}
                  excludeSelf={excludeSelf}
                  activeOnly={activeOnly}
                  placeholder={excludeSelf ? "Select a member" : undefined}
                />
              )}
            </Field>
          ) : null}
          {showRate ? (
            <HourlyRateSelect value={hourlyRateId} onValueChange={setChosenRateId} locked={!canSelectRate} />
          ) : null}
        </div>
      ) : null}
      {!entry ? (
        <Field label="Entry method">
          <ToggleGroup
            value={[method]}
            onValueChange={(value) => {
              const next = value[0];
              if (next === "Duration" || next === "Total") setMethod(next);
            }}
            variant="outline"
            spacing={0}
            className="w-full sm:w-fit"
          >
            <ToggleGroupItem value="Duration" className="flex-1 sm:flex-none">
              Start and duration
            </ToggleGroupItem>
            <ToggleGroupItem value="Total" className="flex-1 sm:flex-none">
              Total hours
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>
      ) : null}
      <div className={entryGridClass}>
        {punch && !canEditTimes ? (
          <p className="col-span-full text-sm text-muted-foreground">
            Timer times cannot be changed here. Update the project, category, and notes, or stop the timer.
          </p>
        ) : total ? (
          <>
            <Field
              label="Date"
              htmlFor={`${idPrefix}-occurredOn`}
              action={
                !entry ? (
                  <button
                    type="button"
                    aria-label="Add day"
                    disabled={extraDates.length + 1 >= maxDays}
                    onClick={() =>
                      setExtraDates((current) => [...current, previousOpenDay([occurredOn, ...current])])
                    }
                    className="-mr-0.5 inline-flex h-5 items-center gap-0.5 rounded-sm px-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                  >
                    <PlusIcon className="size-3" />
                    Add day
                  </button>
                ) : undefined
              }
            >
              <Input
                id={`${idPrefix}-occurredOn`}
                type="date"
                value={occurredOn}
                max={today()}
                onChange={(event) => setOccurredOn(event.target.value)}
                required
                disabled={!canEditTimes}
              />
            </Field>
            <Field label="Hours" htmlFor={`${idPrefix}-hours`} hint="HH:MM" error={error || null} className="sm:col-start-3">
              <Input
                id={`${idPrefix}-hours`}
                inputMode="text"
                placeholder="0:00"
                autoComplete="off"
                spellCheck={false}
                value={hours}
                onChange={(event) => setHours(event.target.value)}
                onBlur={(event) => {
                  const minutes = minutesFromDurationInput(event.currentTarget.value);
                  if (minutes !== null) setHours(formatDurationInput(minutes));
                }}
                required
                disabled={!canEditTimes}
                className="px-2 text-center font-mono tabular-nums"
              />
            </Field>
          </>
        ) : (
          <>
            <Field
              label="Date"
              htmlFor={`${idPrefix}-occurredOn`}
              action={
                !entry ? (
                  <button
                    type="button"
                    aria-label="Add day"
                    disabled={extraDates.length + 1 >= maxDays}
                    onClick={() =>
                      setExtraDates((current) => [...current, previousOpenDay([occurredOn, ...current])])
                    }
                    className="-mr-0.5 inline-flex h-5 items-center gap-0.5 rounded-sm px-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                  >
                    <PlusIcon className="size-3" />
                    Add day
                  </button>
                ) : undefined
              }
            >
              <Input
                id={`${idPrefix}-occurredOn`}
                type="date"
                value={occurredOn}
                max={today()}
                onChange={(event) => setOccurredOn(event.target.value)}
                required
                disabled={!canEditTimes}
              />
            </Field>
            <Field label="Start" htmlFor={`${idPrefix}-start`}>
              <Input
                id={`${idPrefix}-start`}
                type="time"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                required={!entry || Boolean(entry.startedAt) || punch}
                disabled={!canEditTimes}
              />
            </Field>
            <Field
              label="Duration"
              htmlFor={`${idPrefix}-hours`}
              hint="HH:MM"
              error={extraDates.length > 0 ? null : error || null}
            >
              <Input
                id={`${idPrefix}-hours`}
                inputMode="text"
                placeholder="0:00"
                autoComplete="off"
                spellCheck={false}
                value={hours}
                onChange={(event) => setHours(event.target.value)}
                onBlur={(event) => {
                  const minutes = minutesFromDurationInput(event.currentTarget.value);
                  if (minutes !== null) setHours(formatDurationInput(minutes));
                }}
                disabled={!canEditTimes}
                className="px-2 text-center font-mono tabular-nums"
              />
            </Field>
          </>
        )}
        {endsNextDay ? <p className="col-span-full text-sm text-muted-foreground">Ends the next day.</p> : null}
        {extraDates.length > 0 ? (
          <div className="col-span-full flex flex-col gap-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">More days</p>
            {extraDates.map((date, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  aria-label={`Additional day ${index + 2}`}
                  type="date"
                  value={date}
                  max={today()}
                  onChange={(event) =>
                    setExtraDates((current) => current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))
                  }
                  required
                  className="sm:max-w-56"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  aria-label={`Remove additional day ${index + 2}`}
                  onClick={() => setExtraDates((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                >
                  <XIcon />
                </Button>
              </div>
            ))}
            <p className="text-sm text-muted-foreground">
              {total ? "This saves the same hours and settings on each day." : "This saves the same times and settings on each day."}
            </p>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
        ) : null}
        {!canEditTimes && !punch ? (
          <p className="col-span-full text-sm text-muted-foreground">Times stay as saved until an admin allows time entry editing.</p>
        ) : null}
        <PlacementFields state={placement} embedded optional={punch} />
      </div>
      <Field label="Notes" htmlFor={`${idPrefix}-notes`}>
        <Textarea
          id={`${idPrefix}-notes`}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="What did you work on?"
          rows={2}
        />
      </Field>
      <DialogActions form={formId}>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <SubmitButton
          pending={entry ? update.isPending : create.isPending}
          disabled={showPerson && !selectedPersonId}
        >
          {submitLabel ?? (entry ? "Save" : extraDates.length > 0 ? `Save ${extraDates.length + 1} days` : "Save time")}
        </SubmitButton>
      </DialogActions>
    </form>
  );
}

export function TimeEntryDialog({
  open,
  onOpenChange,
  entry,
  userId,
  userIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry?: TimeEntry | null;
  userId?: string;
  userIds?: string[];
}) {
  const tenant = useTenant();
  const canEditTimes = tenant.preferences.allowTimeEntryEditing;
  return (
    <EntityFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={entry ? "Edit time entry" : userIds && userIds.length > 1 ? "Add time for selected people" : "Add time"}
      description={
        entry
          ? canEditTimes
            ? "Change the start time or the duration."
            : "You can update the project, category, and notes."
            : userIds && userIds.length > 1
            ? `This saves the same entry for ${userIds.length} people. Add days to record it on each one.`
            : "A start time and duration, or a total as HH:MM. Add days to record the same entry on each one."
      }
      className="sm:max-w-xl"
    >
      <TimeEntryForm
        entry={entry ?? undefined}
        userId={userId}
        userIds={userIds}
        onCancel={() => onOpenChange(false)}
        onSaved={() => onOpenChange(false)}
      />
    </EntityFormDialog>
  );
}
