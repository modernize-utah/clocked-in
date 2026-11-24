"use client";

import { LinkIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { createConnectionAction, deleteConnectionAction, updateConnectionAction } from "@/app/actions/connections";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useMembers } from "@/hooks/use-members";
import { useTenant } from "@/hooks/use-workspace";
import { connectionPersonName, memberRelationships, type MemberConnectionRecord } from "@/lib/member-connection";
import { connectionsQuery, keys } from "@/lib/queries";
import { EmptyState } from "@/components/empty-state";

const relationshipOptions = memberRelationships.map((relationship) => ({ value: relationship, label: relationship }));

function pairKey(left: string, right: string) {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

export function ConnectionsCard() {
  const tenant = useTenant();
  const connections = useQuery(connectionsQuery(tenant.id));
  const { members } = useMembers();
  const [userId, setUserId] = useState("");
  const [connectedUserId, setConnectedUserId] = useState("");
  const [relationship, setRelationship] = useState<string>(memberRelationships[0]);
  const invalidate = [keys.connections(tenant.id)];
  const create = useActionMutation(
    (input: { userId: string; connectedUserId: string; relationship: string }) =>
      createConnectionAction(tenant.id, input),
    {
      invalidate,
      onSuccess: () => setConnectedUserId(""),
    },
  );
  const update = useActionMutation(
    (input: { connectionId: string; userId: string; relationship: string }) =>
      updateConnectionAction(tenant.id, input.connectionId, {
        userId: input.userId,
        relationship: input.relationship,
      }),
    { invalidate },
  );
  const remove = useActionMutation(
    (connectionId: string) => deleteConnectionAction(tenant.id, connectionId),
    { invalidate },
  );

  const active = members.filter((member) => member.isActive !== false);
  const people = active.map((member) => ({ value: member.userId, label: connectionPersonName(member.user) }));
  const linked = new Set((connections.data ?? []).map((connection) => pairKey(connection.userAId, connection.userBId)));
  const others = people.filter(
    (person) => person.value !== userId && (userId === "" || !linked.has(pairKey(userId, person.value))),
  );
  const rows = connections.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connections</CardTitle>
        <CardDescription>
          Link two people so they can log time for each other. The relationship is how the second person relates to the
          first.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {active.length < 2 ? (
          <p className="text-sm text-muted-foreground">Add at least two people before connecting them.</p>
        ) : (
          <form
            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9rem_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              if (!userId || !connectedUserId) return;
              create.mutate({ userId, connectedUserId, relationship });
            }}
          >
            <SelectField
              aria-label="First person"
              value={userId}
              onValueChange={(next) => {
                setUserId(next);
                if (next === connectedUserId || (next && linked.has(pairKey(next, connectedUserId)))) {
                  setConnectedUserId("");
                }
              }}
              options={people}
              placeholder="First person"
              className="h-9"
            />
            <SelectField
              aria-label="Second person"
              value={connectedUserId}
              onValueChange={setConnectedUserId}
              options={others}
              placeholder="Second person"
              className="h-9"
            />
            <SelectField
              aria-label="Relationship"
              value={relationship}
              onValueChange={setRelationship}
              options={relationshipOptions}
              className="h-9"
            />
            <Button type="submit" className="h-9" disabled={!userId || !connectedUserId || create.isPending}>
              Connect
            </Button>
          </form>
        )}
        {connections.isPending ? <p className="text-sm text-muted-foreground">Loading connections…</p> : null}
        {!connections.isPending && rows.length === 0 ? (
          <EmptyState icon={LinkIcon} title="No connections yet" className="py-8" />
        ) : null}
        {rows.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {rows.map((connection) => (
              <ConnectionRow
                key={connection.id}
                connection={connection}
                pending={update.isPending || remove.isPending}
                onChange={(next) =>
                  update.mutate({ connectionId: connection.id, userId: connection.userAId, relationship: next })
                }
                onRemove={() => remove.mutate(connection.id)}
              />
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ConnectionRow({
  connection,
  pending,
  onChange,
  onRemove,
}: {
  connection: MemberConnectionRecord;
  pending: boolean;
  onChange: (relationship: string) => void;
  onRemove: () => void;
}) {
  return (
    <li className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
      <p className="min-w-0 text-sm">
        <span className="font-medium">{connectionPersonName(connection.userB)}</span>
        <span className="text-muted-foreground"> is </span>
        <span className="font-medium">{connectionPersonName(connection.userA)}</span>
        <span className="text-muted-foreground">&apos;s</span>
      </p>
      <SelectField
        aria-label={`Relationship between ${connectionPersonName(connection.userA)} and ${connectionPersonName(connection.userB)}`}
        value={connection.relationship}
        onValueChange={onChange}
        options={relationshipOptions}
        disabled={pending}
        className="h-9"
      />
      <Button type="button" variant="outline" className="h-9" disabled={pending} onClick={onRemove}>
        Remove
      </Button>
    </li>
  );
}
