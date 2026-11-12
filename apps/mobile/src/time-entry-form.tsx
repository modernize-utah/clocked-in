import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "@/api/client";
import type { TimeEntry } from "@/api/types";
import { formatCurrency, formatDurationInput, fromDateOnly, localTime, minutesFromDurationInput, shiftDate, today, toDateOnly } from "@/format";
import { organizationWide, PlacementFields, usePlacement } from "@/placement";
import { useColors } from "@/theme";
import { Button, DateField, ErrorText, FormField, Input, Muted, Select, TimeField, ToggleGroup } from "@/ui";
import { useLookups, useRefreshTime, useWorkspace } from "@/workspace";

type Method = "Duration" | "Total";

export function TimeEntryForm({
  people,
  initialPersonId,
  entry,
  submitLabel,
  onSaved,
  onCancel,
  pinActions = false,
}: {
  /** Pick someone else to log for. Without it the entry is the caller's own. */
  people?: { value: string; label: string }[];
  initialPersonId?: string;
  entry?: TimeEntry;
  submitLabel?: string;
  onSaved?: () => void;
  onCancel?: () => void;
  /** Keep the save button on screen while the fields scroll. */
  pinActions?: boolean;
}) {
  const colors = useColors();
  const { organization, canSelectRate, labels, viewer } = useWorkspace();
  const { lookups } = useLookups();
  const refresh = useRefreshTime();
  const punch = entry?.mode === "Punch";
  const [method, setMethod] = useState<Method>(entry?.mode === "Total" ? "Total" : "Duration");
  const total = entry ? entry.mode === "Total" : method === "Total";
  const canEditTimes = !entry || organization.preferences.allowTimeEntryEditing;
  const placement = usePlacement(
    entry
      ? {
          departmentId: entry.departmentId ?? organizationWide,
          projectId: entry.projectId ?? "",
          taskCategoryId: entry.taskCategoryId ?? "",
          tagIds: entry.tagIds,
        }
      : undefined,
  );
  const [personId, setPersonId] = useState(initialPersonId ?? "");
  const selectedPersonId = people ? (people.some((person) => person.value === personId) ? personId : (people[0]?.value ?? "")) : "";
  const rates = lookups.hourlyRates.filter((rate) => !rate.isArchived);
  const defaultRateId = rates.find((rate) => rate.isDefault)?.id ?? "";
  const [chosenRateId, setChosenRateId] = useState<string | null>(entry?.hourlyRateId ?? null);
  const hourlyRateId = chosenRateId ?? defaultRateId;
  const [occurredOn, setOccurredOn] = useState(entry?.occurredOn ?? today());
  const [extraDates, setExtraDates] = useState<string[]>([]);
  const [hours, setHours] = useState(entry?.durationMinutes ? formatDurationInput(entry.durationMinutes) : entry ? "" : "1:00");
  const [start, setStart] = useState(localTime(entry?.startedAt ?? null, entry ? "" : "09:00"));
  const [notes, setNotes] = useState(entry?.description ?? "");
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      if (entry) return api.updateEntry(entry.id, body);
      if (Array.isArray(body.entries)) {
        const userId = people ? selectedPersonId : viewer.id;
        return api.logDays(userId, body).then((page) => page.items[0]);
      }
      if (people) return api.logForUser(selectedPersonId, body);
      return total ? api.logTotal(body as never) : api.logDuration(body as never);
    },
    onSuccess: async () => {
      setError("");
      if (!entry) setNotes("");
      await refresh();
      onSaved?.();
    },
    onError: (failure) => setError(failure instanceof Error ? failure.message : "Something went wrong."),
  });

  function fail(message: string) {
    setError(message);
    return null;
  }

  function span() {
    const startedAt = start ? new Date(`${occurredOn}T${start}`) : null;
    if (!startedAt || Number.isNaN(startedAt.getTime())) return fail("Start time is required.");
    const minutes = minutesFromDurationInput(hours);
    if (minutes === null) return fail("Enter a duration as HH:MM.");
    if (minutes < 1 || minutes > 1440) return fail("Duration must be from 1 minute to 24 hours.");
    return { occurredOn, durationMinutes: minutes, startedAt: startedAt.toISOString() };
  }

  function totalTimes() {
    const minutes = minutesFromDurationInput(hours);
    if (minutes === null) return fail("Enter a duration as HH:MM.");
    if (minutes < 1 || minutes > 59940) return fail("Duration must be from 1 minute to 999 hours.");
    return { occurredOn, durationMinutes: minutes };
  }

  function times() {
    if (!canEditTimes) return {};
    if (total) return totalTimes();
    if (punch && !hours.trim()) {
      const startedAt = start ? new Date(`${occurredOn}T${start}`) : null;
      if (!startedAt || Number.isNaN(startedAt.getTime())) return fail("Start time is required.");
      return { startedAt: startedAt.toISOString() };
    }
    if (!start && entry?.mode === "Duration" && !entry.startedAt) {
      const minutes = minutesFromDurationInput(hours);
      if (minutes === null) return fail("Enter a duration as HH:MM.");
      if (minutes < 1 || minutes > 1440) return fail("Duration must be from 1 minute to 24 hours.");
      return { occurredOn, durationMinutes: minutes };
    }
    return span();
  }

  function previousOpenDay(dates: string[]) {
    const used = new Set(dates.filter(Boolean));
    for (let i = 1; i < 366; i += 1) {
      const value = shiftDate(today(), -i);
      if (!used.has(value)) return value;
    }
    return "";
  }

  function shiftDay(template: { occurredOn: string; durationMinutes: number; startedAt?: string }, date: string) {
    if (date === template.occurredOn || !template.startedAt) {
      return { occurredOn: date, durationMinutes: template.durationMinutes, startedAt: template.startedAt };
    }
    const delta = fromDateOnly(date).getTime() - fromDateOnly(template.occurredOn).getTime();
    const startedAt = new Date(new Date(template.startedAt).getTime() + delta).toISOString();
    return {
      occurredOn: date,
      durationMinutes: template.durationMinutes,
      startedAt,
      endedAt: new Date(new Date(startedAt).getTime() + template.durationMinutes * 60000).toISOString(),
    };
  }

  function collectDays() {
    const dates = [occurredOn, ...extraDates];
    if (dates.some((date) => !date)) return fail("Each day needs a date.");
    if (dates.some((date) => date > today())) return fail("Days must be today or earlier.");
    if (new Set(dates).size !== dates.length) return fail("Each day can only be saved once.");
    const picked = times();
    if (!picked || !("durationMinutes" in picked) || picked.durationMinutes === undefined) return null;
    const startedAt = "startedAt" in picked && typeof picked.startedAt === "string" ? picked.startedAt : undefined;
    const template = { occurredOn, durationMinutes: picked.durationMinutes, startedAt };
    return dates.map((date) => shiftDay(template, date));
  }

  function submit() {
    if (people && !selectedPersonId) return;
    if (!punch && !placement.ready) {
      setError(`Choose a ${labels.project.toLowerCase()} and a ${labels.taskCategory.toLowerCase()}.`);
      return;
    }
    const base = placement.body(notes);
    const rate = canSelectRate ? { hourlyRateId: hourlyRateId || null } : {};
    if (entry) {
      const picked = times();
      if (!picked) return;
      setError("");
      save.mutate({ ...base, ...rate, ...picked });
      return;
    }
    if (extraDates.length > 0) {
      const entries = collectDays();
      if (!entries) return;
      setError("");
      save.mutate({
        ...base,
        ...rate,
        organizationId: organization.id,
        mode: total ? "Total" : "Duration",
        entries,
      });
      return;
    }
    const picked = times();
    if (!picked) return;
    setError("");
    save.mutate({
      ...base,
      ...rate,
      ...picked,
      organizationId: organization.id,
      ...(people ? { mode: total ? "Total" : "Duration" } : {}),
    });
  }

  const typedMinutes = minutesFromDurationInput(hours);
  const startedAt = start ? new Date(`${occurredOn}T${start}`) : null;
  const endsNextDay =
    !total &&
    startedAt !== null &&
    !Number.isNaN(startedAt.getTime()) &&
    typedMinutes !== null &&
    typedMinutes >= 1 &&
    toDateOnly(new Date(startedAt.getTime() + typedMinutes * 60000)) !== occurredOn;

  const normalize = () => {
    const minutes = minutesFromDurationInput(hours);
    if (minutes !== null) setHours(formatDurationInput(minutes));
  };

  const actions = (
    <View style={{ flexDirection: "row", justifyContent: pinActions ? "flex-start" : "flex-end", gap: 8 }}>
      {onCancel ? <Button label="Cancel" onPress={onCancel} variant="outline" /> : null}
      <Button
        disabled={Boolean(people) && !selectedPersonId}
        label={submitLabel ?? (entry ? "Save" : extraDates.length > 0 ? `Save ${extraDates.length + 1} days` : "Save time")}
        onPress={submit}
        pending={save.isPending}
        style={pinActions ? { flex: 1 } : undefined}
      />
    </View>
  );
  const saved = save.isSuccess && !entry ? <Text style={{ color: colors.success, fontSize: 13, textAlign: "right" }}>Saved.</Text> : null;
  const fields = (
    <>
      {people ? <Select label="Person" onChange={setPersonId} options={people} searchable value={selectedPersonId} /> : null}
      {rates.length > 0 && canSelectRate ? (
        <Select
          label="Rate"
          onChange={setChosenRateId}
          options={rates.map((rate) => ({ value: rate.id, label: `${rate.name} · ${formatCurrency(rate.perHourRate)}/h` }))}
          value={hourlyRateId}
        />
      ) : null}
      {rates.length > 0 && !canSelectRate ? (
        <FormField label="Rate">
          <Muted>
            {rates.find((rate) => rate.id === hourlyRateId)?.name ?? "Default"} ·{" "}
            {formatCurrency(rates.find((rate) => rate.id === hourlyRateId)?.perHourRate ?? 0)}/h
          </Muted>
        </FormField>
      ) : null}
      {!entry ? (
        <FormField label="Entry method">
          <ToggleGroup
            items={[
              { id: "Duration", label: "Start and duration" },
              { id: "Total", label: "Total hours" },
            ]}
            onChange={setMethod}
            value={method}
          />
        </FormField>
      ) : null}
      {punch && !canEditTimes ? (
        <Muted>Timer times cannot be changed here. Update the project, category, and notes, or stop the timer.</Muted>
      ) : canEditTimes ? (
        <>
          <DateField label="Date" onChange={setOccurredOn} value={occurredOn} />
          {total ? (
            <FormField error={!pinActions && error && error.startsWith("Duration") ? error : null} hint="HH:MM" label="Hours">
              <Input accessibilityLabel="Hours" mono onBlur={normalize} onChangeText={setHours} placeholder="0:00" value={hours} />
            </FormField>
          ) : (
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <TimeField label="Start" onChange={setStart} value={start} />
              </View>
              <View style={{ flex: 1 }}>
                <FormField hint="HH:MM" label="Duration">
                  <Input accessibilityLabel="Duration" mono onBlur={normalize} onChangeText={setHours} placeholder="0:00" value={hours} />
                </FormField>
              </View>
            </View>
          )}
          {endsNextDay ? <Muted>Ends the next day.</Muted> : null}
          {!entry
            ? extraDates.map((date, index) => (
                <DateField
                  action={
                    <Button
                      label="Remove"
                      onPress={() => setExtraDates((current) => current.filter((_, item) => item !== index))}
                      variant="ghost"
                    />
                  }
                  key={`${date}-${index}`}
                  label={`Day ${index + 2}`}
                  onChange={(next) => setExtraDates((current) => current.map((item, itemIndex) => (itemIndex === index ? next : item)))}
                  value={date}
                />
              ))
            : null}
          {!entry && extraDates.length < 30 ? (
            <Button
              label="Add day"
              onPress={() => {
                const next = previousOpenDay([occurredOn, ...extraDates]);
                if (next) setExtraDates((current) => [...current, next]);
              }}
              variant="outline"
            />
          ) : null}
        </>
      ) : (
        <Muted>Times stay as saved until an admin allows time entry editing.</Muted>
      )}
      <PlacementFields optional={punch} state={placement} />
      <FormField label="Notes">
        <Input accessibilityLabel="Notes" multiline onChangeText={setNotes} placeholder="What did you work on?" value={notes} />
      </FormField>
      {error && !pinActions ? <ErrorText error={error} /> : null}
      {pinActions ? null : actions}
      {pinActions ? null : saved}
    </>
  );

  if (!pinActions) return <View style={{ gap: 16 }}>{fields}</View>;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, minHeight: 0 }}>
      <ScrollView
        contentContainerStyle={{ gap: 16, paddingHorizontal: 16, paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        style={{ flex: 1 }}
      >
        {fields}
      </ScrollView>
      <View
        style={{
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          gap: 8,
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        {error ? <ErrorText error={error} /> : null}
        {actions}
        {saved}
      </View>
    </KeyboardAvoidingView>
  );
}
