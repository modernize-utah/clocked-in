import { Prisma } from "@/generated/prisma/client";
import { Access } from "@/lib/api/access";
import { guard } from "@/lib/api/db";
import { notFound, validation } from "@/lib/api/errors";
import { Body, has, list, optionalString, requireBool } from "@/lib/api/json";
import { emailTemplateDefault, emailTemplateDefaults } from "@/lib/api/mail";
import {
  emailHtmlToText,
  emailTemplateFields,
  emailTemplateFors,
  isEmailTemplateFor,
  optionalEmailTemplates,
  sanitizeEmailHtml,
  unknownPlaceholders,
  type EmailTemplateFor,
} from "@/lib/email/templates";
import { prisma } from "@/lib/prisma";

type Row = Prisma.EmailTemplateGetPayload<object>;

export type EmailTemplateJson = {
  id: string;
  tenantId: string;
  name: string;
  version: number;
  for: EmailTemplateFor;
  subject: string;
  heading: string;
  preview: string;
  template: string;
  isEnabled: boolean;
  isOptional: boolean;
  fields: string[];
  createdAt: string;
  updatedAt: string;
};

function kindOf(row: Row): EmailTemplateFor {
  if (!isEmailTemplateFor(row.for)) {
    throw new Error(`Unknown email template for ${row.for}.`);
  }
  return row.for;
}

export function emailTemplateJson(row: Row): EmailTemplateJson {
  const kind = kindOf(row);
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    version: row.version,
    for: kind,
    subject: row.subject,
    heading: row.heading,
    preview: row.preview,
    template: row.template,
    isEnabled: row.isEnabled,
    isOptional: optionalEmailTemplates.includes(kind),
    fields: Object.keys(emailTemplateFields[kind]),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Rows for every default, used when an tenant is created. */
export function defaultEmailTemplateRows(now = new Date()) {
  return emailTemplateDefaults.map((item) => ({
    name: item.name,
    version: 1,
    for: item.for,
    subject: item.subject,
    heading: item.heading,
    preview: item.preview,
    template: item.html,
    isEnabled: true,
    createdAt: now,
    updatedAt: now,
  }));
}

/** Adds any default template the tenant is missing. */
async function ensureSeeded(tenantId: string) {
  const existing = await prisma.emailTemplate.findMany({ where: { tenantId }, select: { for: true } });
  const have = new Set(existing.map((row) => row.for));
  const missing = defaultEmailTemplateRows().filter((row) => !have.has(row.for));
  if (missing.length === 0) return;
  await prisma.emailTemplate.createMany({
    data: missing.map((row) => ({ id: crypto.randomUUID(), tenantId, ...row })),
    skipDuplicates: true,
  });
}

async function find(tenantId: string, templateId: string) {
  const row = await prisma.emailTemplate.findFirst({ where: { id: templateId, tenantId } });
  if (!row) notFound();
  return row;
}

export async function listEmailTemplates(access: Access, tenantId: string) {
  await access.requireTenant(tenantId, false);
  await ensureSeeded(tenantId);
  const rows = await prisma.emailTemplate.findMany({ where: { tenantId } });
  const order = (row: Row) => emailTemplateFors.indexOf(kindOf(row));
  const items = rows.sort((a, b) => order(a) - order(b)).map(emailTemplateJson);
  return list(items, { limit: 100, offset: 0 });
}

export async function getEmailTemplate(access: Access, tenantId: string, templateId: string) {
  await access.requireTenant(tenantId, false);
  return emailTemplateJson(await find(tenantId, templateId));
}

function text(body: Body, key: string, max: number, required: boolean) {
  const value = (optionalString(body, key) ?? "").trim();
  if (required && value.length === 0) validation(`${key} is required.`);
  if (value.length > max) validation(`${key} must be ${max} characters or less.`);
  return value;
}

export type EmailTemplatePatch = {
  name?: string;
  subject?: string;
  heading?: string;
  preview?: string;
  template?: string;
  isEnabled?: boolean;
};

export function parseEmailTemplatePatch(body: Body): EmailTemplatePatch {
  if (has(body, "for")) validation("for cannot be changed.");
  const keys = ["name", "subject", "heading", "preview", "template", "isEnabled"];
  if (!keys.some((key) => has(body, key))) validation("Provide at least one field to update.");
  const patch: EmailTemplatePatch = {};
  if (has(body, "name")) patch.name = text(body, "name", 80, true);
  if (has(body, "subject")) patch.subject = text(body, "subject", 200, true);
  if (has(body, "heading")) patch.heading = text(body, "heading", 120, true);
  if (has(body, "preview")) patch.preview = text(body, "preview", 200, false);
  if (has(body, "template")) {
    const html = sanitizeEmailHtml(text(body, "template", 20000, true));
    if (emailHtmlToText(html).length === 0) validation("template is required.");
    patch.template = html;
  }
  if (has(body, "isEnabled")) patch.isEnabled = requireBool(body, "isEnabled");
  return patch;
}

export async function updateEmailTemplate(
  access: Access,
  tenantId: string,
  templateId: string,
  patch: EmailTemplatePatch,
) {
  await access.requireTenantAdmin(tenantId);
  const row = await find(tenantId, templateId);
  const kind = kindOf(row);
  if (patch.isEnabled === false && !optionalEmailTemplates.includes(kind)) {
    validation("This email cannot be turned off.");
  }
  const next = {
    name: patch.name ?? row.name,
    subject: patch.subject ?? row.subject,
    heading: patch.heading ?? row.heading,
    preview: patch.preview ?? row.preview,
    template: patch.template ?? row.template,
    isEnabled: patch.isEnabled ?? row.isEnabled,
  };
  const unknown = unknownPlaceholders(kind, next.subject, next.heading, next.preview, next.template);
  if (unknown.length > 0) validation(`{{${unknown[0]}}} is not a field for this email.`);
  const updated = await guard(
    prisma.emailTemplate.update({
      where: { id: row.id },
      data: { ...next, version: { increment: 1 }, updatedAt: new Date() },
    }),
  );
  return emailTemplateJson(updated);
}

export async function resetEmailTemplate(access: Access, tenantId: string, templateId: string) {
  await access.requireTenantAdmin(tenantId);
  const row = await find(tenantId, templateId);
  const item = emailTemplateDefault(kindOf(row));
  const updated = await prisma.emailTemplate.update({
    where: { id: row.id },
    data: {
      name: item.name,
      subject: item.subject,
      heading: item.heading,
      preview: item.preview,
      template: item.html,
      isEnabled: true,
      version: { increment: 1 },
      updatedAt: new Date(),
    },
  });
  return emailTemplateJson(updated);
}
