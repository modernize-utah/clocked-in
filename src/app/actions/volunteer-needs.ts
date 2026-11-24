"use server";

import {
  createVolunteerNeed,
  decideNeed,
  deleteSignup,
  deleteVolunteerNeed,
  emailVolunteers,
  parsePublicSignup,
  parseSaveNeed,
  parseUpdateNeed,
  parseVolunteerEmail,
  signUpForNeed,
  unvetSignup,
  updateVolunteerNeed,
  vetSignup,
} from "@/lib/api/features/volunteer-needs";
import { run } from "@/lib/server/action";
import { getAccess, requireAccess } from "@/lib/server/session";
import { getTenantSlug } from "@/lib/server/tenant";

export async function createNeedAction(tenantId: string, body: Record<string, unknown>) {
  return run(async () => createVolunteerNeed(await requireAccess(), tenantId, parseSaveNeed(body)), "Need added.");
}

export async function updateNeedAction(needId: string, body: Record<string, unknown>) {
  return run(async () => updateVolunteerNeed(await requireAccess(), needId, parseUpdateNeed(body)), "Need updated.");
}

export async function deleteNeedAction(needId: string) {
  return run(async () => {
    await deleteVolunteerNeed(await requireAccess(), needId);
  }, "Need deleted.");
}

export async function vetSignupAction(needId: string, signupId: string) {
  return run(async () => vetSignup(await requireAccess(), needId, signupId), "Volunteer vetted.");
}

export async function unvetSignupAction(needId: string, signupId: string) {
  return run(async () => unvetSignup(await requireAccess(), needId, signupId), "Vetting removed.");
}

export async function deleteSignupAction(needId: string, signupId: string) {
  return run(async () => {
    await deleteSignup(await requireAccess(), needId, signupId);
  }, "Signup removed.");
}

export async function emailVolunteersAction(needId: string, body: Record<string, unknown>) {
  return run(async () => emailVolunteers(await requireAccess(), needId, parseVolunteerEmail(body)), "Email sent.");
}

export async function decideNeedAction(needId: string, status: "published" | "rejected") {
  return run(async () => decideNeed(await requireAccess(), needId, status), status === "published" ? "Need published." : "Need rejected.");
}

export async function signUpForNeedAction(token: string, body: Record<string, unknown>) {
  return run(
    async () => signUpForNeed(await getAccess(), token, parsePublicSignup(body), { tenantSlug: await getTenantSlug() }),
    "You are signed up.",
  );
}
