import type { McpServer } from "@modelcontextprotocol/server";
import { beginMcpCatalogRecording, type McpToolMeta } from "@/lib/mcp/tool";
import { registerCatalogTools } from "@/lib/mcp/tools/catalog";
import { registerExternalSyncTools } from "@/lib/mcp/tools/external-sync";
import { registerTenantTools } from "@/lib/mcp/tools/tenants";
import { registerPeopleTools } from "@/lib/mcp/tools/people";
import { registerProjectTools } from "@/lib/mcp/tools/projects";
import { registerReportTools } from "@/lib/mcp/tools/reports";
import { registerTimeTools } from "@/lib/mcp/tools/time";

const groups: { group: string; register: (server: McpServer) => void }[] = [
  { group: "Tenants", register: registerTenantTools },
  { group: "Projects", register: registerProjectTools },
  { group: "People", register: registerPeopleTools },
  { group: "Reports", register: registerReportTools },
  { group: "Time", register: registerTimeTools },
  { group: "Catalog", register: registerCatalogTools },
  { group: "External sync", register: registerExternalSyncTools },
];

export type McpToolGroup = { group: string; tools: McpToolMeta[] };

export function loadMcpCatalog(): McpToolGroup[] {
  const server = { registerTool() {} } as unknown as McpServer;
  return groups.map(({ group, register }) => {
    const session = beginMcpCatalogRecording();
    try {
      register(server);
      return { group, tools: session.take() };
    } catch (error) {
      session.take();
      throw error;
    }
  });
}
