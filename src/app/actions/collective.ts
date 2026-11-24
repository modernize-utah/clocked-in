"use server";

import {
  createCollective,
  deleteCollective,
  parseCreateCollective,
  parseUpdateCollective,
  updateCollective,
} from "@/lib/api/features/collective";
import type { Placement } from "@/app/actions/entries";
import { body, run } from "@/lib/server/action";
import { requireAccess } from "@/lib/server/session";

export type NewGroupSession = Placement & {
  startedAt: string;
  endedAt: string;
  participantCount: number;
  hourlyRateId?: string | null;
};

export async function createGroupSessionAction(session: NewGroupSession) {
  return run(async () => {
    const access = await requireAccess();
    return createCollective(access, parseCreateCollective(body(session)));
  }, "Group time saved.");
}

export type GroupSessionPatch = {
  organizationId?: string | null;
  projectId?: string | null;
  taskCategoryId?: string | null;
  description?: string | null;
  tagIds?: string[];
  startedAt?: string;
  endedAt?: string;
  participantCount?: number;
  hourlyRateId?: string | null;
};

export async function updateGroupSessionAction(sessionId: string, patch: GroupSessionPatch) {
  return run(async () => {
    const access = await requireAccess();
    return updateCollective(access, sessionId, parseUpdateCollective(body(patch)));
  }, "Group session saved.");
}

export async function deleteGroupSessionAction(sessionId: string) {
  return run(async () => {
    const access = await requireAccess();
    await deleteCollective(access, sessionId);
  }, "Group session deleted.");
}
