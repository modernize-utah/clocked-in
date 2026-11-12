import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { Access } from "@/lib/api/access";
import { lockOrganization, transaction } from "@/lib/api/db";
import { ApiError, validation } from "@/lib/api/errors";
import { assertCanGrant, effectivePermissions } from "@/lib/api/features/roles";
import { linkGuest } from "@/lib/api/features/volunteer-needs";
import { isRoleScope } from "@/lib/permissions";
import {
  type AccessType,
  assertTimezone,
  type Body,
  dateOnly,
  description,
  has,
  normalizeAccessType,
  normalizeEmail,
  normalizeProjectType,
  normalizeRole,
  normalizeUsername,
  personName,
  type ProjectType,
  requireName,
} from "@/lib/api/json";
import { hashPassword } from "@/lib/api/security";
import { maxImportRows } from "@/lib/import/parse-csv";
import { usernameFromName } from "@/lib/import/username";
import { sendEmail } from "@/lib/api/mail";
import { appUrl } from "@/lib/api/security";
import { prisma } from "@/lib/prisma";

export type ImportError = { row: number; message: string };
export type ImportedPassword = { email: string; username: string; temporaryPassword: string };
export type ImportResult = {
  created: number;
  skipped: number;
  errors: ImportError[];
  passwords?: ImportedPassword[];
};

type RowResult =
  | { kind: "skip"; email?: string; username?: string; name?: string }
  | { kind: "created"; email?: string; username?: string; name?: string; password?: ImportedPassword };

export function parseImportRows(body: Body) {
  if (!has(body, "rows") || !Array.isArray(body.rows)) {
    validation("rows must be an array.");
  }

  if (body.rows.length > maxImportRows) {
    validation("A CSV import can include at most 1000 rows.");
  }

  return body.rows;
}

function isRecord(value: unknown): value is Body {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBlank(row: Body) {
  return Object.values(row).every((value) => {
    if (value === null || value === undefined) {
      return true;
    }

    return typeof value === "string" && value.trim() === "";
  });
}

function text(row: Body, key: string) {
  if (!has(row, key) || row[key] === null || row[key] === undefined) {
    return null;
  }

  const value = row[key];
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
    validation(`${key} must be text.`);
  }

  const trimmed = String(value).trim();
  return trimmed.length === 0 ? null : trimmed;
}

function requiredText(row: Body, key: string) {
  return text(row, key) ?? validation(`${key} is required.`);
}

function limited(value: string | null, max: number, message: string) {
  if (value !== null && value.length > max) {
    validation(message);
  }

  return value;
}

function enumWord(value: string) {
  const lower = value.trim().toLowerCase();
  return lower ? `${lower[0].toUpperCase()}${lower.slice(1)}` : lower;
}

function importBool(value: string, key: string) {
  const textValue = value.trim().toLowerCase();
  if (textValue === "true" || textValue === "yes" || textValue === "y" || textValue === "1") {
    return true;
  }

  if (textValue === "false" || textValue === "no" || textValue === "n" || textValue === "0") {
    return false;
  }

  validation(`${key} must be a boolean.`);
}

function importDate(value: string, key: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return dateOnly(value, key);
  }

  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(value);
  if (!match) {
    validation(`${key} must be a date.`);
  }

  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return dateOnly(`${year}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`, key);
}

function temporaryPassword() {
  return randomBytes(18).toString("base64url");
}

async function importRows(rows: unknown[], importRow: (row: Body) => Promise<RowResult>) {
  if (rows.length > maxImportRows) {
    validation("A CSV import can include at most 1000 rows.");
  }

  const result: ImportResult = { created: 0, skipped: 0, errors: [] };
  for (let index = 0; index < rows.length; index += 1) {
    const rowNumber = index + 1;
    const row = rows[index];
    if (!isRecord(row)) {
      result.errors.push({ row: rowNumber, message: "Each row must be an object." });
      continue;
    }

    if (isBlank(row)) {
      continue;
    }

    try {
      const outcome = await importRow(row);
      if (outcome.kind === "skip") {
        result.skipped += 1;
      } else {
        result.created += 1;
        if (outcome.password) {
          result.passwords ??= [];
          result.passwords.push(outcome.password);
        }
      }
    } catch (error) {
      if (error instanceof ApiError && (error.status === 400 || error.status === 409)) {
        result.errors.push({ row: rowNumber, message: error.message });
        continue;
      }

      throw error;
    }
  }

  return result;
}

async function departmentByName(tx: Prisma.TransactionClient, organizationId: string, name: string) {
  return tx.department.findFirst({
    where: { organizationId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
}

async function allocateUsername(
  tx: Prisma.TransactionClient,
  firstName: string,
  lastName: string,
  requested: string | null,
  seen: Set<string>,
) {
  if (requested) {
    const username = normalizeUsername(requested);
    if (seen.has(username) || (await tx.user.findUnique({ where: { username }, select: { id: true } }))) {
      validation("username is already in use.");
    }

    return username;
  }

  const base = usernameFromName(firstName, lastName);
  let suffix = "";
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const username = `${base.slice(0, 50 - suffix.length)}${suffix}`;
    if (!seen.has(username) && !(await tx.user.findUnique({ where: { username }, select: { id: true } }))) {
      return username;
    }

    suffix = String(attempt + 2);
  }

  validation("username is already in use.");
}

export async function importPeople(access: Access, organizationId: string, rows: unknown[], emailUsers = false) {
  await access.requirePermission(organizationId, "import_people");
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { defaultRateType: true },
  });
  if (!organization) {
    validation("Organization was not found.");
  }

  const roleRows = await prisma.role.findMany({
    where: { code: { in: ["MEMBER", "VOLUNTEER", "ADMIN"] }, organizationId: null },
    include: { permissions: true },
  });
  const roleIds = new Map(roleRows.map((role) => [role.code, role.id]));
  // An importer receives each new account's password, so they may only create roles they could grant.
  const importableRoles = new Set<string>();
  for (const role of roleRows) {
    const allowed = await assertCanGrant(access, organizationId, {
      permissions: effectivePermissions(role),
      scope: isRoleScope(role.scope) ? role.scope : null,
    }).then(
      () => true,
      () => false,
    );
    if (allowed) importableRoles.add(role.code);
  }
  const seenEmails = new Set<string>();
  const seenUsernames = new Set<string>();
  const result = await importRows(rows, async (row) => {
    const outcome = await transaction(async (tx) => {
      await lockOrganization(tx, organizationId);
      const email = normalizeEmail(requiredText(row, "email"));
      const action = String(row._action ?? "").toLowerCase();
      const existing = await tx.user.findUnique({ where: { email }, select: { id: true } });
      if (action === "skip" || (action !== "merge" && (seenEmails.has(email) || existing))) {
        return { kind: "skip", email } as const;
      }
      if (action === "merge") {
        const firstName = personName(requiredText(row, "firstName"), "firstName");
        const lastName = personName(requiredText(row, "lastName"), "lastName");
        // Merge only updates people already in this organization, and only accounts no other organization shares.
        const match = await tx.user.findFirst({
          where: {
            ...(existing ? { id: existing.id } : { profile: { firstName, lastName } }),
            organizationMemberships: { some: { organizationId } },
          },
          select: {
            id: true,
            isSuperAdmin: true,
            profile: { select: { id: true } },
            _count: { select: { organizationMemberships: { where: { organizationId: { not: organizationId } } } } },
          },
        });
        if (match?.profile && !match.isSuperAdmin && match._count.organizationMemberships === 0) {
          await tx.userProfile.update({
            where: { userId: match.id },
            data: { firstName, lastName },
          });
        }
        return { kind: "skip", email } as const;
      }

      const firstName = personName(requiredText(row, "firstName"), "firstName");
      const lastName = personName(requiredText(row, "lastName"), "lastName");
      const displayName = limited(text(row, "displayName"), 100, "displayName is required.");
      const timezone = text(row, "timezone") ?? "UTC";
      assertTimezone(timezone);
      const phone = limited(text(row, "phone"), 40, "phone is required.");
      const zipCode = limited(text(row, "zipCode"), 20, "zipCode must be 20 characters or fewer.");
      const notes = limited(text(row, "notes"), 2000, "notes must be 2000 characters or fewer.");
      const memberNumber = limited(text(row, "memberNumber"), 100, "memberNumber must be 100 characters or fewer.");
      const role = text(row, "role") ? normalizeRole(text(row, "role") ?? "") : "VOLUNTEER";
      const roleId = roleIds.get(role);
      const memberRoleId = roleIds.get("MEMBER");
      if (!roleId || !memberRoleId) {
        validation("role must be MEMBER, VOLUNTEER, or ADMIN.");
      }
      if (!importableRoles.has(role)) {
        validation(`You cannot import people with the ${role} role.`);
      }

      const departmentName = text(row, "primaryDepartment");
      const department = departmentName ? await departmentByName(tx, organizationId, requireName(departmentName, "primaryDepartment")) : null;
      if (departmentName && !department) {
        validation("primaryDepartment was not found.");
      }

      const username = await allocateUsername(tx, firstName, lastName, text(row, "username"), seenUsernames);
      const password = temporaryPassword();
      const user = await tx.user.create({
        data: {
          username,
          email,
          passwordHash: await hashPassword(password),
          mustChangePassword: true,
          profile: {
            create: {
              firstName,
              lastName,
              displayName,
              timezone,
              phone,
              zipCode,
              notes,
              memberNumber,
            },
          },
        },
        select: { id: true },
      });
      await linkGuest(tx, email, user.id);
      await tx.organizationMembership.create({
        data: {
          userId: user.id,
          organizationId,
          roleId,
          rateType: organization.defaultRateType,
          isActive: true,
          primaryDepartmentId: department?.id ?? null,
        },
      });
      if (department) {
        await tx.departmentMembership.create({
          data: { userId: user.id, departmentId: department.id, roleId: memberRoleId },
        });
      }

      return {
        kind: "created",
        email,
        username,
        password: { email, username, temporaryPassword: password },
      } as const;
    });
    if (outcome.email) {
      seenEmails.add(outcome.email);
    }

    if (outcome.username) {
      seenUsernames.add(outcome.username);
    }

    return outcome;
  });
  if (emailUsers) {

    const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true, slug: true } });
    const organizationName = org?.name ?? "VolunTime";
    for (const item of result.passwords ?? []) {
      await sendEmail({
        to: item.email,
        organizationId,
        for: "Welcome",
        context: {
          organization: { name: organizationName },
          user: { username: item.username, password: item.temporaryPassword },
          account: { url: appUrl("/login", org?.slug) },
        },
      }).catch(() => undefined);
    }
  }
  return { ...result, passwords: result.passwords ?? [] };
}

export async function importDepartments(access: Access, organizationId: string, rows: unknown[]) {
  await access.requireOrganizationAdmin(organizationId);
  const seen = new Set<string>();
  const result = await importRows(rows, async (row) => {
    const outcome = await transaction(async (tx) => {
      await lockOrganization(tx, organizationId);
      const name = requireName(requiredText(row, "name"));
      const key = name.toLowerCase();
      if (seen.has(key) || (await departmentByName(tx, organizationId, name))) {
        return { kind: "skip", name: key } as const;
      }

      await tx.department.create({ data: { organizationId, name } });
      return { kind: "created", name: key } as const;
    });
    if (outcome.name) {
      seen.add(outcome.name);
    }

    return outcome;
  });
  return { created: result.created, skipped: result.skipped, errors: result.errors };
}

export async function importProjects(access: Access, organizationId: string, rows: unknown[]) {
  await access.requireOrganizationAdmin(organizationId);
  const ownerUserId = access.actorUserId;
  const seen = new Set<string>();
  const result = await importRows(rows, async (row) => {
    const outcome = await transaction(async (tx) => {
      await lockOrganization(tx, organizationId);
      const title = requireName(requiredText(row, "title"), "title");
      const key = title.toLowerCase();
      const existing = await tx.project.findFirst({
        where: { organizationId, title: { equals: title, mode: "insensitive" } },
        select: { id: true },
      });
      if (seen.has(key) || existing) {
        return { kind: "skip", name: key } as const;
      }

      const accessType: AccessType = text(row, "accessType") ? normalizeAccessType(enumWord(text(row, "accessType") ?? "")) : "Public";
      const projectType: ProjectType = text(row, "projectType")
        ? normalizeProjectType(enumWord(text(row, "projectType") ?? ""))
        : "Project";
      const departmentName = text(row, "department");
      if (accessType === "Department" && !departmentName) {
        validation("department is required when accessType is Department.");
      }

      if (accessType !== "Department" && departmentName) {
        validation("department must be empty when accessType is Public or Private.");
      }

      const department = departmentName ? await departmentByName(tx, organizationId, requireName(departmentName, "department")) : null;
      if (departmentName && !department) {
        validation("department was not found.");
      }

      const startText = text(row, "startDate");
      const endText = text(row, "endDate");
      const startDate = startText ? importDate(startText, "startDate") : null;
      const endDate = endText ? importDate(endText, "endDate") : null;
      if (startDate && endDate && endDate < startDate) {
        validation("endDate must be on or after startDate.");
      }

      const activeText = text(row, "isActive");
      await tx.project.create({
        data: {
          organizationId,
          departmentId: department?.id ?? null,
          ownerUserId,
          title,
          description: description(text(row, "description")),
          accessType,
          projectType,
          startDate,
          endDate,
          isActive: activeText ? importBool(activeText, "isActive") : true,
        },
      });
      return { kind: "created", name: key } as const;
    });
    if (outcome.name) {
      seen.add(outcome.name);
    }

    return outcome;
  });
  return { created: result.created, skipped: result.skipped, errors: result.errors };
}
