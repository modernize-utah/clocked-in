import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { createOrganization, deleteOrganization, listOrganizations, updateOrganization } from "@/lib/api/features/organizations";
import {
  createHourlyRate,
  deleteHourlyRate,
  listHourlyRates,
  parseCreateHourlyRate,
  parseUpdateHourlyRate,
  updateHourlyRate,
} from "@/lib/api/features/hourly-rates";
import { parseName } from "@/lib/api/features/tenants";
import { createTag, deleteTag, listTags, updateTag } from "@/lib/api/features/tags";
import {
  createTaskCategory,
  deleteTaskCategory,
  listTaskCategories,
  updateTaskCategory,
} from "@/lib/api/features/task-categories";
import { createTheme, deleteTheme, listThemes, parseThemeWrite, updateTheme } from "@/lib/api/features/themes";
import {
  createVolunteerNeed,
  deleteVolunteerNeed,
  getVolunteerNeed,
  listVolunteerNeeds,
  parseSaveNeed,
  parseUpdateNeed,
  updateVolunteerNeed,
} from "@/lib/api/features/volunteer-needs";
import { jsonBody, query } from "@/lib/mcp/call";
import { mcpAccess } from "@/lib/mcp/context";
import { guid, tool } from "@/lib/mcp/tool";

const page = { limit: z.number().int().nullable(), offset: z.number().int().nullable() };
const name = { name: z.string() };

export function registerCatalogTools(server: McpServer) {
  tool(server, "list_tenants", "List organizations in an tenant.", { tenantId: guid, ...page }, ({ tenantId, limit, offset }) =>
    listOrganizations(mcpAccess(), tenantId, query({ limit, offset })),
  );
  tool(server, "create_tenant", "Create a organization.", { tenantId: guid, ...name }, ({ tenantId, name: organizationName }) =>
    createOrganization(mcpAccess(), tenantId, parseName({ name: organizationName })),
  );
  tool(server, "update_tenant", "Rename a organization.", { organizationId: guid, ...name }, ({ organizationId, name: organizationName }) =>
    updateOrganization(mcpAccess(), organizationId, parseName({ name: organizationName })),
  );
  tool(server, "delete_tenant", "Delete a organization.", { organizationId: guid }, async ({ organizationId }) => {
    await deleteOrganization(mcpAccess(), organizationId);
    return "deleted";
  });

  tool(server, "list_tags", "List tags in an tenant.", { tenantId: guid, ...page }, ({ tenantId, limit, offset }) =>
    listTags(mcpAccess(), tenantId, query({ limit, offset })),
  );
  tool(server, "create_tag", "Create a tag.", { tenantId: guid, ...name }, ({ tenantId, name: tagName }) =>
    createTag(mcpAccess(), tenantId, parseName({ name: tagName })),
  );
  tool(server, "update_tag", "Rename a tag.", { tagId: guid, ...name }, ({ tagId, name: tagName }) =>
    updateTag(mcpAccess(), tagId, parseName({ name: tagName })),
  );
  tool(server, "delete_tag", "Delete a tag.", { tagId: guid }, async ({ tagId }) => {
    await deleteTag(mcpAccess(), tagId);
    return "deleted";
  });

  tool(
    server,
    "list_task_categories",
    "List task categories in an tenant.",
    { tenantId: guid, ...page },
    ({ tenantId, limit, offset }) => listTaskCategories(mcpAccess(), tenantId, query({ limit, offset })),
  );
  tool(
    server,
    "create_task_category",
    "Create a task category.",
    { tenantId: guid, ...name },
    ({ tenantId, name: categoryName }) => createTaskCategory(mcpAccess(), tenantId, parseName({ name: categoryName })),
  );
  tool(
    server,
    "update_task_category",
    "Rename a task category.",
    { taskCategoryId: guid, ...name },
    ({ taskCategoryId, name: categoryName }) => updateTaskCategory(mcpAccess(), taskCategoryId, parseName({ name: categoryName })),
  );
  tool(server, "delete_task_category", "Delete a task category.", { taskCategoryId: guid }, async ({ taskCategoryId }) => {
    await deleteTaskCategory(mcpAccess(), taskCategoryId);
    return "deleted";
  });

  tool(
    server,
    "list_hourly_rates",
    "List hourly rates in an tenant.",
    { tenantId: guid, ...page },
    ({ tenantId, limit, offset }) => listHourlyRates(mcpAccess(), tenantId, query({ limit, offset })),
  );
  tool(
    server,
    "create_hourly_rate",
    "Create an hourly rate. Pass JSON with type, name, perHourRate, and optional isDefault, isArchived, and source.",
    { tenantId: guid, body: z.string() },
    ({ tenantId, body }) => createHourlyRate(mcpAccess(), tenantId, parseCreateHourlyRate(jsonBody(body))),
  );
  tool(
    server,
    "update_hourly_rate",
    "Update an hourly rate. Pass JSON with any of type, name, perHourRate, isDefault, isArchived, and source.",
    { hourlyRateId: guid, body: z.string() },
    ({ hourlyRateId, body }) => updateHourlyRate(mcpAccess(), hourlyRateId, parseUpdateHourlyRate(jsonBody(body))),
  );
  tool(server, "delete_hourly_rate", "Delete an hourly rate.", { hourlyRateId: guid }, async ({ hourlyRateId }) => {
    await deleteHourlyRate(mcpAccess(), hourlyRateId);
    return "deleted";
  });

  tool(server, "list_themes", "List global and tenant themes.", { tenantId: guid }, ({ tenantId }) =>
    listThemes(mcpAccess(), tenantId),
  );
  tool(
    server,
    "create_theme",
    "Create an tenant theme. Pass JSON matching the theme write body.",
    { tenantId: guid, body: z.string() },
    ({ tenantId, body }) => createTheme(mcpAccess(), tenantId, parseThemeWrite(jsonBody(body))),
  );
  tool(
    server,
    "update_theme",
    "Update an tenant theme.",
    { tenantId: guid, themeId: guid, body: z.string() },
    ({ tenantId, themeId, body }) => updateTheme(mcpAccess(), tenantId, themeId, parseThemeWrite(jsonBody(body))),
  );
  tool(server, "delete_theme", "Delete an tenant theme.", { tenantId: guid, themeId: guid }, async ({ tenantId, themeId }) => {
    await deleteTheme(mcpAccess(), tenantId, themeId);
    return "deleted";
  });

  const filter = z.string().nullable();
  tool(
    server,
    "list_volunteer_needs",
    "List volunteer needs in an tenant.",
    {
      tenantId: guid,
      ...page,
      q: filter,
      type: filter,
      projectId: filter,
      organizationId: filter,
      allowPublic: filter,
      sort: filter,
      order: filter,
    },
    ({ tenantId, limit, offset, q, type, projectId, organizationId, allowPublic, sort, order }) =>
      listVolunteerNeeds(
        mcpAccess(),
        tenantId,
        query({ limit, offset, q, type, projectId, organizationId, allowPublic, sort, order }),
      ),
  );
  tool(server, "get_volunteer_need", "Get a volunteer need, including the question form and correct answers.", { volunteerNeedId: guid }, ({ volunteerNeedId }) =>
    getVolunteerNeed(mcpAccess(), volunteerNeedId),
  );
  tool(
    server,
    "create_volunteer_need",
    "Create a volunteer need. Pass JSON with name, type (Position or Task), countNeeded, and optional description, dates, allowPublic, requireVetting, questions, projectId, taskCategoryId, and organizationId.",
    { tenantId: guid, body: z.string() },
    ({ tenantId, body }) => createVolunteerNeed(mcpAccess(), tenantId, parseSaveNeed(jsonBody(body))),
  );
  tool(
    server,
    "update_volunteer_need",
    "Update a volunteer need. Pass JSON with any writable need field.",
    { volunteerNeedId: guid, body: z.string() },
    ({ volunteerNeedId, body }) => updateVolunteerNeed(mcpAccess(), volunteerNeedId, parseUpdateNeed(jsonBody(body))),
  );
  tool(server, "delete_volunteer_need", "Delete a volunteer need and its signups.", { volunteerNeedId: guid }, async ({ volunteerNeedId }) => {
    await deleteVolunteerNeed(mcpAccess(), volunteerNeedId);
    return "deleted";
  });
}
