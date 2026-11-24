import { z } from "zod";
import { permissions } from "@/lib/permissions";

const rateTypes = ["Volunteer", "Professional", "Paid"] as const;
const scopes = ["tenant", "assigned_groups", "self"] as const;

export const externalRoleSchema = z.object({
  externalId: z.string().min(1).max(200).optional(),
  code: z.string().min(2).max(40),
  name: z.string().min(1).max(100),
  scope: z.enum(scopes).default("tenant"),
  permissions: z.array(z.enum(permissions)).default([]),
});

export const externalPersonSchema = z.object({
  externalId: z.string().min(1).max(200).optional(),
  email: z.string().email().max(320),
  username: z.string().min(1).max(100).optional(),
  displayName: z.string().min(1).max(100).optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  roleCode: z.string().min(2).max(40),
  rateType: z.enum(rateTypes).default("Volunteer"),
  isActive: z.boolean().default(true),
});

export const peopleRolesPayloadSchema = z.object({
  roles: z.array(externalRoleSchema).default([]),
  people: z.array(externalPersonSchema),
});

export const externalOrganizationSchema = z.object({
  externalId: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
});

export const externalOrganizationMembershipSchema = z.object({
  email: z.string().email().max(320),
  organizationExternalId: z.string().min(1).max(200),
  roleCode: z.string().min(2).max(40).default("MEMBER"),
  isManager: z.boolean().default(false),
  isPrimary: z.boolean().default(false),
});

export const tenantGroupsPayloadSchema = z.object({
  tenant: z
    .object({
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(8000).nullable().optional(),
      websiteUrl: z.string().url().max(2000).nullable().optional(),
    })
    .optional(),
  organizations: z.array(externalOrganizationSchema).default([]),
  memberships: z.array(externalOrganizationMembershipSchema).default([]),
});

export type PeopleRolesPayload = z.infer<typeof peopleRolesPayloadSchema>;
export type TenantGroupsPayload = z.infer<typeof tenantGroupsPayloadSchema>;

export function peopleRolesContractDoc() {
  return {
    name: "People and Roles Management",
    summary:
      "ClockedIn pulls people and roles from your URL (or accepts the same payload via webhook). When configured, ClockedIn is not the system of record for people or roles.",
    pull: {
      method: "GET",
      auth: "Authorization: Bearer <outbound API token or JWT>",
      responseContentType: "application/json",
      responseSchema: {
        roles: [
          {
            externalId: "optional string",
            code: "string (2-40)",
            name: "string",
            scope: "tenant | assigned_groups | self",
            permissions: ["manage_members", "..."],
          },
        ],
        people: [
          {
            externalId: "optional string",
            email: "required email",
            username: "optional string",
            displayName: "optional string",
            firstName: "optional string",
            lastName: "optional string",
            roleCode: "required role code",
            rateType: "Volunteer | Professional | Paid",
            isActive: "boolean (default true)",
          },
        ],
      },
    },
    webhook: {
      method: "POST",
      path: "/webhooks/tenants/{tenantId}/people-roles",
      headers: {
        "Content-Type": "application/json",
        "Clocked-In-Signature": "t=<unix_seconds>,v1=<hmac_sha256_hex>",
      },
      signature: "HMAC-SHA256 of `${timestamp}.${rawBody}` using the webhook secret (shown once when minted)",
      bodySchema: "Same as pull response",
    },
    matching: {
      people: "email (case-insensitive)",
      roles: "code within the tenant, or externalId when provided",
    },
    removals: "People missing from the payload are soft-deactivated (membership isActive=false).",
  };
}

export function tenantGroupsContractDoc() {
  return {
    name: "Tenant and Group Management",
    summary:
      "ClockedIn pulls tenant metadata, organizations (groups), and organization memberships from your URL (or accepts the same payload via webhook).",
    pull: {
      method: "GET",
      auth: "Authorization: Bearer <outbound API token or JWT>",
      responseContentType: "application/json",
      responseSchema: {
        tenant: {
          name: "optional string",
          description: "optional string | null",
          websiteUrl: "optional url | null",
        },
        organizations: [{ externalId: "required string", name: "required string" }],
        memberships: [
          {
            email: "required email of an org member",
            organizationExternalId: "required string",
            roleCode: "role code (default MEMBER)",
            isManager: "boolean",
            isPrimary: "boolean",
          },
        ],
      },
    },
    webhook: {
      method: "POST",
      path: "/webhooks/tenants/{tenantId}/tenant-groups",
      headers: {
        "Content-Type": "application/json",
        "Clocked-In-Signature": "t=<unix_seconds>,v1=<hmac_sha256_hex>",
      },
      signature: "HMAC-SHA256 of `${timestamp}.${rawBody}` using the webhook secret (shown once when minted)",
      bodySchema: "Same as pull response",
    },
    matching: {
      organizations: "externalId",
      memberships: "email + organizationExternalId",
    },
    removals:
      "Organization memberships missing from the payload are removed. Organizations missing from the payload are left in place but emptied of synced memberships when they have no remaining assignments from the payload.",
  };
}
