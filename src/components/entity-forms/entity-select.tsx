"use client";

import { PlusIcon } from "lucide-react";
import { Field } from "@/components/field";
import { SearchableSelect } from "@/components/searchable-select";
import { SelectField, type Option } from "@/components/select-field";
import { useWorkspace } from "@/hooks/use-workspace";

export function EntitySelect({
  id,
  label,
  value,
  onValueChange,
  options,
  onCreate,
  createLabel = "Add",
  hint,
  placeholder,
  searchable = false,
  className,
}: {
  id?: string;
  label: React.ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  options: Option[];
  onCreate?: () => void;
  createLabel?: string;
  hint?: React.ReactNode;
  placeholder?: string;
  searchable?: boolean;
  className?: string;
}) {
  const { isAdmin, permissions } = useWorkspace();
  const canCreate = Boolean(onCreate) && (isAdmin || permissions.includes("create_projects"));

  return (
    <Field
      label={label}
      htmlFor={id}
      hint={hint}
      className={className}
      action={
        canCreate ? (
          <button
            type="button"
            aria-label={createLabel}
            onClick={onCreate}
            className="-mr-0.5 inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <PlusIcon className="size-3.5" />
          </button>
        ) : undefined
      }
    >
      {searchable ? (
        <SearchableSelect
          id={id}
          value={value}
          onValueChange={onValueChange}
          options={options}
          placeholder={placeholder}
          className="min-w-0"
        />
      ) : (
        <SelectField
          id={id}
          value={value}
          onValueChange={onValueChange}
          options={options}
          placeholder={placeholder}
          className="min-w-0"
        />
      )}
    </Field>
  );
}
