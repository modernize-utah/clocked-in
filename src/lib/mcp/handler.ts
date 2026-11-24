import { createMcpHandler } from "mcp-handler";
import { registerCatalogTools } from "@/lib/mcp/tools/catalog";
import { registerExternalSyncTools } from "@/lib/mcp/tools/external-sync";
import { registerTenantTools } from "@/lib/mcp/tools/tenants";
import { registerPeopleTools } from "@/lib/mcp/tools/people";
import { registerProjectTools } from "@/lib/mcp/tools/projects";
import { registerReportTools } from "@/lib/mcp/tools/reports";
import { registerTimeTools } from "@/lib/mcp/tools/time";

export const mcpHandler = createMcpHandler(
  (server) => {
    registerTenantTools(server);
    registerProjectTools(server);
    registerPeopleTools(server);
    registerReportTools(server);
    registerTimeTools(server);
    registerCatalogTools(server);
    registerExternalSyncTools(server);
  },
  { serverInfo: { name: "clocked-in", version: "0.1.0" } },
);
