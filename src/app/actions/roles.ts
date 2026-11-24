"use server";

import {
  createTenantRole,
  deleteTenantRole,
  parseCreateRole,
  parseUpdateRole,
  updateTenantRole,
} from "@/lib/api/features/roles";
import { body, run } from "@/lib/server/action";
import { requireAccess } from "@/lib/server/session";

export async function createRoleAction(
  tenantId: string,
  input: { name: string; code?: string; scope?: string; permissions: string[] },
) {
  return run(async () => {
    const access = await requireAccess();
    return createTenantRole(access, tenantId, parseCreateRole(body(input)));
  }, "Role created.");
}

export async function updateRoleAction(
  tenantId: string,
  roleId: string,
  input: { name?: string; scope?: string; permissions?: string[] },
) {
  return run(async () => {
    const access = await requireAccess();
    return updateTenantRole(access, tenantId, roleId, parseUpdateRole(body(input)));
  }, "Role saved.");
}

export async function deleteRoleAction(tenantId: string, roleId: string) {
  return run(async () => {
    const access = await requireAccess();
    await deleteTenantRole(access, tenantId, roleId);
  }, "Role deleted.");
}
