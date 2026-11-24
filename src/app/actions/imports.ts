"use server";

import { importPeople, importProjects } from "@/lib/api/features/imports";
import { run } from "@/lib/server/action";
import { requireAccess } from "@/lib/server/session";

export async function importPeopleAction(tenantId: string, rows: Record<string, string>[], emailUsers = false) {
  return run(async () => {
    const access = await requireAccess();
    return importPeople(access, tenantId, rows, emailUsers);
  });
}

export async function importProjectsAction(tenantId: string, rows: Record<string, string>[]) {
  return run(async () => {
    const access = await requireAccess();
    return importProjects(access, tenantId, rows);
  });
}
