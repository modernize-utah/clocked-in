"use client";

import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { createProjectAction, updateProjectAction, type ProjectInput } from "@/app/actions/projects";
import { DialogActions } from "@/components/dialog-actions";
import { EntityFormDialog } from "@/components/entity-forms/entity-form-dialog";
import { EntitySelect } from "@/components/entity-forms/entity-select";
import { rememberLookup, savedProject, upsertProject } from "@/components/entity-forms/lookup-cache";
import { CreateOrganizationDialog } from "@/components/entity-forms/name-entity-form";
import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useLabels } from "@/hooks/use-labels";
import { useLookups } from "@/hooks/use-lookups";
import { tenantWide } from "@/hooks/use-placement";
import { useTenant } from "@/hooks/use-workspace";
import { keys } from "@/lib/queries";
import type { Project } from "@/lib/types";

const projectTypes = [
  { value: "Project", label: "Project" },
  { value: "Event", label: "Event" },
] as const;

type Draft = {
  title: string;
  projectType: "Project" | "Event";
  organizationId: string;
  startDate: string;
  endDate: string;
};

const blank: Draft = {
  title: "",
  projectType: "Project",
  organizationId: tenantWide,
  startDate: "",
  endDate: "",
};

function dateError(draft: Draft) {
  if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) {
    return "End date must be on or after the start date.";
  }

  return null;
}

function toInput(draft: Draft): ProjectInput {
  return {
    title: draft.title.trim(),
    projectType: draft.projectType,
    organizationId: draft.organizationId === tenantWide ? null : draft.organizationId,
    startDate: draft.startDate || null,
    endDate: draft.endDate || null,
  };
}

function fromProject(project: Project): Draft {
  return {
    title: project.title,
    projectType: project.projectType === "Event" ? "Event" : "Project",
    organizationId: project.organizationId ?? tenantWide,
    startDate: project.startDate ?? "",
    endDate: project.endDate ?? "",
  };
}

export function ProjectForm({
  project,
  defaultProjectType = "Project",
  idPrefix = "project",
  submitLabel,
  layout = "stack",
  autoFocus = false,
  onCreated,
  onSaved,
  onCancel,
}: {
  project?: Project;
  defaultProjectType?: "Project" | "Event";
  idPrefix?: string;
  submitLabel?: string;
  layout?: "grid" | "stack";
  autoFocus?: boolean;
  onCreated?: (project: Project) => void;
  onSaved?: (project: Project) => void;
  onCancel?: () => void;
}) {
  const tenant = useTenant();
  const copy = useLabels();
  const queryClient = useQueryClient();
  const { lookups } = useLookups();
  const [draft, setDraft] = useState<Draft>(() =>
    project ? fromProject(project) : { ...blank, projectType: defaultProjectType },
  );
  const [error, setError] = useState<string | null>(null);
  const [addingOrganization, setAddingOrganization] = useState(false);
  const invalidate = [keys.lookups(tenant.id)];
  const organizations = [
    { value: tenantWide, label: `Whole ${copy.tenant.toLowerCase()}` },
    ...lookups.organizations.map((item) => ({ value: item.id, label: item.name })),
  ];

  function remember(saved: Project) {
    rememberLookup(queryClient, tenant.id, (current) => ({
      ...current,
      projects: upsertProject(current.projects, saved),
    }));
  }

  const create = useActionMutation((input: ProjectInput) => createProjectAction(tenant.id, input), {
    invalidate,
    onSuccess: (data) => {
      if (savedProject(data)) {
        remember(data);
        onCreated?.(data);
      }
      setDraft((current) => ({ ...blank, projectType: current.projectType, organizationId: current.organizationId }));
      setError(null);
    },
  });
  const update = useActionMutation((input: ProjectInput) => updateProjectAction(project?.id ?? "", input), {
    invalidate,
    onSuccess: (data) => {
      if (savedProject(data)) {
        remember(data);
        onSaved?.(data);
      } else {
        onSaved?.(project as Project);
      }
      setError(null);
    },
  });

  function submit() {
    const nextError = dateError(draft);
    setError(nextError);
    if (nextError || !draft.title.trim()) return;
    const input = toInput(draft);
    if (project) update.mutate(input);
    else create.mutate(input);
  }

  return (
    <>
      <form
        id={`${idPrefix}-form`}
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className={cn("grid gap-3", layout === "grid" ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-2")}>
          <Field label={copy.project} htmlFor={`${idPrefix}-title`} className="sm:col-span-2">
            <Input
              id={`${idPrefix}-title`}
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              required
              autoFocus={autoFocus}
              className="h-9"
            />
          </Field>
          <EntitySelect
            id={`${idPrefix}-type`}
            label="Type"
            value={draft.projectType}
            onValueChange={(projectType) =>
              setDraft({ ...draft, projectType: projectType === "Event" ? "Event" : "Project" })
            }
            options={[...projectTypes]}
            className="sm:col-span-2"
          />
          <EntitySelect
            id={`${idPrefix}-organization`}
            label={copy.organization}
            value={draft.organizationId}
            onValueChange={(organizationId) => setDraft({ ...draft, organizationId })}
            options={organizations}
            createLabel={`Add a ${copy.organization.toLowerCase()}`}
            onCreate={() => setAddingOrganization(true)}
            className="sm:col-span-2"
          />
          <Field label="Start date" htmlFor={`${idPrefix}-start`}>
            <Input
              id={`${idPrefix}-start`}
              type="date"
              value={draft.startDate}
              max={draft.endDate || undefined}
              onChange={(event) => setDraft({ ...draft, startDate: event.target.value })}
              className="h-9"
            />
          </Field>
          <Field label="End date" htmlFor={`${idPrefix}-end`}>
            <Input
              id={`${idPrefix}-end`}
              type="date"
              value={draft.endDate}
              min={draft.startDate || undefined}
              onChange={(event) => setDraft({ ...draft, endDate: event.target.value })}
              className="h-9"
            />
          </Field>
        </div>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <DialogActions form={`${idPrefix}-form`}>
          {onCancel ? (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <SubmitButton pending={project ? update.isPending : create.isPending}>
            {submitLabel ?? (project ? "Save" : "Add")}
          </SubmitButton>
        </DialogActions>
      </form>
      <CreateOrganizationDialog
        open={addingOrganization}
        onOpenChange={setAddingOrganization}
        onCreated={(organization) => setDraft((current) => ({ ...current, organizationId: organization.id }))}
      />
    </>
  );
}

export function ProjectDialog({
  open,
  onOpenChange,
  project,
  defaultProjectType = "Project",
  onCreated,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project | null;
  defaultProjectType?: "Project" | "Event";
  onCreated?: (project: Project) => void;
  onSaved?: (project: Project) => void;
}) {
  const idPrefix = useId();
  const editing = Boolean(project);
  return (
    <EntityFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit project" : defaultProjectType === "Event" ? "Add an event" : "Add a project"}
      description="Assign a project to a organization and give it a start and end date. Leave the organization as the whole tenant when everyone should see it."
      className="sm:max-w-lg"
    >
      <ProjectForm
        project={project ?? undefined}
        defaultProjectType={defaultProjectType}
        idPrefix={idPrefix}
        submitLabel={editing ? "Save" : defaultProjectType === "Event" ? "Add event" : "Add project"}
        layout="stack"
        autoFocus
        onCancel={() => onOpenChange(false)}
        onCreated={(saved) => {
          onCreated?.(saved);
          onOpenChange(false);
        }}
        onSaved={(saved) => {
          onSaved?.(saved);
          onOpenChange(false);
        }}
      />
    </EntityFormDialog>
  );
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (project: Project) => void;
}) {
  return <ProjectDialog open={open} onOpenChange={onOpenChange} onCreated={onCreated} />;
}
