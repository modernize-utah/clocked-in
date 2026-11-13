"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDownIcon, MoreVerticalIcon, PencilIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createConnectionAction, deleteConnectionAction, updateConnectionAction } from "@/app/actions/connections";
import { removeMemberAction, removeMembersAction, updateMemberAction, type MemberPatch } from "@/app/actions/members";
import { DialogActions } from "@/components/dialog-actions";
import { EntityFormDialog } from "@/components/entity-forms/entity-form-dialog";
import { TimeEntryDialog } from "@/components/entity-forms/time-entry-form";
import { Field } from "@/components/field";
import { SelectField } from "@/components/select-field";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageSkeleton } from "@/components/skeletons";
import { PersonProfileDialog } from "./person-profile-dialog";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useLabels } from "@/hooks/use-labels";
import { useLookups } from "@/hooks/use-lookups";
import { useMembers } from "@/hooks/use-members";
import { useOrganization, useWorkspace } from "@/hooks/use-workspace";
import { formatPersonName } from "@/lib/format";
import { connectionPersonName, memberRelationships, relationshipFor } from "@/lib/member-connection";
import { connectionsQuery, keys } from "@/lib/queries";
import type { Membership } from "@/lib/types";
import { departmentNames, emailPattern, roleLabel } from "./member-shared";
import { PersonDialog } from "./person-forms";

const relationshipOptions = memberRelationships.map((relationship) => ({ value: relationship, label: relationship }));

function removalDescription(count: number, organizationName: string) {
  const people = count === 1 ? "1 person" : `${count} people`;
  const history = count === 1 ? "Their account and time history stay." : "Their accounts and time history stay.";
  return `${people} will lose access to ${organizationName}. ${history}`;
}

function InlineEmail({
  email,
  name,
  pending,
  onSave,
}: {
  email: string;
  name: string;
  pending?: boolean;
  onSave: (email: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(email);
  const skipSave = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [previousEmail, setPreviousEmail] = useState(email);
  if (email !== previousEmail) {
    setPreviousEmail(email);
    if (!editing) setValue(email);
  }

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
  }, [editing]);

  function stopEditing(next = email) {
    skipSave.current = false;
    setValue(next);
    setEditing(false);
  }

  function commit(input: HTMLInputElement) {
    if (skipSave.current) {
      stopEditing();
      return;
    }

    const next = input.value.trim();
    if (next.toLowerCase() === email.trim().toLowerCase()) {
      stopEditing();
      return;
    }

    if (next.length > 254 || !emailPattern.test(next)) {
      toast.error("email must be an email address.");
      window.setTimeout(() => input.focus(), 0);
      return;
    }

    setValue(next);
    setEditing(false);
    void onSave(next).catch(() => setValue(email));
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        autoFocus
        type="email"
        inputMode="email"
        autoComplete="off"
        spellCheck={false}
        aria-label={`Email for ${name}`}
        value={value}
        disabled={pending}
        onChange={(event) => setValue(event.target.value)}
        onBlur={(event) => commit(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            skipSave.current = true;
            event.currentTarget.blur();
          }
        }}
        className="h-8"
      />
    );
  }

  return (
    <div className="flex w-full min-w-0 items-center gap-1.5">
      <span className="min-w-0 break-all text-sm text-muted-foreground">{value}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="ml-auto shrink-0 text-muted-foreground"
        aria-label={`Edit email for ${name}`}
        disabled={pending}
        onClick={() => {
          setValue(email);
          setEditing(true);
        }}
      >
        <PencilIcon />
      </Button>
    </div>
  );
}

function DepartmentSummary({ names }: { names: string[] }) {
  if (names.length === 0) return <span className="text-muted-foreground">—</span>;
  if (names.length === 1) return <span className="whitespace-normal break-words text-muted-foreground">{names[0]}</span>;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="text-left whitespace-normal break-words text-muted-foreground underline decoration-dotted underline-offset-2"
            aria-label={`${names.length} departments: ${names.join(", ")}`}
          />
        }
      >
        {names.length} departments
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <ul className="flex flex-col gap-0.5 text-left">
          {names.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

export function PeopleView() {
  const organization = useOrganization();
  const copy = useLabels();
  const { viewer, isAdmin, isCoordinator, groupDepartments } = useWorkspace();
  const { members: allMembers, isPending: membersPending } = useMembers();
  const members = isCoordinator
    ? allMembers.filter((member) => (member.departmentIds ?? []).some((id) => groupDepartments.includes(id)))
    : allMembers;
  const { lookups, isPending: lookupsPending } = useLookups();
  const [selected, setSelected] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editMember, setEditMember] = useState<Membership | null>(null);
  const [profileMember, setProfileMember] = useState<Membership | null>(null);
  const [connectionMember, setConnectionMember] = useState<Membership | null>(null);
  const [removeMember, setRemoveMember] = useState<Membership | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<Membership[] | null>(null);
  const [timeFor, setTimeFor] = useState<string[] | null>(null);
  const invalidate = [keys.members(organization.id)];
  const update = useActionMutation(
    ({ membershipId, patch }: { membershipId: string; patch: MemberPatch }) =>
      updateMemberAction(organization.id, membershipId, patch),
    { invalidate },
  );
  const [emailSavingId, setEmailSavingId] = useState<string | null>(null);
  const saveEmail = useActionMutation(
    ({ membershipId, email }: { membershipId: string; email: string }) =>
      updateMemberAction(organization.id, membershipId, { email }),
    { invalidate, silent: true, onSuccess: () => toast.success("Email saved.") },
  );

  async function saveMemberEmail(membershipId: string, email: string) {
    setEmailSavingId(membershipId);
    try {
      await saveEmail.mutateAsync({ membershipId, email });
    } finally {
      setEmailSavingId((current) => (current === membershipId ? null : current));
    }
  }
  const remove = useActionMutation((membershipId: string) => removeMemberAction(organization.id, membershipId), {
    invalidate,
    onSuccess: () => setRemoveMember(null),
  });
  const removeMany = useActionMutation(
    (membershipIds: string[]) => removeMembersAction(organization.id, membershipIds),
    {
      invalidate,
      onSuccess: () => {
        setPendingRemoval(null);
        setSelected([]);
      },
    },
  );

  const selectedIds = useMemo(() => new Set(selected), [selected]);
  const allSelected = members.length > 0 && members.every((member) => selectedIds.has(member.id));
  if (membersPending || lookupsPending) return <PageSkeleton rows={8} />;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>People</CardTitle>
          <CardDescription>
            Volunteers log their own time, and time for people they are connected to. Admins can log time for others.
            Removing someone leaves the account and their history.
          </CardDescription>
          <CardAction className="flex flex-col items-end gap-2">
            {isAdmin ? (
              <Button type="button" className="h-9" onClick={() => setAddOpen(true)}>
                Add person
              </Button>
            ) : null}
            {selected.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button type="button" variant="outline" className="h-9" />}>
                  Actions
                  <ChevronDownIcon data-icon="inline-end" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() =>
                      setTimeFor(members.filter((member) => selectedIds.has(member.id)).map((member) => member.userId))
                    }
                  >
                    Add time
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setPendingRemoval(members.filter((member) => selectedIds.has(member.id)))}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </CardAction>
        </CardHeader>
        <CardContent className="px-0">
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-9">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(checked) => {
                        setSelected(checked === true ? members.map((member) => member.id) : []);
                      }}
                      aria-label="Select all people"
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>{copy.departments}</TableHead>
                  <TableHead className="w-20">Status</TableHead>
                  <TableHead className="w-12 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id} data-state={selectedIds.has(member.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(member.id)}
                        onCheckedChange={(checked) => {
                          setSelected((current) =>
                            checked === true ? [...current, member.id] : current.filter((id) => id !== member.id),
                          );
                        }}
                        aria-label={`Select ${formatPersonName(member.user)}`}
                      />
                    </TableCell>
                    <TableCell className="whitespace-normal break-words leading-snug">
                      <button
                        type="button"
                        className="text-left font-medium hover:underline"
                        onClick={() => setProfileMember(member)}
                      >
                        {formatPersonName(member.user)}
                      </button>
                      {member.userId === viewer.id ? (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">you</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <InlineEmail
                        email={member.user.email ?? ""}
                        name={formatPersonName(member.user)}
                        pending={emailSavingId === member.id}
                        onSave={(email) => saveMemberEmail(member.id, email)}
                      />
                    </TableCell>
                    <TableCell className="max-w-36 whitespace-normal break-words leading-snug">
                      {roleLabel(member.role.code, member.role.name)}
                    </TableCell>
                    <TableCell className="max-w-44 whitespace-normal break-words leading-snug">
                      <DepartmentSummary names={departmentNames(member, lookups.departments)} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={member.isActive === false ? "outline" : "secondary"}>
                        {member.isActive === false ? "Inactive" : "Active"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <PersonActions
                        member={member}
                        onEdit={() => setEditMember(member)}
                        onRemove={() => setRemoveMember(member)}
                        onToggleActive={() =>
                          update.mutate({ membershipId: member.id, patch: { isActive: member.isActive === false } })
                        }
                        onAddTime={() => setTimeFor([member.userId])}
                        onAddConnection={isAdmin ? () => setConnectionMember(member) : undefined}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col gap-3 px-4 md:hidden">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(checked) => {
                  setSelected(checked === true ? members.map((member) => member.id) : []);
                }}
                aria-label="Select all people"
              />
              Select all
            </label>
            <ul className="flex flex-col gap-2">
              {members.map((member) => (
                <li
                  key={member.id}
                  className="rounded-xl border bg-background p-3 ring-1 ring-foreground/10 data-[state=selected]:bg-muted/40"
                  data-state={selectedIds.has(member.id) ? "selected" : undefined}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      className="mt-0.5"
                      checked={selectedIds.has(member.id)}
                      onCheckedChange={(checked) => {
                        setSelected((current) =>
                          checked === true ? [...current, member.id] : current.filter((id) => id !== member.id),
                        );
                      }}
                      aria-label={`Select ${formatPersonName(member.user)}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p>
                          <button
                            type="button"
                            className="text-left font-medium hover:underline"
                            onClick={() => setProfileMember(member)}
                          >
                            {formatPersonName(member.user)}
                          </button>
                          {member.userId === viewer.id ? (
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">you</span>
                          ) : null}
                        </p>
                        <PersonActions
                          member={member}
                          onEdit={() => setEditMember(member)}
                          onRemove={() => setRemoveMember(member)}
                          onToggleActive={() =>
                            update.mutate({ membershipId: member.id, patch: { isActive: member.isActive === false } })
                          }
                          onAddTime={() => setTimeFor([member.userId])}
                          onAddConnection={isAdmin ? () => setConnectionMember(member) : undefined}
                        />
                      </div>
                      <InlineEmail
                        email={member.user.email ?? ""}
                        name={formatPersonName(member.user)}
                        pending={emailSavingId === member.id}
                        onSave={(email) => saveMemberEmail(member.id, email)}
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span>{roleLabel(member.role.code, member.role.name)}</span>
                        <Badge variant={member.isActive === false ? "outline" : "secondary"}>
                          {member.isActive === false ? "Inactive" : "Active"}
                        </Badge>
                        <DepartmentSummary names={departmentNames(member, lookups.departments)} />
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
      <PersonProfileDialog
        member={profileMember}
        departmentNames={profileMember ? departmentNames(profileMember, lookups.departments) : []}
        timeZone={viewer.timezone}
        onOpenChange={(open) => {
          if (!open) setProfileMember(null);
        }}
      />
      <PersonDialog open={addOpen} onOpenChange={setAddOpen} />
      <PersonDialog
        open={Boolean(editMember)}
        onOpenChange={(open) => {
          if (!open) setEditMember(null);
        }}
        member={editMember}
      />
      <PersonConnectionDialog
        member={connectionMember}
        members={allMembers}
        onOpenChange={(open) => {
          if (!open) setConnectionMember(null);
        }}
      />
      <TimeEntryDialog
        open={Boolean(timeFor)}
        onOpenChange={(open) => {
          if (!open) setTimeFor(null);
        }}
        userId={timeFor?.length === 1 ? timeFor[0] : undefined}
        userIds={timeFor && timeFor.length > 1 ? timeFor : undefined}
      />
      <AlertDialog
        open={Boolean(pendingRemoval)}
        onOpenChange={(open) => {
          if (!open && !removeMany.isPending) setPendingRemoval(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from organization?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemoval ? removalDescription(pendingRemoval.length, organization.name) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMany.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={removeMany.isPending || !pendingRemoval?.length}
              onClick={() => {
                if (pendingRemoval?.length) removeMany.mutate(pendingRemoval.map((member) => member.id));
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(removeMember)}
        onOpenChange={(open) => {
          if (!open) setRemoveMember(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from organization?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeMember
                ? `${formatPersonName(removeMember.user)} will lose access to ${organization.name}. Their account and time history stay.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (removeMember) remove.mutate(removeMember.id);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PersonConnectionDialog({
  member,
  members,
  onOpenChange,
}: {
  member: Membership | null;
  members: Membership[];
  onOpenChange: (open: boolean) => void;
}) {
  const organization = useOrganization();
  const connections = useQuery({ ...connectionsQuery(organization.id), enabled: Boolean(member) });
  const [otherUserId, setOtherUserId] = useState("");
  const [relationship, setRelationship] = useState<string>(memberRelationships[0]);
  const invalidate = [keys.connections(organization.id)];

  const create = useActionMutation(
    (input: { userId: string; connectedUserId: string; relationship: string }) =>
      createConnectionAction(organization.id, input),
    {
      invalidate,
      onSuccess: () => {
        setOtherUserId("");
        onOpenChange(false);
      },
    },
  );
  const update = useActionMutation(
    (input: { connectionId: string; userId: string; relationship: string }) =>
      updateConnectionAction(organization.id, input.connectionId, {
        userId: input.userId,
        relationship: input.relationship,
      }),
    { invalidate },
  );
  const remove = useActionMutation(
    (connectionId: string) => deleteConnectionAction(organization.id, connectionId),
    { invalidate },
  );

  const linked = member
    ? (connections.data ?? []).filter(
        (connection) => connection.userAId === member.userId || connection.userBId === member.userId,
      )
    : [];
  const taken = new Set(linked.flatMap((connection) => [connection.userAId, connection.userBId]));
  const choices = member
    ? members
        .filter((item) => item.userId !== member.userId && item.isActive !== false && !taken.has(item.userId))
        .map((item) => ({ value: item.userId, label: connectionPersonName(item.user) }))
    : [];
  const targetName = member ? formatPersonName(member.user) : "";

  return (
    <EntityFormDialog
      open={Boolean(member)}
      onOpenChange={(open) => {
        if (!open) setOtherUserId("");
        onOpenChange(open);
      }}
      title={member ? `Add connection for ${targetName}` : "Add connection"}
      description={
        member
          ? `Link ${targetName} with another person so they can log time for each other. The relationship is how the selected person relates to ${targetName}.`
          : undefined
      }
      className="sm:max-w-lg"
    >
      {member ? (
        <form
          id="add-connection-form"
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!otherUserId) return;
            create.mutate({ userId: member.userId, connectedUserId: otherUserId, relationship });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Person">
              <SelectField
                aria-label="Person"
                value={otherUserId}
                onValueChange={setOtherUserId}
                options={choices}
                placeholder={choices.length ? "Select a person" : "No available people"}
                disabled={choices.length === 0}
                className="h-9"
              />
            </Field>
            <Field label="Relationship">
              <SelectField
                aria-label="Relationship"
                value={relationship}
                onValueChange={setRelationship}
                options={relationshipOptions}
                className="h-9"
              />
            </Field>
          </div>
          {linked.length > 0 ? (
            <div className="flex flex-col gap-2 border-t pt-3">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Current connections
              </p>
              <ul className="flex flex-col gap-2">
                {linked.map((connection) => {
                  const person = connection.userAId === member.userId ? connection.userB : connection.userA;
                  const currentRel = relationshipFor(connection, member.userId);
                  return (
                    <li key={connection.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm">{connectionPersonName(person)}</span>
                      <SelectField
                        aria-label={`Relationship to ${connectionPersonName(person)}`}
                        value={currentRel}
                        onValueChange={(next) =>
                          update.mutate({ connectionId: connection.id, userId: member.userId, relationship: next })
                        }
                        options={relationshipOptions}
                        disabled={update.isPending || remove.isPending}
                        className="h-8 w-36"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled={update.isPending || remove.isPending}
                        onClick={() => remove.mutate(connection.id)}
                      >
                        Remove
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          <DialogActions form="add-connection-form">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <SubmitButton pending={create.isPending} disabled={!otherUserId}>
              Connect
            </SubmitButton>
          </DialogActions>
        </form>
      ) : null}
    </EntityFormDialog>
  );
}

function PersonActions({
  member,
  onEdit,
  onRemove,
  onToggleActive,
  onAddTime,
  onAddConnection,
}: {
  member: Membership;
  onEdit: () => void;
  onRemove: () => void;
  onToggleActive: () => void;
  onAddTime: () => void;
  onAddConnection?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="ghost" size="icon-sm" className="shrink-0" aria-label="Actions" />}
      >
        <MoreVerticalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
        {onAddConnection ? <DropdownMenuItem onClick={onAddConnection}>Add connection</DropdownMenuItem> : null}
        <DropdownMenuItem onClick={onRemove}>Remove</DropdownMenuItem>
        <DropdownMenuItem onClick={onToggleActive}>
          {member.isActive === false ? "Activate" : "Deactivate"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onAddTime}>Add Time</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
