"use client";

import { useState } from "react";
import { useLookups } from "@/hooks/use-lookups";
import { useCurrentMembership } from "@/hooks/use-members";
import { useTenant } from "@/hooks/use-workspace";
import type { Placement } from "@/app/actions/entries";

export const tenantWide = "tenant";

type Choice = { organizationId?: string; projectId?: string; taskCategoryId?: string; tagIds: string[] };

export type PlacementPreference = {
  organizationId?: string;
  projectId?: string;
  taskCategoryId?: string;
  tagIds?: string[];
};

export function usePlacement(preferred?: PlacementPreference) {
  const tenant = useTenant();
  const { lookups } = useLookups();
  const membership = useCurrentMembership();
  const [choiceByOrg, setChoiceByOrg] = useState<Record<string, Choice>>(() =>
    preferred
      ? {
          [tenant.id]: {
            tagIds: preferred.tagIds ?? [],
            organizationId: preferred.organizationId,
            projectId: preferred.projectId,
            taskCategoryId: preferred.taskCategoryId,
          },
        }
      : {},
  );
  const choice = choiceByOrg[tenant.id] ?? { tagIds: [] };

  const organizationId = choice.organizationId ?? membership?.primaryOrganizationId ?? tenantWide;
  const projectId = choice.projectId ?? preferred?.projectId ?? "";
  const taskCategoryId = choice.taskCategoryId ?? preferred?.taskCategoryId ?? "";

  const placement = (description: string): Placement => ({
    tenantId: tenant.id,
    organizationId: organizationId === tenantWide ? null : organizationId,
    projectId: projectId || null,
    taskCategoryId: taskCategoryId || null,
    description: description.trim() || null,
    tagIds: choice.tagIds,
  });

  return {
    lookups,
    ready: Boolean(projectId && taskCategoryId),
    punchReady: true,
    value: { organizationId, projectId, taskCategoryId, tagIds: choice.tagIds },
    set: (patch: Partial<Choice>) =>
      setChoiceByOrg((current) => ({
        ...current,
        [tenant.id]: { ...(current[tenant.id] ?? { tagIds: [] }), ...patch },
      })),
    placement,
  };
}

export type PlacementState = ReturnType<typeof usePlacement>;
