import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, XIcon } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "@/api/client";
import type { Project } from "@/api/types";
import { useColors } from "@/theme";
import { Button, ErrorText, FormField, Input, Muted, Select, Sheet, styles } from "@/ui";
import { useLookups, useWorkspace } from "@/workspace";

export const organizationWide = "organization";
const none = "none";

export type PlacementValue = { departmentId: string; projectId: string; taskCategoryId: string; tagIds: string[] };

export function usePlacement(initial?: Partial<PlacementValue>) {
  const [value, setValue] = useState<PlacementValue>({
    departmentId: initial?.departmentId || organizationWide,
    projectId: initial?.projectId ?? "",
    taskCategoryId: initial?.taskCategoryId ?? "",
    tagIds: initial?.tagIds ?? [],
  });
  return {
    value,
    set: (patch: Partial<PlacementValue>) => setValue((current) => ({ ...current, ...patch })),
    reset: () => setValue({ departmentId: organizationWide, projectId: "", taskCategoryId: "", tagIds: [] }),
    ready: Boolean(value.projectId && value.taskCategoryId),
    body: (description: string) => ({
      departmentId: value.departmentId === organizationWide ? null : value.departmentId,
      projectId: value.projectId || null,
      taskCategoryId: value.taskCategoryId || null,
      tagIds: value.tagIds,
      description: description.trim() || null,
    }),
  };
}

export type PlacementState = ReturnType<typeof usePlacement>;

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

export function PlacementFields({
  state,
  optional = false,
  departmentIds,
}: {
  state: PlacementState;
  optional?: boolean;
  departmentIds?: string[];
}) {
  const { lookups } = useLookups();
  const { labels, isAdmin, permissions } = useWorkspace();
  const { value, set } = state;
  const canCreate = isAdmin || permissions.includes("create_projects");
  const [creating, setCreating] = useState<"project" | "category" | "department" | null>(null);
  const projects = useMemo(() => projectOptions(lookups.projects.filter((project) => project.isActive !== false)), [lookups.projects]);
  const categories = lookups.categories.map((item) => ({ value: item.id, label: item.name }));
  const departments = (departmentIds ? lookups.departments.filter((item) => departmentIds.includes(item.id)) : lookups.departments).map(
    (item) => ({ value: item.id, label: item.name }),
  );

  return (
    <>
      <Select
        label={labels.project}
        onChange={(projectId) => set({ projectId: projectId === none ? "" : projectId })}
        options={optional ? [{ value: none, label: "None" }, ...projects] : projects}
        placeholder={optional ? "Optional" : `Select a ${labels.project.toLowerCase()}`}
        searchable
        value={value.projectId}
        {...(canCreate
          ? { createLabel: `Add a ${labels.project.toLowerCase()}`, onCreate: () => setCreating("project") }
          : {})}
      />
      <Select
        label={labels.taskCategory}
        onChange={(taskCategoryId) => set({ taskCategoryId: taskCategoryId === none ? "" : taskCategoryId })}
        options={optional ? [{ value: none, label: "None" }, ...categories] : categories}
        placeholder={optional ? "Optional" : `Select a ${labels.taskCategory.toLowerCase()}`}
        searchable
        value={value.taskCategoryId}
        {...(canCreate
          ? { createLabel: `Add a ${labels.taskCategory.toLowerCase()}`, onCreate: () => setCreating("category") }
          : {})}
      />
      <Select
        label={labels.department}
        onChange={(departmentId) => set({ departmentId })}
        options={
          departmentIds ? departments : [{ value: organizationWide, label: `Whole ${labels.organization.toLowerCase()}` }, ...departments]
        }
        searchable
        value={value.departmentId}
        {...(canCreate && !departmentIds
          ? { createLabel: `Add a ${labels.department.toLowerCase()}`, onCreate: () => setCreating("department") }
          : {})}
      />
      {lookups.tags.length || isAdmin ? (
        <TagPicker canCreate={isAdmin} onChange={(tagIds) => set({ tagIds })} selected={value.tagIds} />
      ) : null}
      <CreateNamed
        label="Name"
        onClose={() => setCreating(null)}
        onCreated={(id) => {
          if (creating === "project") set({ projectId: id });
          if (creating === "category") set({ taskCategoryId: id });
          if (creating === "department") set({ departmentId: id });
        }}
        open={creating !== null}
        title={
          creating === "project"
            ? `Add a ${labels.project.toLowerCase()}`
            : creating === "category"
              ? `Add a ${labels.taskCategory.toLowerCase()}`
              : `Add a ${labels.department.toLowerCase()}`
        }
        kind={creating ?? "project"}
      />
    </>
  );
}

function CreateNamed({
  open,
  title,
  label,
  kind,
  onClose,
  onCreated,
}: {
  open: boolean;
  title: string;
  label: string;
  kind: "project" | "category" | "department" | "tag";
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { organization } = useWorkspace();
  const client = useQueryClient();
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (kind === "project") return api.createProject(organization.id, { title: trimmed, accessType: "Private" });
      if (kind === "category") return api.createCategory(organization.id, trimmed);
      if (kind === "department") return api.createDepartment(organization.id, trimmed);
      return api.createTag(organization.id, trimmed);
    },
    onSuccess: async (created) => {
      await client.invalidateQueries({ queryKey: ["lookups", organization.id] });
      onCreated(created.id);
      setName("");
      onClose();
    },
  });

  return (
    <Sheet
      onClose={() => {
        setName("");
        create.reset();
        onClose();
      }}
      open={open}
      title={title}
    >
      <FormField label={label}>
        <Input onChangeText={setName} value={name} />
      </FormField>
      <ErrorText error={create.error} />
      <Button disabled={!name.trim()} label="Add" onPress={() => create.mutate()} pending={create.isPending} />
    </Sheet>
  );
}

function TagPicker({
  selected,
  onChange,
  canCreate,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  canCreate: boolean;
}) {
  const colors = useColors();
  const { lookups } = useLookups();
  const { organization } = useWorkspace();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => api.createTag(organization.id, name.trim()),
    onSuccess: async (created) => {
      await client.invalidateQueries({ queryKey: ["lookups", organization.id] });
      onChange([...selected, created.id]);
      setName("");
    },
  });
  const tags = lookups.tags;
  const chosen = selected.map((id) => tags.find((tag) => tag.id === id)).filter((tag): tag is (typeof tags)[number] => Boolean(tag));

  return (
    <FormField label="Tags">
      <Pressable
        accessibilityLabel="Add a tag"
        onPress={() => setOpen(true)}
        style={[styles.input, { borderColor: colors.input, backgroundColor: colors.card, flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center", paddingVertical: 6 }]}
      >
        {chosen.map((tag) => (
          <View key={tag.id} style={[styles.badge, { backgroundColor: colors.secondary, borderColor: "transparent", flexDirection: "row", alignItems: "center", gap: 4 }]}>
            <Text style={{ color: colors.foreground, fontSize: 12 }}>{tag.name}</Text>
            <Pressable accessibilityLabel={`Remove ${tag.name}`} hitSlop={6} onPress={() => onChange(selected.filter((id) => id !== tag.id))}>
              <XIcon color={colors.mutedForeground} size={12} />
            </Pressable>
          </View>
        ))}
        {chosen.length === 0 ? <Text style={{ color: colors.mutedForeground, fontSize: 15 }}>Add a tag</Text> : <PlusIcon color={colors.mutedForeground} size={14} />}
      </Pressable>
      <Sheet onClose={() => setOpen(false)} open={open} title="Tags">
        {tags.length === 0 ? <Muted>{canCreate ? "No tags yet." : "No tags yet. Add them in Settings."}</Muted> : null}
        {canCreate ? (
          <View style={{ gap: 8 }}>
            <FormField label="New tag">
              <Input onChangeText={setName} value={name} />
            </FormField>
            <ErrorText error={create.error} />
            <Button disabled={!name.trim()} label="Add tag" onPress={() => create.mutate()} pending={create.isPending} variant="outline" />
          </View>
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {tags.map((tag) => {
            const active = selected.includes(tag.id);
            return (
              <Pressable
                key={tag.id}
                onPress={() => onChange(active ? selected.filter((id) => id !== tag.id) : [...selected, tag.id])}
                style={[
                  styles.badge,
                  { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border },
                ]}
              >
                <Text style={{ color: active ? colors.primaryForeground : colors.foreground, fontSize: 14 }}>{tag.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </FormField>
  );
}
