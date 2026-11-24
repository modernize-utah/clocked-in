import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getTenant, listTenants, parseUpdateTenant, updateTenant } from "@/lib/api/features/tenants";
import { jsonBody, query } from "@/lib/mcp/call";
import { mcpAccess } from "@/lib/mcp/context";
import { guid, tool } from "@/lib/mcp/tool";

const page = { limit: z.number().int().nullable(), offset: z.number().int().nullable() };

export function registerTenantTools(server: McpServer) {
  tool(server, "list_tenants", "List tenants the caller can access.", page, ({ limit, offset }) =>
    listTenants(mcpAccess(), query({ limit, offset })),
  );

  tool(server, "get_tenant", "Get an tenant by id.", { tenantId: guid }, ({ tenantId }) =>
    getTenant(mcpAccess(), tenantId),
  );

  tool(
    server,
    "update_tenant",
    "Update an tenant. Pass a JSON object with fields such as name, description, websiteUrl, volunteerHourlyRate, defaultRateType, preferences, and themeId.",
    { tenantId: guid, body: z.string() },
    ({ tenantId, body }) => updateTenant(mcpAccess(), tenantId, parseUpdateTenant(jsonBody(body))),
  );
}
