"use server";

import {
  createHourlyRate,
  deleteHourlyRate,
  parseCreateHourlyRate,
  parseUpdateHourlyRate,
  updateHourlyRate,
} from "@/lib/api/features/hourly-rates";
import { body, run } from "@/lib/server/action";
import { requireAccess } from "@/lib/server/session";

export type HourlyRateInput = {
  type: string;
  name: string;
  perHourRate: number;
  isDefault?: boolean;
  isArchived?: boolean;
  source?: string | null;
};

export async function createHourlyRateAction(tenantId: string, input: HourlyRateInput) {
  return run(async () => {
    const access = await requireAccess();
    return createHourlyRate(access, tenantId, parseCreateHourlyRate(body(input)));
  }, "Hourly rate added.");
}

export async function updateHourlyRateAction(rateId: string, input: Partial<HourlyRateInput>) {
  return run(async () => {
    const access = await requireAccess();
    return updateHourlyRate(access, rateId, parseUpdateHourlyRate(body(input)));
  }, "Hourly rate saved.");
}

export async function deleteHourlyRateAction(rateId: string) {
  return run(async () => {
    const access = await requireAccess();
    await deleteHourlyRate(access, rateId);
  }, "Hourly rate deleted.");
}
