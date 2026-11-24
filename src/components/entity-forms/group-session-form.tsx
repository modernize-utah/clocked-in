"use client";

import { useId, useState } from "react";
import {
  createGroupSessionAction,
  updateGroupSessionAction,
  type GroupSessionPatch,
  type NewGroupSession,
} from "@/app/actions/collective";
import { DialogActions } from "@/components/dialog-actions";
import { EntityFormDialog } from "@/components/entity-forms/entity-form-dialog";
import { Field } from "@/components/field";
import { alignedEntryGridClass, PlacementFields } from "@/components/placement-fields";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { tenantWide, usePlacement, type PlacementPreference } from "@/hooks/use-placement";
import { HourlyRateSelect, defaultVolunteerRateId } from "@/components/hourly-rate-select";
import { useLookups } from "@/hooks/use-lookups";
import { useTenant } from "@/hooks/use-workspace";
import { formatCurrency, formatHours, today, toDateOnly } from "@/lib/format";
import { keys } from "@/lib/queries";
import type { GroupSession } from "@/lib/types";

function localTime(value: string, fallback: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function span(occurredOn: string, start: string, end: string) {
  const startedAt = new Date(`${occurredOn}T${start}`);
  const endedAt = new Date(`${occurredOn}T${end}`);
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime()) || endedAt <= startedAt) {
    return null;
  }

  return { startedAt, endedAt };
}

function peopleCount(value: string) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 ? count : null;
}

function groupValue(startedAt: Date, endedAt: Date, participantCount: number, hourlyRate: number) {
  const seconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);
  const rateCents = Math.round(Number(`${hourlyRate}e2`));
  return Math.round((seconds * participantCount * rateCents) / 3600) / 100;
}

export function GroupSessionForm({
  session,
  organizationIds,
  onCancel,
  onSaved,
  submitLabel,
}: {
  session?: GroupSession;
  organizationIds?: string[];
  onCancel?: () => void;
  onSaved?: () => void;
  submitLabel?: string;
}) {
  const tenant = useTenant();
  const { lookups } = useLookups();
  const idPrefix = useId();
  const preferred: PlacementPreference | undefined = session
    ? {
        organizationId: session.organizationId ?? tenantWide,
        projectId: session.projectId,
        taskCategoryId: session.taskCategoryId,
        tagIds: session.tagIds,
      }
    : organizationIds?.[0]
      ? { organizationId: organizationIds[0] }
      : undefined;
  const placement = usePlacement(preferred);
  const [occurredOn, setOccurredOn] = useState(session ? toDateOnly(new Date(session.startedAt)) : today());
  const [start, setStart] = useState(session ? localTime(session.startedAt, "09:00") : "09:00");
  const [end, setEnd] = useState(session ? localTime(session.endedAt, "12:00") : "12:00");
  const [participants, setParticipants] = useState(session ? String(session.participantCount) : "1");
  const [notes, setNotes] = useState(session?.description ?? "");
  const [chosenRateId, setChosenRateId] = useState<string | null>(session?.hourlyRateId ?? null);
  const hourlyRateId = chosenRateId ?? defaultVolunteerRateId(lookups.hourlyRates);
  const [error, setError] = useState("");

  const create = useActionMutation((next: NewGroupSession) => createGroupSessionAction(next), {
    invalidate: [keys.tenant(tenant.id)],
    onSuccess: () => {
      setNotes("");
      setError("");
      onSaved?.();
    },
  });
  const update = useActionMutation(
    ({ id, patch }: { id: string; patch: GroupSessionPatch }) => updateGroupSessionAction(id, patch),
    {
      invalidate: [keys.tenant(tenant.id)],
      onSuccess: () => {
        setError("");
        onSaved?.();
      },
    },
  );

  const times = span(occurredOn, start, end);
  const count = peopleCount(participants);
  const selectedRate = lookups.hourlyRates.find((rate) => rate.id === hourlyRateId);
  const hourlyRate = selectedRate?.perHourRate ?? tenant.volunteerHourlyRate;
  const preview = times && count ? groupValue(times.startedAt, times.endedAt, count, hourlyRate) : null;
  const hours = times ? (times.endedAt.getTime() - times.startedAt.getTime()) / 3_600_000 : 0;

  const formId = `${idPrefix}-form`;

  return (
    <form
      id={formId}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!placement.ready) return;
        if (!times) {
          setError("End time must be after start time.");
          return;
        }
        if (!count) {
          setError("Enter at least 1 person.");
          return;
        }

        setError("");
        const base = placement.placement(notes);
        const next = {
          ...base,
          startedAt: times.startedAt.toISOString(),
          endedAt: times.endedAt.toISOString(),
          participantCount: count,
          hourlyRateId: hourlyRateId || null,
        };
        if (session) {
          update.mutate({ id: session.id, patch: next });
          return;
        }

        create.mutate(next);
      }}
    >
      <div className={alignedEntryGridClass}>
        <Field label="Date" htmlFor={`${idPrefix}-date`}>
          <Input
            id={`${idPrefix}-date`}
            type="date"
            value={occurredOn}
            max={today()}
            onChange={(event) => setOccurredOn(event.target.value)}
            required
            className="h-9"
          />
        </Field>
        <Field label="Start" htmlFor={`${idPrefix}-start`}>
          <Input
            id={`${idPrefix}-start`}
            type="time"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            required
            className="h-9"
          />
        </Field>
        <Field label="End" htmlFor={`${idPrefix}-end`} error={error === "End time must be after start time." ? error : null}>
          <Input
            id={`${idPrefix}-end`}
            type="time"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            required
            className="h-9"
          />
        </Field>
        <Field
          label="People"
          htmlFor={`${idPrefix}-people`}
          error={error === "Enter at least 1 person." ? error : null}
          hint="Counted for the whole session"
        >
          <Input
            id={`${idPrefix}-people`}
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={participants}
            onChange={(event) => setParticipants(event.target.value)}
            required
            className="h-9"
          />
        </Field>
        <PlacementFields state={placement} organizationIds={organizationIds} embedded />
      </div>
      <HourlyRateSelect value={hourlyRateId} onValueChange={setChosenRateId} />
      <Field label="Notes" htmlFor={`${idPrefix}-notes`}>
        <Textarea
          id={`${idPrefix}-notes`}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="What did the group work on?"
          rows={2}
        />
      </Field>
      {preview !== null && count ? (
        <p className="text-sm text-muted-foreground">
          {formatHours(hours)} × {count} {count === 1 ? "person" : "people"} · {formatCurrency(preview)} in-kind at{" "}
          {formatCurrency(hourlyRate)}/h
        </p>
      ) : null}
      <DialogActions form={formId}>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <SubmitButton pending={session ? update.isPending : create.isPending} disabled={!placement.ready}>
          {submitLabel ?? (session ? "Save" : "Save session")}
        </SubmitButton>
      </DialogActions>
    </form>
  );
}

export function GroupSessionDialog({
  open,
  onOpenChange,
  session,
  organizationIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session?: GroupSession | null;
  organizationIds?: string[];
}) {
  return (
    <EntityFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit group session"
      description="Session length, headcount, and where the time counts."
      className="sm:max-w-lg"
    >
      <GroupSessionForm
        session={session ?? undefined}
        organizationIds={organizationIds}
        onCancel={() => onOpenChange(false)}
        onSaved={() => onOpenChange(false)}
      />
    </EntityFormDialog>
  );
}
