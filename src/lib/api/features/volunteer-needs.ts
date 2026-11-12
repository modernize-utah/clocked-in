import { randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { Access } from "@/lib/api/access";
import { guard, transaction } from "@/lib/api/db";
import { sendEmail } from "@/lib/api/mail";
import { verifyCaptcha } from "@/lib/api/turnstile";
import { conflict, fail, notFound, validation } from "@/lib/api/errors";
import {
  asDateOnly,
  type Body,
  has,
  ids,
  list,
  normalizeEmail,
  optional,
  optionalDate,
  optionalInstant,
  optionalString,
  optionalUuid,
  page,
  requireBool,
  requireInt,
  requireName,
  requireString,
  requireUuid,
  utcNow,
} from "@/lib/api/json";
import { prisma } from "@/lib/prisma";

const emptyQuestions = { version: 1, items: [] as NeedQuestion[] };

export type NeedChoice = { id: string; label: string };
export type NeedQuestion = {
  id: string;
  prompt: string;
  kind: "single" | "multi";
  choices: NeedChoice[];
  correctChoiceIds: string[];
};
export type NeedForm = { version: 1; items: NeedQuestion[] };
export type PublicQuestion = { id: string; prompt: string; kind: "single" | "multi"; choices: NeedChoice[] };
export type StoredAnswer = { questionId: string; prompt: string; choiceIds: string[]; labels: string[] };

type NeedRow = {
  id: string;
  organizationId: string;
  createdByUserId: string;
  publicToken: string;
  name: string;
  description: string | null;
  type: string;
  countNeeded: number;
  countVetted: number;
  startDate: Date | null;
  endDate: Date | null;
  requiredBy: Date | null;
  allowPublic: boolean;
  requireVetting: boolean;
  questions: Prisma.JsonValue;
  projectId: string | null;
  taskCategoryId: string | null;
  departmentId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

const signupInclude = {
  User: { include: { profile: true } },
  Guest: true,
} as const;

type SignupRow = Prisma.VolunteerSignupGetPayload<{ include: typeof signupInclude }>;

function text(value: string, max: number, message: string) {
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > max) validation(message);
  return trimmed;
}

function descriptionOf(body: Body, required: boolean) {
  if (!required && !has(body, "description")) return null;
  const value = optionalString(body, "description");
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 4000) validation("description must be 4000 characters or fewer.");
  return trimmed;
}

function commentOf(value: string | null | undefined) {
  if (!value?.trim()) return null;
  return text(value, 2000, "comment must be 2000 characters or fewer.");
}

function guestName(value: string | null | undefined) {
  return text(value ?? "", 120, "name is required.");
}

function phoneOf(value: string | null | undefined) {
  return text(value ?? "", 40, "phone is required.");
}

function needType(value: string) {
  if (value !== "Position" && value !== "Task") validation("type must be Position or Task.");
  return value;
}

function countNeeded(value: number) {
  if (value < 1 || value > 10000) validation("countNeeded must be from 1 to 10000.");
  return value;
}

function assertDates(startDate: Date | null, endDate: Date | null) {
  if (startDate && endDate && endDate < startDate) validation("endDate must be on or after startDate.");
}

function guidList(node: unknown, key: string) {
  if (!Array.isArray(node)) validation(`${key} must be an array of ids.`);
  return node.map((item) => (typeof item === "string" && /^[0-9a-f-]{36}$/i.test(item) ? item.toLowerCase() : validation(`${key} must be an array of ids.`)));
}

export function parseQuestions(node: unknown): NeedForm {
  if (typeof node !== "object" || node === null || Array.isArray(node)) validation("questions must be an object.");
  const body = node as Body;
  if (requireInt(body, "version") !== 1) validation("questions.version must be 1.");
  const items = body.items;
  if (!Array.isArray(items)) validation("questions.items must be an array.");
  if (items.length > 30) validation("A need can have at most 30 questions.");
  const seen = new Set<string>();
    const questions: NeedQuestion[] = items.map((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      validation("questions.items must be an array of questions.");
    }
    const question = item as Body;
    const id = requireUuid(question, "id");
    if (seen.has(id)) validation("Each question needs its own id.");
    seen.add(id);
    const prompt = text(requireString(question, "prompt"), 300, "prompt must be 1 to 300 characters.");
    const kindValue = requireString(question, "kind");
    if (kindValue !== "single" && kindValue !== "multi") validation("kind must be single or multi.");
    const kind = kindValue;
    const choicesNode = question.choices;
    if (!Array.isArray(choicesNode) || choicesNode.length < 2 || choicesNode.length > 12) {
      validation("Each question needs 2 to 12 choices.");
    }
    const choiceIds = new Set<string>();
    const choices = choicesNode.map((choiceNode) => {
      if (typeof choiceNode !== "object" || choiceNode === null || Array.isArray(choiceNode)) {
        validation("choices must be an array of choices.");
      }
      const choice = choiceNode as Body;
      const choiceId = requireUuid(choice, "id");
      if (choiceIds.has(choiceId)) validation("Each choice needs its own id.");
      choiceIds.add(choiceId);
      return { id: choiceId, label: text(requireString(choice, "label"), 200, "label must be 1 to 200 characters.") };
    });
    const correct = guidList(question.correctChoiceIds, "correctChoiceIds");
    if (new Set(correct).size !== correct.length || correct.some((choiceId) => !choiceIds.has(choiceId))) {
      validation("The required answer must be one of the choices.");
    }
    if (kind === "single" && correct.length !== 1) validation("A single-choice question needs one required answer.");
    if (kind === "multi" && correct.length === 0) validation("A multiple-choice question needs a required answer.");
    return { id, prompt, kind, choices, correctChoiceIds: correct };
  });
  return { version: 1, items: questions };
}

function questionsFrom(value: Prisma.JsonValue) {
  return parseQuestions(value);
}

function publicQuestions(form: NeedForm): PublicQuestion[] {
  return form.items.map(({ id, prompt, kind, choices }) => ({ id, prompt, kind, choices }));
}

function grade(form: NeedForm, node: unknown): { passed: boolean; answers: StoredAnswer[] } {
  if (node === undefined) {
    if (form.items.length > 0) validation("Answer every question.");
    return { passed: true, answers: [] };
  }
  if (!Array.isArray(node)) validation("answers must be an array.");
  if (form.items.length === 0) {
    if (node.length > 0) validation("This need has no questions.");
    return { passed: true, answers: [] };
  }
  const submitted = new Map<string, string[]>();
  for (const item of node) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) validation("answers must be an array.");
    const answer = item as Body;
    const questionId = requireUuid(answer, "questionId");
    if (submitted.has(questionId)) validation("Answer every question once.");
    submitted.set(questionId, guidList(answer.choiceIds, "choiceIds"));
  }
  if (submitted.size !== form.items.length || form.items.some((item) => !submitted.has(item.id))) {
    validation("Answer every question.");
  }
  let passed = true;
  const answers = form.items.map((question) => {
    const selected = submitted.get(question.id) ?? [];
    const known = new Set(question.choices.map((choice) => choice.id));
    if (new Set(selected).size !== selected.length || selected.some((id) => !known.has(id))) {
      validation("Choose an answer for every question.");
    }
    if (question.kind === "single" && selected.length !== 1) validation("Choose one answer for every question.");
    if (question.kind === "multi" && selected.length === 0) validation("Answer every question.");
    const correct = new Set(question.correctChoiceIds);
    if (correct.size !== selected.length || selected.some((id) => !correct.has(id))) passed = false;
    return {
      questionId: question.id,
      prompt: question.prompt,
      choiceIds: selected,
      labels: question.choices.filter((choice) => selected.includes(choice.id)).map((choice) => choice.label),
    };
  });
  return { passed, answers };
}

function needJson(need: NeedRow) {
  return {
    id: need.id,
    organizationId: need.organizationId,
    createdByUserId: need.createdByUserId,
    publicToken: need.publicToken,
    name: need.name,
    description: need.description,
    type: need.type,
    countNeeded: need.countNeeded,
    countVetted: need.countVetted,
    startDate: need.startDate ? asDateOnly(need.startDate) : null,
    endDate: need.endDate ? asDateOnly(need.endDate) : null,
    requiredBy: need.requiredBy ? need.requiredBy.toISOString() : null,
    allowPublic: need.allowPublic,
    requireVetting: need.requireVetting,
    status: need.status || "published",
    questions: questionsFrom(need.questions),
    projectId: need.projectId,
    taskCategoryId: need.taskCategoryId,
    departmentId: need.departmentId,
    createdAt: need.createdAt.toISOString(),
    updatedAt: need.updatedAt.toISOString(),
  };
}

function personName(user: NonNullable<SignupRow["User"]>) {
  const profile = user.profile;
  const display = profile?.displayName?.trim();
  if (display) return display;
  const full = `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim();
  return full || user.username;
}

function signupJson(signup: SignupRow) {
  const answers = Array.isArray(signup.answers) ? (signup.answers as StoredAnswer[]) : [];
  if (signup.User) {
    return {
      id: signup.id,
      volunteerNeedId: signup.volunteerNeedId,
      userId: signup.userId,
      guestId: null,
      name: personName(signup.User),
      email: signup.User.email,
      phone: signup.User.profile?.phone ?? null,
      kind: "member" as const,
      comment: signup.comment,
      answers,
      passed: signup.passed,
      vetted: signup.vetted,
      createdAt: signup.createdAt.toISOString(),
      linkedUserId: null,
    };
  }
  const guest = signup.Guest;
  if (!guest) notFound();
  return {
    id: signup.id,
    volunteerNeedId: signup.volunteerNeedId,
    userId: null,
    guestId: signup.guestId,
    name: guest.name,
    email: guest.email,
    phone: guest.phone,
    kind: "guest" as const,
    comment: signup.comment,
    answers,
    passed: signup.passed,
    vetted: signup.vetted,
    createdAt: signup.createdAt.toISOString(),
    linkedUserId: guest.userId,
  };
}

function closedReason(need: { requiredBy: Date | null; countVetted: number; countNeeded: number }, now = new Date()) {
  if (need.requiredBy && need.requiredBy.getTime() <= now.getTime()) return "deadline" as const;
  return need.countVetted >= need.countNeeded ? ("full" as const) : null;
}

function rejectClosed(need: { requiredBy: Date | null; countVetted: number; countNeeded: number }) {
  const closed = closedReason(need);
  if (closed === "deadline") conflict("Sign-up for this need has closed.");
  if (closed === "full") conflict("This need is already filled.");
}

async function relations(organizationId: string, projectId: string | null, taskCategoryId: string | null, departmentId: string | null) {
  if (projectId && !(await prisma.project.findFirst({ where: { id: projectId, organizationId }, select: { id: true } }))) {
    validation("projectId was not found.");
  }
  if (taskCategoryId && !(await prisma.taskCategory.findFirst({ where: { id: taskCategoryId, organizationId }, select: { id: true } }))) {
    validation("taskCategoryId was not found.");
  }
  if (departmentId && !(await prisma.department.findFirst({ where: { id: departmentId, organizationId }, select: { id: true } }))) {
    validation("departmentId was not found.");
  }
}

async function managed(access: Access, needId: string) {
  const need = await prisma.volunteerNeed.findUnique({ where: { id: needId } });
  if (!need) notFound();
  if (
    !(await access.can(need.organizationId, "create_needs", need.departmentId)) &&
    !(await access.can(need.organizationId, "approve_needs"))
  ) {
    await access.requireOrganization(need.organizationId, true);
  }
  return need;
}

function orderBy(sort: string | null, order: string | null): Prisma.VolunteerNeedOrderByWithRelationInput {
  if (order && order !== "asc" && order !== "desc") validation("order must be asc or desc.");
  const direction = order === "desc" ? "desc" : "asc";
  const key = sort?.trim() || "name";
  if (!["name", "type", "startDate", "endDate", "countNeeded", "countVetted", "createdAt"].includes(key)) {
    validation("sort must be name, type, startDate, endDate, countNeeded, countVetted, or createdAt.");
  }
  return { [key]: direction };
}

export function parseSaveNeed(body: Body) {
  return {
    name: requireName(requireString(body, "name"), "name"),
    description: descriptionOf(body, false),
    type: needType(requireString(body, "type")),
    countNeeded: countNeeded(requireInt(body, "countNeeded")),
    startDate: optionalDate(body, "startDate"),
    endDate: optionalDate(body, "endDate"),
    requiredBy: optionalInstant(body, "requiredBy"),
    allowPublic: has(body, "allowPublic") ? requireBool(body, "allowPublic") : false,
    requireVetting: has(body, "requireVetting") ? requireBool(body, "requireVetting") : false,
    questions: has(body, "questions") ? parseQuestions(body.questions) : emptyQuestions,
    projectId: optionalUuid(body, "projectId"),
    taskCategoryId: optionalUuid(body, "taskCategoryId"),
    departmentId: optionalUuid(body, "departmentId"),
  };
}

export function parseUpdateNeed(body: Body) {
  const request = {
    name: optional(body, "name", (item, key) => requireName(requireString(item, key), key)),
    description: optional(body, "description", (item) => descriptionOf(item, true)),
    type: optional(body, "type", (item, key) => needType(requireString(item, key))),
    countNeeded: optional(body, "countNeeded", (item, key) => countNeeded(requireInt(item, key))),
    startDate: optional(body, "startDate", optionalDate),
    endDate: optional(body, "endDate", optionalDate),
    requiredBy: optional(body, "requiredBy", optionalInstant),
    allowPublic: optional(body, "allowPublic", requireBool),
    requireVetting: optional(body, "requireVetting", requireBool),
    questions: optional(body, "questions", (item, key) => parseQuestions(item[key])),
    projectId: optional(body, "projectId", optionalUuid),
    taskCategoryId: optional(body, "taskCategoryId", optionalUuid),
    departmentId: optional(body, "departmentId", optionalUuid),
  };
  if (Object.values(request).every((field) => !field.set)) validation("Provide at least one field to update.");
  return request;
}

export function parsePublicSignup(body: Body) {
  return {
    name: optionalString(body, "name") ?? null,
    email: optionalString(body, "email") ?? null,
    phone: optionalString(body, "phone") ?? null,
    comment: optionalString(body, "comment") ?? null,
    answers: has(body, "answers") ? body.answers : undefined,
    acknowledged: has(body, "acknowledged") ? requireBool(body, "acknowledged") : false,
    captchaToken: optionalString(body, "captchaToken") ?? null,
    requestAccess: has(body, "requestAccess") ? requireBool(body, "requestAccess") : false,
  };
}

export function parseVolunteerEmail(body: Body) {
  const signupIds = [...new Set(ids(body, "signupIds", false))];
  if (signupIds.length < 1 || signupIds.length > 100) validation("signupIds must contain 1 to 100 ids.");
  const subject = text(requireString(body, "subject"), 200, "subject must be 1 to 200 characters.");
  const message = text(requireString(body, "body"), 5000, "body must be 1 to 5000 characters.");
  return { signupIds, subject, message };
}

export async function linkGuest(db: Prisma.TransactionClient | typeof prisma, email: string, userId: string) {
  await db.guest.updateMany({ where: { email, userId: null }, data: { userId } });
}

export async function listVolunteerNeeds(access: Access, organizationId: string, params: URLSearchParams) {
  const paging = page(params);
  const canApprove = await access.can(organizationId, "approve_needs");
  if (!(await access.can(organizationId, "create_needs")) && !canApprove) {
    await access.requireOrganization(organizationId, true);
  }
  const q = params.get("q")?.trim();
  if (q && q.length > 200) validation("q must be 200 characters or fewer.");
  const type = params.get("type");
  const projectId = params.get("projectId");
  const departmentId = params.get("departmentId");
  const allowPublic = params.get("allowPublic");
  const status = params.get("status")?.trim();
  if (projectId && !/^[0-9a-f-]{36}$/i.test(projectId)) validation("projectId must be an id.");
  if (departmentId && !/^[0-9a-f-]{36}$/i.test(departmentId)) validation("departmentId must be an id.");
  if (allowPublic && allowPublic !== "true" && allowPublic !== "false") validation("allowPublic must be true or false.");
  if (status && !["pending_approval", "published", "rejected", "draft"].includes(status)) {
    validation("status must be pending_approval, published, rejected, or draft.");
  }
  const managedIds = canApprove ? [] : await access.adminDepartmentIds(organizationId);
  const owned = canApprove
    ? {}
    : {
        OR: [
          { createdByUserId: access.actorUserId },
          ...(managedIds.length > 0 ? [{ departmentId: { in: managedIds } }] : []),
        ],
      };
  const needs = await prisma.volunteerNeed.findMany({
    where: {
      organizationId,
      ...owned,
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      ...(type ? { type: needType(type) } : {}),
      ...(projectId ? { projectId } : {}),
      ...(departmentId ? { departmentId } : {}),
      ...(allowPublic ? { allowPublic: allowPublic === "true" } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: orderBy(params.get("sort"), params.get("order")),
    skip: paging.offset,
    take: paging.limit,
  });
  return list(needs.map(needJson), paging);
}

export async function getVolunteerNeed(access: Access, needId: string) {
  return needJson(await managed(access, needId));
}

export async function createVolunteerNeed(access: Access, organizationId: string, request: ReturnType<typeof parseSaveNeed>) {
  await access.requirePermission(organizationId, "create_needs", request.departmentId);
  assertDates(request.startDate, request.endDate);
  await relations(organizationId, request.projectId, request.taskCategoryId, request.departmentId);
  const now = utcNow();
  const publishNow = await access.can(organizationId, "approve_needs");
  const status = publishNow ? "published" : "pending_approval";
  const need = await guard(
    prisma.volunteerNeed.create({
      data: {
        id: randomUUID(),
        organizationId,
        createdByUserId: access.actorUserId,
        publicToken: randomBytes(16).toString("hex"),
        name: request.name,
        description: request.description,
        type: request.type,
        countNeeded: request.countNeeded,
        startDate: request.startDate,
        endDate: request.endDate,
        requiredBy: request.requiredBy,
        allowPublic: request.allowPublic,
        requireVetting: request.requireVetting,
        questions: request.questions,
        projectId: request.projectId,
        taskCategoryId: request.taskCategoryId,
        departmentId: request.departmentId,
        status,
        createdAt: now,
        updatedAt: now,
      },
    }),
  );
  if (!publishNow) {
    const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
    const admins = await prisma.organizationMembership.findMany({
      where: { organizationId, isActive: true, role: { code: "ADMIN" } },
      include: { user: { select: { email: true } } },
    });
    await Promise.all(
      admins.map((admin) =>
        sendEmail({
          to: admin.user.email,
          organizationId,
          for: "NeedSubmitted",
          context: {
            organization: { name: organization?.name ?? "VolunTime" },
            need: { name: need.name, managerName: access.caller.profile?.firstName || access.caller.username },
          },
        }).catch(() => undefined),
      ),
    );
  }
  return needJson(need);
}

export async function updateVolunteerNeed(access: Access, needId: string, request: ReturnType<typeof parseUpdateNeed>) {
  const current = await managed(access, needId);
  const startDate = request.startDate.set ? request.startDate.value : current.startDate;
  const endDate = request.endDate.set ? request.endDate.value : current.endDate;
  const nextCount = request.countNeeded.set ? request.countNeeded.value : current.countNeeded;
  if (nextCount < current.countVetted) validation("countNeeded cannot be less than the number of vetted volunteers.");
  assertDates(startDate, endDate);
  const projectId = request.projectId.set ? request.projectId.value : current.projectId;
  const taskCategoryId = request.taskCategoryId.set ? request.taskCategoryId.value : current.taskCategoryId;
  const departmentId = request.departmentId.set ? request.departmentId.value : current.departmentId;
  await relations(current.organizationId, projectId, taskCategoryId, departmentId);
  const need = await guard(
    prisma.volunteerNeed.update({
      where: { id: needId },
      data: {
        ...(request.name.set ? { name: request.name.value } : {}),
        ...(request.description.set ? { description: request.description.value } : {}),
        ...(request.type.set ? { type: request.type.value } : {}),
        ...(request.countNeeded.set ? { countNeeded: request.countNeeded.value } : {}),
        ...(request.startDate.set ? { startDate: request.startDate.value } : {}),
        ...(request.endDate.set ? { endDate: request.endDate.value } : {}),
        ...(request.requiredBy.set ? { requiredBy: request.requiredBy.value } : {}),
        ...(request.allowPublic.set ? { allowPublic: request.allowPublic.value } : {}),
        ...(request.requireVetting.set ? { requireVetting: request.requireVetting.value } : {}),
        ...(request.questions.set ? { questions: request.questions.value } : {}),
        ...(request.projectId.set ? { projectId: request.projectId.value } : {}),
        ...(request.taskCategoryId.set ? { taskCategoryId: request.taskCategoryId.value } : {}),
        ...(request.departmentId.set ? { departmentId: request.departmentId.value } : {}),
        updatedAt: utcNow(),
      },
    }),
  );
  return needJson(need);
}

export async function deleteVolunteerNeed(access: Access, needId: string) {
  await managed(access, needId);
  await guard(prisma.volunteerNeed.delete({ where: { id: needId } }));
}

export async function listSignups(access: Access, needId: string) {
  await managed(access, needId);
  const signups = await prisma.volunteerSignup.findMany({
    where: { volunteerNeedId: needId },
    include: signupInclude,
    orderBy: { createdAt: "desc" },
  });
  return { items: signups.map(signupJson), limit: signups.length, offset: 0 };
}

async function pinnedOrganizationId(tenantSlug?: string | null) {
  const normalized = tenantSlug?.trim().toLowerCase() || null;
  if (!normalized) return undefined;
  const pinned = await prisma.organization.findFirst({ where: { slug: normalized }, select: { id: true } });
  if (!pinned) notFound();
  return pinned.id;
}

export async function publicVolunteerNeed(token: string, options?: { tenantSlug?: string | null }) {
  const organizationId = await pinnedOrganizationId(options?.tenantSlug);
  const need = await prisma.volunteerNeed.findFirst({
    where: { publicToken: token, allowPublic: true, status: "published", ...(organizationId ? { organizationId } : {}) },
    include: { Organization: true },
  });
  if (!need) notFound();
  const closed = closedReason(need);
  return {
    name: need.name,
    description: need.description,
    type: need.type,
    countNeeded: need.countNeeded,
    countVetted: need.countVetted,
    remaining: need.countNeeded - need.countVetted,
    startDate: need.startDate ? asDateOnly(need.startDate) : null,
    endDate: need.endDate ? asDateOnly(need.endDate) : null,
    requiredBy: need.requiredBy ? need.requiredBy.toISOString() : null,
    requireVetting: need.requireVetting,
    closed,
    questions: publicQuestions(questionsFrom(need.questions)),
    organizationName: need.Organization.name,
  };
}

export async function signUpForNeed(
  access: Access | null,
  token: string,
  request: ReturnType<typeof parsePublicSignup>,
  options?: { tenantSlug?: string | null },
) {
  const organizationId = await pinnedOrganizationId(options?.tenantSlug ?? access?.tenantSlug);
  if (!request.acknowledged) validation("Acknowledge how your email will be used.");
  await verifyCaptcha(request.captchaToken);
  const user = access && !access.isApiKey ? access.caller : null;
  const signupId = await transaction(async (tx) => {
    const need = await tx.volunteerNeed.findFirst({
      where: { publicToken: token, allowPublic: true, status: "published", ...(organizationId ? { organizationId } : {}) },
    });
    if (!need) notFound();
    await tx.$queryRaw`SELECT "id" FROM "VolunteerNeed" WHERE "id" = CAST(${need.id} AS uuid) FOR UPDATE`;
    const locked = await tx.volunteerNeed.findUniqueOrThrow({ where: { id: need.id } });
    rejectClosed(locked);
    const graded = grade(questionsFrom(locked.questions), request.answers);
    const vetted = !locked.requireVetting && graded.passed;
    if (vetted && locked.countVetted >= locked.countNeeded) conflict("This need is already filled.");
    const now = utcNow();
    let guestId: string | null = null;
    let userId: string | null = null;
    if (user) {
      const guest = await tx.guest.findUnique({ where: { email: user.email } });
      if (guest && !guest.userId) await tx.guest.update({ where: { id: guest.id }, data: { userId: user.id } });
      const duplicate = await tx.volunteerSignup.findFirst({
        where: {
          volunteerNeedId: locked.id,
          OR: [{ userId: user.id }, ...(guest ? [{ guestId: guest.id }] : [])],
        },
        select: { id: true },
      });
      if (duplicate) conflict("You are already signed up for this need.");
      userId = user.id;
    } else {
      const email = normalizeEmail(request.email ?? "");
      if (await tx.user.findUnique({ where: { email }, select: { id: true } })) {
        fail(409, "account_exists", "An account already uses this email. Log in to sign up.");
      }
      const existing = await tx.guest.findUnique({ where: { email } });
      if (!existing) {
        guestId = randomUUID();
        await tx.guest.create({ data: { id: guestId, name: guestName(request.name), email, phone: phoneOf(request.phone) } });
      } else {
        guestId = existing.id;
        await tx.guest.update({ where: { id: existing.id }, data: { name: guestName(request.name), phone: phoneOf(request.phone) } });
      }
      const duplicate = await tx.volunteerSignup.findFirst({
        where: { volunteerNeedId: locked.id, guestId },
        select: { id: true },
      });
      if (duplicate) conflict("You are already signed up for this need.");
    }
    const id = randomUUID();
    await tx.volunteerSignup.create({
      data: {
        id,
        volunteerNeedId: locked.id,
        userId,
        guestId,
        comment: commentOf(request.comment),
        answers: graded.answers,
        passed: graded.passed,
        vetted,
        createdAt: now,
      },
    });
    if (vetted) {
      await tx.volunteerNeed.update({
        where: { id: locked.id },
        data: { countVetted: locked.countVetted + 1, updatedAt: now },
      });
    }
    return id;
  });
  const signup = await prisma.volunteerSignup.findUniqueOrThrow({ where: { id: signupId }, include: signupInclude });
  const json = signupJson(signup);
  if (request.requestAccess) {
    const need = await prisma.volunteerNeed.findFirst({ where: { publicToken: token }, select: { organizationId: true, id: true } });
    if (need) {
      const { createPublicAccessRequest } = await import("@/lib/api/features/access-requests");
      await createPublicAccessRequest(need.organizationId, {
        email: json.email,
        name: json.name,
        guestId: json.guestId,
        volunteerNeedId: need.id,
      }).catch(() => undefined);
    }
  }
  return json;
}

async function changeVetting(access: Access, needId: string, signupId: string, vetted: boolean) {
  // Access checks use the global client, so they run before the transaction holds the connection.
  const need = await prisma.volunteerNeed.findUnique({ where: { id: needId } });
  if (!need) notFound();
  await access.requireOrganization(need.organizationId, true);
  await transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "VolunteerNeed" WHERE "id" = CAST(${need.id} AS uuid) FOR UPDATE`;
    const locked = await tx.volunteerNeed.findUniqueOrThrow({ where: { id: need.id } });
    const signup = await tx.volunteerSignup.findFirst({ where: { id: signupId, volunteerNeedId: need.id } });
    if (!signup) notFound();
    if (signup.vetted === vetted) return;
    if (vetted && locked.countVetted >= locked.countNeeded) conflict("This need is already filled.");
    await tx.volunteerSignup.update({ where: { id: signup.id }, data: { vetted } });
    await tx.volunteerNeed.update({
      where: { id: locked.id },
      data: { countVetted: locked.countVetted + (vetted ? 1 : -1), updatedAt: utcNow() },
    });
  });
  const signup = await prisma.volunteerSignup.findUniqueOrThrow({ where: { id: signupId }, include: signupInclude });
  return signupJson(signup);
}

export function vetSignup(access: Access, needId: string, signupId: string) {
  return changeVetting(access, needId, signupId, true);
}

export function unvetSignup(access: Access, needId: string, signupId: string) {
  return changeVetting(access, needId, signupId, false);
}

export async function deleteSignup(access: Access, needId: string, signupId: string) {
  const need = await prisma.volunteerNeed.findUnique({ where: { id: needId } });
  if (!need) notFound();
  await access.requireOrganization(need.organizationId, true);
  await transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "VolunteerNeed" WHERE "id" = CAST(${need.id} AS uuid) FOR UPDATE`;
    const locked = await tx.volunteerNeed.findUniqueOrThrow({ where: { id: need.id } });
    const signup = await tx.volunteerSignup.findFirst({ where: { id: signupId, volunteerNeedId: need.id } });
    if (!signup) notFound();
    await tx.volunteerSignup.delete({ where: { id: signup.id } });
    await tx.volunteerNeed.update({
      where: { id: locked.id },
      data: {
        countVetted: signup.vetted ? locked.countVetted - 1 : locked.countVetted,
        updatedAt: utcNow(),
      },
    });
  });
}

export async function emailVolunteers(access: Access, needId: string, request: ReturnType<typeof parseVolunteerEmail>) {
  const need = await managed(access, needId);
  const signups = await prisma.volunteerSignup.findMany({
    where: { volunteerNeedId: need.id, id: { in: request.signupIds } },
    include: signupInclude,
  });
  if (signups.length !== request.signupIds.length) notFound();
  for (const signup of signups) {
    const person = signupJson(signup);
    await sendEmail({
      to: person.email,
      organizationId: need.organizationId,
      for: "VolunteerMessage",
      context: { message: { subject: request.subject, body: request.message }, need: { name: need.name } },
    });
  }
  return { sent: signups.length };
}

export async function listPublicNeeds(slug: string, options?: { tenantSlug?: string | null }) {
  const pinnedId = await pinnedOrganizationId(options?.tenantSlug);
  const organization = await prisma.organization.findFirst({
    where: { publicSlug: slug.toLowerCase(), ...(pinnedId ? { id: pinnedId } : {}) },
    select: { id: true, name: true, publicSlug: true },
  });
  if (!organization) notFound();
  const needs = await prisma.volunteerNeed.findMany({
    where: { organizationId: organization.id, allowPublic: true, status: "published" },
    orderBy: { startDate: "asc" },
  });
  return {
    organizationName: organization.name,
    slug: organization.publicSlug,
    items: needs.map((need) => ({
      id: need.id,
      name: need.name,
      description: need.description,
      type: need.type,
      countNeeded: need.countNeeded,
      countVetted: need.countVetted,
      remaining: need.countNeeded - need.countVetted,
      startDate: need.startDate ? asDateOnly(need.startDate) : null,
      endDate: need.endDate ? asDateOnly(need.endDate) : null,
      token: need.publicToken,
    })),
  };
}

export async function decideNeed(access: Access, needId: string, status: "published" | "rejected") {
  const need = await managed(access, needId);
  await access.requirePermission(need.organizationId, "approve_needs");
  const updated = await prisma.volunteerNeed.update({
    where: { id: needId },
    data: { status, updatedAt: utcNow() },
  });
  const creator = await prisma.user.findUnique({ where: { id: need.createdByUserId }, select: { email: true } });
  const organization = await prisma.organization.findUnique({ where: { id: need.organizationId }, select: { name: true } });
  if (creator) {
    await sendEmail({
      to: creator.email,
      organizationId: need.organizationId,
      for: "NeedDecided",
      context: { organization: { name: organization?.name ?? "VolunTime" }, need: { name: need.name, decision: status } },
    }).catch(() => undefined);
  }
  return needJson(updated);
}
