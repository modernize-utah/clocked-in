import { Prisma } from "@/generated/prisma/client";
import { Access } from "@/lib/api/access";
import { guard } from "@/lib/api/db";
import { conflict, forbidden, notFound, validation } from "@/lib/api/errors";
import {
  AccessType,
  asDateOnly,
  Body,
  description,
  has,
  ids,
  list,
  normalizeAccessType,
  normalizeProjectType,
  type ProjectType,
  optional,
  Optional,
  optionalDate,
  optionalDescription,
  optionalString,
  optionalUuid,
  or,
  page,
  requireBool,
  requireName,
  requireString,
} from "@/lib/api/json";
import { prisma } from "@/lib/prisma";

const projectInclude = { editors: { select: { userId: true } } } as const;
type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

function projectJson(project: ProjectRow) {
  return {
    id: project.id,
    organizationId: project.organizationId,
    departmentId: project.departmentId,
    ownerUserId: project.ownerUserId,
    title: project.title,
    description: project.description,
    accessType: project.accessType,
    projectType: project.projectType,
    startDate: project.startDate ? asDateOnly(project.startDate) : null,
    endDate: project.endDate ? asDateOnly(project.endDate) : null,
    isActive: project.isActive,
    editorIds: project.editors.map((editor) => editor.userId).sort(),
  };
}

export type CreateProjectRequest = {
  accessType: AccessType;
  projectType: ProjectType;
  departmentId: string | null;
  startDate: Date | null;
  endDate: Date | null;
  editorIds: string[];
  title: string;
  description: string | null;
  isActive: boolean;
};

export function parseCreateProject(body: Body): CreateProjectRequest {
  return {
    accessType: normalizeAccessType(requireString(body, "accessType")),
    projectType: has(body, "projectType") ? normalizeProjectType(requireString(body, "projectType")) : "Project",
    departmentId: optionalUuid(body, "departmentId"),
    startDate: optionalDate(body, "startDate"),
    endDate: optionalDate(body, "endDate"),
    editorIds: ids(body, "editorIds", true),
    title: requireName(requireString(body, "title"), "title"),
    description: optionalDescription(body),
    isActive: !has(body, "isActive") || requireBool(body, "isActive"),
  };
}

export type UpdateProjectRequest = {
  accessType: Optional<AccessType>;
  projectType: Optional<ProjectType>;
  departmentId: Optional<string | null>;
  startDate: Optional<Date | null>;
  endDate: Optional<Date | null>;
  title: Optional<string>;
  description: Optional<string | null>;
  isActive: Optional<boolean>;
  editorIds: Optional<string[]>;
};

export function parseUpdateProject(body: Body): UpdateProjectRequest {
  const request: UpdateProjectRequest = {
    accessType: optional(body, "accessType", (b, k) => normalizeAccessType(requireString(b, k))),
    projectType: optional(body, "projectType", (b, k) => normalizeProjectType(requireString(b, k))),
    departmentId: optional(body, "departmentId", optionalUuid),
    startDate: optional(body, "startDate", optionalDate),
    endDate: optional(body, "endDate", optionalDate),
    title: optional(body, "title", (b, k) => requireName(requireString(b, k), k)),
    description: optional(body, "description", (b, k) => description(optionalString(b, k))),
    isActive: optional(body, "isActive", requireBool),
    editorIds: optional(body, "editorIds", (b, k) => ids(b, k, false)),
  };
  if (Object.values(request).every((field) => !field.set)) {
    validation("Provide at least one field to update.");
  }

  return request;
}

async function load(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: projectInclude });
  if (!project) {
    notFound();
  }

  return project;
}

async function requireRead(access: Access, project: ProjectRow) {
  await access.requireOrganization(project.organizationId, false);
  if (
    access.isApiKey ||
    access.isSuperAdmin ||
    (await access.isOrgAdmin(project.organizationId)) ||
    project.accessType === "Public" ||
    project.ownerUserId === access.actorUserId ||
    project.editors.some((editor) => editor.userId === access.actorUserId)
  ) {
    return;
  }

  if (
    project.accessType === "Department" &&
    project.departmentId &&
    (await access.departmentIds()).includes(project.departmentId)
  ) {
    return;
  }

  forbidden();
}

async function assertManage(access: Access, project: ProjectRow) {
  if (access.isApiKey) {
    if (!access.canWrite(project.organizationId)) {
      forbidden();
    }

    return;
  }

  if (
    access.isSuperAdmin ||
    (await access.isOrgAdmin(project.organizationId)) ||
    project.ownerUserId === access.actorUserId ||
    project.editors.some((editor) => editor.userId === access.actorUserId)
  ) {
    return;
  }

  if (
    project.accessType === "Department" &&
    project.departmentId &&
    (await access.isDepartmentAdmin(project.departmentId))
  ) {
    return;
  }

  forbidden();
}

async function assertAccessWrite(
  access: Access,
  organizationId: string,
  accessType: string,
  departmentId: string | null,
) {
  if (accessType !== "Department") {
    if (departmentId !== null) {
      validation("departmentId must be empty when accessType is Public or Private.");
    }

    return;
  }

  if (departmentId === null) {
    validation("departmentId is required when accessType is Department.");
  }

  const department = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!department) {
    notFound();
  }

  if (department.organizationId !== organizationId) {
    validation("departmentId does not belong to this organization.");
  }

  if (
    !access.isSuperAdmin &&
    !access.canWrite(organizationId) &&
    !(await access.isOrgAdmin(organizationId)) &&
    !(await access.isDepartmentAdmin(departmentId))
  ) {
    forbidden();
  }
}

function assertDates(accessType: string, departmentId: string | null, startDate: Date | null, endDate: Date | null) {
  if (accessType === "Department" && departmentId === null) {
    validation("departmentId is required when accessType is Department.");
  }

  if (accessType !== "Department" && departmentId !== null) {
    validation("departmentId must be empty when accessType is Public or Private.");
  }

  if (startDate && endDate && endDate < startDate) {
    validation("endDate must be on or after startDate.");
  }
}

async function editors(organizationId: string, ownerUserId: string, editorIds: string[]) {
  const unique = [...new Set(editorIds)].filter((id) => id !== ownerUserId);
  if (unique.length === 0) {
    return unique;
  }

  const members = await prisma.organizationMembership.count({
    where: { organizationId, userId: { in: unique } },
  });
  if (members !== unique.length) {
    validation("Each editor must be a member of this organization.");
  }

  return unique;
}

export async function listProjects(access: Access, organizationId: string, params: URLSearchParams) {
  const paging = page(params);
  await access.requireOrganization(organizationId, false);
  let where: Prisma.ProjectWhereInput = { organizationId };
  if (!access.isApiKey && !access.isSuperAdmin && !(await access.isOrgAdmin(organizationId))) {
    where = {
      organizationId,
      OR: [
        { accessType: "Public" },
        { ownerUserId: access.actorUserId },
        { editors: { some: { userId: access.actorUserId } } },
        { accessType: "Department", departmentId: { in: await access.departmentIds() } },
      ],
    };
  }

  const includeInactive = params.get("includeInactive") === "true";
  if (!includeInactive) {
    where = { ...where, isActive: true };
  }
  const projects = await prisma.project.findMany({
    where,
    include: projectInclude,
    orderBy: { title: "asc" },
    skip: paging.offset,
    take: paging.limit,
  });
  return list(projects.map(projectJson), paging);
}

export async function createProject(access: Access, organizationId: string, request: CreateProjectRequest) {
  await access.requireOrganization(organizationId, access.isApiKey);
  await access.requirePermission(
    organizationId,
    "create_projects",
    request.accessType === "Department" ? request.departmentId : null,
  );
  await assertAccessWrite(access, organizationId, request.accessType, request.departmentId);
  assertDates(request.accessType, request.departmentId, request.startDate, request.endDate);
  const editorIds = await editors(organizationId, access.actorUserId, request.editorIds);
  const project = await guard(
    prisma.project.create({
      data: {
        organizationId,
        departmentId: request.accessType === "Department" ? request.departmentId : null,
        ownerUserId: access.actorUserId,
        title: request.title,
        description: request.description,
        accessType: request.accessType,
        projectType: request.projectType,
        startDate: request.startDate,
        endDate: request.endDate,
        isActive: request.isActive,
        editors: { create: editorIds.map((userId) => ({ userId })) },
      },
      include: projectInclude,
    }),
  );
  return projectJson(project);
}

export async function getProject(access: Access, projectId: string) {
  const project = await load(projectId);
  await requireRead(access, project);
  return projectJson(project);
}

export async function updateProject(access: Access, projectId: string, request: UpdateProjectRequest) {
  const project = await load(projectId);
  await assertManage(access, project);
  const accessType = or(request.accessType, project.accessType as AccessType);
  const departmentId = or(request.departmentId, project.departmentId);
  await assertAccessWrite(access, project.organizationId, accessType, departmentId);
  const startDate = or(request.startDate, project.startDate);
  const endDate = or(request.endDate, project.endDate);
  assertDates(accessType, departmentId, startDate, endDate);
  const editorIds = request.editorIds.set
    ? await editors(project.organizationId, project.ownerUserId, request.editorIds.value)
    : undefined;
  const placementChanged = request.accessType.set || request.departmentId.set;
  const updated = await guard(
    prisma.project.update({
      where: { id: projectId },
      data: {
        title: request.title.set ? request.title.value : undefined,
        description: request.description.set ? request.description.value : undefined,
        projectType: request.projectType.set ? request.projectType.value : undefined,
        accessType: placementChanged ? accessType : undefined,
        departmentId: placementChanged ? (accessType === "Department" ? departmentId : null) : undefined,
        startDate,
        endDate,
        isActive: request.isActive.set ? request.isActive.value : undefined,
        editors: editorIds
          ? { deleteMany: {}, create: editorIds.map((userId) => ({ userId })) }
          : undefined,
      },
      include: projectInclude,
    }),
  );
  return projectJson(updated);
}

export async function deleteProject(access: Access, projectId: string) {
  const project = await load(projectId);
  await assertManage(access, project);
  const referenced =
    (await prisma.userTimeEntry.count({ where: { projectId } })) > 0 ||
    (await prisma.collectiveTimeEntry.count({ where: { projectId } })) > 0;
  if (referenced) {
    conflict("Delete the time entries first.");
  }

  await guard(prisma.project.delete({ where: { id: projectId } }));
}
