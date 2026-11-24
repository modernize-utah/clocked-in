"use server";

import { createProject, parseCreateProject, parseUpdateProject, updateProject } from "@/lib/api/features/projects";
import { body, run } from "@/lib/server/action";
import { requireAccess } from "@/lib/server/session";

export type ProjectInput = {
  title: string;
  projectType: "Project" | "Event";
  organizationId: string | null;
  startDate: string | null;
  endDate: string | null;
};

function placement(organizationId: string | null) {
  return organizationId
    ? { accessType: "Organization" as const, organizationId }
    : { accessType: "Public" as const, organizationId: null };
}

export async function createProjectAction(tenantId: string, input: ProjectInput) {
  return run(async () => {
    const access = await requireAccess();
    return createProject(
      access,
      tenantId,
      parseCreateProject(
        body({
          title: input.title,
          projectType: input.projectType,
          ...placement(input.organizationId),
          startDate: input.startDate,
          endDate: input.endDate,
        }),
      ),
    );
  }, "Added.");
}

export async function updateProjectAction(projectId: string, input: ProjectInput) {
  return run(async () => {
    const access = await requireAccess();
    return updateProject(
      access,
      projectId,
      parseUpdateProject(
        body({
          title: input.title,
          projectType: input.projectType,
          ...placement(input.organizationId),
          startDate: input.startDate,
          endDate: input.endDate,
        }),
      ),
    );
  }, "Saved.");
}
