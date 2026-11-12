"use client";

import { useQueryClient } from "@tanstack/react-query";
import { cancelClockAction, clockInAction, clockOutAction, resetClockAction, type Placement } from "@/app/actions/entries";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useWorkspace } from "@/hooks/use-workspace";
import { keys } from "@/lib/queries";
import type { TimeEntry } from "@/lib/types";

export function useClock() {
  const { viewer } = useWorkspace();
  const queryClient = useQueryClient();
  const invalidate = [keys.openPunch(viewer.id), ["org"]];

  const clockIn = useActionMutation<Placement, TimeEntry>(clockInAction, {
    invalidate,
    onSuccess: (entry) => queryClient.setQueryData(keys.openPunch(viewer.id), entry ?? null),
  });
  const clockOut = useActionMutation<
    {
      description?: string | null;
      tagIds?: string[];
      projectId?: string | null;
      taskCategoryId?: string | null;
      departmentId?: string | null;
    },
    TimeEntry
  >(clockOutAction, {
    invalidate,
    onSuccess: () => queryClient.setQueryData(keys.openPunch(viewer.id), null),
  });
  const cancelClock = useActionMutation<void, void>(cancelClockAction, {
    invalidate,
    onSuccess: () => queryClient.setQueryData(keys.openPunch(viewer.id), null),
  });
  const resetClock = useActionMutation<void, TimeEntry>(resetClockAction, {
    invalidate,
    onSuccess: (entry) => queryClient.setQueryData(keys.openPunch(viewer.id), entry ?? null),
  });
  return { clockIn, clockOut, cancelClock, resetClock };
}
