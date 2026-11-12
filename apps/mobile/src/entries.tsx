import { useMutation } from "@tanstack/react-query";
import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react-native";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api } from "@/api/client";
import type { TimeEntry } from "@/api/types";
import { dayLabel, formatCurrency, formatMinutes, formatTime } from "@/format";
import { useColors } from "@/theme";
import { TimeEntryForm } from "@/time-entry-form";
import { ConfirmDialog, IconButton, Menu, mono, Panel, Sheet } from "@/ui";
import { useLookups, useRefreshTime } from "@/workspace";

const modeLabel: Record<string, string> = { Punch: "Timer", Duration: "Start / end", Total: "Total hours" };

export function EntryRow({
  entry,
  onEdit,
  onDelete,
}: {
  entry: TimeEntry;
  onEdit?: (entry: TimeEntry) => void;
  onDelete?: (entry: TimeEntry) => void;
}) {
  const colors = useColors();
  const { names, isSuccess } = useLookups();
  const named = entry.projectId ? names.project.get(entry.projectId) : undefined;
  const project = named ?? (entry.projectId && !isSuccess ? "…" : "Unclassified");
  const category = entry.taskCategoryId ? names.category.get(entry.taskCategoryId) : undefined;
  const open = entry.durationMinutes === null;
  const when = entry.startedAt ? `${formatTime(entry.startedAt)} – ${entry.endedAt ? formatTime(entry.endedAt) : "now"}` : modeLabel[entry.mode];
  const value = entry.inKindValue !== null ? formatCurrency(entry.inKindValue) : "—";
  const detail = [entry.description ? project : null, category, when, value].filter(Boolean).join(" · ");

  return (
    <View style={rowStyles.row}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: colors.cardForeground, fontSize: 15, fontWeight: "500" }}>
          {entry.description || project}
        </Text>
        <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
          {detail}
          {entry.enteredByUserId !== entry.userId ? " · entered by an admin" : ""}
        </Text>
      </View>
      <Text style={[rowStyles.minutes, { color: open ? colors.success : colors.cardForeground }]}>{open ? "Live" : formatMinutes(entry.durationMinutes)}</Text>
      {onEdit || onDelete ? (
        <Menu
          align="end"
          items={[
            ...(onEdit ? [{ label: "Edit entry", icon: PencilIcon, onPress: () => onEdit(entry) }] : []),
            ...(onDelete ? [{ label: "Delete entry", icon: Trash2Icon, destructive: true, onPress: () => onDelete(entry) }] : []),
          ]}
          trigger={(show) => <IconButton icon={MoreHorizontalIcon} label="Entry actions" onPress={show} size={32} />}
          width={180}
        />
      ) : null}
    </View>
  );
}

export function groupByDay(entries: TimeEntry[]) {
  const groups = new Map<string, TimeEntry[]>();
  for (const entry of entries) groups.set(entry.occurredOn, [...(groups.get(entry.occurredOn) ?? []), entry]);
  return [...groups.entries()];
}

/** Entries grouped under a day header with that day's total, with edit and delete. */
export function EntryDays({ entries, canDelete = true, cards = false }: { entries: TimeEntry[]; canDelete?: boolean; cards?: boolean }) {
  const colors = useColors();
  const refresh = useRefreshTime();
  const days = useMemo(() => groupByDay(entries), [entries]);
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [deleting, setDeleting] = useState<TimeEntry | null>(null);
  const remove = useMutation({
    mutationFn: (entry: TimeEntry) => api.deleteEntry(entry.id),
    onSuccess: async () => {
      setDeleting(null);
      await refresh();
    },
  });

  return (
    <>
      {days.map(([day, items]) => {
        const minutes = items.reduce((sum, entry) => sum + (entry.durationMinutes ?? 0), 0);
        const rows = items.map((entry, index) => (
          <View key={entry.id} style={index > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border } : null}>
            <EntryRow entry={entry} onDelete={canDelete ? setDeleting : undefined} onEdit={setEditing} />
          </View>
        ));
        if (cards) {
          return (
            <Panel key={day}>
              <View style={[rowStyles.dayHeader, { backgroundColor: colors.primary, paddingVertical: 10 }]}>
                <Text style={[rowStyles.dayLabel, { color: colors.primaryForeground, letterSpacing: 1.4 }]}>{dayLabel(day)}</Text>
                <Text style={[rowStyles.dayLabel, { color: colors.primaryForeground }]}>
                  Total <Text style={{ fontFamily: mono, fontSize: 15, letterSpacing: 0 }}>{formatMinutes(minutes)}</Text>
                </Text>
              </View>
              {rows}
            </Panel>
          );
        }
        return (
          <View key={day} style={{ borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
            <View style={[rowStyles.dayHeader, { backgroundColor: colors.muted }]}>
              <Text style={[rowStyles.dayLabel, { color: colors.mutedForeground }]}>{dayLabel(day)}</Text>
              <Text style={{ fontFamily: mono, fontSize: 12, color: colors.foreground }}>{formatMinutes(minutes)}</Text>
            </View>
            {rows}
          </View>
        );
      })}
      <Sheet onClose={() => setEditing(null)} open={editing !== null} title="Edit entry">
        {editing ? <TimeEntryForm entry={editing} key={editing.id} onCancel={() => setEditing(null)} onSaved={() => setEditing(null)} /> : null}
      </Sheet>
      <ConfirmDialog
        confirmLabel="Delete"
        description="This removes the hours from reports. This cannot be undone."
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        open={deleting !== null}
        pending={remove.isPending}
        title="Delete this entry?"
      />
    </>
  );
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 16, paddingRight: 8, paddingVertical: 12 },
  minutes: { width: 56, textAlign: "right", fontFamily: mono, fontSize: 14, fontWeight: "500" },
  dayHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8 },
  dayLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase" },
});
