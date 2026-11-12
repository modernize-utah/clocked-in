import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { CalendarClockIcon, Link2Icon, MoreHorizontalIcon, PencilIcon, PlayIcon, SquareIcon, TimerIcon, Trash2Icon, TriangleAlertIcon, UsersIcon } from "lucide-react-native";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "@/api/client";
import type { CollectiveEntry, Connection } from "@/api/types";
import { EntryDays } from "@/entries";
import { dayLabel, formatClock, formatCurrency, formatMinutes, formatPersonName, formatTime, localTime, rangeLabel, today, toDateOnly, type DateRange } from "@/format";
import { organizationWide, PlacementFields, usePlacement } from "@/placement";
import { useColors } from "@/theme";
import { TimeEntryForm } from "@/time-entry-form";
import {
  Button,
  ConfirmDialog,
  DateField,
  DateRangeField,
  EmptyState,
  ErrorText,
  FormField,
  IconButton,
  Input,
  Menu,
  Muted,
  mono,
  Panel,
  PanelHeader,
  Select,
  Sheet,
  Tabs,
  TimeField,
} from "@/ui";
import { useElapsed, useLookups, useOpenPunch, useRefreshTime, useWorkspace } from "@/workspace";

export function UnclassifiedBanner() {
  const colors = useColors();
  const { organization } = useWorkspace();
  const count = useQuery({
    queryKey: ["unclassified-count", organization.id],
    queryFn: () => api.unclassifiedCount(organization.id),
  });
  const total = count.data?.count ?? 0;
  if (total === 0) return null;
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push({ pathname: "/entries", params: { unclassified: "1" } })}
      style={{ borderWidth: 1, borderColor: colors.highlight, backgroundColor: `${colors.highlight}1A`, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 }}
    >
      <Text style={{ color: colors.foreground, fontSize: 14, lineHeight: 20 }}>
        {total === 1 ? "1 time entry needs" : `${total} time entries need`} a project, task category, or group.{" "}
        <Text style={{ fontWeight: "600", textDecorationLine: "underline" }}>Review unclassified entries</Text>
      </Text>
    </Pressable>
  );
}

function FillScroll({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      contentContainerStyle={{ gap: 16, paddingBottom: 8 }}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      style={{ flex: 1 }}
    >
      {children}
    </ScrollView>
  );
}

export function OwnTimeView() {
  const [tab, setTab] = useState<"timer" | "manual" | "entries">("timer");
  return (
    <View style={{ flex: 1, minHeight: 0, gap: 16 }}>
      <UnclassifiedBanner />
      <Tabs
        items={[
          { id: "timer", label: "Timer" },
          { id: "manual", label: "Manual" },
          { id: "entries", label: "Entries" },
        ]}
        onChange={setTab}
        value={tab}
      />
      <View style={{ flex: 1, minHeight: 0 }}>
        {tab === "timer" ? (
          <FillScroll>
            <TimerCard />
          </FillScroll>
        ) : null}
        {tab === "manual" ? <ManualEntryCard /> : null}
        {tab === "entries" ? (
          <FillScroll>
            <EntriesCard />
          </FillScroll>
        ) : null}
      </View>
    </View>
  );
}

function TimerCard() {
  const colors = useColors();
  const { organization } = useWorkspace();
  const { punch } = useOpenPunch();
  const elapsed = useElapsed(punch?.startedAt);
  const { names } = useLookups();
  const refresh = useRefreshTime();
  const placement = usePlacement();
  const [description, setDescription] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const running = Boolean(punch);
  const { set } = placement;

  useEffect(() => {
    if (!punch) return;
    set({
      departmentId: punch.departmentId ?? organizationWide,
      projectId: punch.projectId ?? "",
      taskCategoryId: punch.taskCategoryId ?? "",
      tagIds: punch.tagIds,
    });
    setDescription(punch.description ?? "");
    // Only when a different timer starts; later edits belong to the person.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [punch?.id]);

  const clockIn = useMutation({
    mutationFn: () => api.clockIn({ organizationId: organization.id, ...placement.body(description) }),
    onSuccess: () => refresh(),
  });
  const clockOut = useMutation({
    mutationFn: () => api.clockOut(placement.body(description)),
    onSuccess: async () => {
      setDescription("");
      setConfirming(false);
      placement.reset();
      await refresh();
    },
  });
  const cancelClock = useMutation({
    mutationFn: () => api.cancelClock(),
    onSuccess: async () => {
      setDescription("");
      setDiscarding(false);
      placement.reset();
      await refresh();
    },
  });
  const resetClock = useMutation({
    mutationFn: () => api.resetClock(),
    onSuccess: async () => {
      setResetting(false);
      await refresh();
    },
  });

  const longerThanADay = Boolean(punch?.startedAt && Date.now() - new Date(punch.startedAt).getTime() >= 24 * 60 * 60 * 1000);
  const title = punch ? punch.description || (punch.projectId && names.project.get(punch.projectId)) || "Running timer" : "";
  const category = punch?.taskCategoryId ? names.category.get(punch.taskCategoryId) : null;

  return (
    <Panel>
      <View style={{ padding: 16, gap: 14 }}>
        <View style={styles.row}>
          <TimerIcon color={colors.mutedForeground} size={20} />
          {running && punch ? (
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: colors.cardForeground, fontSize: 15, fontWeight: "500" }}>
                {title}
              </Text>
              <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 12 }}>
                Started {formatTime(punch.startedAt)}
                {category ? ` · ${category}` : ""}
              </Text>
            </View>
          ) : (
            <TextInput
              accessibilityLabel="What are you working on?"
              onChangeText={setDescription}
              placeholder="What are you working on?"
              placeholderTextColor={colors.mutedForeground}
              style={{ flex: 1, minHeight: 40, fontSize: 16, color: colors.foreground }}
              value={description}
            />
          )}
        </View>
        <View style={[styles.row, { justifyContent: "space-between" }]}>
          <Text style={{ fontFamily: mono, fontSize: 28, fontWeight: "600", color: colors.cardForeground }}>{formatClock(elapsed)}</Text>
          <Button
            filledIcon
            icon={running ? SquareIcon : PlayIcon}
            label={running ? "Stop" : "Start timer"}
            onPress={() => (running ? setConfirming(true) : clockIn.mutate())}
            pending={clockIn.isPending || clockOut.isPending || cancelClock.isPending || resetClock.isPending}
            size="lg"
            style={{ minWidth: 140 }}
            variant={running ? "destructive" : "default"}
          />
        </View>
        <ErrorText error={clockIn.error ?? cancelClock.error ?? resetClock.error} />
        {running ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button label="Reset start" onPress={() => setResetting(true)} variant="outline" />
            <Button label="Cancel timer" onPress={() => setDiscarding(true)} variant="ghost" />
          </View>
        ) : null}
      </View>
      <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.muted, padding: 16, gap: 14 }}>
        <PlacementFields optional state={placement} />
      </View>
      <ConfirmDialog
        confirmLabel="Save time"
        description={
          longerThanADay
            ? "This timer has been running longer than 24 hours. Saving keeps the first 24 hours, the most one entry can hold. You can leave the project, task category, and group blank and classify later."
            : "Confirm the project, task category, and group are right, then save. You can leave them blank and classify later."
        }
        onCancel={() => setConfirming(false)}
        onConfirm={() => clockOut.mutate()}
        open={confirming}
        pending={clockOut.isPending}
        title="Check this time before saving"
      >
        <ErrorText error={clockOut.error} />
      </ConfirmDialog>
      <ConfirmDialog
        confirmLabel="Reset start"
        description="The clock starts over from now. The time so far is not saved."
        destructive
        onCancel={() => setResetting(false)}
        onConfirm={() => resetClock.mutate()}
        open={resetting}
        pending={resetClock.isPending}
        title="Reset this timer?"
      />
      <ConfirmDialog
        confirmLabel="Cancel timer"
        description="This discards the running timer. Nothing is saved."
        destructive
        onCancel={() => setDiscarding(false)}
        onConfirm={() => cancelClock.mutate()}
        open={discarding}
        pending={cancelClock.isPending}
        title="Cancel this timer?"
      />
    </Panel>
  );
}

function ManualEntryCard() {
  return (
    <Panel style={{ flex: 1, minHeight: 0 }}>
      <PanelHeader description="A start time and duration, or a total as HH:MM." icon={CalendarClockIcon} title="Add time manually" />
      <TimeEntryForm pinActions />
    </Panel>
  );
}

const pageSize = 50;

export function EntriesCard({ title = "Your entries" }: { title?: string }) {
  const colors = useColors();
  const { viewer, organization } = useWorkspace();
  const [limit, setLimit] = useState(pageSize);
  const [range, setRange] = useState<DateRange>({});
  const entries = useQuery({
    queryKey: ["own-entries", viewer.id, organization.id, limit, range.from ?? "", range.to ?? ""],
    queryFn: () => api.entries(viewer.id, { organizationId: organization.id, limit, from: range.from, to: range.to }),
    placeholderData: (previous) => previous,
  });
  const items = entries.data?.items ?? [];
  const total = items.reduce((sum, entry) => sum + (entry.durationMinutes ?? 0), 0);
  const more = items.length >= limit;

  return (
    <Panel>
      <PanelHeader
        action={<Text style={{ fontFamily: mono, fontSize: 18, fontWeight: "600", color: colors.cardForeground }}>{formatMinutes(total)}</Text>}
        description={more ? `${rangeLabel(range)} · loaded so far` : rangeLabel(range)}
        title={title}
      />
      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <DateRangeField
          onChange={(next) => {
            setRange(next);
            setLimit(pageSize);
          }}
          value={range}
        />
      </View>
      <ErrorText error={entries.error} />
      {items.length ? (
        <EntryDays entries={items} />
      ) : (
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 16 }}>
          <Muted>{entries.isPending ? "Loading…" : "Nothing logged yet."}</Muted>
        </View>
      )}
      {more ? (
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 12 }}>
          <Button label="Load more" onPress={() => setLimit((current) => current + pageSize)} pending={entries.isFetching} variant="outline" />
        </View>
      ) : null}
    </Panel>
  );
}

export function MemberTimeView({ personId }: { personId?: string }) {
  const { viewer, organization } = useWorkspace();
  const members = useQuery({ queryKey: ["members", organization.id], queryFn: () => api.memberships(organization.id) });
  const eligible = (members.data?.items ?? [])
    .filter((member) => member.isActive && member.userId !== viewer.id)
    .map((member) => ({ value: member.userId, label: formatPersonName(member.user) }));
  return (
    <Panel style={{ flex: 1, minHeight: 0 }}>
      <PanelHeader
        description="Choose an active member, then log a start time and duration or a total as HH:MM."
        icon={CalendarClockIcon}
        title="Add time for a member"
      />
      {members.isPending ? (
        <View style={{ padding: 16 }}>
          <Muted>Loading…</Muted>
        </View>
      ) : eligible.length === 0 ? (
        <EmptyState description="Add or reactivate someone on People to log time for them." icon={UsersIcon} title="No other active members" />
      ) : (
        <TimeEntryForm pinActions initialPersonId={personId} people={eligible} />
      )}
    </Panel>
  );
}

function useWorkspaceId() {
  return useWorkspace().organization.id;
}

export function useConnections() {
  const organizationId = useWorkspaceId();
  return useQuery({ queryKey: ["connections", organizationId], queryFn: () => api.connections(organizationId) });
}

function connectionPeople(connections: Connection[], viewerId: string) {
  return connections.flatMap((connection) => {
    if (connection.userAId !== viewerId && connection.userBId !== viewerId) return [];
    const person = connection.userAId === viewerId ? connection.userB : connection.userA;
    return [{ value: person.id, label: `${formatPersonName(person)} (${connection.relationship})` }];
  });
}

const relationships = ["Parent", "Child", "Spouse", "Sibling", "Grandparent", "Grandchild", "Guardian", "Dependent", "Friend", "Colleague", "Associate"];

export function ConnectionTimeView() {
  const { viewer, organization, role } = useWorkspace();
  const client = useQueryClient();
  const connections = useConnections();
  const mine = connectionPeople(connections.data?.items ?? [], viewer.id);
  const canAdd = role === "VOLUNTEER" && organization.preferences.allowVolunteersToAddVolunteers;
  const [adding, setAdding] = useState(false);
  return (
    <Panel style={{ flex: 1, minHeight: 0 }}>
      <PanelHeader
        description="Choose someone you are connected to, then log start and end times or total hours."
        icon={Link2Icon}
        title="Add time for a connection"
      />
      {canAdd ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          <Button label="Add volunteer" onPress={() => setAdding(true)} variant="outline" />
        </View>
      ) : null}
      {connections.isPending ? (
        <View style={{ padding: 16 }}>
          <Muted>Loading…</Muted>
        </View>
      ) : mine.length === 0 ? (
        <View style={{ padding: 16 }}>
          <Muted>{canAdd ? "Add a volunteer to log time for them." : "You have no connections to log time for."}</Muted>
        </View>
      ) : (
        <TimeEntryForm pinActions people={mine} />
      )}
      <AddVolunteerSheet
        onClose={() => setAdding(false)}
        onSaved={async () => {
          setAdding(false);
          await client.invalidateQueries({ queryKey: ["connections", organization.id] });
        }}
        open={adding}
      />
    </Panel>
  );
}

function AddVolunteerSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { organization } = useWorkspace();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState(relationships[0]);
  const create = useMutation({
    mutationFn: () =>
      api.createMembership(organization.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        role: "VOLUNTEER",
        relationship,
        emailUser: false,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      }),
    onSuccess: () => {
      setFirstName("");
      setLastName("");
      setEmail("");
      onSaved();
    },
  });
  return (
    <Sheet onClose={onClose} open={open} title="Add volunteer">
      <Muted>They will choose a new password the first time they sign in. Tell them how you are related.</Muted>
      <FormField label="First name">
        <Input onChangeText={setFirstName} value={firstName} />
      </FormField>
      <FormField label="Last name">
        <Input onChangeText={setLastName} value={lastName} />
      </FormField>
      <FormField label="Email">
        <Input autoCapitalize="none" keyboardType="email-address" onChangeText={setEmail} value={email} />
      </FormField>
      <Select
        label="This person is my"
        onChange={setRelationship}
        options={relationships.map((item) => ({ value: item, label: item }))}
        value={relationship}
      />
      <ErrorText error={create.error} />
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
        <Button label="Cancel" onPress={onClose} variant="outline" />
        <Button
          disabled={!firstName.trim() || !lastName.trim() || !email.trim()}
          label="Add volunteer"
          onPress={() => create.mutate()}
          pending={create.isPending}
        />
      </View>
    </Sheet>
  );
}

export function GroupTimeView() {
  const colors = useColors();
  const { isAdmin, labels } = useWorkspace();
  const { lookups, isSuccess } = useLookups();
  const [tab, setTab] = useState<"record" | "entries">("record");
  const missingProject = isSuccess && lookups.projects.length === 0;
  const missingCategory = isSuccess && lookups.categories.length === 0;
  const entities =
    missingProject && missingCategory
      ? `a ${labels.project.toLowerCase()} and a ${labels.taskCategory.toLowerCase()}`
      : missingProject
        ? `a ${labels.project.toLowerCase()}`
        : `a ${labels.taskCategory.toLowerCase()}`;
  return (
    <View style={{ flex: 1, minHeight: 0, gap: 16 }}>
      {missingProject || missingCategory ? (
        <View style={{ flexDirection: "row", gap: 10, borderRadius: 12, backgroundColor: colors.muted, paddingHorizontal: 16, paddingVertical: 12 }}>
          <TriangleAlertIcon color={colors.foreground} size={16} />
          <Text style={{ flex: 1, color: colors.foreground, fontSize: 14, lineHeight: 20 }}>
            {isAdmin
              ? `Add ${entities} before you can save group time.`
              : `Ask an ${labels.organization.toLowerCase()} admin to add ${entities} before you can save group time.`}
          </Text>
        </View>
      ) : null}
      <Tabs
        items={[
          { id: "record", label: "Record" },
          { id: "entries", label: "Entries" },
        ]}
        onChange={setTab}
        value={tab}
      />
      <View style={{ flex: 1, minHeight: 0 }}>
        {tab === "record" ? (
          <Panel style={{ flex: 1, minHeight: 0 }}>
            <PanelHeader
              description="Log a group session or an event total. In-kind value is the session length times the number of people, at the volunteer rate."
              icon={UsersIcon}
              title="Record a session"
            />
            <GroupSessionForm pinActions onSaved={() => setTab("entries")} />
          </Panel>
        ) : (
          <FillScroll>
            <GroupSessions />
          </FillScroll>
        )}
      </View>
    </View>
  );
}

function GroupSessionForm({ onSaved, session, pinActions = false }: { onSaved: () => void; session?: CollectiveEntry; pinActions?: boolean }) {
  const colors = useColors();
  const { organization, groupDepartments, labels } = useWorkspace();
  const client = useQueryClient();
  const departmentIds = groupDepartments === "all" ? undefined : groupDepartments;
  const placement = usePlacement(
    session
      ? {
          departmentId: session.departmentId ?? organizationWide,
          projectId: session.projectId,
          taskCategoryId: session.taskCategoryId,
          tagIds: session.tagIds ?? [],
        }
      : departmentIds?.[0]
        ? { departmentId: departmentIds[0] }
        : undefined,
  );
  const [occurredOn, setOccurredOn] = useState(session ? toDateOnly(new Date(session.startedAt)) : today());
  const [start, setStart] = useState(session ? localTime(session.startedAt, "09:00") : "09:00");
  const [end, setEnd] = useState(session ? localTime(session.endedAt, "12:00") : "12:00");
  const [participants, setParticipants] = useState(session ? String(session.participantCount) : "1");
  const [notes, setNotes] = useState(session?.description ?? "");
  const [error, setError] = useState("");
  const startedAt = new Date(`${occurredOn}T${start}`);
  const endedAt = new Date(`${occurredOn}T${end}`);
  const valid = !Number.isNaN(startedAt.getTime()) && !Number.isNaN(endedAt.getTime()) && endedAt > startedAt;
  const count = Number(participants);
  const hours = valid ? (endedAt.getTime() - startedAt.getTime()) / 3_600_000 : 0;
  const preview = valid && Number.isInteger(count) && count > 0 ? hours * count * organization.volunteerHourlyRate : null;

  const save = useMutation({
    mutationFn: () => {
      const body = placement.body(notes);
      const payload = {
        departmentId: body.departmentId,
        projectId: body.projectId,
        taskCategoryId: body.taskCategoryId,
        tagIds: body.tagIds,
        description: body.description,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        participantCount: count,
      };
      return session ? api.updateCollective(session.id, payload) : api.createCollective({ organizationId: organization.id, ...payload });
    },
    onSuccess: async () => {
      setNotes("");
      await client.invalidateQueries({ queryKey: ["collective", organization.id] });
      onSaved();
    },
    onError: (failure) => setError(failure instanceof Error ? failure.message : "Something went wrong."),
  });

  const saveSession = () => {
    if (!valid) return setError("End time must be after start time.");
    if (!Number.isInteger(count) || count < 1) return setError("Enter at least 1 person.");
    if (!placement.ready) return setError(`Choose a ${labels.project.toLowerCase()} and a ${labels.taskCategory.toLowerCase()}.`);
    setError("");
    save.mutate();
  };
  const fields = (
    <>
      <DateField label="Date" onChange={setOccurredOn} value={occurredOn} />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <TimeField label="Start" onChange={setStart} value={start} />
        </View>
        <View style={{ flex: 1 }}>
          <TimeField error={error === "End time must be after start time." ? error : null} label="End" onChange={setEnd} value={end} />
        </View>
      </View>
      <FormField label="People">
        <Input keyboardType="number-pad" mono onChangeText={setParticipants} value={participants} />
      </FormField>
      <PlacementFields departmentIds={departmentIds} state={placement} />
      <FormField label="Notes">
        <Input multiline onChangeText={setNotes} placeholder="What did the group work on?" value={notes} />
      </FormField>
      {preview !== null ? (
        <Muted>
          {Math.round(hours * 100) / 100} h × {count} {count === 1 ? "person" : "people"} = {formatCurrency(preview)} in-kind
        </Muted>
      ) : null}
      {error && error !== "End time must be after start time." && !pinActions ? <ErrorText error={error} /> : null}
    </>
  );
  const saveButton = (
    <Button label="Save session" onPress={saveSession} pending={save.isPending} style={pinActions ? { flex: 1 } : undefined} />
  );

  if (!pinActions) {
    return (
      <View style={{ gap: 16 }}>
        {fields}
        <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>{saveButton}</View>
      </View>
    );
  }

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
        {error && error !== "End time must be after start time." ? <ErrorText error={error} /> : null}
        <View style={{ flexDirection: "row" }}>{saveButton}</View>
      </View>
    </KeyboardAvoidingView>
  );
}

function sessionMinutes(session: CollectiveEntry) {
  return Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 60000);
}

function GroupSessions() {
  const colors = useColors();
  const organizationId = useWorkspaceId();
  const { names } = useLookups();
  const { labels, groupDepartments } = useWorkspace();
  const client = useQueryClient();
  const [editing, setEditing] = useState<CollectiveEntry | null>(null);
  const [removing, setRemoving] = useState<CollectiveEntry | null>(null);
  const remove = useMutation({
    mutationFn: (session: CollectiveEntry) => api.deleteCollective(session.id),
    onSuccess: async () => {
      setRemoving(null);
      await client.invalidateQueries({ queryKey: ["collective", organizationId] });
    },
  });
  function canEdit(session: CollectiveEntry) {
    if (groupDepartments === "all") return true;
    return session.departmentId !== null && groupDepartments.includes(session.departmentId);
  }
  const sessions = useQuery({ queryKey: ["collective", organizationId], queryFn: () => api.collective(organizationId) });
  const items = sessions.data?.items ?? [];
  const days = useMemo(() => {
    const groups = new Map<string, CollectiveEntry[]>();
    for (const session of items) {
      const day = toDateOnly(new Date(session.startedAt));
      groups.set(day, [...(groups.get(day) ?? []), session]);
    }
    return [...groups.entries()];
  }, [items]);
  const totalValue = items.reduce((sum, session) => sum + (session.inKindValue ?? 0), 0);

  if (!items.length) {
    return (
      <Panel>
        <EmptyState
          description={sessions.isPending ? "Loading…" : "Sessions you record show up here and on the group tab of Reports."}
          icon={UsersIcon}
          title="No group sessions yet"
        />
      </Panel>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      <Muted>
        {items.length} session{items.length === 1 ? "" : "s"} · {formatCurrency(totalValue)} in-kind
      </Muted>
      {days.map(([day, rows]) => (
        <Panel key={day}>
          <View style={[styles.groupHeader, { backgroundColor: colors.primary }]}>
            <Text style={[styles.groupLabel, { color: colors.primaryForeground }]}>{dayLabel(day)}</Text>
            <Text style={[styles.groupLabel, { color: colors.primaryForeground }]}>
              {rows.length} session{rows.length === 1 ? "" : "s"}
            </Text>
          </View>
          {rows.map((session, index) => {
            const project = names.project.get(session.projectId) ?? labels.project;
            const category = names.category.get(session.taskCategoryId);
            const department = session.departmentId
              ? (names.department.get(session.departmentId) ?? labels.department)
              : `Whole ${labels.organization.toLowerCase()}`;
            return (
              <View key={session.id} style={[styles.sessionRow, index > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border } : null]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: colors.cardForeground, fontSize: 15, fontWeight: "500" }}>
                    {session.description || project}
                  </Text>
                  <Text numberOfLines={2} style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
                    {[session.description ? project : null, category, department, `${formatTime(session.startedAt)} – ${formatTime(session.endedAt)}`]
                      .filter(Boolean)
                      .join(" · ")}
                    {` · ${session.participantCount} ${session.participantCount === 1 ? "person" : "people"}`}
                  </Text>
                </View>
                <Text style={{ fontFamily: mono, fontSize: 14, fontWeight: "500", color: colors.cardForeground }}>{formatMinutes(sessionMinutes(session))}</Text>
                {canEdit(session) ? (
                  <Menu
                    align="end"
                    items={[
                      { label: "Edit session", icon: PencilIcon, onPress: () => setEditing(session) },
                      { label: "Delete session", icon: Trash2Icon, destructive: true, onPress: () => setRemoving(session) },
                    ]}
                    trigger={(show) => <IconButton icon={MoreHorizontalIcon} label="Session actions" onPress={show} size={32} />}
                    width={180}
                  />
                ) : null}
              </View>
            );
          })}
        </Panel>
      ))}
      <Sheet onClose={() => setEditing(null)} open={editing !== null} title="Edit session">
        {editing ? <GroupSessionForm onSaved={() => setEditing(null)} session={editing} /> : null}
      </Sheet>
      <ConfirmDialog
        confirmLabel="Delete session"
        description="This removes the session and its in-kind value."
        destructive
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing)}
        open={removing !== null}
        pending={remove.isPending}
        title="Delete this session?"
      >
        <ErrorText error={remove.error} />
      </ConfirmDialog>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  groupHeader: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  groupLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 1.4, textTransform: "uppercase" },
  sessionRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
});
