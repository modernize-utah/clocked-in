import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  createCollective,
  deleteCollective,
  getCollective,
  listCollective,
  parseCreateCollective,
  parseUpdateCollective,
  updateCollective,
} from "@/lib/api/features/collective";
import {
  cancelClock,
  clockIn,
  clockOut,
  parseClockTarget,
  resetClock,
  createTimeEntry,
  deleteTimeEntry,
  getTimeEntry,
  listTimeEntries,
  parseClockIn,
  parseClockOut,
  parseCreateTimeEntry,
  parseUpdateTimeEntry,
  updateTimeEntry,
} from "@/lib/api/features/time-entries";
import { jsonBody, query } from "@/lib/mcp/call";
import { mcpAccess } from "@/lib/mcp/context";
import { guid, tool } from "@/lib/mcp/tool";

const page = { limit: z.number().int().nullable(), offset: z.number().int().nullable() };

export function registerTimeTools(server: McpServer) {
  tool(
    server,
    "list_time_entries",
    "List a user's time entries. Optional organizationId, departmentId, from, to, limit, offset.",
    {
      userId: guid,
      organizationId: z.string().nullable(),
      departmentId: z.string().nullable(),
      from: z.string().nullable(),
      to: z.string().nullable(),
      ...page,
    },
    ({ userId, organizationId, departmentId, from, to, limit, offset }) =>
      listTimeEntries(mcpAccess(), userId, query({ organizationId, departmentId, from, to, limit, offset })),
  );

  tool(server, "get_time_entry", "Get a time entry by id.", { timeEntryId: guid }, ({ timeEntryId }) =>
    getTimeEntry(mcpAccess(), timeEntryId),
  );

  tool(
    server,
    "create_time_entry",
    "Create a time entry for a user. Pass JSON with mode (Punch, Duration, Total), organizationId, optional projectId, optional taskCategoryId, and time fields.",
    { userId: guid, body: z.string() },
    ({ userId, body }) => createTimeEntry(mcpAccess(), userId, parseCreateTimeEntry(jsonBody(body))),
  );

  tool(
    server,
    "update_time_entry",
    "Update a time entry. Pass JSON with any writable fields.",
    { timeEntryId: guid, body: z.string() },
    ({ timeEntryId, body }) => updateTimeEntry(mcpAccess(), timeEntryId, parseUpdateTimeEntry(jsonBody(body))),
  );

  tool(server, "delete_time_entry", "Delete a time entry.", { timeEntryId: guid }, async ({ timeEntryId }) => {
    await deleteTimeEntry(mcpAccess(), timeEntryId);
    return "deleted";
  });

  tool(
    server,
    "clock_in",
    "Clock in a user. userId is required for organization API keys. Pass JSON with organizationId, projectId, taskCategoryId, optional departmentId, tagIds, hourlyRateId.",
    { userId: guid, body: z.string() },
    ({ userId, body }) => {
      const json = jsonBody(body);
      json.userId = userId;
      return clockIn(mcpAccess(), parseClockIn(json));
    },
  );

  tool(
    server,
    "clock_out",
    "Clock out a user. userId is required for organization API keys.",
    { userId: guid, description: z.string().nullable(), tagIds: z.array(guid).nullable() },
    ({ userId, description, tagIds }) => {
      const body: Record<string, unknown> = { userId };
      if (description !== null) {
        body.description = description;
      }
      if (tagIds !== null) {
        body.tagIds = tagIds;
      }
      return clockOut(mcpAccess(), parseClockOut(body));
    },
  );

  tool(server, "cancel_clock", "Discard a user's running timer without saving it. userId is required for organization API keys.", { userId: guid }, async ({ userId }) => {
    await cancelClock(mcpAccess(), parseClockTarget({ userId }));
    return "cancelled";
  });

  tool(server, "reset_clock", "Restart a user's running timer from now. The time so far is not saved. userId is required for organization API keys.", { userId: guid }, ({ userId }) =>
    resetClock(mcpAccess(), parseClockTarget({ userId })),
  );

  tool(
    server,
    "list_collective_entries",
    "List collective time entries. Optional organizationId, departmentId, limit, offset.",
    { organizationId: z.string().nullable(), departmentId: z.string().nullable(), ...page },
    ({ organizationId, departmentId, limit, offset }) =>
      listCollective(mcpAccess(), query({ organizationId, departmentId, limit, offset })),
  );

  tool(server, "get_collective_entry", "Get a collective time entry.", { collectiveEntryId: guid }, ({ collectiveEntryId }) =>
    getCollective(mcpAccess(), collectiveEntryId),
  );

  tool(
    server,
    "create_collective_entry",
    "Create a collective time entry. Pass JSON with organizationId, projectId, taskCategoryId, startedAt, endedAt, participantCount.",
    { body: z.string() },
    ({ body }) => createCollective(mcpAccess(), parseCreateCollective(jsonBody(body))),
  );

  tool(
    server,
    "update_collective_entry",
    "Update a collective time entry.",
    { collectiveEntryId: guid, body: z.string() },
    ({ collectiveEntryId, body }) => updateCollective(mcpAccess(), collectiveEntryId, parseUpdateCollective(jsonBody(body))),
  );

  tool(server, "delete_collective_entry", "Delete a collective time entry.", { collectiveEntryId: guid }, async ({ collectiveEntryId }) => {
    await deleteCollective(mcpAccess(), collectiveEntryId);
    return "deleted";
  });
}
