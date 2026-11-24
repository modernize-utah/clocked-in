"use client";

import { useState } from "react";
import { createNeedAction, updateNeedAction } from "@/app/actions/volunteer-needs";
import { DialogActions } from "@/components/dialog-actions";
import { Field } from "@/components/field";
import { QuestionDesigner, type QuestionDraft } from "@/components/question-designer";
import { SelectField } from "@/components/select-field";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useLookups } from "@/hooks/use-lookups";
import { CreateProjectDialog } from "@/components/entity-forms/project-form";
import { useTenant, useWorkspace } from "@/hooks/use-workspace";
import { keys } from "@/lib/queries";
import type { VolunteerNeed } from "@/lib/types";

const none = "none";

function localInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function NeedForm({ need, onDone }: { need?: VolunteerNeed; onDone: () => void }) {
  const tenant = useTenant();
  const { permissions } = useWorkspace();
  const { lookups } = useLookups();
  const [creatingProject, setCreatingProject] = useState(false);
  const [name, setName] = useState(need?.name ?? "");
  const [description, setDescription] = useState(need?.description ?? "");
  const [type, setType] = useState(need?.type ?? "Position");
  const [countNeeded, setCountNeeded] = useState(String(need?.countNeeded ?? 1));
  const [startDate, setStartDate] = useState(need?.startDate ?? "");
  const [endDate, setEndDate] = useState(need?.endDate ?? "");
  const [requiredBy, setRequiredBy] = useState(localInput(need?.requiredBy ?? null));
  const [allowPublic, setAllowPublic] = useState(need?.allowPublic ?? false);
  const [requireVetting, setRequireVetting] = useState(need?.requireVetting ?? false);
  const [projectId, setProjectId] = useState(need?.projectId ?? none);
  const [organizationId, setOrganizationId] = useState(need?.organizationId ?? none);
  const [taskCategoryId, setTaskCategoryId] = useState(need?.taskCategoryId ?? none);
  const [questions, setQuestions] = useState<QuestionDraft[]>(need?.questions.items ?? []);
  const save = useActionMutation(
    (body: Record<string, unknown>) => (need ? updateNeedAction(need.id, body) : createNeedAction(tenant.id, body)),
    {
      invalidate: [keys.needs(tenant.id), ...(need ? [keys.need(need.id)] : [])],
      onSuccess: onDone,
    },
  );

  function optionalId(value: string) {
    return value === none ? null : value;
  }

  return (
    <form
      id="need-form"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const count = Number(countNeeded);
        save.mutate({
          name,
          description,
          type,
          countNeeded: count,
          startDate: startDate || null,
          endDate: endDate || null,
          requiredBy: requiredBy ? new Date(requiredBy).toISOString() : null,
          allowPublic,
          requireVetting,
          projectId: optionalId(projectId),
          organizationId: optionalId(organizationId),
          taskCategoryId: optionalId(taskCategoryId),
          questions: { version: 1, items: questions },
        });
      }}
    >
      <Field label="Name" htmlFor="need-name">
        <Input id="need-name" value={name} onChange={(event) => setName(event.target.value)} required />
      </Field>
      <Field label="Description" htmlFor="need-description">
        <Textarea id="need-description" value={description} onChange={(event) => setDescription(event.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type">
          <SelectField
            aria-label="Type"
            value={type}
            options={[
              { value: "Position", label: "Position" },
              { value: "Task", label: "Task" },
            ]}
            onValueChange={setType}
          />
        </Field>
        <Field label="Needed" htmlFor="need-count">
          <Input id="need-count" type="number" min={1} max={10000} value={countNeeded} onChange={(event) => setCountNeeded(event.target.value)} required />
        </Field>
        <Field label="Starts" htmlFor="need-start">
          <Input id="need-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </Field>
        <Field label="Ends" htmlFor="need-end">
          <Input id="need-end" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </Field>
      </div>
      <Field label="Required by" htmlFor="need-deadline" hint="Sign-up closes at this time.">
        <Input id="need-deadline" type="datetime-local" value={requiredBy} onChange={(event) => setRequiredBy(event.target.value)} />
      </Field>
      <Field label="Project">
        <div className="flex flex-col gap-2">
          <SelectField
            aria-label="Project"
            value={projectId}
            options={[
              { value: none, label: "None" },
              ...lookups.projects.filter((project) => project.isActive !== false).map((project) => ({ value: project.id, label: project.title })),
            ]}
            onValueChange={setProjectId}
          />
          {permissions.includes("create_projects") ? (
            <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setCreatingProject(true)}>
              + New project / event
            </Button>
          ) : null}
        </div>
      </Field>
      <CreateProjectDialog open={creatingProject} onOpenChange={setCreatingProject} />
      <Field label="Task category">
        <SelectField
          aria-label="Task category"
          value={taskCategoryId}
          options={[{ value: none, label: "None" }, ...lookups.categories.map((category) => ({ value: category.id, label: category.name }))]}
          onValueChange={setTaskCategoryId}
        />
      </Field>
      <Field label="Group">
        <SelectField
          aria-label="Group"
          value={organizationId}
          options={[{ value: none, label: "None" }, ...lookups.organizations.map((organization) => ({ value: organization.id, label: organization.name }))]}
          onValueChange={setOrganizationId}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={allowPublic} onCheckedChange={(checked) => setAllowPublic(checked === true)} />
        Allow a public sign-up link
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={requireVetting} onCheckedChange={(checked) => setRequireVetting(checked === true)} />
        Require vetting before a volunteer fills a spot
      </label>
      <QuestionDesigner questions={questions} onChange={setQuestions} />
      <DialogActions form="need-form">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton pending={save.isPending}>{need ? "Save" : "Add need"}</SubmitButton>
      </DialogActions>
    </form>
  );
}
