"use server";

import { createOrganization, deleteOrganization, updateOrganization } from "@/lib/api/features/organizations";
import { parseName } from "@/lib/api/features/tenants";
import { createProject, deleteProject, parseCreateProject, parseUpdateProject, updateProject } from "@/lib/api/features/projects";
import { createTag, deleteTag, updateTag } from "@/lib/api/features/tags";
import { createTaskCategory, deleteTaskCategory, updateTaskCategory } from "@/lib/api/features/task-categories";
import { run } from "@/lib/server/action";
import { requireAccess } from "@/lib/server/session";

export type LookupKind = "organizations" | "projects" | "categories" | "tags";
export type NamedLookupKind = Exclude<LookupKind, "projects">;

export async function createLookupAction(kind: LookupKind, tenantId: string, name: string) {
  return run(async () => {
    const access = await requireAccess();
    switch (kind) {
      case "organizations":
        return createOrganization(access, tenantId, parseName({ name }));
      case "categories":
        return createTaskCategory(access, tenantId, parseName({ name }));
      case "tags":
        return createTag(access, tenantId, parseName({ name }));
      case "projects":
        return createProject(access, tenantId, parseCreateProject({ title: name, accessType: "Public" }));
    }
  }, "Added.");
}

export async function updateLookupAction(kind: NamedLookupKind, id: string, name: string) {
  return run(async () => {
    const access = await requireAccess();
    const request = parseName({ name });
    switch (kind) {
      case "organizations":
        return updateOrganization(access, id, request);
      case "categories":
        return updateTaskCategory(access, id, request);
      case "tags":
        return updateTag(access, id, request);
    }
  }, "Saved.");
}

export async function archiveProjectAction(projectId: string, isActive: boolean) {
  return run(async () => {
    const access = await requireAccess();
    return updateProject(access, projectId, parseUpdateProject({ isActive }));
  }, isActive ? "Project restored." : "Project archived.");
}

export async function archiveTagAction(tagId: string, isArchived: boolean) {
  return run(async () => {
    const access = await requireAccess();
    return updateTag(access, tagId, { name: "", isArchived });
  }, isArchived ? "Tag archived." : "Tag restored.");
}

export async function deleteLookupAction(kind: LookupKind, id: string) {
  return run(async () => {
    const access = await requireAccess();
    switch (kind) {
      case "organizations":
        return deleteOrganization(access, id);
      case "categories":
        return deleteTaskCategory(access, id);
      case "tags":
        return deleteTag(access, id);
      case "projects":
        return deleteProject(access, id);
    }
  }, "Deleted.");
}

export async function deleteLookupsAction(kind: LookupKind, ids: string[]) {
  return run(
    async () => {
      const access = await requireAccess();
      for (const id of ids) {
        switch (kind) {
          case "organizations":
            await deleteOrganization(access, id);
            break;
          case "categories":
            await deleteTaskCategory(access, id);
            break;
          case "tags":
            await deleteTag(access, id);
            break;
          case "projects":
            await deleteProject(access, id);
            break;
        }
      }
    },
    ids.length === 1 ? "Deleted." : `${ids.length} deleted.`,
  );
}
