"use client";

import { useQueryClient } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createLookupAction } from "@/app/actions/lookups";
import { EntitySelect } from "@/components/entity-forms/entity-select";
import { CreateOrganizationDialog, CreateTaskCategoryDialog } from "@/components/entity-forms/name-entity-form";
import { namedEntity, rememberLookup, upsertNamed } from "@/components/entity-forms/lookup-cache";
import { CreateProjectDialog } from "@/components/entity-forms/project-form";
import { Field } from "@/components/field";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { tenantWide, type PlacementState } from "@/hooks/use-placement";
import { useLabels } from "@/hooks/use-labels";
import { useTenant, useWorkspace } from "@/hooks/use-workspace";
import { keys } from "@/lib/queries";
import type { Project } from "@/lib/types";

type Creating = "project" | "category" | "organization" | null;
type TagOption = { id: string; name: string };

const projectTypeGroups = [
  { type: "Project", label: "Projects" },
  { type: "Event", label: "Events" },
] as const;

function projectOptions(projects: Project[]) {
  return projectTypeGroups.flatMap((group) =>
    projects
      .filter((project) => (project.projectType === "Event" ? "Event" : "Project") === group.type)
      .map((project) => ({ value: project.id, label: project.title, group: group.label })),
  );
}

/** Date / start / end, plus a narrow fourth column, sharing tracks with placement fields. */
export const alignedEntryGridClass =
  "grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_4.5rem]";

const none = "none";

export function PlacementFields({
  state,
  organizationIds,
  embedded = false,
  optional = false,
}: {
  state: PlacementState;
  /** Accepted so existing timer usage stays valid. Layout no longer changes with it. */
  compact?: boolean;
  organizationIds?: string[];
  /** Join a parent `alignedEntryGridClass` so these columns line up with date, start, and end. */
  embedded?: boolean;
  /** Allow leaving project and task category empty. */
  optional?: boolean;
}) {
  const { lookups, value, set } = state;
  const projects = useMemo(
    () => projectOptions(lookups.projects.filter((project) => project.isActive !== false)),
    [lookups.projects],
  );
  const organizations = organizationIds
    ? lookups.organizations.filter((item) => organizationIds.includes(item.id))
    : lookups.organizations;
  const { isAdmin } = useWorkspace();
  const copy = useLabels();
  const [creating, setCreating] = useState<Creating>(null);
  const tagClass = embedded ? "col-span-full" : "sm:col-span-3";

  return (
    <>
      <div
        className={
          embedded ? "contents" : "grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]"
        }
      >
        <EntitySelect
          label={copy.project}
          value={value.projectId}
          onValueChange={(projectId) => set({ projectId: projectId === none ? "" : projectId })}
          options={optional ? [{ value: none, label: "None" }, ...projects] : projects}
          searchable
          placeholder={optional ? "Optional" : undefined}
          createLabel={`Add a ${copy.project.toLowerCase()}`}
          onCreate={() => setCreating("project")}
        />
        <EntitySelect
          label={copy.taskCategory}
          value={value.taskCategoryId}
          onValueChange={(taskCategoryId) => set({ taskCategoryId: taskCategoryId === none ? "" : taskCategoryId })}
          options={
            optional
              ? [
                  { value: none, label: "None" },
                  ...lookups.categories.map((item) => ({ value: item.id, label: item.name })),
                ]
              : lookups.categories.map((item) => ({ value: item.id, label: item.name }))
          }
          placeholder={optional ? "Optional" : undefined}
          createLabel={`Add a ${copy.taskCategory.toLowerCase()}`}
          onCreate={() => setCreating("category")}
        />
        <EntitySelect
          label={copy.organization}
          value={value.organizationId}
          onValueChange={(organizationId) => set({ organizationId })}
          options={
            organizationIds
              ? organizations.map((item) => ({ value: item.id, label: item.name }))
              : [
                  { value: tenantWide, label: `Whole ${copy.tenant.toLowerCase()}` },
                  ...organizations.map((item) => ({ value: item.id, label: item.name })),
                ]
          }
          createLabel={`Add a ${copy.organization.toLowerCase()}`}
          onCreate={organizationIds ? undefined : () => setCreating("organization")}
        />
        {lookups.tags.length || isAdmin ? (
          <Field label='Tags' className={tagClass}>
            <TagInput
              tags={lookups.tags}
              selected={value.tagIds}
              onChange={(tagIds) => set({ tagIds })}
              canCreate={isAdmin}
            />
          </Field>
        ) : null}
      </div>
      <CreateProjectDialog
        open={creating === "project"}
        onOpenChange={(open) => !open && setCreating(null)}
        onCreated={(project) => set({ projectId: project.id })}
      />
      <CreateTaskCategoryDialog
        open={creating === "category"}
        onOpenChange={(open) => !open && setCreating(null)}
        onCreated={(category) => set({ taskCategoryId: category.id })}
      />
      <CreateOrganizationDialog
        open={creating === "organization"}
        onOpenChange={(open) => !open && setCreating(null)}
        onCreated={(organization) => set({ organizationId: organization.id })}
      />
    </>
  );
}

function TagInput({
  tags,
  selected,
  onChange,
  canCreate,
}: {
  tags: TagOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  canCreate: boolean;
}) {
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef(selected);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const create = useActionMutation((name: string) => createLookupAction("tags", tenant.id, name), {
    invalidate: [keys.lookups(tenant.id)],
    silent: true,
    onSuccess: (data) => {
      if (!namedEntity(data)) return;
      rememberLookup(queryClient, tenant.id, (current) => ({
        ...current,
        tags: upsertNamed(current.tags, {
          id: data.id,
          tenantId: tenant.id,
          name: data.name,
          isArchived: false,
        }),
      }));
      if (!selectedRef.current.includes(data.id)) {
        onChange([...selectedRef.current, data.id]);
      }
      setDraft("");
    },
  });

  const trimmed = draft.trim();
  const query = trimmed.toLowerCase();
  const exact = tags.find((tag) => tag.name.toLowerCase() === query);
  const suggestions = tags
    .filter((tag) => !selected.includes(tag.id) && (!query || tag.name.toLowerCase().includes(query)))
    .slice(0, 8);
  const showCreate = canCreate && trimmed.length > 0 && !exact && !create.isPending;
  const chosen = selected
    .map((id) => tags.find((tag) => tag.id === id))
    .filter((tag): tag is TagOption => Boolean(tag));

  function select(id: string) {
    if (!selectedRef.current.includes(id)) {
      onChange([...selectedRef.current, id]);
    }
    setDraft("");
    inputRef.current?.focus();
  }

  function remove(id: string) {
    onChange(selectedRef.current.filter((current) => current !== id));
    inputRef.current?.focus();
  }

  function commit() {
    if (!trimmed || create.isPending) return;
    if (exact) {
      select(exact.id);
      return;
    }
    if (canCreate) create.mutate(trimmed);
  }

  return (
    <div>
      <div
        className='flex min-h-9 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-1.5 py-1 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50'
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            event.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        {chosen.map((tag) => (
          <span
            key={tag.id}
            className='inline-flex h-6 max-w-full items-center gap-0.5 rounded-full bg-secondary pr-0.5 pl-2 text-xs text-secondary-foreground'
          >
            <span className='truncate'>{tag.name}</span>
            <button
              type='button'
              className='rounded-full p-0.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground'
              aria-label={`Remove ${tag.name}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => remove(tag.id)}
            >
              <XIcon className='size-3' />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={draft}
          aria-label='Add a tag'
          aria-expanded={open}
          placeholder={chosen.length ? "" : "Add a tag"}
          className='h-6 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground'
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            setDraft(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              commit();
            } else if (event.key === "Backspace" && !draft && selected.length > 0) {
              event.preventDefault();
              remove(selected[selected.length - 1]);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
        />
      </div>
      {open && (suggestions.length > 0 || showCreate) ? (
        <ul className='mt-1 max-h-44 overflow-auto rounded-lg border bg-popover p-1 text-sm shadow-md' role='listbox'>
          {suggestions.map((tag) => (
            <li key={tag.id}>
              <button
                type='button'
                role='option'
                className='flex w-full rounded-md px-2 py-1.5 text-left hover:bg-muted'
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(tag.id)}
              >
                {tag.name}
              </button>
            </li>
          ))}
          {showCreate ? (
            <li>
              <button
                type='button'
                role='option'
                className='flex w-full rounded-md px-2 py-1.5 text-left hover:bg-muted'
                onMouseDown={(event) => event.preventDefault()}
                onClick={commit}
              >
                Add “{trimmed}”
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
