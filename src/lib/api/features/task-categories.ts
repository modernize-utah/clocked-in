import { Access } from "@/lib/api/access";
import { guard } from "@/lib/api/db";
import { conflict, notFound } from "@/lib/api/errors";
import { list, page } from "@/lib/api/json";
import { NameRequest } from "@/lib/api/features/tenants";
import { prisma } from "@/lib/prisma";

function taskCategoryJson(category: { id: string; tenantId: string; name: string }) {
  return { id: category.id, tenantId: category.tenantId, name: category.name };
}

async function managed(access: Access, categoryId: string) {
  const category = await prisma.taskCategory.findUnique({ where: { id: categoryId } });
  if (!category) {
    notFound();
  }

  await access.requireTenant(category.tenantId, true);
  return category;
}

export async function listTaskCategories(access: Access, tenantId: string, params: URLSearchParams) {
  const paging = page(params);
  await access.requireTenant(tenantId, false);
  const categories = await prisma.taskCategory.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
    skip: paging.offset,
    take: paging.limit,
  });
  return list(categories.map(taskCategoryJson), paging);
}

export async function createTaskCategory(access: Access, tenantId: string, request: NameRequest) {
  await access.requireTenant(tenantId, true);
  return taskCategoryJson(await guard(prisma.taskCategory.create({ data: { tenantId, name: request.name } })));
}

export async function updateTaskCategory(access: Access, categoryId: string, request: NameRequest) {
  await managed(access, categoryId);
  return taskCategoryJson(
    await guard(prisma.taskCategory.update({ where: { id: categoryId }, data: { name: request.name } })),
  );
}

export async function deleteTaskCategory(access: Access, categoryId: string) {
  await managed(access, categoryId);
  const referenced =
    (await prisma.userTimeEntry.count({ where: { taskCategoryId: categoryId } })) > 0 ||
    (await prisma.collectiveTimeEntry.count({ where: { taskCategoryId: categoryId } })) > 0;
  if (referenced) {
    conflict("Delete the time entries first.");
  }

  await guard(prisma.taskCategory.delete({ where: { id: categoryId } }));
}
