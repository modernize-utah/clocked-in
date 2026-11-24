"use server";

import {
  createOrganizationInvitation,
  createTenantInvitation,
  parseCreateInvitation,
  resendTenantInvitation,
  revokeOrganizationInvitation,
  revokeTenantInvitation,
} from "@/lib/api/features/invitations";
import {
  createOrgMembership,
  deleteOrgMembership,
  deleteOrgMemberships,
  parseCreateOrgMembership,
  parseUpdateOrgMembership,
  updateOrgMembership,
} from "@/lib/api/features/memberships";
import { body, run } from "@/lib/server/action";
import { requireAccess } from "@/lib/server/session";

export type MemberPatch = {
  role?: string;
  rateType?: string;
  professionalBillingRate?: number | null;
  isActive?: boolean;
  primaryOrganizationId?: string | null;
  organizationIds?: string[];
  managedOrganizationIds?: string[];
  firstName?: string;
  lastName?: string;
  displayName?: string | null;
  timezone?: string;
  phone?: string | null;
  zipCode?: string | null;
  notes?: string | null;
  email?: string;
};

export type NewPerson = {
  email: string;
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  displayName?: string | null;
  timezone?: string;
  phone?: string | null;
  zipCode?: string | null;
  notes?: string | null;
  role: string;
  organizationIds?: string[];
  managedOrganizationIds?: string[];
  relationship?: string;
  emailUser?: boolean;
};

export async function createPersonAction(tenantId: string, input: NewPerson) {
  return run(async () => {
    const access = await requireAccess();
    return createOrgMembership(access, tenantId, parseCreateOrgMembership(body(input)));
  }, "Person added.");
}

export async function updateMemberAction(tenantId: string, membershipId: string, patch: MemberPatch) {
  return run(async () => {
    const access = await requireAccess();
    return updateOrgMembership(access, tenantId, membershipId, parseUpdateOrgMembership(body(patch)));
  }, "Person saved.");
}

export async function removeMemberAction(tenantId: string, membershipId: string) {
  return run(async () => {
    const access = await requireAccess();
    await deleteOrgMembership(access, tenantId, membershipId);
  }, "Person removed from the tenant.");
}

export async function removeMembersAction(tenantId: string, membershipIds: string[]) {
  const count = new Set(membershipIds).size;
  return run(async () => {
    const access = await requireAccess();
    await deleteOrgMemberships(access, tenantId, membershipIds);
  }, count === 1 ? "Person removed from the tenant." : `${count} people removed from the tenant.`);
}

export async function inviteMemberAction(
  tenantId: string,
  input: { email: string; role: string; firstName: string; lastName: string; username?: string },
) {
  return run(async () => {
    const access = await requireAccess();
    await createTenantInvitation(access, tenantId, parseCreateInvitation(input));
  }, `Invitation sent to ${input.email}.`);
}

export async function inviteOrganizationMemberAction(
  organizationId: string,
  input: { email: string; role: string; firstName: string; lastName: string; username?: string },
) {
  return run(async () => {
    const access = await requireAccess();
    await createOrganizationInvitation(access, organizationId, parseCreateInvitation(input));
  }, `Invitation sent to ${input.email}.`);
}

export async function revokeOrganizationInvitationAction(organizationId: string, invitationId: string) {
  return run(async () => {
    const access = await requireAccess();
    await revokeOrganizationInvitation(access, organizationId, invitationId);
  }, "Invitation revoked.");
}

export async function resendInvitationAction(tenantId: string, invitationId: string, email: string) {
  return run(async () => {
    const access = await requireAccess();
    await resendTenantInvitation(access, tenantId, invitationId);
  }, `Invitation resent to ${email}.`);
}

export async function revokeInvitationAction(tenantId: string, invitationId: string) {
  return run(async () => {
    const access = await requireAccess();
    await revokeTenantInvitation(access, tenantId, invitationId);
  }, "Invitation revoked.");
}
