"use client";

import { ListFilterIcon } from "lucide-react";
import { useState } from "react";
import { DateRangeFilter, useUrlParams } from "@/components/date-range-filter";
import { SearchableMultiSelect } from "@/components/searchable-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useLabels } from "@/hooks/use-labels";
import { useLookups } from "@/hooks/use-lookups";
import { useMembers } from "@/hooks/use-members";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  activeIdFilterCount,
  filterParams,
  filtersFromSearch,
  reportIdFilterKeys,
  type ReportFilters,
  type ReportIdFilterKey,
} from "@/lib/report-layout";
import { formatPersonName } from "@/lib/format";

export function reportFiltersFromSearch(search: { get: (key: string) => string | null }): ReportFilters {
  return filtersFromSearch(search);
}

export function ReportFilters({ filters }: { filters: ReportFilters }) {
  const copy = useLabels();
  const { lookups } = useLookups();
  const { members } = useMembers();
  const { viewer, isCoordinator, groupOrganizations } = useWorkspace();
  const params = filterParams(filters);
  const { update } = useUrlParams(params);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ReportFilters>(filters);
  const scoped = isCoordinator
    ? members.filter((member) => (member.organizationIds ?? []).some((id) => groupOrganizations.includes(id)))
    : members;
  const people = scoped.map((member) => ({
    value: member.userId,
    label: member.userId === viewer.id ? `${formatPersonName(member.user)} (you)` : formatPersonName(member.user),
  }));
  const fields: { key: ReportIdFilterKey; label: string; placeholder: string; options: { value: string; label: string }[] }[] = [
    {
      key: "organizationId",
      label: copy.organization,
      placeholder: `Any ${copy.organization.toLowerCase()}`,
      options: lookups.organizations.map((item) => ({ value: item.id, label: item.name })),
    },
    {
      key: "taskCategoryId",
      label: copy.taskCategory,
      placeholder: `Any ${copy.taskCategory.toLowerCase()}`,
      options: lookups.categories.map((item) => ({ value: item.id, label: item.name })),
    },
    {
      key: "projectId",
      label: copy.project,
      placeholder: `Any ${copy.project.toLowerCase()}`,
      options: lookups.projects.map((item) => ({ value: item.id, label: item.title })),
    },
    { key: "userId", label: "Person", placeholder: "Anyone", options: people },
  ];
  const active = activeIdFilterCount(filters);

  const openModal = () => {
    setDraft(filters);
    setOpen(true);
  };

  const apply = () => {
    update(filterParams(draft));
    setOpen(false);
  };

  const clear = () => {
    setDraft((current) => {
      const next = { ...current };
      for (const key of reportIdFilterKeys) delete next[key];
      return next;
    });
  };

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <DateRangeFilter range={{ from: filters.from, to: filters.to }} params={params} />
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={active > 0 ? `Filters (${active} active)` : "Filters"}
        className="relative"
        onClick={openModal}
      >
        <ListFilterIcon />
        {active > 0 ? (
          <span className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-[0.625rem] font-medium text-primary-foreground">
            {active}
          </span>
        ) : null}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Filters</DialogTitle>
            <DialogDescription>Narrow this report by date and by one or more of each field.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Date range</Label>
              <DateRangeFilter
                range={{ from: draft.from, to: draft.to }}
                stacked
                onChange={(range) => setDraft((current) => ({ ...current, from: range.from, to: range.to }))}
              />
            </div>
            {fields.map((field) => (
              <div key={field.key} className="flex flex-col gap-1.5">
                <Label htmlFor={`report-filter-${field.key}`}>{field.label}</Label>
                <SearchableMultiSelect
                  id={`report-filter-${field.key}`}
                  aria-label={field.label}
                  value={draft[field.key] ?? []}
                  onValueChange={(ids) =>
                    setDraft((current) => ({ ...current, [field.key]: ids.length > 0 ? ids : undefined }))
                  }
                  options={field.options}
                  placeholder={field.placeholder}
                  searchPlaceholder={`Search ${field.label.toLowerCase()}`}
                />
              </div>
            ))}
          </div>
          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="ghost" onClick={clear}>
              Clear
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={apply}>
                Apply
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
