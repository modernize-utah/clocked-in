"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { createConnectionAction, deleteConnectionAction, updateConnectionAction } from "@/app/actions/connections";
import { MarkdownView } from "@/components/markdown-view";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useMembers } from "@/hooks/use-members";
import { useOrganization, useWorkspace } from "@/hooks/use-workspace";
import { formatInstant } from "@/lib/format";
import { avatarImageSrc } from "@/lib/avatar";
import { connectionPersonName, memberRelationships, relationshipFor, type MemberConnectionRecord } from "@/lib/member-connection";
import { connectionsQuery, keys, userQuery } from "@/lib/queries";
import type { Membership } from "@/lib/types";

type UserProfile = {
  firstName: string;
  lastName: string;
  displayName: string | null;
  timezone: string;
  phone: string | null;
  zipCode: string | null;
  notes: string | null;
  memberNumber: string | null;
  avatarUrl: string | null;
  description: string | null;
};

function personName(member: Membership, profile: UserProfile | null | undefined) {
  const display = profile?.displayName?.trim() || member.user.displayName?.trim();
  if (display) return display;
  const full = [profile?.firstName ?? member.user.firstName, profile?.lastName ?? member.user.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return full || member.user.username;
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) return null;
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 text-sm break-words">{value}</dd>
    </div>
  );
}

export function PersonProfileDialog({
  member,
  departmentNames,
  timeZone,
  onOpenChange,
}: {
  member: Membership | null;
  departmentNames: string[];
  timeZone: string;
  onOpenChange: (open: boolean) => void;
}) {
  const profileQuery = useQuery({ ...userQuery(member?.userId ?? ""), enabled: Boolean(member) });
  const profile = profileQuery.data?.profile;
  const name = member ? personName(member, profile) : "";
  const avatarSrc = member ? avatarImageSrc(member.userId, profile?.avatarUrl) : null;

  return (
    <Dialog open={Boolean(member)} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(40rem,85vh)] flex-col overflow-hidden sm:max-w-lg">
        {member ? (
          <>
            <DialogHeader className="shrink-0 pr-8">
              <div className="flex items-center gap-3">
                {avatarSrc ? (
                  <img src={avatarSrc} alt="" className="size-12 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <DialogTitle className="truncate text-lg">{name}</DialogTitle>
                  <DialogDescription className="truncate">
                    {member.orgUserTitle?.trim() || member.user.email}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
              {profileQuery.isPending ? <p className="text-sm text-muted-foreground">Loading profile…</p> : null}
              {profileQuery.isError ? (
                <p className="text-sm text-muted-foreground">The rest of this profile is not available.</p>
              ) : null}

              {profile?.description?.trim() ? (
                <section>
                  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">About</h3>
                  <div className="mt-2">
                    <MarkdownView source={profile.description} />
                  </div>
                </section>
              ) : null}

              {member.orgUserDescription?.trim() ? (
                <section>
                  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">In this organization</h3>
                  <div className="mt-2">
                    <MarkdownView source={member.orgUserDescription} />
                  </div>
                </section>
              ) : null}

              <dl className="grid gap-4 sm:grid-cols-2">
                <Fact label="Username" value={member.user.username} />
                <Fact label="Email" value={profileQuery.data?.email ?? member.user.email} />
                <Fact label="First name" value={profile?.firstName ?? member.user.firstName} />
                <Fact label="Last name" value={profile?.lastName ?? member.user.lastName} />
                <Fact label="Display name" value={profile?.displayName ?? member.user.displayName} />
                <Fact label="Title" value={member.orgUserTitle} />
                <Fact label="Role" value={member.role.name} />
                <Fact label="Status" value={member.isActive === false ? "Inactive" : "Active"} />
                <Fact label="Departments" value={departmentNames.join(", ")} />
                <Fact label="Member number" value={profile?.memberNumber} />
                <Fact label="Timezone" value={profile?.timezone} />
                <Fact label="Phone" value={profile?.phone} />
                <Fact label="Zip code" value={profile?.zipCode} />
                <Fact label="Joined" value={formatInstant(member.joinedAt, profile?.timezone || timeZone)} />
                <Fact label="Notes" value={profile?.notes} />
              </dl>
              <MemberConnections member={member} />
            </div>
            <DialogFooter showCloseButton />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

const relationshipOptions = memberRelationships.map((relationship) => ({ value: relationship, label: relationship }));

function MemberConnections({ member }: { member: Membership }) {
  const { isAdmin } = useWorkspace();
  const organization = useOrganization();
  const connections = useQuery({ ...connectionsQuery(organization.id), enabled: isAdmin });
  const { members } = useMembers({ enabled: isAdmin });
  const [otherUserId, setOtherUserId] = useState("");
  const [relationship, setRelationship] = useState<string>(memberRelationships[0]);
  const invalidate = [keys.connections(organization.id)];
  const create = useActionMutation(
    (input: { userId: string; connectedUserId: string; relationship: string }) =>
      createConnectionAction(organization.id, input),
    { invalidate, onSuccess: () => setOtherUserId("") },
  );
  const update = useActionMutation(
    (input: { connectionId: string; userId: string; relationship: string }) =>
      updateConnectionAction(organization.id, input.connectionId, { userId: input.userId, relationship: input.relationship }),
    { invalidate },
  );
  const remove = useActionMutation(
    (connectionId: string) => deleteConnectionAction(organization.id, connectionId),
    { invalidate },
  );
  if (!isAdmin) return null;

  const linked = (connections.data ?? []).filter(
    (connection) => connection.userAId === member.userId || connection.userBId === member.userId,
  );
  const taken = new Set(linked.flatMap((connection) => [connection.userAId, connection.userBId]));
  const choices = members
    .filter((item) => item.userId !== member.userId && item.isActive !== false && !taken.has(item.userId))
    .map((item) => ({ value: item.userId, label: connectionPersonName(item.user) }));

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Connections</h3>
      {connections.isPending ? <p className="text-sm text-muted-foreground">Loading connections…</p> : null}
      {linked.length === 0 && !connections.isPending ? (
        <p className="text-sm text-muted-foreground">No connections yet.</p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {linked.map((connection) => (
          <ConnectionRow
            key={connection.id}
            connection={connection}
            memberId={member.userId}
            pending={update.isPending || remove.isPending}
            onChange={(next) =>
              update.mutate({ connectionId: connection.id, userId: member.userId, relationship: next })
            }
            onRemove={() => remove.mutate(connection.id)}
          />
        ))}
      </ul>
      {choices.length > 0 ? (
        <form
          className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            if (!otherUserId) return;
            create.mutate({ userId: member.userId, connectedUserId: otherUserId, relationship });
          }}
        >
          <SelectField
            aria-label="Member"
            value={otherUserId}
            onValueChange={setOtherUserId}
            options={choices}
            placeholder="Add a person"
            className="h-9"
          />
          <SelectField
            aria-label="Relationship"
            value={relationship}
            onValueChange={setRelationship}
            options={relationshipOptions}
            className="h-9"
          />
          <Button type="submit" className="h-9" disabled={!otherUserId || create.isPending}>
            Connect
          </Button>
        </form>
      ) : null}
      <p className="text-xs text-muted-foreground">The relationship is how the other person relates to {connectionPersonName(member.user)}.</p>
    </section>
  );
}

function ConnectionRow({
  connection,
  memberId,
  pending,
  onChange,
  onRemove,
}: {
  connection: MemberConnectionRecord;
  memberId: string;
  pending: boolean;
  onChange: (relationship: string) => void;
  onRemove: () => void;
}) {
  const person = connection.userAId === memberId ? connection.userB : connection.userA;
  const relationship = relationshipFor(connection, memberId);
  return (
    <li className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-sm">{connectionPersonName(person)}</span>
      <SelectField
        aria-label={`Relationship to ${connectionPersonName(person)}`}
        value={relationship}
        onValueChange={onChange}
        options={relationshipOptions}
        disabled={pending}
        className="h-9 w-36"
      />
      <Button type="button" variant="outline" className="h-9" disabled={pending} onClick={onRemove}>
        Remove
      </Button>
    </li>
  );
}
