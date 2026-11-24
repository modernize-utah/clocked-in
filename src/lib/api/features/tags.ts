import { Access } from "@/lib/api/access";
import { guard } from "@/lib/api/db";
import { notFound } from "@/lib/api/errors";
import { list, page } from "@/lib/api/json";
import { NameRequest } from "@/lib/api/features/tenants";
import { prisma } from "@/lib/prisma";

function tagJson(tag: { id: string; tenantId: string; name: string; isArchived?: boolean }) {
  return { id: tag.id, tenantId: tag.tenantId, name: tag.name, isArchived: tag.isArchived ?? false };
}

async function managed(access: Access, tagId: string) {
  const tag = await prisma.tag.findUnique({ where: { id: tagId } });
  if (!tag) {
    notFound();
  }

  await access.requireTenant(tag.tenantId, true);
  return tag;
}

export async function listTags(access: Access, tenantId: string, params: URLSearchParams) {
  const paging = page(params);
  await access.requireTenant(tenantId, false);
  const tags = await prisma.tag.findMany({
    where: { tenantId, ...(params.get("includeArchived") === "true" ? {} : { isArchived: false }) },
    orderBy: { name: "asc" },
    skip: paging.offset,
    take: paging.limit,
  });
  return list(tags.map(tagJson), paging);
}

export async function createTag(access: Access, tenantId: string, request: NameRequest) {
  await access.requireTenant(tenantId, true);
  return tagJson(await guard(prisma.tag.create({ data: { tenantId, name: request.name } })));
}

export async function updateTag(access: Access, tagId: string, request: NameRequest & { isArchived?: boolean }) {
  await managed(access, tagId);
  return tagJson(
    await guard(
      prisma.tag.update({
        where: { id: tagId },
        data: {
          ...(request.name ? { name: request.name } : {}),
          ...(request.isArchived === undefined ? {} : { isArchived: request.isArchived }),
        },
      }),
    ),
  );
}

export async function deleteTag(access: Access, tagId: string) {
  await managed(access, tagId);
  await guard(prisma.tag.delete({ where: { id: tagId } }));
}
