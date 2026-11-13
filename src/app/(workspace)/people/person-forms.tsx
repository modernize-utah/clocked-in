"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createPersonAction, updateMemberAction, type MemberPatch, type NewPerson } from "@/app/actions/members";
import { DialogActions } from "@/components/dialog-actions";
import { EntityFormDialog } from "@/components/entity-forms/entity-form-dialog";
import { Field, FormMessage } from "@/components/field";
import { SelectField } from "@/components/select-field";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useOrganization } from "@/hooks/use-workspace";
import { keys, userQuery } from "@/lib/queries";
import type { Membership } from "@/lib/types";
import { DepartmentChecks, GroupAssignment, useOrgRoleOptions } from "./member-shared";
import { PersonIdentityFields, readPersonIdentity } from "@/components/entity-forms/person-identity-fields";

export function PersonDialog({
  open,
  onOpenChange,
  member,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member?: Membership | null;
}) {
  return (
    <EntityFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={member ? "Edit person" : "Add person"}
      description={member ? "Update their membership and profile." : "Create an account with a temporary password."}
      className="sm:max-w-lg"
    >
      {member ? (
        <EditPersonForm member={member} onCancel={() => onOpenChange(false)} onSaved={() => onOpenChange(false)} />
      ) : (
        <AddPersonForm onCancel={() => onOpenChange(false)} onSaved={() => onOpenChange(false)} />
      )}
    </EntityFormDialog>
  );
}

export function AddPersonForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const organization = useOrganization();
  const roleOptions = useOrgRoleOptions();
  const [role, setRole] = useState("VOLUNTEER");
  const [groups, setGroups] = useState<GroupAssignment[]>([]);
  const [emailUser, setEmailUser] = useState(true);
  const create = useActionMutation((input: NewPerson) => createPersonAction(organization.id, input), {
    invalidate: [keys.members(organization.id)],
    errorToast: false,
    onSuccess: onSaved,
  });

  return (
    <form
      id="add-person-form"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        create.mutate({
          ...readPersonIdentity(data),
          role,
          departmentIds: groups.map((group) => group.departmentId),
          managedDepartmentIds: groups.filter((group) => group.manager).map((group) => group.departmentId),
          emailUser,
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <PersonIdentityFields idPrefix="add" />
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={emailUser} onCheckedChange={(checked) => setEmailUser(checked === true)} />
            Email user
          </label>
          <p className="text-xs text-muted-foreground">
            They will get an email with their username and temporary password.
          </p>
        </div>
        <Field label="Role">
          <SelectField value={role} onValueChange={setRole} options={roleOptions} className="h-9" />
        </Field>
      </div>
      <DepartmentChecks value={groups} onChange={setGroups} />
      <FormMessage result={create.error ? { ok: false, error: create.error.message } : null} />
      <DialogActions form="add-person-form">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton pending={create.isPending}>Add person</SubmitButton>
      </DialogActions>
    </form>
  );
}

export function EditPersonForm({
  member,
  onCancel,
  onSaved,
}: {
  member: Membership;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const organization = useOrganization();
  const roleOptions = useOrgRoleOptions();
  const [role, setRole] = useState(member.role.code);
  const [groups, setGroups] = useState<GroupAssignment[]>(
    (member.departmentIds ?? []).map((departmentId) => ({
      departmentId,
      manager: (member.managedDepartmentIds ?? []).includes(departmentId),
    })),
  );
  const [profile, setProfile] = useState({
    email: member.user.email ?? "",
    firstName: member.user.firstName ?? "",
    lastName: member.user.lastName ?? "",
    displayName: member.user.displayName ?? "",
    timezone: "UTC",
    phone: "",
    zipCode: "",
    notes: "",
  });
  const save = useActionMutation(
    (patch: MemberPatch) => updateMemberAction(organization.id, member.id, patch),
    { invalidate: [keys.members(organization.id), keys.user(member.userId)], errorToast: false, onSuccess: onSaved },
  );

  const userDetail = useQuery(userQuery(member.userId));
  const [profileLoaded, setProfileLoaded] = useState(false);
  if (!profileLoaded && userDetail.data?.profile) {
    const loaded = userDetail.data.profile;
    setProfileLoaded(true);
    setProfile({
      email: userDetail.data.email,
      firstName: loaded.firstName,
      lastName: loaded.lastName,
      displayName: loaded.displayName ?? "",
      timezone: loaded.timezone,
      phone: loaded.phone ?? "",
      zipCode: loaded.zipCode ?? "",
      notes: loaded.notes ?? "",
    });
  }

  return (
    <form
      id="edit-person-form"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({
          role,
          departmentIds: groups.map((group) => group.departmentId),
          managedDepartmentIds: groups.filter((group) => group.manager).map((group) => group.departmentId),
          email: profile.email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          displayName: profile.displayName.trim() || null,
          timezone: profile.timezone,
          phone: profile.phone.trim() || null,
          zipCode: profile.zipCode.trim() || null,
          notes: profile.notes.trim() || null,
        });
      }}
    >
      <Tabs defaultValue="membership">
        <TabsList>
          <TabsTrigger value="membership">Membership</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
        </TabsList>
        <TabsContent value="membership" className="mt-4 flex flex-col gap-4">
          <Field label="Role">
            <SelectField value={role} onValueChange={setRole} options={roleOptions} className="h-9" />
          </Field>
          <DepartmentChecks value={groups} onChange={setGroups} />
        </TabsContent>
        <TabsContent value="profile" className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Email" htmlFor="edit-email" className="sm:col-span-2" hint="Invite and password codes go to this address.">
            <Input
              id="edit-email"
              type="email"
              autoComplete="email"
              value={profile.email}
              onChange={(event) => setProfile({ ...profile, email: event.target.value })}
              required
              maxLength={254}
              className="h-9"
            />
          </Field>
          <Field label="First name" htmlFor="edit-firstName">
            <Input
              id="edit-firstName"
              value={profile.firstName}
              onChange={(event) => setProfile({ ...profile, firstName: event.target.value })}
              required
              className="h-9"
            />
          </Field>
          <Field label="Last name" htmlFor="edit-lastName">
            <Input
              id="edit-lastName"
              value={profile.lastName}
              onChange={(event) => setProfile({ ...profile, lastName: event.target.value })}
              required
              className="h-9"
            />
          </Field>
          <Field label="Display name" htmlFor="edit-displayName" className="sm:col-span-2">
            <Input
              id="edit-displayName"
              value={profile.displayName}
              onChange={(event) => setProfile({ ...profile, displayName: event.target.value })}
              className="h-9"
            />
          </Field>
          <Field label="Timezone" htmlFor="edit-timezone">
            <Input
              id="edit-timezone"
              value={profile.timezone}
              onChange={(event) => setProfile({ ...profile, timezone: event.target.value })}
              className="h-9"
            />
          </Field>
          <Field label="Phone" htmlFor="edit-phone">
            <Input
              id="edit-phone"
              value={profile.phone}
              onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
              className="h-9"
            />
          </Field>
          <Field label="Zip code" htmlFor="edit-zipCode">
            <Input
              id="edit-zipCode"
              value={profile.zipCode}
              onChange={(event) => setProfile({ ...profile, zipCode: event.target.value })}
              className="h-9"
            />
          </Field>
          <Field label="Notes" htmlFor="edit-notes" className="sm:col-span-2">
            <Textarea
              id="edit-notes"
              value={profile.notes}
              onChange={(event) => setProfile({ ...profile, notes: event.target.value })}
              className="min-h-24"
            />
          </Field>
        </TabsContent>
      </Tabs>
      <FormMessage result={save.error ? { ok: false, error: save.error.message } : null} />
      <DialogActions form="edit-person-form">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton pending={save.isPending}>Save</SubmitButton>
      </DialogActions>
    </form>
  );
}
