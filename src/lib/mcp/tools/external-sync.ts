import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  portalContract,
  pullPortalDirectoryForTenant,
  setPortalApiToken,
  setPortalClientId,
  setPortalClientSecret,
  setPortalWebhookSecret,
  validatePortalDirectory,
} from "@/lib/api/features/external-sync";
import { mcpAccess } from "@/lib/mcp/context";
import { guid, tool } from "@/lib/mcp/tool";

export function registerExternalSyncTools(server: McpServer) {
  tool(
    server,
    "get_portal_sync_contract",
    "Return how VolunTime maps the CASWJ Portal directory into tenants and organizations.",
    {},
    async () => portalContract,
  );

  tool(
    server,
    "validate_portal_directory",
    "Call the portal directory APIs and return record counts without applying changes.",
    { tenantId: guid },
    ({ tenantId }) => validatePortalDirectory(mcpAccess(), tenantId),
  );

  tool(
    server,
    "pull_portal_directory",
    "Pull people, organizations, roles, memberships, and positions from the CASWJ Portal into this tenant.",
    { tenantId: guid },
    ({ tenantId }) => pullPortalDirectoryForTenant(mcpAccess(), tenantId),
  );

  tool(
    server,
    "set_portal_client_id",
    "Set the portal OAuth client id for a tenant.",
    { tenantId: guid, clientId: z.string() },
    ({ tenantId, clientId }) => setPortalClientId(mcpAccess(), tenantId, clientId),
  );

  tool(
    server,
    "set_portal_client_secret",
    "Set the portal OAuth client secret for a tenant.",
    { tenantId: guid, secret: z.string() },
    ({ tenantId, secret }) => setPortalClientSecret(mcpAccess(), tenantId, secret),
  );

  tool(
    server,
    "set_portal_api_token",
    "Set the portal API token (caswj_at_…) used for directory pulls.",
    { tenantId: guid, token: z.string() },
    ({ tenantId, token }) => setPortalApiToken(mcpAccess(), tenantId, token),
  );

  tool(
    server,
    "set_portal_webhook_secret",
    "Set the portal-issued webhook signing secret (caswj_wh_…).",
    { tenantId: guid, secret: z.string() },
    ({ tenantId, secret }) => setPortalWebhookSecret(mcpAccess(), tenantId, secret),
  );
}
