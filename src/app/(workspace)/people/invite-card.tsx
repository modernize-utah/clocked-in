"use client";

import { MailIcon } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  inviteOrganizationMemberAction,
  inviteMemberAction,
  revokeOrganizationInvitationAction,
  resendInvitationAction,
  revokeInvitationAction,
} from "@/app/actions/members";
import { decideAccessRequestAction } from "@/app/actions/access-requests";
import { Field } from "@/components/field";
import { SelectField } from "@/components/select-field";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useActionMutation } from "@/hooks/use-action-mutation";
import { useInvitations } from "@/hooks/use-invitations";
import { useLookups } from "@/hooks/use-lookups";
import { useTenant, useWorkspace } from "@/hooks/use-workspace";
import { fetchJson } from "@/lib/fetch-json";
import { formatInstant } from "@/lib/format";
import { keys } from "@/lib/queries";
import type { Invitation, Paged } from "@/lib/types";
import { roleLabel, useOrgRoleOptions, useUsernamePreview } from "./member-shared";
import { EmptyState } from "@/components/empty-state";

export function InviteForm() {
  const tenant = useTenant();
  const { isCoordinator, groupOrganizations } = useWorkspace();
  const { lookups } = useLookups();
  const coordinated = lookups.organizations.filter((organization) => groupOrganizations.includes(organization.id));
  const roleOptions = useOrgRoleOptions();
  const coordinatorRoles = [
    { value: "VOLUNTEER", label: "Volunteer" },
    { value: "ADMIN", label: "Group manager" },
  ];
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("VOLUNTEER");
  const [organizationId, setOrganizationId] = useState(coordinated[0]?.id ?? "");
  const usernamePreview = useUsernamePreview(firstName, lastName);
  const { invitations } = useInvitations();
  const invalidate = [
    keys.invitations(tenant.id),
    ...coordinated.map((organization) => keys.organizationInvitations(organization.id)),
    keys.members(tenant.id),
  ];
  const invite = useActionMutation(
    (input: { email: string; role: string; firstName: string; lastName: string; organizationId?: string }) =>
      input.organizationId
        ? inviteOrganizationMemberAction(input.organizationId, input)
        : inviteMemberAction(tenant.id, input),
    { invalidate, onSuccess: () => { setEmail(""); setFirstName(""); setLastName(""); } },
  );
  const revoke = useActionMutation(
    (invitation: Invitation) =>
      invitation.organizationId
        ? revokeOrganizationInvitationAction(invitation.organizationId, invitation.id)
        : revokeInvitationAction(tenant.id, invitation.id),
    { invalidate },
  );
  const resend = useActionMutation(
    (invitation: Invitation) => resendInvitationAction(tenant.id, invitation.id, invitation.email),
    { invalidate },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite someone</CardTitle>
        <CardDescription>Set their name when you invite them. We email a 6-digit code and their username.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <form
          className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)]"
          onSubmit={(event) => {
            event.preventDefault();
            invite.mutate({
              email,
              firstName,
              lastName,
              role,
              organizationId: isCoordinator ? organizationId || coordinated[0]?.id : undefined,
            });
          }}
        >
          <Field label="First name" htmlFor="invite-first">
            <Input id="invite-first" required value={firstName} onChange={(event) => setFirstName(event.target.value)} className="h-9" />
          </Field>
          <Field label="Last name" htmlFor="invite-last">
            <Input id="invite-last" required value={lastName} onChange={(event) => setLastName(event.target.value)} className="h-9" />
          </Field>
          <Field label="Email" htmlFor="invite-email">
            <Input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-9"
            />
          </Field>
          {isCoordinator && coordinated.length > 1 ? (
            <Field label="Group" htmlFor="invite-group">
              <SelectField
                id="invite-group"
                value={organizationId || coordinated[0]?.id || ""}
                onValueChange={setOrganizationId}
                options={coordinated.map((organization) => ({ value: organization.id, label: organization.name }))}
                className="h-9"
              />
            </Field>
          ) : null}
          <Field label="Role" htmlFor="invite-role">
            <SelectField
              id="invite-role"
              value={role}
              onValueChange={setRole}
              options={isCoordinator ? coordinatorRoles : roleOptions}
              className="h-9"
            />
          </Field>
          {usernamePreview.data?.username ? (
            <p className="text-xs text-muted-foreground sm:col-span-3">
              {usernamePreview.data.collided
                ? `${usernamePreview.data.base} is taken. Will use ${usernamePreview.data.username}.`
                : `Username will be ${usernamePreview.data.username}.`}
            </p>
          ) : null}
          <SubmitButton pending={invite.isPending} className="h-9 sm:col-start-3 sm:mt-6 sm:justify-self-end">
            Send invite
          </SubmitButton>
        </form>
        {invitations.length ? (
          <ul className="divide-y rounded-lg border">
            {invitations.map((invitation) => (
              <InvitationRow
                key={invitation.id}
                invitation={invitation}
                pending={revoke.isPending || resend.isPending}
                onRevoke={() => revoke.mutate(invitation)}
                onResend={invitation.organizationId ? undefined : () => resend.mutate(invitation)}
              />
            ))}
          </ul>
        ) : (
          <EmptyState icon={MailIcon} title="No invitations yet" className="py-8" />
        )}
      </CardContent>
    </Card>
  );
}

export function AccessRequestsCard() {
  const tenant = useTenant();
  const { lookups } = useLookups();
  const { data } = useQuery({
    queryKey: ["org", tenant.id, "access-requests"],
    queryFn: ({ signal }) =>
      fetchJson<
        Paged<{
          id: string;
          name: string;
          email: string;
          status: string;
          message: string | null;
          requestedRole: { code: string; name: string } | null;
          requestedOrganizationIds: string[];
        }>
      >(`/tenants/${tenant.id}/access-requests?limit=50`, signal),
  });
  const decide = useActionMutation(
    ({ id, status }: { id: string; status: "approved" | "declined" }) => decideAccessRequestAction(tenant.id, id, status),
    { invalidate: [["org", tenant.id, "access-requests"], keys.members(tenant.id)] },
  );
  const pending = (data?.items ?? []).filter((item) => item.status === "pending");
  if (pending.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Access requests</CardTitle>
        <CardDescription>Approve or decline people who asked for more access.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-lg border">
          {pending.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {item.email}
                  {item.requestedRole ? ` · ${item.requestedRole.name}` : ""}
                  {item.requestedOrganizationIds.length
                    ? ` · ${item.requestedOrganizationIds
                        .map((id) => lookups.organizations.find((organization) => organization.id === id)?.name)
                        .filter(Boolean)
                        .join(", ")}`
                    : ""}
                  {item.message ? ` · ${item.message}` : ""}
                </p>
              </div>
              <Button type="button" size="sm" onClick={() => decide.mutate({ id: item.id, status: "approved" })}>
                Approve
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => decide.mutate({ id: item.id, status: "declined" })}>
                Decline
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function invitationStatus(invitation: Invitation) {
  if (invitation.acceptedAt) return { label: "Accepted", variant: "default" as const };
  if (invitation.revokedAt) return { label: "Revoked", variant: "outline" as const };
  if (new Date(invitation.expiresAt).getTime() <= Date.now()) return { label: "Expired", variant: "destructive" as const };
  return { label: "Pending", variant: "secondary" as const };
}

export function InvitationRow({
  invitation,
  pending,
  onRevoke,
  onResend,
}: {
  invitation: Invitation;
  pending: boolean;
  onRevoke: () => void;
  onResend?: () => void;
}) {
  const { viewer } = useWorkspace();
  const status = invitationStatus(invitation);
  const canResend = Boolean(onResend) && (status.label === "Pending" || status.label === "Expired");
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{invitation.email}</p>
        <p className="text-xs text-muted-foreground">
          {roleLabel(invitation.role.code, invitation.role.name)} · sent {formatInstant(invitation.createdAt, viewer.timezone)}
        </p>
      </div>
      <Badge variant={status.variant}>{status.label}</Badge>
      {canResend ? (
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onResend}>
          Resend
        </Button>
      ) : null}
      {status.label === "Pending" ? (
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onRevoke}>
          Revoke
        </Button>
      ) : null}
    </li>
  );
}
