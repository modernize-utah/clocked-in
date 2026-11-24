"use client";

import { CalendarIcon, FolderKanbanIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { archiveProjectAction, deleteLookupAction } from "@/app/actions/lookups";
import { ProjectDialog } from "@/components/entity-forms/project-form";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useLabels } from "@/hooks/use-labels";
import { useLookups } from "@/hooks/use-lookups";
import { useTenant, useWorkspace } from "@/hooks/use-workspace";
import { formatDate } from "@/lib/format";
import { keys } from "@/lib/queries";
import type { Project } from "@/lib/types";

function dateRange(project: Project) {
  if (project.startDate && project.endDate) {
    return `${formatDate(project.startDate)} – ${formatDate(project.endDate)}`;
  }

  if (project.startDate) return `From ${formatDate(project.startDate)}`;
  if (project.endDate) return `Until ${formatDate(project.endDate)}`;
  return "No dates";
}

export function ProjectsCard({ projectType = "Project" }: { projectType?: "Project" | "Event" }) {
  const tenant = useTenant();
  const { isCoordinator, groupOrganizations } = useWorkspace();
  const copy = useLabels();
  const { lookups, names } = useLookups();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null);
  const visible = (
    isCoordinator
      ? lookups.projects.filter(
          (project) =>
            project.accessType === "Organization" &&
            project.organizationId &&
            groupOrganizations.includes(project.organizationId),
        )
      : lookups.projects
  ).filter((project) => (project.projectType === "Event" ? "Event" : "Project") === projectType);

  const remove = useActionMutation((id: string) => deleteLookupAction("projects", id), {
    invalidate: [keys.lookups(tenant.id)],
  });
  const archive = useActionMutation(
    ({ id, isActive }: { id: string; isActive: boolean }) => archiveProjectAction(id, isActive),
    { invalidate: [keys.lookups(tenant.id)] },
  );

  const isEvent = projectType === "Event";
  const title = isEvent ? "Events" : copy.projects;
  const noun = isEvent ? "event" : copy.project.toLowerCase();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Assign {isEvent ? "an event" : `a ${noun}`} to a {copy.organization.toLowerCase()} and give it a start and end date. Leave the{" "}
          {copy.organization.toLowerCase()} as the whole {copy.tenant.toLowerCase()} when everyone should see it.
        </CardDescription>
        <CardAction>
          <Button type="button" size="sm" className="h-8" onClick={() => setCreating(true)}>
            <PlusIcon />
            Add
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {visible.length ? (
          <ul className="divide-y rounded-lg border">
            {visible.map((project) => (
              <li key={project.id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {project.title}
                    {project.isActive === false ? <span className="ml-2 text-xs text-muted-foreground">Archived</span> : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {project.organizationId ? (names.organization.get(project.organizationId) ?? copy.organization) : `Whole ${copy.tenant.toLowerCase()}`}
                    {" · "}
                    {dateRange(project)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => archive.mutate({ id: project.id, isActive: project.isActive === false })}
                >
                  {project.isActive === false ? "Unarchive" : "Archive"}
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${project.title}`} onClick={() => setEditing(project)}>
                  <PencilIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${project.title}`}
                  onClick={() => setPendingDelete(project)}
                >
                  <Trash2Icon />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={isEvent ? CalendarIcon : FolderKanbanIcon}
            title={`No ${title.toLowerCase()} yet`}
            className="py-8"
          />
        )}
      </CardContent>
      <ProjectDialog open={creating} defaultProjectType={projectType} onOpenChange={setCreating} />
      <ProjectDialog open={editing !== null} project={editing} defaultProjectType={projectType} onOpenChange={(open) => !open && setEditing(null)} />
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete ${pendingDelete?.title ?? `this ${noun}`}?`}
        description="Time already logged against it stays, but you will not be able to pick it for new entries."
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
      />
    </Card>
  );
}
