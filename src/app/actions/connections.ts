"use server";

import {
  createConnection,
  deleteConnection,
  parseCreateConnection,
  parseUpdateConnection,
  updateConnection,
} from "@/lib/api/features/connections";
import { body, run } from "@/lib/server/action";
import { requireAccess } from "@/lib/server/session";

export async function createConnectionAction(
  tenantId: string,
  input: { userId: string; connectedUserId: string; relationship: string },
) {
  return run(async () => {
    const access = await requireAccess();
    return createConnection(access, tenantId, parseCreateConnection(body(input)));
  }, "Connection added.");
}

export async function updateConnectionAction(
  tenantId: string,
  connectionId: string,
  input: { userId: string; relationship: string },
) {
  return run(async () => {
    const access = await requireAccess();
    return updateConnection(access, tenantId, connectionId, parseUpdateConnection(body(input)));
  }, "Connection updated.");
}

export async function deleteConnectionAction(tenantId: string, connectionId: string) {
  return run(async () => {
    const access = await requireAccess();
    await deleteConnection(access, tenantId, connectionId);
  }, "Connection removed.");
}
