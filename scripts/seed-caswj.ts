import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { prismaPoolConfig } from "../src/lib/prisma-connection";
import {
  baseCaswjTheme,
  baseCaswjThemeName,
  caswjLabels,
  caswjSourceRefPrefix,
  clockedInThemeId,
  departmentNames,
  indexProjectAliases,
  inKindFromMinutes,
  anonWorkbookPath,
  loadCaswjWorkbook,
  loadClockifyExport,
  localEmail,
  money,
  onDate,
  orgName,
  slug,
} from "./caswj-workbook";
import { archiveCaswjClockifyDuplicates } from "./archive-caswj-clockify-duplicates";

const envFiles = { local: ".env", staging: ".env.staging", production: ".env.production" } as const;
const appEnv = process.env.APP_ENV === "production" || process.env.APP_ENV === "staging" ? process.env.APP_ENV : "local";
config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), `../${envFiles[appEnv]}`) });

function prismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }

  return new PrismaClient({ adapter: new PrismaPg(prismaPoolConfig(connectionString, { pooled: false })) });
}

function namedSeedAllowed() {
  return appEnv === "local" || process.env.SEED_ALLOW_REAL_NAMES === "1";
}

async function seedBrandMarks(
  db: PrismaClient,
  organizationId: string,
) {
  const publicLogo = "/caswj-logo.svg";
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (token) {
    try {
      const { put } = await import("@vercel/blob");
      const sharp = (await import("sharp")).default;
      const svg = await readFile(path.resolve(process.cwd(), "public/caswj-logo.svg"));
      const access = process.env.BLOB_ACCESS?.trim().toLowerCase() === "public" ? "public" : "private";
      const mark = await sharp(svg).resize(64, 64, { fit: "cover", position: "centre" }).webp({ quality: 85 }).toBuffer();
      const wordmark = await sharp(svg).resize(800, 200, { fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
      const options = { access, addRandomSuffix: false, allowOverwrite: true, contentType: "image/webp", token } as const;
      const markBlob = await put(`orgs/${organizationId}/mark.webp`, mark, options);
      const wordmarkBlob = await put(`orgs/${organizationId}/wordmark.webp`, wordmark, options);
      await db.organization.update({
        where: { id: organizationId },
        data: { markUrl: markBlob.url, wordmarkUrl: wordmarkBlob.url, wordmarkOnLightUrl: wordmarkBlob.url },
      });
      return;
    } catch (error) {
      console.warn("CASWJ brand upload failed; using the public logo.", error);
    }
  }

  await db.organization.update({
    where: { id: organizationId },
    data: { markUrl: publicLogo, wordmarkUrl: publicLogo, wordmarkOnLightUrl: publicLogo },
  });
}

async function main() {
  const password = process.env.SEED_SUPERADMIN_PASSWORD?.trim();
  if (!password) {
    throw new Error("SEED_SUPERADMIN_PASSWORD is required.");
  }

  const named = namedSeedAllowed() && process.env.SEED_ANON !== "1";
  const anon = !named;
  if (anon && process.env.SEED_ANON !== "1") {
    console.warn(`Named CASWJ seed is local-only. Using the anonymized workbook for ${appEnv}. Set SEED_ALLOW_REAL_NAMES=1 to import real names.`);
  }

  const { categories, projects, people, logRows } = anon
    ? await loadClockifyExport(anonWorkbookPath)
    : await loadCaswjWorkbook();
  const sourceRefPrefix = anon ? "caswj-anon:" : caswjSourceRefPrefix;
  const projectAliases = indexProjectAliases(projects);
  const db = prismaClient();
  try {
    const [adminRole, volunteerRole] = await Promise.all([
      db.role.findUniqueOrThrow({ where: { code: "ADMIN" } }),
      db.role.findUniqueOrThrow({ where: { code: "VOLUNTEER" } }),
    ]);
    const adminHash = await bcrypt.hash(password, 12);
    const organization =
      (await db.organization.findFirst({ where: { name: orgName } })) ??
      (await db.organization.create({
        data: {
          name: orgName,
          defaultRateType: "Volunteer",
          themeId: clockedInThemeId,
          preferences: {
            allowTimeEntryEditing: true,
            entityLabels: caswjLabels,
          },
        },
      }));
    const theme =
      (await db.theme.findFirst({ where: { organizationId: organization.id, name: baseCaswjThemeName } })) ??
      (await db.theme.create({
        data: {
          organizationId: organization.id,
          ...baseCaswjTheme,
        },
      }));
    await db.theme.update({
      where: { id: theme.id },
      data: baseCaswjTheme,
    });
    await db.organization.update({
      where: { id: organization.id },
      data: {
        defaultRateType: "Volunteer",
        themeId: theme.id,
        preferences: { allowTimeEntryEditing: true, entityLabels: caswjLabels },
      },
    });
    await seedBrandMarks(db, organization.id);

    const admin =
      (await db.user.findFirst({ where: { OR: [{ username: "jbaddley" }, { email: "jasonbaddley+caswj@gmail.com" }] } })) ??
      (await db.user.create({
        data: {
          username: "jbaddley",
          email: "jasonbaddley+caswj@gmail.com",
          passwordHash: adminHash,
          isSuperAdmin: true,
          profile: { create: { firstName: "Jason", lastName: "Baddley", displayName: "Jason Baddley" } },
        },
      }));
    await db.user.update({
      where: { id: admin.id },
      data: { username: "jbaddley", email: "jasonbaddley+caswj@gmail.com", passwordHash: adminHash, isSuperAdmin: true },
    });
    await db.organizationMembership.upsert({
      where: { userId_organizationId: { userId: admin.id, organizationId: organization.id } },
      update: { roleId: adminRole.id, isActive: true },
      create: { userId: admin.id, organizationId: organization.id, roleId: adminRole.id, rateType: "Volunteer", isActive: true },
    });

    let dworkmanStatus = "skipped";
    let dworkmanPassword: string | null = null;
    if (!anon) {
    const dworkmanByUsername = await db.user.findUnique({ where: { username: "dworkman" } });
    const dworkmanByEmail = await db.user.findUnique({ where: { email: "volunteer@wjarts.org" } });
    if (dworkmanByUsername && dworkmanByEmail && dworkmanByUsername.id !== dworkmanByEmail.id) {
      throw new Error("Username dworkman and email volunteer@wjarts.org belong to different users.");
    }

    const dworkmanExisting = dworkmanByUsername ?? dworkmanByEmail;
    dworkmanPassword = dworkmanExisting ? null : randomBytes(12).toString("base64url");
    const dworkman = dworkmanExisting
      ? await db.user.update({
          where: { id: dworkmanExisting.id },
          data: { username: "dworkman", email: "volunteer@wjarts.org" },
        })
      : await db.user.create({
          data: {
            username: "dworkman",
            email: "volunteer@wjarts.org",
            passwordHash: await bcrypt.hash(dworkmanPassword!, 12),
            mustChangePassword: true,
            profile: { create: { firstName: "Dillon", lastName: "Workman", displayName: "Dillon Workman" } },
          },
        });
    await db.userProfile.upsert({
      where: { userId: dworkman.id },
      update: { firstName: "Dillon", lastName: "Workman", displayName: "Dillon Workman" },
      create: { userId: dworkman.id, firstName: "Dillon", lastName: "Workman", displayName: "Dillon Workman" },
    });
    await db.organizationMembership.upsert({
      where: { userId_organizationId: { userId: dworkman.id, organizationId: organization.id } },
      update: { roleId: adminRole.id, isActive: true },
      create: { userId: dworkman.id, organizationId: organization.id, roleId: adminRole.id, rateType: "Volunteer", isActive: true },
    });
    dworkmanStatus = dworkmanExisting ? "updated" : "created";
    }

    const departments = new Map<string, string>();
    for (const name of departmentNames) {
      const department =
        (await db.department.findFirst({ where: { organizationId: organization.id, name: { equals: name, mode: "insensitive" } } })) ??
        (await db.department.create({ data: { organizationId: organization.id, name } }));
      departments.set(name.toLowerCase(), department.id);
    }

    for (const name of categories) {
      const existing = await db.taskCategory.findFirst({
        where: { organizationId: organization.id, name: { equals: name, mode: "insensitive" } },
      });
      if (!existing) {
        await db.taskCategory.create({ data: { organizationId: organization.id, name } });
      }
    }

    const categoryIds = new Map(
      (await db.taskCategory.findMany({ where: { organizationId: organization.id } })).map((row) => [row.name.toLowerCase(), row.id]),
    );
    const tags = new Map<string, string>();
    for (const name of new Set(logRows.flatMap((row) => row.tags))) {
      const existing =
        (await db.tag.findFirst({ where: { organizationId: organization.id, name: { equals: name, mode: "insensitive" } } })) ??
        (await db.tag.create({ data: { organizationId: organization.id, name } }));
      tags.set(name.toLowerCase(), existing.id);
    }

    const existingProjects = await db.project.findMany({ where: { organizationId: organization.id } });
    const projectsByTitle = new Map<string, typeof existingProjects>();
    for (const row of existingProjects) {
      const title = projectAliases.get(row.title.toLowerCase());
      if (!title) {
        continue;
      }

      const matches = projectsByTitle.get(title) ?? [];
      matches.push(row);
      projectsByTitle.set(title, matches);
    }

    for (const project of projects) {
      const matches = projectsByTitle.get(project.title) ?? [];
      const fields = {
        title: project.title,
        projectType: project.projectType,
        startDate: project.startDate,
        endDate: project.endDate,
        isActive: project.active,
      };
      const keep = matches.find((row) => row.title.toLowerCase() === project.title.toLowerCase()) ?? matches[0];
      if (!keep) {
        await db.project.create({
          data: {
            organizationId: organization.id,
            ownerUserId: admin.id,
            accessType: "Public",
            ...fields,
          },
        });
        continue;
      }

      for (const extra of matches) {
        if (extra.id === keep.id) {
          continue;
        }

        await db.userTimeEntry.updateMany({ where: { projectId: extra.id }, data: { projectId: keep.id } });
        await db.collectiveTimeEntry.updateMany({ where: { projectId: extra.id }, data: { projectId: keep.id } });
        await db.project.delete({ where: { id: extra.id } });
      }

      await db.project.update({ where: { id: keep.id }, data: fields });
    }

    const projectIds = new Map(
      (await db.project.findMany({ where: { organizationId: organization.id } })).map((row) => [row.title.toLowerCase(), row.id]),
    );
    let rate = await db.hourlyRate.findFirst({ where: { organizationId: organization.id, isDefault: true } });
    if (!rate) {
      rate = await db.hourlyRate.create({
        data: {
          organizationId: organization.id,
          type: "Volunteer",
          name: "Utah Volunteer Rate",
          perHourRate: 35.47,
          isDefault: true,
        },
      });
    } else if (rate.name !== "Utah Volunteer Rate" || Number(rate.perHourRate) !== 35.47) {
      rate = await db.hourlyRate.update({
        where: { id: rate.id },
        data: { name: "Utah Volunteer Rate", perHourRate: 35.47, type: "Volunteer", isArchived: false },
      });
    }

    const professionalRates = new Map<string, typeof rate>();
    async function rateForRow(row: (typeof logRows)[number]) {
      const amount = money(row.hourlyRate);
      if (amount === 0) {
        return null;
      }
      const professional =
        row.rateType.trim().toLowerCase() === "professional" || amount !== 35.47;
      if (!professional) {
        return rate;
      }

      const key = `${amount}`;
      const cached = professionalRates.get(key);
      if (cached) {
        return cached;
      }

      const existing = await db.hourlyRate.findFirst({
        where: { organizationId: organization.id, type: "Professional", perHourRate: amount, isArchived: false },
      });
      const created =
        existing ??
        (await db.hourlyRate.create({
          data: {
            organizationId: organization.id,
            type: "Professional",
            name: row.rateType.trim() || `Professional ${amount}`,
            perHourRate: amount,
            isDefault: false,
          },
        }));
      professionalRates.set(key, created);
      return created;
    }

    const usersByName = new Map<string, string>();
    for (const person of people.values()) {
      const usernameBase = slug(person.displayName) || slug(`${person.firstName} ${person.lastName}`) || "volunteer";
      const username = usernameBase.slice(0, 50);
      const email = !anon && person.email ? person.email.trim().toLowerCase() : localEmail(username);
      const zipCode = !anon ? person.zipCode || null : null;
      const notes = !anon ? person.notes || null : null;
      const membershipRate = !anon && person.rateType?.toLowerCase().includes("professional") ? "Professional" : "Volunteer";
      const existing =
        (await db.user.findFirst({ where: { OR: [{ username }, { email }] } })) ??
        (await db.user.create({
          data: {
            username,
            email,
            passwordHash: await bcrypt.hash(randomBytes(16).toString("base64url"), 12),
            profile: {
              create: {
                firstName: person.firstName,
                lastName: person.lastName,
                displayName: person.displayName,
                memberNumber: person.memberNumber,
                zipCode,
                notes,
              },
            },
          },
        }));
      await db.userProfile.upsert({
        where: { userId: existing.id },
        update: {
          firstName: person.firstName,
          lastName: person.lastName,
          displayName: person.displayName,
          memberNumber: person.memberNumber,
          zipCode,
          notes,
        },
        create: {
          userId: existing.id,
          firstName: person.firstName,
          lastName: person.lastName,
          displayName: person.displayName,
          memberNumber: person.memberNumber,
          zipCode,
          notes,
        },
      });
      await db.organizationMembership.upsert({
        where: { userId_organizationId: { userId: existing.id, organizationId: organization.id } },
        update: {
          isActive: person.displayName.toLowerCase() === "clockify import" ? false : person.active,
          roleId: volunteerRole.id,
          rateType: membershipRate,
        },
        create: {
          userId: existing.id,
          organizationId: organization.id,
          roleId: volunteerRole.id,
          rateType: membershipRate,
          isActive: person.displayName.toLowerCase() === "clockify import" ? false : person.active,
        },
      });
      if (!anon && person.primaryGroup) {
        const departmentId = departments.get(person.primaryGroup.toLowerCase());
        if (departmentId) {
          await db.departmentMembership.upsert({
            where: { userId_departmentId: { userId: existing.id, departmentId } },
            update: {},
            create: { userId: existing.id, departmentId, roleId: volunteerRole.id },
          });
        }
      }
      usersByName.set(person.displayName.toLowerCase(), existing.id);
    }

    const unnamed =
      (await db.user.findFirst({ where: { username: "caswj.unnamed" } })) ??
      (await db.user.create({
        data: {
          username: "caswj.unnamed",
          email: localEmail("caswj.unnamed"),
          passwordHash: await bcrypt.hash(randomBytes(16).toString("base64url"), 12),
          profile: { create: { firstName: "", lastName: "", displayName: "" } },
        },
      }));
    await db.organizationMembership.upsert({
      where: { userId_organizationId: { userId: unnamed.id, organizationId: organization.id } },
      update: { roleId: volunteerRole.id, isActive: true },
      create: { userId: unnamed.id, organizationId: organization.id, roleId: volunteerRole.id, rateType: "Volunteer", isActive: true },
    });

    let created = 0;
    let skipped = 0;
    for (const row of logRows) {
      const sourceRef = `${sourceRefPrefix}${row.sheetRow}`;
      const projectId = projectIds.get(row.project.toLowerCase());
      const taskCategoryId = categoryIds.get(row.category.toLowerCase());
      if (!projectId || !taskCategoryId) {
        throw new Error(`Missing project or category on row ${row.sheetRow}.`);
      }

      const existing = await db.userTimeEntry.findUnique({ where: { sourceRef } });
      if (existing) {
        if (existing.projectId !== projectId) {
          await db.userTimeEntry.update({ where: { id: existing.id }, data: { projectId } });
        }
        skipped += 1;
        continue;
      }

      const userId = row.volunteer ? usersByName.get(row.volunteer.toLowerCase()) : unnamed.id;
      if (!userId) {
        throw new Error(`Missing volunteer ${row.volunteer} on row ${row.sheetRow}.`);
      }

      const groupKey = row.group.toLowerCase();
      const departmentId = !groupKey || groupKey === "caswj" ? null : departments.get(groupKey);

      const enteredByUserId = row.enteredBy.toLowerCase() === "clockify import" ? usersByName.get("clockify import") ?? admin.id : admin.id;
      const minutes = Math.round(row.hours * 60);
      if (minutes < 1 || minutes > 59940) {
        throw new Error(`Hours on row ${row.sheetRow} are outside the Total range (${row.hours}).`);
      }

      const catalogRate = await rateForRow(row);
      const hourlyRate = money(row.hourlyRate);
      const inKindValue = inKindFromMinutes(minutes, hourlyRate);
      let entry;
      try {
        entry = await db.userTimeEntry.create({
          data: {
            userId,
            enteredByUserId,
            organizationId: organization.id,
            departmentId,
            projectId,
            taskCategoryId,
            hourlyRateId: catalogRate?.id ?? null,
            mode: "Total",
            startedAt: onDate(row.occurredOn, row.startedAt),
            endedAt: onDate(row.occurredOn, row.endedAt),
            durationMinutes: minutes,
            occurredOn: row.occurredOn,
            description: row.notes || null,
            hourlyRate,
            inKindValue,
            sourceRef,
            createdAt: row.createdAt,
          },
        });
      } catch (error) {
        throw new Error(
          `Row ${row.sheetRow} failed (${row.hours}h, ${minutes}m, rate ${hourlyRate}, in-kind ${inKindValue}, start ${onDate(row.occurredOn, row.startedAt)?.toISOString() ?? "none"}, end ${onDate(row.occurredOn, row.endedAt)?.toISOString() ?? "none"}): ${error instanceof Error ? error.message : error}`,
        );
      }
      if (row.tags.length) {
        await db.userTimeEntryTag.createMany({
          data: row.tags.map((name) => ({ userTimeEntryId: entry.id, tagId: tags.get(name.toLowerCase())! })),
          skipDuplicates: true,
        });
      }

      created += 1;
    }

    await archiveCaswjClockifyDuplicates(db);

    const totals = await db.userTimeEntry.aggregate({
      where: { organizationId: organization.id, sourceRef: { startsWith: sourceRefPrefix } },
      _count: { _all: true },
      _sum: { durationMinutes: true, inKindValue: true },
    });
    console.log(
      JSON.stringify(
        {
          appEnv,
          organizationId: organization.id,
          themeId: theme.id,
          themeName: theme.name,
          dworkman: dworkmanStatus,
          ...(dworkmanPassword ? { dworkmanTemporaryPassword: dworkmanPassword } : {}),
          created,
          skipped,
          entries: totals._count._all,
          hours: Number((((totals._sum.durationMinutes ?? 0) / 60) as number).toFixed(5)),
          inKind: Number(totals._sum.inKindValue ?? 0),
        },
        null,
        2,
      ),
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
