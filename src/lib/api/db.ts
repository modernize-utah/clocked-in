import { Prisma } from "@/generated/prisma/client";
import { ApiError, conflict, validation } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

export type Db = Prisma.TransactionClient | typeof prisma;

type AdapterCause = {
  kind?: string;
  code?: string;
  message?: string;
  constraint?: { index?: string; fields?: string[] };
};

function adapterCause(error: unknown): AdapterCause | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth += 1) {
    const node = current as { meta?: { driverAdapterError?: unknown }; cause?: unknown };
    const next = node.meta?.driverAdapterError ?? node.cause;
    if (typeof next === "object" && next !== null && "kind" in next) {
      return next as AdapterCause;
    }

    current = next;
  }

  return null;
}

function constraintName(cause: AdapterCause | null, error: unknown) {
  if (cause?.constraint?.index) {
    return cause.constraint.index;
  }

  if (cause?.constraint?.fields) {
    return cause.constraint.fields.join("_");
  }

  const text = cause?.message ?? (error instanceof Error ? error.message : "");
  return /constraint "([^"]+)"/.exec(text)?.[1] ?? /constraint: `([^`]+)`/.exec(text)?.[1] ?? "";
}

function prismaCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
}

export function translate(error: unknown): never {
  if (error instanceof ApiError) {
    throw error;
  }

  const cause = adapterCause(error);
  const code = prismaCode(error);
  const name = constraintName(cause, error);
  const lower = name.toLowerCase();
  const timeConstraint = name.includes("TimeEntry");

  if (cause?.kind === "UniqueConstraintViolation" || code === "P2002") {
    if (lower.includes("pending")) {
      conflict("A pending invite already exists for that email.");
    }

    if (lower.includes("sourceref")) {
      conflict("That sourceRef is already in use.");
    }

    if (lower.includes("username")) {
      conflict("That username is already in use.");
    }

    if (lower.includes("email") && !name.includes("Invitation")) {
      conflict("That email is already in use.");
    }

    conflict("That value is already in use.");
  }

  if (cause?.kind === "ForeignKeyConstraintViolation" || cause?.kind === "RestrictViolation" || code === "P2003") {
    conflict(timeConstraint ? "Delete the time entries first." : "This record is still in use.");
  }

  if (cause?.code === "23514" || code === "P2004") {
    validation(timeConstraint ? "The time entry does not satisfy the time rules." : "The values do not satisfy the rules.");
  }

  throw error;
}

export async function guard<T>(work: Promise<T>) {
  try {
    return await work;
  } catch (error) {
    translate(error);
  }
}

export async function transaction<T>(run: (tx: Prisma.TransactionClient) => Promise<T>) {
  try {
    return await prisma.$transaction(run);
  } catch (error) {
    translate(error);
  }
}

export async function lockUser(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = CAST(${userId} AS uuid) FOR UPDATE`;
}

export async function lockTenant(tx: Prisma.TransactionClient, tenantId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = CAST(${tenantId} AS uuid) FOR UPDATE`;
}

export async function lockSuperAdmins(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('superadmin'))`;
}
