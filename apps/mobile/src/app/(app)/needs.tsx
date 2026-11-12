import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { HandHeartIcon, PlusIcon } from "lucide-react-native";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { api } from "@/api/client";
import type { VolunteerNeed } from "@/api/types";
import { NeedForm } from "@/need-form";
import { Badge, Button, EmptyState, ErrorText, FormField, Input, ListRow, Loading, Menu, PageTitle, Panel, Screen, Select, Sheet } from "@/ui";
import { useOrgQuery, useWorkspace } from "@/workspace";

const statuses = [
  { value: "all", label: "Any status" },
  { value: "pending_approval", label: "Pending review" },
  { value: "published", label: "Published" },
  { value: "rejected", label: "Rejected" },
];
const sorts = [
  { value: "status", label: "Status" },
  { value: "name", label: "Name A–Z" },
  { value: "name-desc", label: "Name Z–A" },
  { value: "type", label: "Type" },
  { value: "filled", label: "Most filled" },
  { value: "start", label: "Start date" },
];

function statusLabel(status: string | undefined) {
  return statuses.find((item) => item.value === status)?.label ?? "Published";
}

export default function NeedsScreen() {
  const { organization, permissions } = useWorkspace();
  const client = useQueryClient();
  const needs = useOrgQuery("needs", (organizationId) => api.needs(organizationId));
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [visibility, setVisibility] = useState("all");
  const [sort, setSort] = useState("status");
  const canApprove = permissions.includes("approve_needs");
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteNeed(id),
    onSuccess: () => client.invalidateQueries({ queryKey: ["needs", organization.id] }),
  });
  const decide = useMutation({
    mutationFn: (input: { id: string; status: "published" | "rejected" }) => api.decideNeed(input.id, input.status),
    onSuccess: () => client.invalidateQueries({ queryKey: ["needs", organization.id] }),
  });

  const items = useMemo(() => {
    const text = search.trim().toLowerCase();
    const filtered = (needs.data?.items ?? []).filter((need) => {
      if (text && !need.name.toLowerCase().includes(text)) return false;
      if (status !== "all" && (need.status ?? "published") !== status) return false;
      if (type !== "all" && need.type !== type) return false;
      if (visibility === "public" && !need.allowPublic) return false;
      if (visibility === "private" && need.allowPublic) return false;
      return true;
    });
    const rank = (need: VolunteerNeed) => (need.status === "pending_approval" ? 0 : need.status === "published" ? 1 : 2);
    return filtered.sort((left, right) => {
      if (sort === "name") return left.name.localeCompare(right.name);
      if (sort === "name-desc") return right.name.localeCompare(left.name);
      if (sort === "type") return left.type.localeCompare(right.type);
      if (sort === "filled") return right.countVetted / right.countNeeded - left.countVetted / left.countNeeded;
      if (sort === "start") return (left.startDate ?? "").localeCompare(right.startDate ?? "");
      return rank(left) - rank(right) || left.name.localeCompare(right.name);
    });
  }, [needs.data?.items, search, sort, status, type, visibility]);

  if (needs.isLoading) return <Loading />;

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <PageTitle description="Positions and tasks that volunteers can sign up for." title="Needs" />
        </View>
        <Button icon={PlusIcon} label="Add need" onPress={() => setCreating(true)} />
      </View>
      <FormField label="Search">
        <Input onChangeText={setSearch} placeholder="Search needs" value={search} />
      </FormField>
      <Select label="Status" onChange={setStatus} options={statuses} value={status} />
      <Select label="Type" onChange={setType} options={[{ value: "all", label: "Any type" }, { value: "Position", label: "Position" }, { value: "Task", label: "Task" }]} value={type} />
      <Select label="Visibility" onChange={setVisibility} options={[{ value: "all", label: "Any visibility" }, { value: "public", label: "Public" }, { value: "private", label: "Private" }]} value={visibility} />
      <Select label="Sort" onChange={setSort} options={sorts} value={sort} />
      <ErrorText error={needs.error ?? remove.error ?? decide.error} />
      <Panel>
        {items.length === 0 ? (
          <EmptyState description="Create a need to start recruiting." icon={HandHeartIcon} title="No needs yet" />
        ) : (
          items.map((need) => (
            <ListRow
              detail={`${statusLabel(need.status)} · ${need.allowPublic ? "Public" : "Private"}${need.requireVetting ? " · Vetting" : ""}`}
              key={need.id}
              onPress={() => router.push(`/needs/${need.id}`)}
              right={
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Badge label={`${need.countVetted}/${need.countNeeded}`} tone="secondary" />
                  <Menu
                    align="end"
                    items={[
                      ...(canApprove && need.status === "pending_approval"
                        ? [
                            { label: "Publish", onPress: () => decide.mutate({ id: need.id, status: "published" as const }) },
                            { label: "Reject", onPress: () => decide.mutate({ id: need.id, status: "rejected" as const }) },
                          ]
                        : []),
                      { label: "Delete", destructive: true, onPress: () => remove.mutate(need.id) },
                    ]}
                    trigger={(open) => <Button label="…" onPress={open} variant="ghost" />}
                    width={160}
                  />
                </View>
              }
              title={`${need.name} · ${need.type}`}
            />
          ))
        )}
      </Panel>
      <Sheet onClose={() => setCreating(false)} open={creating} title="New need">
        <NeedForm onSaved={() => setCreating(false)} />
      </Sheet>
    </Screen>
  );
}
