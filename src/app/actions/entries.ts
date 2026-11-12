"use server";

import {
  clockIn,
  cancelClock,
  clockOut,
  parseClockTarget,
  resetClock,
  createTimeEntries,
  createTimeEntry,
  deleteTimeEntry,
  parseClockIn,
  parseClockOut,
  parseCreateTimeEntries,
  parseCreateTimeEntry,
  parseUpdateTimeEntry,
  updateTimeEntry,
} from "@/lib/api/features/time-entries";
import { body, run } from "@/lib/server/action";
import { requireAccess } from "@/lib/server/session";

export type Placement = {
  organizationId: string;
  departmentId: string | null;
  projectId: string | null;
  taskCategoryId: string | null;
  description: string | null;
  tagIds: string[];
};

export type NewEntry = Placement & {
  mode: "Duration" | "Total";
  occurredOn: string;
  durationMinutes: number;
  startedAt?: string;
  endedAt?: string;
  hourlyRateId?: string | null;
};

export async function createEntryAction(userId: string, entry: NewEntry) {
  return run(async () => {
    const access = await requireAccess();
    return createTimeEntry(access, userId, parseCreateTimeEntry(body(entry)));
  }, "Time saved.");
}

export async function createEntriesAction(userIds: string[], entry: NewEntry) {
  return run(async () => {
    const access = await requireAccess();
    const parsed = parseCreateTimeEntry(body(entry));
    for (const userId of userIds) {
      await createTimeEntry(access, userId, parsed);
    }
  }, userIds.length === 1 ? "Time saved." : `Time saved for ${userIds.length} people.`);
}

export type DayEntry = {
  occurredOn: string;
  durationMinutes: number;
  startedAt?: string;
  endedAt?: string;
};

export async function createDayEntriesAction(
  userIds: string[],
  entry: Placement & {
    mode: "Duration" | "Total";
    hourlyRateId?: string | null;
    entries: DayEntry[];
  },
) {
  const days = entry.entries.length;
  const people = userIds.length;
  const message =
    days > 1 && people > 1
      ? `Time saved for ${people} people on ${days} days.`
      : days > 1
        ? `Time saved for ${days} days.`
        : people > 1
          ? `Time saved for ${people} people.`
          : "Time saved.";
  return run(async () => {
    const access = await requireAccess();
    const parsed = parseCreateTimeEntries(body(entry));
    for (const userId of userIds) {
      await createTimeEntries(access, userId, parsed);
    }
  }, message);
}

export type EntryPatch = {
  departmentId?: string | null;
  projectId?: string | null;
  taskCategoryId?: string | null;
  description?: string | null;
  tagIds?: string[];
  occurredOn?: string;
  durationMinutes?: number;
  startedAt?: string | null;
  endedAt?: string | null;
  hourlyRateId?: string | null;
};

export async function updateEntryAction(entryId: string, patch: EntryPatch) {
  return run(async () => {
    const access = await requireAccess();
    return updateTimeEntry(access, entryId, parseUpdateTimeEntry(body(patch)));
  }, "Entry saved.");
}

export async function deleteEntryAction(entryId: string) {
  return run(async () => {
    const access = await requireAccess();
    await deleteTimeEntry(access, entryId);
  }, "Entry deleted.");
}

export async function clockInAction(placement: Placement) {
  return run(async () => {
    const access = await requireAccess();
    return clockIn(access, parseClockIn(body(placement)));
  }, "Timer started.");
}

export async function cancelClockAction() {
  return run(async () => {
    const access = await requireAccess();
    await cancelClock(access, parseClockTarget({}));
  }, "Timer cancelled.");
}

export async function resetClockAction() {
  return run(async () => {
    const access = await requireAccess();
    return resetClock(access, parseClockTarget({}));
  }, "Timer restarted.");
}

export async function clockOutAction(
  details: {
    description?: string | null;
    tagIds?: string[];
    projectId?: string | null;
    taskCategoryId?: string | null;
    departmentId?: string | null;
  } = {},
) {
  return run(async () => {
    const access = await requireAccess();
    return clockOut(access, parseClockOut(body(details)));
  }, "Timer stopped.");
}
