import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { EllipsisIcon, LinkIcon, PlusIcon, ShieldIcon, UserPlusIcon, UsersIcon, XIcon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "@/api/client";
import type { Invitation, Membership } from "@/api/types";
import { formatPersonName } from "@/format";
import { permissionGroups } from "@/gates";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorText,
  Field,
  IconButton,
  ListRow,
  Loading,
  Menu,
  Muted,
  PageTitle,
  Panel,
  PanelHeader,
  Screen,
  Section,
  SectionNav,
  Select,
  Sheet,
} from "@/ui";
import { useLookups, useOrgQuery, useWorkspace } from "@/workspace";

const roles = [
  { value: "VOLUNTEER", label: "Volunteer" },
  { value: "MEMBER", label: "Staff" },
  { value: "ADMIN", label: "Admin" },
];

const relationships = ["Parent", "Child", "Spouse", "Sibling", "Grandparent", "Grandchild", "Guardian", "Dependent", "Friend", "Colleague", "Associate"].map(
  (value) => ({ value, label: value }),
);

const scopes = [
  { value: "organization", label: "Whole organization" },
  { value: "assigned_groups", label: "Assigned groups" },
  { value: "self", label: "Own time only" },
];

type PeopleView = "people" | "invites" | "connections" | "roles";

function inviteStatus(invitation: Invitation) {
  if (invitation.acceptedAt) return { label: "Accepted", tone: "success" as const };
  if (invitation.revokedAt) return { label: "Revoked", tone: "outline" as const };
  if (new Date(invitation.expiresAt).getTime() <= Date.now()) return { label: "Expired", tone: "outline" as const };
  return { label: "Pending", tone: "secondary" as const };
}

export default function PeopleScreen() {
  const { organization, isAdmin, isCoordinator, groupDepartments, permissions, viewer } = useWorkspace();
  const { lookups } = useLookups();
  const client = useQueryClient();
  const [view, setView] = useState<PeopleView>("people");
  const members = useOrgQuery("members", (organizationId) => api.memberships(organizationId));
  const invitations = useOrgQuery("invitations", (organizationId) => api.invitations(organizationId), view === "invites" && isAdmin);
  const groupIds = groupDepartments === "all" ? [] : groupDepartments;
  const departmentInvites = useQuery({
    queryKey: ["dept-invites", organization.id, groupIds],
    enabled: view === "invites" && !isAdmin && groupIds.length > 0,
    queryFn: async () => {
      const pages = await Promise.all(groupIds.map((id) => api.departmentInvitations(id)));
      return pages.flatMap((page) => page.items);
    },
  });
  const requests = useOrgQuery(
    "access-requests",
    (organizationId) => api.accessRequests(organizationId),
    view === "invites" && (isAdmin || permissions.includes("approve_access_requests")),
  );
  const connections = useOrgQuery("connections", (organizationId) => api.connections(organizationId), view === "connections");
  const rolesQuery = useOrgQuery("roles", (organizationId) => api.roles(organizationId), view === "roles");
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("VOLUNTEER");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [userId, setUserId] = useState("");
  const [connectedUserId, setConnectedUserId] = useState("");
  const [relationship, setRelationship] = useState("Colleague");
  const [roleName, setRoleName] = useState("");
  const [inviteGroup, setInviteGroup] = useState(groupIds[0] ?? "");
  const [error, setError] = useState<unknown>(null);
  const [profile, setProfile] = useState<Membership | null>(null);
  const [editing, setEditing] = useState<Membership | null>(null);
  const [editTab, setEditTab] = useState<"membership" | "profile">("membership");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [roleEditor, setRoleEditor] = useState<string | null>(null);
  const preview = useQuery({
    queryKey: ["username-preview", firstName, lastName],
    enabled: view === "invites" && firstName.trim().length > 0 && lastName.trim().length > 0,
    queryFn: () => api.usernamePreview(firstName.trim(), lastName.trim()),
  });

  async function refresh() {
    setError(null);
    await Promise.all(
      ["members", "invitations", "connections", "roles", "access-requests", "dept-invites"].map((key) =>
        client.invalidateQueries({ queryKey: [key, organization.id] }),
      ),
    );
  }

  const coordinatorOnly = isCoordinator && !isAdmin;
  const inviteRoles = coordinatorOnly ? roles.filter((item) => item.value !== "ADMIN") : roles;
  const invite = useMutation({
    mutationFn: () => {
      const body = {
        email: email.trim(),
        role,
        firstName: firstName.trim() || "Volunteer",
        lastName: lastName.trim() || "Invitee",
        username: preview.data?.username,
      };
      return coordinatorOnly
        ? api.createDepartmentInvitation(inviteGroup, body)
        : api.createInvitation(organization.id, body);
    },
    onSuccess: async () => {
      setEmail("");
      setFirstName("");
      setLastName("");
      await refresh();
    },
    onError: setError,
  });

  const addPerson = useMutation({
    mutationFn: () =>
      api.createMembership(organization.id, {
        email: email.trim(),
        username: username.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role,
      }),
    onSuccess: async () => {
      setAdding(false);
      setFirstName("");
      setLastName("");
      setEmail("");
      setUsername("");
      setPassword("");
      await refresh();
    },
    onError: setError,
  });

  const connect = useMutation({
    mutationFn: () => api.createConnection(organization.id, { userId, connectedUserId, relationship }),
    onSuccess: refresh,
    onError: setError,
  });

  const createRole = useMutation({
    mutationFn: () => api.createRole(organization.id, { name: roleName.trim(), scope: "self", permissions: ["log_own_time"] }),
    onSuccess: async () => {
      setRoleName("");
      await refresh();
    },
    onError: setError,
  });

  const saveMember = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.updateMembership(organization.id, editing!.id, body),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
    onError: setError,
  });

  const removePeople = useMutation({
    mutationFn: (ids: string[]) => (ids.length === 1 ? api.deleteMembership(organization.id, ids[0]) : api.deleteMemberships(organization.id, ids)),
    onSuccess: async () => {
      setConfirmDelete(false);
      setSelected([]);
      setSelecting(false);
      await refresh();
    },
    onError: setError,
  });

  if (members.isLoading) return <Loading />;
  const departmentName = (id: string) => lookups?.departments.find((item) => item.id === id)?.name ?? "Group";
  const visible = (members.data?.items ?? []).filter((member) => {
    if (groupDepartments === "all" || isAdmin) return true;
    return (member.departmentIds ?? []).some((id) => groupDepartments.includes(id)) || member.userId === viewer.id;
  });
  const options = visible.filter((member) => member.isActive).map((member) => ({ value: member.userId, label: formatPersonName(member.user) }));
  const inviteItems = isAdmin ? (invitations.data?.items ?? []) : (departmentInvites.data ?? []);
  const pending = inviteItems.filter((invitation) => !invitation.acceptedAt && !invitation.revokedAt);
  const openRequests = (requests.data?.items ?? []).filter((item) => item.status === "pending");
  const editedRole = rolesQuery.data?.items.find((item) => item.id === roleEditor) ?? null;

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <PageTitle title="People" />
        </View>
        {view === "people" ? <Button icon={PlusIcon} label="Add person" onPress={() => setAdding(true)} /> : null}
      </View>
      <SectionNav
        items={[
          { id: "people" as const, label: "People", icon: UsersIcon },
          { id: "invites" as const, label: "Invites", icon: UserPlusIcon },
          ...(isAdmin
            ? [
                { id: "connections" as const, label: "Connections", icon: LinkIcon },
                { id: "roles" as const, label: "Roles", icon: ShieldIcon },
              ]
            : []),
        ]}
        onChange={setView}
        value={view}
      />
      <ErrorText error={error} />

      {view === "people" ? (
        <Panel>
          <PanelHeader
            description={`${visible.filter((member) => member.isActive).length} active`}
            title="Members"
            action={
              <Button
                label={selecting ? "Done" : "Select"}
                onPress={() => {
                  setSelecting((current) => !current);
                  setSelected([]);
                }}
                variant="ghost"
              />
            }
          />
          {selecting && selected.length ? (
            <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
              <Button
                label="Add time"
                onPress={() => {
                  const person = visible.find((member) => member.id === selected[0])?.userId;
                  router.push(person ? { pathname: "/log", params: { view: "member", person } } : { pathname: "/log", params: { view: "member" } });
                }}
                variant="outline"
              />
              <Button label="Delete" onPress={() => setConfirmDelete(true)} variant="ghost" />
            </View>
          ) : null}
          {visible.length === 0 ? <EmptyState icon={UsersIcon} title="No members yet" /> : null}
          {visible.map((member) => {
            const groups = (member.departmentIds ?? []).map(departmentName).join(", ");
            const on = selected.includes(member.id);
            return (
              <ListRow
                detail={[member.user.email, groups].filter(Boolean).join(" · ")}
                key={member.id}
                onPress={() => {
                  if (selecting) {
                    setSelected((current) => (on ? current.filter((id) => id !== member.id) : [...current, member.id]));
                    return;
                  }
                  setProfile(member);
                }}
                right={
                  selecting ? (
                    <Badge label={on ? "Selected" : "Select"} tone={on ? "success" : "outline"} />
                  ) : (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      {!member.isActive ? <Badge label="Inactive" tone="outline" /> : null}
                      <Badge label={roles.find((item) => item.value === member.role.code)?.label ?? member.role.name} tone="secondary" />
                      <Menu
                        align="end"
                        items={[
                          { label: "Edit", onPress: () => { setEditTab("membership"); setEditing(member); } },
                          { label: "Add time", onPress: () => router.push({ pathname: "/log", params: { view: "member", person: member.userId } }) },
                          {
                            label: member.isActive ? "Deactivate" : "Activate",
                            onPress: () => void api.updateMembership(organization.id, member.id, { isActive: !member.isActive }).then(refresh).catch(setError),
                          },
                          { label: "Remove", destructive: true, onPress: () => { setSelected([member.id]); setConfirmDelete(true); } },
                        ]}
                        trigger={(open) => <IconButton icon={EllipsisIcon} label="Member actions" onPress={open} size={32} />}
                      />
                    </View>
                  )
                }
                title={`${selecting && on ? "✓ " : ""}${formatPersonName(member.user)}`}
              />
            );
          })}
        </Panel>
      ) : null}

      {view === "invites" ? (
        <>
          <Section description="They get an email with a link to join." icon={UserPlusIcon} title="Invite someone">
            <Field autoCapitalize="words" label="First name" onChangeText={setFirstName} value={firstName} />
            <Field autoCapitalize="words" label="Last name" onChangeText={setLastName} value={lastName} />
            {preview.data?.username ? <Muted>Username: {preview.data.username}</Muted> : null}
            <Field autoComplete="email" keyboardType="email-address" label="Email" onChangeText={setEmail} value={email} />
            <Select label="Role" onChange={setRole} options={inviteRoles} value={role} />
            {coordinatorOnly ? (
              <Select
                label="Group"
                onChange={setInviteGroup}
                options={groupIds.map((id) => ({ value: id, label: departmentName(id) }))}
                value={inviteGroup}
              />
            ) : null}
            <Button
              disabled={!email.includes("@") || (coordinatorOnly && !inviteGroup)}
              label="Send invite"
              onPress={() => invite.mutate()}
              pending={invite.isPending}
            />
          </Section>
          <Panel>
            <PanelHeader description={`${pending.length} pending`} title="Invites" />
            {inviteItems.map((invitation) => {
              const status = inviteStatus(invitation);
              return (
                <ListRow
                  detail={invitation.role.name}
                  key={invitation.id}
                  right={
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Badge label={status.label} tone={status.tone} />
                      {status.label === "Pending" && !invitation.departmentId ? (
                        <Button
                          label="Resend"
                          onPress={() => void api.resendInvitation(organization.id, invitation.id).then(refresh).catch(setError)}
                          variant="ghost"
                        />
                      ) : null}
                      {status.label === "Pending" ? (
                        <IconButton
                          icon={XIcon}
                          label="Revoke invite"
                          onPress={() =>
                            void (invitation.departmentId
                              ? api.revokeDepartmentInvitation(invitation.departmentId, invitation.id)
                              : api.revokeInvitation(organization.id, invitation.id)
                            )
                              .then(refresh)
                              .catch(setError)
                          }
                          size={32}
                        />
                      ) : null}
                    </View>
                  }
                  title={invitation.email}
                />
              );
            })}
          </Panel>
          {openRequests.length ? (
            <Panel>
              <PanelHeader description={`${openRequests.length} waiting`} title="Access requests" />
              {openRequests.map((request) => (
                <ListRow
                  detail={[request.requestedRole?.name, request.message].filter(Boolean).join(" · ")}
                  key={request.id}
                  right={
                    <View style={{ gap: 4 }}>
                      <Button
                        label="Approve"
                        onPress={() => void api.decideAccessRequest(organization.id, request.id, "approved").then(refresh).catch(setError)}
                      />
                      <Button
                        label="Decline"
                        onPress={() => void api.decideAccessRequest(organization.id, request.id, "declined").then(refresh).catch(setError)}
                        variant="outline"
                      />
                    </View>
                  }
                  title={request.name || request.email}
                />
              ))}
            </Panel>
          ) : null}
        </>
      ) : null}

      {view === "connections" ? (
        <>
          <Section description="Connected people can log time for each other." icon={LinkIcon} title="Connect two people">
            <Select label="Person" onChange={setUserId} options={options} searchable value={userId} />
            <Select label="Connected person" onChange={setConnectedUserId} options={options} searchable value={connectedUserId} />
            <Select label="Relationship" onChange={setRelationship} options={relationships} value={relationship} />
            <Button disabled={!userId || !connectedUserId} label="Connect" onPress={() => connect.mutate()} pending={connect.isPending} />
          </Section>
          <Panel>
            <PanelHeader title="Connections" />
            {(connections.data?.items ?? []).map((connection) => (
              <ListRow
                detail={connection.relationship}
                key={connection.id}
                right={
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <View style={{ width: 140 }}>
                      <Select
                        label="Relationship"
                        onChange={(value) => void api.updateConnection(connection.id, value).then(refresh).catch(setError)}
                        options={relationships}
                        value={connection.relationship}
                      />
                    </View>
                    <IconButton
                      icon={XIcon}
                      label="Remove connection"
                      onPress={() => void api.deleteConnection(connection.id).then(refresh).catch(setError)}
                      size={32}
                    />
                  </View>
                }
                title={`${formatPersonName(connection.userA)} and ${formatPersonName(connection.userB)}`}
              />
            ))}
          </Panel>
        </>
      ) : null}

      {view === "roles" ? (
        <>
          <Section description="Custom roles start with own-time logging. System roles stay read-only." icon={ShieldIcon} title="Create a role">
            <Field autoCapitalize="words" label="Name" onChangeText={setRoleName} value={roleName} />
            <Button disabled={roleName.trim().length < 2} label="Create role" onPress={() => createRole.mutate()} pending={createRole.isPending} />
          </Section>
          <Panel>
            <PanelHeader title="Roles" />
            {(rolesQuery.data?.items ?? []).map((item) => (
              <ListRow
                detail={`${scopes.find((scope) => scope.value === item.scope)?.label ?? item.scope} · ${item.permissions.length} permissions`}
                key={item.id}
                onPress={item.isSystem ? undefined : () => setRoleEditor(item.id)}
                right={item.isSystem ? <Badge label="System" tone="outline" /> : <Badge label="Edit" tone="secondary" />}
                title={item.name}
              />
            ))}
          </Panel>
        </>
      ) : null}

      <Sheet description="They choose a new password the first time they sign in." onClose={() => setAdding(false)} open={adding} title="Add person">
        <Field autoCapitalize="words" label="First name" onChangeText={setFirstName} value={firstName} />
        <Field autoCapitalize="words" label="Last name" onChangeText={setLastName} value={lastName} />
        <Field autoComplete="email" keyboardType="email-address" label="Email" onChangeText={setEmail} value={email} />
        <Field label="Username" onChangeText={setUsername} value={username} />
        <Field label="Temporary password" onChangeText={setPassword} secureTextEntry value={password} />
        <Select label="Role" onChange={setRole} options={roles} value={role} />
        <ErrorText error={error} />
        <Button
          disabled={firstName.trim().length < 1 || !email.includes("@") || username.trim().length < 3 || password.length < 8}
          label="Add person"
          onPress={() => addPerson.mutate()}
          pending={addPerson.isPending}
        />
      </Sheet>

      <Sheet onClose={() => setProfile(null)} open={Boolean(profile)} title={profile ? formatPersonName(profile.user) : "Person"}>
        {profile ? (
          <View style={{ gap: 8 }}>
            <Muted>{profile.user.email}</Muted>
            <Muted>{roles.find((item) => item.value === profile.role.code)?.label ?? profile.role.name}</Muted>
            <Muted>{profile.isActive ? "Active" : "Inactive"}</Muted>
            {(profile.departmentIds ?? []).length ? <Muted>{profile.departmentIds!.map(departmentName).join(", ")}</Muted> : null}
            {profile.orgUserTitle ? <Muted>{profile.orgUserTitle}</Muted> : null}
            <Button label="Edit" onPress={() => { setEditTab("membership"); setEditing(profile); setProfile(null); }} />
          </View>
        ) : null}
      </Sheet>

      {editing ? (
        <MemberEditor
          key={editing.id}
          member={editing}
          tab={editTab}
          onTab={setEditTab}
          onClose={() => setEditing(null)}
          pending={saveMember.isPending}
          error={saveMember.error}
          onSave={(body) => saveMember.mutate(body)}
          departments={(lookups?.departments ?? []).map((item) => ({ value: item.id, label: item.name }))}
        />
      ) : null}

      <RoleEditor
        key={editedRole?.id ?? "none"}
        role={editedRole}
        onClose={() => setRoleEditor(null)}
        onDelete={() => {
          if (!editedRole) return;
          void api.deleteRole(organization.id, editedRole.id).then(async () => {
            setRoleEditor(null);
            await refresh();
          }).catch(setError);
        }}
        onSave={(body) => {
          if (!editedRole) return;
          void api.updateRole(organization.id, editedRole.id, body).then(async () => {
            setRoleEditor(null);
            await refresh();
          }).catch(setError);
        }}
      />

      <ConfirmDialog
        confirmLabel="Remove"
        description="This removes the selected people from the organization."
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => removePeople.mutate(selected)}
        open={confirmDelete}
        pending={removePeople.isPending}
        title="Remove people"
      />
    </Screen>
  );
}

function MemberEditor({
  member,
  tab,
  onTab,
  onClose,
  onSave,
  pending,
  error,
  departments,
}: {
  member: Membership | null;
  tab: "membership" | "profile";
  onTab: (tab: "membership" | "profile") => void;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
  pending: boolean;
  error: unknown;
  departments: { value: string; label: string }[];
}) {
  const [role, setRole] = useState(member?.role.code ?? "VOLUNTEER");
  const [groups, setGroups] = useState<string[]>(member?.departmentIds ?? []);
  const [first, setFirst] = useState(member?.user.firstName ?? "");
  const [last, setLast] = useState(member?.user.lastName ?? "");
  const [display, setDisplay] = useState(member?.user.displayName ?? "");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState(member?.notes ?? "");
  const [title, setTitle] = useState(member?.orgUserTitle ?? "");
  return (
    <Sheet onClose={onClose} open={Boolean(member)} title="Edit person">
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label="Membership" onPress={() => onTab("membership")} variant={tab === "membership" ? "default" : "outline"} />
        <Button label="Profile" onPress={() => onTab("profile")} variant={tab === "profile" ? "default" : "outline"} />
      </View>
      {tab === "membership" ? (
        <>
          <Select label="Role" onChange={setRole} options={roles} value={role} />
          <Muted>Groups</Muted>
          {departments.map((department) => {
            const on = groups.includes(department.value);
            return (
              <Pressable
                key={department.value}
                onPress={() => setGroups((current) => (on ? current.filter((id) => id !== department.value) : [...current, department.value]))}
              >
                <Text>{on ? "✓ " : ""}{department.label}</Text>
              </Pressable>
            );
          })}
        </>
      ) : (
        <>
          <Field label="First name" onChangeText={setFirst} value={first} />
          <Field label="Last name" onChangeText={setLast} value={last} />
          <Field label="Display name" onChangeText={setDisplay} value={display} />
          <Field label="Title" onChangeText={setTitle} value={title} />
          <Field label="Phone" onChangeText={setPhone} placeholder="Leave blank to keep" value={phone} />
          <Field label="Organization notes" onChangeText={setNotes} value={notes} />
        </>
      )}
      <ErrorText error={error} />
      <Button
        label="Save"
        onPress={() =>
          onSave(
            tab === "membership"
              ? { role, departmentIds: groups }
              : { firstName: first, lastName: last, displayName: display, orgUserTitle: title, ...(phone.trim() ? { phone } : {}), notes: notes || null },
          )
        }
        pending={pending}
      />
    </Sheet>
  );
}

function RoleEditor({
  role,
  onClose,
  onSave,
  onDelete,
}: {
  role: { id: string; name: string; scope: string; permissions: string[]; isSystem: boolean } | null;
  onClose: () => void;
  onSave: (body: { scope: string; permissions: string[] }) => void;
  onDelete: () => void;
}) {
  const [scope, setScope] = useState(role?.scope ?? "self");
  const [permissions, setPermissions] = useState<string[]>(role?.permissions ?? []);
  return (
    <Sheet onClose={onClose} open={Boolean(role) && !role?.isSystem} title={role?.name ?? "Role"}>
      <Select label="Scope" onChange={setScope} options={scopes} value={scope} />
      {permissionGroups.map((group) => (
        <View key={group.label} style={{ gap: 6 }}>
          <Muted>{group.label}</Muted>
          {group.items.map((item) => {
            const on = permissions.includes(item.key);
            return (
              <Pressable
                key={item.key}
                onPress={() => setPermissions((current) => (on ? current.filter((key) => key !== item.key) : [...current, item.key]))}
              >
                <Text>{on ? "✓ " : ""}{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
      <Button label="Save role" onPress={() => onSave({ scope, permissions })} />
      <Button label="Delete role" onPress={onDelete} variant="ghost" />
    </Sheet>
  );
}
