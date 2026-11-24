import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { parseCreateInvitation, listTenantInvitations, createTenantInvitation, revokeTenantInvitation } from "@/lib/api/features/invitations";
import {
  createConnection,
  deleteConnection,
  listConnections,
  parseCreateConnection,
  parseUpdateConnection,
  updateConnection,
} from "@/lib/api/features/connections";
import {
  createOrgMembership,
  deleteOrgMembership,
  deleteOrgMemberships,
  listOrgMemberships,
  parseCreateOrgMembership,
  parseUpdateOrgMembership,
  updateOrgMembership,
} from "@/lib/api/features/memberships";
import { jsonBody, query } from "@/lib/mcp/call";
import { mcpAccess } from "@/lib/mcp/context";
import { guid, tool } from "@/lib/mcp/tool";

const page = { limit: z.number().int().nullable(), offset: z.number().int().nullable() };

export function registerPeopleTools(server: McpServer) {
  tool(server, "list_members", "List tenant memberships.", { tenantId: guid, ...page }, ({ tenantId, limit, offset }) =>
    listOrgMemberships(mcpAccess(), tenantId, query({ limit, offset })),
  );

  tool(
    server,
    "create_member",
    "Create a membership (existing or new person). Pass JSON with email, role, firstName, lastName, and optional username, password, organizationIds, avatarUrl, description, title, memberDescription, and emailUser. emailUser emails a new account its username and temporary password. When Allow volunteers to add volunteers is on, a volunteer can create another volunteer and must include relationship.",
    { tenantId: guid, body: z.string() },
    ({ tenantId, body }) => createOrgMembership(mcpAccess(), tenantId, parseCreateOrgMembership(jsonBody(body))),
  );

  tool(
    server,
    "update_membership",
    "Update an tenant membership.",
    { tenantId: guid, membershipId: guid, body: z.string() },
    ({ tenantId, membershipId, body }) =>
      updateOrgMembership(mcpAccess(), tenantId, membershipId, parseUpdateOrgMembership(jsonBody(body))),
  );

  tool(
    server,
    "delete_membership",
    "Remove an tenant membership.",
    { tenantId: guid, membershipId: guid },
    async ({ tenantId, membershipId }) => {
      await deleteOrgMembership(mcpAccess(), tenantId, membershipId);
      return "deleted";
    },
  );

  tool(
    server,
    "delete_memberships",
    "Remove tenant memberships. membershipIds is 1 to 100 tenant membership ids.",
    { tenantId: guid, membershipIds: z.array(guid) },
    async ({ tenantId, membershipIds }) => {
      await deleteOrgMemberships(mcpAccess(), tenantId, membershipIds);
      return "deleted";
    },
  );

  tool(
    server,
    "list_invitations",
    "List pending tenant invitations.",
    { tenantId: guid, ...page },
    ({ tenantId, limit, offset }) => listTenantInvitations(mcpAccess(), tenantId, query({ limit, offset })),
  );

  tool(
    server,
    "create_invitation",
    "Invite someone to the tenant. Role is ADMIN, MEMBER, or VOLUNTEER.",
    { tenantId: guid, email: z.string(), role: z.string() },
    ({ tenantId, email, role }) =>
      createTenantInvitation(mcpAccess(), tenantId, parseCreateInvitation({ email, role })),
  );

  tool(
    server,
    "revoke_invitation",
    "Revoke an tenant invitation.",
    { tenantId: guid, invitationId: guid },
    ({ tenantId, invitationId }) => revokeTenantInvitation(mcpAccess(), tenantId, invitationId),
  );

  tool(
    server,
    "list_connections",
    "List member connections. Admins see every connection. Other members see only their own. relationship is how user B relates to user A.",
    { tenantId: guid, ...page },
    ({ tenantId, limit, offset }) => listConnections(mcpAccess(), tenantId, query({ limit, offset })),
  );

  tool(
    server,
    "create_connection",
    "Connect two active members. JSON body has userId, connectedUserId, and relationship (how connectedUserId relates to userId). Tenant admin only.",
    { tenantId: guid, body: z.string() },
    ({ tenantId, body }) => createConnection(mcpAccess(), tenantId, parseCreateConnection(jsonBody(body))),
  );

  tool(
    server,
    "update_connection",
    "Change a connection. JSON body has userId and relationship from that person's point of view. Tenant admin only.",
    { tenantId: guid, connectionId: guid, body: z.string() },
    ({ tenantId, connectionId, body }) =>
      updateConnection(mcpAccess(), tenantId, connectionId, parseUpdateConnection(jsonBody(body))),
  );

  tool(
    server,
    "delete_connection",
    "Remove a member connection. Tenant admin only.",
    { tenantId: guid, connectionId: guid },
    async ({ tenantId, connectionId }) => {
      await deleteConnection(mcpAccess(), tenantId, connectionId);
      return "deleted";
    },
  );
}
