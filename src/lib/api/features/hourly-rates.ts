import { Prisma } from "@/generated/prisma/client";
import { Access } from "@/lib/api/access";
import { guard, transaction } from "@/lib/api/db";
import { conflict, notFound, validation } from "@/lib/api/errors";
import {
  Body,
  limited,
  list,
  normalizeRateType,
  optional,
  Optional,
  page,
  RateType,
  requireBool,
  requireDecimal,
  requireName,
  requireString,
  roundMoney,
} from "@/lib/api/json";
import { prisma } from "@/lib/prisma";

function rateJson(rate: {
  id: string;
  tenantId: string;
  type: string;
  name: string;
  perHourRate: Prisma.Decimal;
  isDefault: boolean;
  isArchived: boolean;
  source: string | null;
}) {
  return {
    id: rate.id,
    tenantId: rate.tenantId,
    type: rate.type,
    name: rate.name,
    perHourRate: Number(rate.perHourRate),
    isDefault: rate.isDefault,
    isArchived: rate.isArchived,
    source: rate.source,
  };
}

export function seedDefaultHourlyRate(tenantId: string) {
  return {
    tenantId,
    type: "Volunteer" as const,
    name: "Volunteer",
    perHourRate: 35.47,
    isDefault: true,
    isArchived: false,
  };
}

export async function defaultVolunteerRate(tenantId: string) {
  const rate = await prisma.hourlyRate.findFirst({
    where: { tenantId, isDefault: true },
  });
  if (!rate) {
    validation("This tenant needs a default volunteer rate.");
  }

  return { id: rate.id, rate: Number(rate.perHourRate) };
}

export type CreateHourlyRateRequest = {
  type: RateType;
  name: string;
  perHourRate: number;
  isDefault: boolean;
  isArchived: boolean;
  source: string | null;
};

function rateSource(body: Body) {
  return limited(body, "source", 200, "source must be 200 characters or fewer.");
}

export function parseCreateHourlyRate(body: Body): CreateHourlyRateRequest {
  const type = normalizeRateType(requireString(body, "type"));
  const name = requireName(requireString(body, "name"));
  const perHourRate = roundMoney(requireDecimal(body, "perHourRate"));
  if (perHourRate <= 0) {
    validation("perHourRate must be greater than zero.");
  }

  const isDefault = body.isDefault === true;
  const isArchived = body.isArchived === true;
  if (isDefault && type !== "Volunteer") {
    validation("Only a volunteer rate can be the default.");
  }

  if (isDefault && isArchived) {
    validation("The default volunteer rate cannot be archived.");
  }

  return { type, name, perHourRate, isDefault, isArchived, source: rateSource(body) };
}

export type UpdateHourlyRateRequest = {
  type: Optional<RateType>;
  name: Optional<string>;
  perHourRate: Optional<number>;
  isDefault: Optional<boolean>;
  isArchived: Optional<boolean>;
  source: Optional<string | null>;
};

export function parseUpdateHourlyRate(body: Body): UpdateHourlyRateRequest {
  const request: UpdateHourlyRateRequest = {
    type: optional(body, "type", (b, k) => normalizeRateType(requireString(b, k))),
    name: optional(body, "name", (b, k) => requireName(requireString(b, k))),
    perHourRate: optional(body, "perHourRate", (b, k) => {
      const rate = roundMoney(requireDecimal(b, k));
      if (rate <= 0) {
        validation("perHourRate must be greater than zero.");
      }

      return rate;
    }),
    isDefault: optional(body, "isDefault", requireBool),
    isArchived: optional(body, "isArchived", requireBool),
    source: optional(body, "source", (b) => rateSource(b)),
  };
  if (
    !request.type.set &&
    !request.name.set &&
    !request.perHourRate.set &&
    !request.isDefault.set &&
    !request.isArchived.set &&
    !request.source.set
  ) {
    validation("Provide at least one field to update.");
  }

  return request;
}

export async function listHourlyRates(access: Access, tenantId: string, params: URLSearchParams) {
  const paging = page(params);
  await access.requireTenant(tenantId, false);
  const rates = await prisma.hourlyRate.findMany({
    where: { tenantId },
    orderBy: [{ isDefault: "desc" }, { type: "asc" }, { name: "asc" }],
    skip: paging.offset,
    take: paging.limit,
  });
  return list(rates.map(rateJson), paging);
}

async function managed(access: Access, rateId: string) {
  const rate = await prisma.hourlyRate.findUnique({ where: { id: rateId } });
  if (!rate) {
    notFound();
  }

  await access.requireTenantAdmin(rate.tenantId);
  return rate;
}

async function clearDefault(tx: Prisma.TransactionClient, tenantId: string, exceptRateId?: string) {
  await tx.hourlyRate.updateMany({
    where: { tenantId, isDefault: true, ...(exceptRateId ? { id: { not: exceptRateId } } : {}) },
    data: { isDefault: false },
  });
}

export async function createHourlyRate(access: Access, tenantId: string, request: CreateHourlyRateRequest) {
  await access.requireTenantAdmin(tenantId);
  return rateJson(
    await transaction(async (tx) => {
      if (request.isDefault) {
        await clearDefault(tx, tenantId);
      }

      return guard(
        tx.hourlyRate.create({
          data: {
            tenantId,
            type: request.type,
            name: request.name,
            perHourRate: request.perHourRate,
            isDefault: request.isDefault,
            isArchived: request.isArchived,
            source: request.source,
          },
        }),
      );
    }),
  );
}

export async function updateHourlyRate(access: Access, rateId: string, request: UpdateHourlyRateRequest) {
  const rate = await managed(access, rateId);
  return rateJson(
    await transaction(async (tx) => {
      const type = request.type.set ? request.type.value : rate.type;
      const isDefault = request.isDefault.set ? request.isDefault.value : rate.isDefault;
      const isArchived = request.isArchived.set ? request.isArchived.value : rate.isArchived;
      if (isDefault && type !== "Volunteer") {
        validation("Only a volunteer rate can be the default.");
      }

      if (isDefault && isArchived) {
        validation("The default volunteer rate cannot be archived.");
      }

      if (rate.isDefault && !isDefault) {
        validation("Choose another default volunteer rate first.");
      }

      if (isDefault && !rate.isDefault) {
        await clearDefault(tx, rate.tenantId, rate.id);
      }

      return guard(
        tx.hourlyRate.update({
          where: { id: rate.id },
          data: {
            type,
            name: request.name.set ? request.name.value : undefined,
            perHourRate: request.perHourRate.set ? request.perHourRate.value : undefined,
            isDefault,
            isArchived,
            source: request.source.set ? request.source.value : undefined,
          },
        }),
      );
    }),
  );
}

export async function deleteHourlyRate(access: Access, rateId: string) {
  const rate = await managed(access, rateId);
  if (rate.isDefault) {
    conflict("The default volunteer rate cannot be deleted.");
  }

  const referenced =
    (await prisma.userTimeEntry.count({ where: { hourlyRateId: rate.id } })) > 0 ||
    (await prisma.collectiveTimeEntry.count({ where: { hourlyRateId: rate.id } })) > 0;
  if (referenced) {
    conflict("Archive this rate instead. Time entries still use it.");
  }

  await guard(prisma.hourlyRate.delete({ where: { id: rate.id } }));
}
