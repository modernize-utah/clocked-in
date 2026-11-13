"use client";

import { useMemo, useState } from "react";
import { createRoleAction, deleteRoleAction, updateRoleAction } from "@/app/actions/roles";
import { Field } from "@/components/field";
import { SelectField } from "@/components/select-field";
import { PageSkeleton } from "@/components/skeletons";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useOrganization, useWorkspace } from "@/hooks/use-workspace";
import { permissionGroups } from "@/lib/permissions";
import { keys } from "@/lib/queries";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/fetch-json";
import type { Paged } from "@/lib/types";

type OrgRole = {
  id: string;
  code: string;
  name: string;
  organizationId: string | null;
  isSystem: boolean;
  scope: string;
  permissions: string[];
};

export function RolesView() {
  const organization = useOrganization();
  const { permissions, viewer } = useWorkspace();
  const canManage = permissions.includes("manage_roles");
  const { data, isPending } = useQuery({
    queryKey: ["org", organization.id, "roles"],
    queryFn: ({ signal }) => fetchJson<Paged<OrgRole>>(`/organizations/${organization.id}/roles?limit=100`, signal),
  });
  const roles = data?.items ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = roles.find((role) => role.id === selectedId) ?? roles[0] ?? null;

  if (isPending) return <PageSkeleton />;

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Roles</CardTitle>
          <CardDescription>System roles stay, and you can add ones this organization needs.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {roles.map((role) => (
            <button
              key={role.id}
              type="button"
              className={`rounded-md border px-3 py-2 text-left text-sm ${selected?.id === role.id ? "border-primary bg-muted" : ""}`}
              onClick={() => setSelectedId(role.id)}
            >
              <span className="font-medium">{role.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">{role.isSystem ? "System" : "Custom"}</span>
            </button>
          ))}
          {canManage ? <CreateRoleForm /> : null}
        </CardContent>
      </Card>
      {selected ? (
        <RoleEditor
          key={selected.id}
          role={selected}
          canManage={canManage}
          isSuperAdmin={viewer.isSuperAdmin}
        />
      ) : null}
    </div>
  );
}

function CreateRoleForm() {
  const organization = useOrganization();
  const [name, setName] = useState("");
  const create = useActionMutation(
    () => createRoleAction(organization.id, { name, permissions: ["log_own_time"], scope: "assigned_groups" }),
    { invalidate: [["org", organization.id, "roles"]], onSuccess: () => setName("") },
  );
  return (
    <form
      className="mt-4 flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate();
      }}
    >
      <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="New role name" className="h-9" />
      <SubmitButton pending={create.isPending} className="h-9">
        Create
      </SubmitButton>
    </form>
  );
}

function RoleEditor({
  role,
  canManage,
  isSuperAdmin,
}: {
  role: OrgRole;
  canManage: boolean;
  isSuperAdmin: boolean;
}) {
  const organization = useOrganization();
  const canEditSystemRole = isSuperAdmin;
  const canEditName = canManage && (!role.isSystem || canEditSystemRole);
  const canEditScope = canManage && (!role.isSystem || canEditSystemRole);
  const canEditPermissions = canManage && (!role.isSystem || canEditSystemRole);
  const [name, setName] = useState(role.name);
  const [scope, setScope] = useState(role.scope);
  const [granted, setGranted] = useState<string[]>(role.permissions);
  const save = useActionMutation(
    () => updateRoleAction(organization.id, role.id, { name, scope, permissions: granted }),
    { invalidate: [["org", organization.id, "roles"], keys.members(organization.id)] },
  );
  const remove = useActionMutation(() => deleteRoleAction(organization.id, role.id), {
    invalidate: [["org", organization.id, "roles"]],
  });
  const selected = useMemo(() => new Set(granted), [granted]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{role.name}</CardTitle>
        <CardDescription>
          {role.isSystem
            ? canEditSystemRole
              ? "System role. You can change its name, scope, and permissions. You cannot delete it."
              : "System role. A SuperAdmin can change it. You cannot delete it."
            : "Custom role for this organization."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Field label="Name">
          <Input value={name} onChange={(event) => setName(event.target.value)} disabled={!canEditName} className="h-9" />
        </Field>
        <Field label="Scope">
          <SelectField
            value={scope}
            onValueChange={setScope}
            disabled={!canEditScope}
            options={[
              { value: "organization", label: "Whole organization" },
              { value: "assigned_groups", label: "Assigned groups" },
              { value: "self", label: "Own records" },
            ]}
          />
        </Field>
        {permissionGroups.map((group) => (
          <div key={group.label} className="flex flex-col gap-2">
            <p className="text-sm font-medium">{group.label}</p>
            {group.items.map((item) => (
              <label key={item.key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selected.has(item.key)}
                  disabled={!canEditPermissions}
                  onCheckedChange={(checked) => {
                    setGranted((current) =>
                      checked === true ? [...new Set([...current, item.key])] : current.filter((key) => key !== item.key),
                    );
                  }}
                />
                {item.label}
              </label>
            ))}
          </div>
        ))}
        {canManage && (!role.isSystem || canEditSystemRole) ? (
          <div className="flex gap-2">
            <SubmitButton pending={save.isPending} onClick={() => save.mutate()}>
              Save
            </SubmitButton>
            {!role.isSystem ? (
              <Button type="button" variant="outline" onClick={() => remove.mutate()}>
                Delete
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
