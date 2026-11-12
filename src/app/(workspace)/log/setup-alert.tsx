"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useLabels } from "@/hooks/use-labels";

export function SetupAlert({
  isAdmin,
  missingProject,
  missingCategory,
  action,
}: {
  isAdmin: boolean;
  missingProject: boolean;
  missingCategory: boolean;
  action: string;
}) {
  const copy = useLabels();
  const entities =
    missingProject && missingCategory
      ? `a ${copy.project.toLowerCase()} and a ${copy.taskCategory.toLowerCase()}`
      : missingProject
        ? `a ${copy.project.toLowerCase()}`
        : `a ${copy.taskCategory.toLowerCase()}`;

  return (
    <div role="alert" className="flex shrink-0 items-start gap-3 rounded-xl bg-muted px-4 py-3 text-sm ring-1 ring-foreground/10">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
      <p>
        {isAdmin
          ? `Add ${entities} before you can ${action}.`
          : `Ask an ${copy.organization.toLowerCase()} admin to add ${entities} before you can ${action}.`}
      </p>
    </div>
  );
}
