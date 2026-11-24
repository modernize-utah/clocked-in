import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  parseCreateProject,
  parseUpdateProject,
  updateProject,
} from "@/lib/api/features/projects";
import { jsonBody, query } from "@/lib/mcp/call";
import { mcpAccess } from "@/lib/mcp/context";
import { guid, tool } from "@/lib/mcp/tool";

const page = { limit: z.number().int().nullable(), offset: z.number().int().nullable() };

export function registerProjectTools(server: McpServer) {
  tool(
    server,
    "list_projects",
    "List projects in an tenant that the caller can see.",
    { tenantId: guid, ...page },
    ({ tenantId, limit, offset }) => listProjects(mcpAccess(), tenantId, query({ limit, offset })),
  );

  tool(server, "get_project", "Get a project by id.", { projectId: guid }, ({ projectId }) => getProject(mcpAccess(), projectId));

  tool(
    server,
    "create_project",
    "Create a project. Pass JSON with title, accessType, and optional projectType, organizationId, description, startDate, endDate, isActive, editorIds.",
    { tenantId: guid, body: z.string() },
    ({ tenantId, body }) => createProject(mcpAccess(), tenantId, parseCreateProject(jsonBody(body))),
  );

  tool(
    server,
    "update_project",
    "Update a project. Pass JSON with any writable project fields.",
    { projectId: guid, body: z.string() },
    ({ projectId, body }) => updateProject(mcpAccess(), projectId, parseUpdateProject(jsonBody(body))),
  );

  tool(server, "delete_project", "Delete a project.", { projectId: guid }, async ({ projectId }) => {
    await deleteProject(mcpAccess(), projectId);
    return "deleted";
  });
}
