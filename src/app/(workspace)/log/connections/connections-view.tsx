"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarClockIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { createPersonAction, type NewPerson } from "@/app/actions/members";
import { DialogActions } from "@/components/dialog-actions";
import { TimeEntryForm } from "@/components/entity-forms/time-entry-form";
import { EntityFormDialog } from "@/components/entity-forms/entity-form-dialog";
import { Field, FormMessage } from "@/components/field";
import { SelectField } from "@/components/select-field";
import { PageSkeleton } from "@/components/skeletons";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useClientRedirect } from "@/hooks/use-client-redirect";
import { useOrganization, useWorkspace } from "@/hooks/use-workspace";
import { connectionPersonName, memberRelationships, relationshipFor } from "@/lib/member-connection";
import { connectionsQuery, keys } from "@/lib/queries";
import { canLogConnectionTime } from "@/lib/roles";
import { PersonIdentityFields, readPersonIdentity } from "@/components/entity-forms/person-identity-fields";
import { logScrollClass } from "../pane";

const relationshipOptions = memberRelationships.map((relationship) => ({ value: relationship, label: relationship }));

export function ConnectionsTimeView() {
  const { viewer, isAdmin, role } = useWorkspace();
  const organization = useOrganization();
  const connections = useQuery(connectionsQuery(organization.id));
  const canLog = canLogConnectionTime({
    role,
    isAdmin,
    allowVolunteersToAddVolunteers: organization.preferences.allowVolunteersToAddVolunteers,
    connectionCount: connections.data?.length ?? 0,
  });
  useClientRedirect(!connections.isPending && !canLog, "/log/own");
  const [adding, setAdding] = useState(false);
  const canAdd = role === "VOLUNTEER" && organization.preferences.allowVolunteersToAddVolunteers;
  if (!canLog && connections.isPending) return null;
  if (!canLog) return null;

  const mine = (connections.data ?? []).flatMap((connection) => {
    if (connection.userAId !== viewer.id && connection.userBId !== viewer.id) return [];
    const person = connection.userAId === viewer.id ? connection.userB : connection.userA;
    const relationship = relationshipFor(connection, viewer.id);
    return [{ userId: person.id, label: `${connectionPersonName(person)} (${relationship})` }];
  });

  return (
    <div className={logScrollClass}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClockIcon className="size-4 text-muted-foreground" />
            Add time for a connection
          </CardTitle>
          <CardDescription>Choose someone you are connected to, then log start and end times or total hours.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {canAdd ? (
            <div>
              <Button type="button" variant="outline" className="h-9" onClick={() => setAdding(true)}>
                <PlusIcon className="size-4" />
                Add volunteer
              </Button>
            </div>
          ) : null}
          {connections.isPending ? (
            <PageSkeleton className="min-h-60" />
          ) : mine.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {canAdd ? "Add a volunteer to log time for them." : "You have no connections to log time for."}
            </p>
          ) : (
            <TimeEntryForm candidates={mine} />
          )}
        </CardContent>
      </Card>
      <EntityFormDialog
        open={adding}
        onOpenChange={setAdding}
        title="Add volunteer"
        description="They will choose a new password the first time they sign in. Tell them how you are related."
      >
        <AddVolunteerForm onCancel={() => setAdding(false)} onSaved={() => setAdding(false)} />
      </EntityFormDialog>
    </div>
  );
}

function AddVolunteerForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const organization = useOrganization();
  const [relationship, setRelationship] = useState<string>(memberRelationships[0]);
  const create = useActionMutation((input: NewPerson) => createPersonAction(organization.id, input), {
    invalidate: [keys.members(organization.id), keys.connections(organization.id)],
    errorToast: false,
    onSuccess: onSaved,
  });

  return (
    <form
      id="connection-form"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        create.mutate({
          ...readPersonIdentity(data),
          role: "VOLUNTEER",
          relationship,
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <PersonIdentityFields idPrefix="connection" />
        <Field label="This person is my" htmlFor="connection-relationship" className="sm:col-span-2">
          <SelectField
            id="connection-relationship"
            value={relationship}
            onValueChange={setRelationship}
            options={relationshipOptions}
            className="h-9"
          />
        </Field>
      </div>
      <FormMessage result={create.error ? { ok: false, error: create.error.message } : null} />
      <DialogActions form="connection-form">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton pending={create.isPending}>Add volunteer</SubmitButton>
      </DialogActions>
    </form>
  );
}
