import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { InboxIcon, PlusIcon, SlidersHorizontalIcon } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { api } from "@/api/client";
import { EntryDays } from "@/entries";
import { formatCurrency, formatMinutes, formatPersonName, rangeLabel, type DateRange } from "@/format";
import { Button, DateRangeField, EmptyState, ErrorText, PageTitle, Panel, Screen, Select, Sheet } from "@/ui";
import { useLookups, useWorkspace } from "@/workspace";

const pageSize = 50;
const everyone = "everyone";

function param(value: string | string[] | undefined) {
  const text = Array.isArray(value) ? value[0] : value;
  return text || undefined;
}

export default function EntriesScreen() {
  const { organization, viewer, isAdmin, isCoordinator, labels } = useWorkspace();
  const { lookups } = useLookups();
  const canSeeOthers = isAdmin || isCoordinator;
  const params = useLocalSearchParams<{
    from?: string;
    to?: string;
    person?: string;
    everyone?: string;
    projectId?: string;
    taskCategoryId?: string;
    departmentId?: string;
    unclassified?: string;
  }>();
  const range: DateRange = { from: param(params.from), to: param(params.to) };
  const showEveryone = param(params.everyone) === "1";
  const personId = showEveryone ? everyone : (param(params.person) ?? viewer.id);
  const projectId = param(params.projectId) ?? "";
  const taskCategoryId = param(params.taskCategoryId) ?? "";
  const departmentId = param(params.departmentId) ?? "";
  const unclassified = param(params.unclassified) === "1";
  const [limit, setLimit] = useState(pageSize);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const members = useQuery({
    queryKey: ["members", organization.id],
    queryFn: () => api.memberships(organization.id),
    enabled: canSeeOthers,
  });
  const query = {
    limit,
    from: range.from,
    to: range.to,
    projectId: projectId || undefined,
    taskCategoryId: taskCategoryId || undefined,
    departmentId: departmentId || undefined,
    unclassified: unclassified ? 1 : undefined,
  };
  const entries = useQuery({
    queryKey: [
      "own-entries",
      showEveryone ? everyone : personId,
      organization.id,
      limit,
      range.from ?? "",
      range.to ?? "",
      projectId,
      taskCategoryId,
      departmentId,
      unclassified,
    ],
    queryFn: () =>
      showEveryone
        ? api.orgEntries(organization.id, query)
        : api.entries(personId, { organizationId: organization.id, ...query }),
    placeholderData: (previous) => previous,
  });
  const items = entries.data?.items ?? [];
  const minutes = items.reduce((sum, entry) => sum + (entry.durationMinutes ?? 0), 0);
  const value = items.reduce((sum, entry) => sum + (entry.inKindValue ?? 0), 0);
  const more = items.length >= limit;
  const people = [
    { value: everyone, label: "Everyone" },
    { value: viewer.id, label: `${viewer.name} (you)` },
    ...(members.data?.items ?? [])
      .filter((member) => member.userId !== viewer.id)
      .map((member) => ({ value: member.userId, label: formatPersonName(member.user) })),
  ];
  const filterCount = [range.from || range.to, projectId, taskCategoryId, departmentId, unclassified].filter(Boolean).length;

  function setFilters(patch: Record<string, string | undefined>) {
    setLimit(pageSize);
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries(patch)) next[key] = value ?? "";
    router.setParams(next);
  }

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <PageTitle
            description={
              items.length
                ? `${formatMinutes(minutes)} hours · ${formatCurrency(value)} in-kind${more ? " (loaded so far)" : ""} · ${rangeLabel(range)}`
                : rangeLabel(range)
            }
            title="Entries"
          />
        </View>
        <Button icon={PlusIcon} label="Log time" onPress={() => router.navigate("/log")} />
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {canSeeOthers ? (
          <View style={{ flex: 1 }}>
            <Select
              label="Person"
              onChange={(next) => setFilters({ person: next === everyone ? undefined : next, everyone: next === everyone ? "1" : undefined })}
              options={people}
              searchable
              value={personId}
            />
          </View>
        ) : null}
        <Button
          icon={SlidersHorizontalIcon}
          label={filterCount ? `Filters ${filterCount}` : "Filters"}
          onPress={() => setFiltersOpen(true)}
          variant="outline"
        />
      </View>
      <Sheet onClose={() => setFiltersOpen(false)} open={filtersOpen} title="Filters">
        <DateRangeField onChange={(next) => setFilters({ from: next.from, to: next.to })} value={range} />
        <Select
          label={labels.project}
          onChange={(next) => setFilters({ projectId: next === "any" ? undefined : next })}
          options={[{ value: "any", label: "Any" }, ...lookups.projects.map((project) => ({ value: project.id, label: project.title }))]}
          value={projectId || "any"}
        />
        <Select
          label={labels.taskCategory}
          onChange={(next) => setFilters({ taskCategoryId: next === "any" ? undefined : next })}
          options={[{ value: "any", label: "Any" }, ...lookups.categories.map((item) => ({ value: item.id, label: item.name }))]}
          value={taskCategoryId || "any"}
        />
        <Select
          label={labels.department}
          onChange={(next) => setFilters({ departmentId: next === "any" ? undefined : next })}
          options={[{ value: "any", label: "Any" }, ...lookups.departments.map((item) => ({ value: item.id, label: item.name }))]}
          value={departmentId || "any"}
        />
        <Button
          label={unclassified ? "Showing unclassified" : "Unclassified only"}
          onPress={() => setFilters({ unclassified: unclassified ? undefined : "1" })}
          variant={unclassified ? "default" : "outline"}
        />
        <Button
          label="Clear filters"
          onPress={() =>
            setFilters({ from: undefined, to: undefined, projectId: undefined, taskCategoryId: undefined, departmentId: undefined, unclassified: undefined })
          }
          variant="ghost"
        />
      </Sheet>
      <ErrorText error={entries.error} />
      {items.length === 0 ? (
        <Panel>
          <EmptyState description={entries.isPending ? "Loading…" : "Log some time and it shows up here."} icon={InboxIcon} title="No entries yet" />
        </Panel>
      ) : (
        <EntryDays cards entries={items} />
      )}
      {more ? (
        <Button label="Load more" onPress={() => setLimit((current) => current + pageSize)} pending={entries.isFetching} variant="outline" />
      ) : null}
    </Screen>
  );
}
