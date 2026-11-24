"use server";

import {
  createAccessRequest,
  decideAccessRequest,
  parseCreateAccessRequest,
} from "@/lib/api/features/access-requests";
import { body, run } from "@/lib/server/action";
import { requireAccess } from "@/lib/server/session";

export async function requestAccessAction(
  tenantId: string,
  input: { message?: string; requestedRole?: string; requestedOrganizationIds?: string[] },
) {
  return run(async () => {
    const access = await requireAccess();
    return createAccessRequest(access, tenantId, parseCreateAccessRequest(body(input)));
  }, "Access request sent.");
}

export async function decideAccessRequestAction(
  tenantId: string,
  requestId: string,
  status: "approved" | "declined",
) {
  return run(async () => {
    const access = await requireAccess();
    return decideAccessRequest(access, tenantId, requestId, status);
  }, status === "approved" ? "Request approved." : "Request declined.");
}
