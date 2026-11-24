import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

export async function archiveCaswjClockifyDuplicates(prisma: PrismaClient) {
  const tenantName = process.env.CASWJ_ORG_NAME?.trim() || "Cultural Arts Society of West Jordan";
  const tenant =
    (await prisma.tenant.findFirst({
      where: { name: { equals: tenantName, mode: "insensitive" } },
      include: { organizations: true, projects: true, tags: true },
    })) ??
    (await prisma.tenant.findFirst({
      where: { name: { equals: "CASWJ", mode: "insensitive" } },
      include: { organizations: true, projects: true, tags: true },
    }));
  if (!tenant) {
    throw new Error(`Tenant ${tenantName} was not found.`);
  }

  const organizationNames = new Set(tenant.organizations.map((organization) => organization.name.toLowerCase()));
  const duplicateProjects = tenant.projects.filter((project) => organizationNames.has(project.title.toLowerCase()));
  const duplicateTags = tenant.tags.filter((tag) => /^\((org|type)\)/i.test(tag.name));

  await prisma.project.updateMany({
    where: { id: { in: duplicateProjects.map((project) => project.id) } },
    data: { isActive: false },
  });
  await prisma.tag.updateMany({
    where: { id: { in: duplicateTags.map((tag) => tag.id) } },
    data: { isArchived: true },
  });

  console.log(
    `Archived ${duplicateProjects.length} projects that match group names and ${duplicateTags.length} (Org)/(Type) tags.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  archiveCaswjClockifyDuplicates(prisma)
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
