"use client";

import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { createLookupAction, updateLookupAction, type NamedLookupKind } from "@/app/actions/lookups";
import { DialogActions } from "@/components/dialog-actions";
import { EntityFormDialog } from "@/components/entity-forms/entity-form-dialog";
import { namedEntity, rememberLookup, upsertNamed, type NamedEntity } from "@/components/entity-forms/lookup-cache";
import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useLabels } from "@/hooks/use-labels";
import { useTenant } from "@/hooks/use-workspace";
import { keys } from "@/lib/queries";

type NameKind = NamedLookupKind;

function kindCopy(kind: NameKind, copy: ReturnType<typeof useLabels>) {
  if (kind === "organizations") {
    return {
      noun: copy.organization.toLowerCase(),
      description: `Teams or sites inside this ${copy.tenant.toLowerCase()}. Hours can be logged against a ${copy.organization.toLowerCase()}, and reports break down by it.`,
    };
  }

  if (kind === "categories") {
    return {
      noun: copy.taskCategory.toLowerCase(),
      description: "What kind of work was this? Used in reports.",
    };
  }

  return {
    noun: "tag",
    description: "Free-form labels volunteers can attach to an entry.",
  };
}

type FormProps = {
  entity?: NamedEntity;
  idPrefix?: string;
  label?: string;
  submitLabel?: string;
  layout?: "inline" | "stack";
  autoFocus?: boolean;
  onCreated?: (entity: NamedEntity) => void;
  onSaved?: (entity: NamedEntity) => void;
  onCancel?: () => void;
};

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity?: NamedEntity | null;
  onCreated?: (entity: NamedEntity) => void;
  onSaved?: (entity: NamedEntity) => void;
};

export function OrganizationForm(props: FormProps) {
  return <NameEntityForm kind="organizations" {...props} />;
}

export function TaskCategoryForm(props: FormProps) {
  return <NameEntityForm kind="categories" {...props} />;
}

export function TagForm(props: FormProps) {
  return <NameEntityForm kind="tags" {...props} />;
}

export function NamedEntityDialog({ kind, open, onOpenChange, entity, onCreated, onSaved }: DialogProps & { kind: NameKind }) {
  const idPrefix = useId();
  const editing = Boolean(entity);
  const { noun, description } = kindCopy(kind, useLabels());
  return (
    <EntityFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${noun}` : `Add a ${noun}`}
      description={description}
    >
      <NameEntityForm
        kind={kind}
        entity={entity ?? undefined}
        idPrefix={idPrefix}
        label="Name"
        submitLabel={editing ? "Save" : `Add ${noun}`}
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

export function CreateOrganizationDialog(props: DialogProps) {
  return <NamedEntityDialog kind="organizations" {...props} />;
}

export function CreateTaskCategoryDialog(props: DialogProps) {
  return <NamedEntityDialog kind="categories" {...props} />;
}

export function CreateTagDialog(props: DialogProps) {
  return <NamedEntityDialog kind="tags" {...props} />;
}

function NameEntityForm({
  kind,
  entity,
  idPrefix = kind,
  label = "Name",
  submitLabel,
  layout = "inline",
  autoFocus = false,
  onCreated,
  onSaved,
  onCancel,
}: FormProps & { kind: NameKind }) {
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const [name, setName] = useState(entity?.name ?? "");
  const invalidate = [keys.lookups(tenant.id)];

  function remember(saved: NamedEntity) {
    rememberLookup(queryClient, tenant.id, (current) => ({
      ...current,
      [kind]: upsertNamed(current[kind], { id: saved.id, tenantId: tenant.id, name: saved.name }),
    }));
  }

  const create = useActionMutation((value: string) => createLookupAction(kind, tenant.id, value), {
    invalidate,
    onSuccess: (data) => {
      if (namedEntity(data)) {
        remember(data);
        onCreated?.(data);
      }
      setName("");
    },
  });
  const update = useActionMutation((value: string) => updateLookupAction(kind, entity?.id ?? "", value), {
    invalidate,
    onSuccess: (data) => {
      if (namedEntity(data)) {
        remember(data);
        onSaved?.(data);
      }
    },
  });
  const inputId = `${idPrefix}-name`;
  const formId = `${idPrefix}-form`;
  const pending = entity ? update.isPending : create.isPending;

  return (
    <form
      id={formId}
      className={cn("flex gap-2", layout === "stack" ? "flex-col gap-4" : "flex-col sm:flex-row")}
      onSubmit={(event) => {
        event.preventDefault();
        const value = name.trim();
        if (!value) return;
        if (entity) update.mutate(value);
        else create.mutate(value);
      }}
    >
      <Field label={label} htmlFor={inputId} className="flex-1">
        <Input
          id={inputId}
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          autoFocus={autoFocus}
          className="h-9"
        />
      </Field>
      <DialogActions form={formId} className={layout === "stack" ? undefined : "sm:mt-6"}>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <SubmitButton pending={pending}>
          {submitLabel ?? (entity ? "Save" : "Add")}
        </SubmitButton>
      </DialogActions>
    </form>
  );
}
