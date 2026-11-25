import { Access } from "@/lib/api/access";
import { guard } from "@/lib/api/db";
import { conflict, notFound } from "@/lib/api/errors";
import { list, page } from "@/lib/api/json";
import { NameRequest } from "@/lib/api/features/tenants";
import { prisma } from "@/lib/prisma";

function organizationJson(organization: { id: string; tenantId: string; name: string; externalId?: string | null }) {
  return {
    id: organization.id,
    tenantId: organization.tenantId,
    name: organization.name,
    externalId: organization.externalId ?? null,
  };
}

async function managed(access: Access, organizationId: string) {
  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization) {
    notFound();
  }

  await access.requireTenant(organization.tenantId, true);
  return organization;
}

export async function listOrganizations(access: Access, tenantId: string, params: URLSearchParams) {
  const paging = page(params);
  await access.requireTenant(tenantId, false);
  const organizations = await prisma.organization.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
    skip: paging.offset,
    take: paging.limit,
  });
  return list(organizations.map(organizationJson), paging);
}

export async function createOrganization(access: Access, tenantId: string, request: NameRequest) {
  const { assertTenantGroupsMutable } = await import("@/lib/api/features/external-sync");
  await assertTenantGroupsMutable(tenantId);
  await access.requireTenant(tenantId, true);
  return organizationJson(await guard(prisma.organization.create({ data: { tenantId, name: request.name } })));
}

export async function getOrganization(access: Access, organizationId: string) {
  return organizationJson(await access.requireOrganization(organizationId));
}

export async function updateOrganization(access: Access, organizationId: string, request: NameRequest) {
  const organization = await managed(access, organizationId);
  const { assertTenantGroupsMutable } = await import("@/lib/api/features/external-sync");
  await assertTenantGroupsMutable(organization.tenantId);
  return organizationJson(
    await guard(prisma.organization.update({ where: { id: organizationId }, data: { name: request.name } })),
  );
}

export async function deleteOrganization(access: Access, organizationId: string) {
  const current = await managed(access, organizationId);
  const { assertTenantGroupsMutable } = await import("@/lib/api/features/external-sync");
  await assertTenantGroupsMutable(current.tenantId);
  const referenced =
    (await prisma.userTimeEntry.count({ where: { organizationId } })) > 0 ||
    (await prisma.collectiveTimeEntry.count({ where: { organizationId } })) > 0;
  if (referenced) {
    conflict("Delete the time entries first.");
  }

  await guard(prisma.organization.delete({ where: { id: organizationId } }));
}
