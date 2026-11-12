export const emailTemplateFors = [
  "Invite",
  "Welcome",
  "PasswordReset",
  "LoggedTime",
  "UnclassifiedEntry",
  "FeedbackReceived",
  "FeedbackNotify",
  "FeedbackCompleted",
  "AccessRequestReceived",
  "AccessRequestDecided",
  "NeedSubmitted",
  "NeedDecided",
  "VolunteerMessage",
] as const;

export type EmailTemplateFor = (typeof emailTemplateFors)[number];

/** Only these mails can be turned off; the rest carry codes, passwords, or decisions people need. */
export const optionalEmailTemplates: readonly EmailTemplateFor[] = ["LoggedTime", "UnclassifiedEntry"];

export const timeEmailFrequencies = ["immediate", "weekly", "off"] as const;
export type TimeEmailFrequency = (typeof timeEmailFrequencies)[number];

export function isTimeEmailFrequency(value: unknown): value is TimeEmailFrequency {
  return typeof value === "string" && (timeEmailFrequencies as readonly string[]).includes(value);
}

export const booleanEmailSettingKeys = [
  "FeedbackReceived",
  "FeedbackNotify",
  "FeedbackCompleted",
  "AccessRequestReceived",
  "AccessRequestDecided",
  "NeedSubmitted",
  "NeedDecided",
  "VolunteerMessage",
] as const;

export type BooleanEmailSettingKey = (typeof booleanEmailSettingKeys)[number];

export type OrganizationEmailSettings = {
  LoggedTime: TimeEmailFrequency;
  UnclassifiedEntry: TimeEmailFrequency;
  FeedbackReceived: boolean;
  FeedbackNotify: boolean;
  FeedbackCompleted: boolean;
  AccessRequestReceived: boolean;
  AccessRequestDecided: boolean;
  NeedSubmitted: boolean;
  NeedDecided: boolean;
  VolunteerMessage: boolean;
};

export const defaultEmailSettings: OrganizationEmailSettings = {
  LoggedTime: "immediate",
  UnclassifiedEntry: "immediate",
  FeedbackReceived: true,
  FeedbackNotify: true,
  FeedbackCompleted: true,
  AccessRequestReceived: true,
  AccessRequestDecided: true,
  NeedSubmitted: true,
  NeedDecided: true,
  VolunteerMessage: true,
};

export function readEmailSettings(value: unknown): OrganizationEmailSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...defaultEmailSettings };
  }
  const source = value as Record<string, unknown>;
  return {
    LoggedTime: isTimeEmailFrequency(source.LoggedTime) ? source.LoggedTime : defaultEmailSettings.LoggedTime,
    UnclassifiedEntry: isTimeEmailFrequency(source.UnclassifiedEntry)
      ? source.UnclassifiedEntry
      : defaultEmailSettings.UnclassifiedEntry,
    FeedbackReceived:
      typeof source.FeedbackReceived === "boolean" ? source.FeedbackReceived : defaultEmailSettings.FeedbackReceived,
    FeedbackNotify:
      typeof source.FeedbackNotify === "boolean" ? source.FeedbackNotify : defaultEmailSettings.FeedbackNotify,
    FeedbackCompleted:
      typeof source.FeedbackCompleted === "boolean" ? source.FeedbackCompleted : defaultEmailSettings.FeedbackCompleted,
    AccessRequestReceived:
      typeof source.AccessRequestReceived === "boolean"
        ? source.AccessRequestReceived
        : defaultEmailSettings.AccessRequestReceived,
    AccessRequestDecided:
      typeof source.AccessRequestDecided === "boolean"
        ? source.AccessRequestDecided
        : defaultEmailSettings.AccessRequestDecided,
    NeedSubmitted:
      typeof source.NeedSubmitted === "boolean" ? source.NeedSubmitted : defaultEmailSettings.NeedSubmitted,
    NeedDecided: typeof source.NeedDecided === "boolean" ? source.NeedDecided : defaultEmailSettings.NeedDecided,
    VolunteerMessage:
      typeof source.VolunteerMessage === "boolean" ? source.VolunteerMessage : defaultEmailSettings.VolunteerMessage,
  };
}

export function shouldSendEmailImmediate(settings: OrganizationEmailSettings, kind: EmailTemplateFor): boolean {
  if (kind === "Invite" || kind === "Welcome" || kind === "PasswordReset") {
    return true;
  }
  if (kind === "LoggedTime" || kind === "UnclassifiedEntry") {
    return settings[kind] === "immediate";
  }
  return settings[kind] === true;
}

export function emailTemplateBadge(
  kind: EmailTemplateFor,
  isEnabled: boolean,
  settings: OrganizationEmailSettings,
): { label: string; variant: "secondary" | "outline" } {
  if (kind === "Invite" || kind === "Welcome" || kind === "PasswordReset") {
    return { label: "Always on", variant: "secondary" };
  }
  if (!isEnabled) {
    return { label: "Off", variant: "outline" };
  }
  if (kind === "LoggedTime" || kind === "UnclassifiedEntry") {
    const freq = settings[kind];
    if (freq === "off") return { label: "Off", variant: "outline" };
    if (freq === "weekly") return { label: "Weekly digest", variant: "secondary" };
    return { label: "Immediately", variant: "secondary" };
  }
  return settings[kind] ? { label: "On", variant: "secondary" } : { label: "Off", variant: "outline" };
}

export const emailForLabels: Record<EmailTemplateFor, string> = {
  Invite: "Invite",
  Welcome: "Welcome",
  PasswordReset: "Password reset",
  LoggedTime: "Logged time",
  UnclassifiedEntry: "Unclassified entry",
  FeedbackReceived: "Feedback received",
  FeedbackNotify: "Feedback notify",
  FeedbackCompleted: "Feedback completed",
  AccessRequestReceived: "Access request received",
  AccessRequestDecided: "Access request decided",
  NeedSubmitted: "Need submitted",
  NeedDecided: "Need decided",
  VolunteerMessage: "Volunteer message",
};

/** Placeholders each mail may use, with the sample value shown in the editor preview. */
export const emailTemplateFields: Record<EmailTemplateFor, Record<string, string>> = {
  Invite: {
    "organization.name": "Harbor Volunteers",
    "invite.targetKind": "Organization",
    "invite.targetName": "Harbor Volunteers",
    "invite.roleName": "Staff",
    "user.username": "jsmith",
    "invite.code": "482913",
    "invite.url": "https://voluntime.app/accept?code=482913",
  },
  Welcome: {
    "organization.name": "Harbor Volunteers",
    "user.username": "jsmith",
    "user.password": "Temp-Pass-42",
    "account.url": "https://voluntime.app/login",
  },
  PasswordReset: {
    "reset.code": "715204",
    "reset.url": "https://voluntime.app/forgot-password?code=715204",
  },
  LoggedTime: {
    "user.firstName": "Jamie",
    "organization.name": "Harbor Volunteers",
    "entry.hours": "2.5",
    "entry.date": "Tue, Oct 27, 2026",
    "entry.url": "https://voluntime.app/log",
  },
  UnclassifiedEntry: {
    "user.firstName": "Jamie",
    "entry.url": "https://voluntime.app/entries?unclassified=1",
  },
  FeedbackReceived: {
    "user.firstName": "Jamie",
    "feedback.title": "Export misses October",
    "feedback.typeLabel": "bug",
  },
  FeedbackNotify: {
    "feedback.submitterName": "Jamie Smith",
    "feedback.typeLabel": "bug",
    "feedback.priorityLabel": "High",
    "feedback.areaLabel": "Reports",
    "feedback.title": "Export misses October",
    "feedback.description": "The October rows are missing from the CSV.",
    "feedback.url": "https://voluntime.app/feedback",
  },
  FeedbackCompleted: {
    "user.firstName": "Jamie",
    "feedback.title": "Export misses October",
    "feedback.typeLabel": "bug",
    "feedback.outcome": "we completed the work you asked for",
    "feedback.note": "October now appears in every export.",
  },
  AccessRequestReceived: {
    "organization.name": "Harbor Volunteers",
    "request.requesterEmail": "jamie@example.org",
  },
  AccessRequestDecided: {
    "organization.name": "Harbor Volunteers",
    "request.decision": "approved",
    "user.name": "Jamie",
  },
  NeedSubmitted: {
    "organization.name": "Harbor Volunteers",
    "need.name": "Saturday food drive",
    "need.managerName": "Alex",
  },
  NeedDecided: {
    "organization.name": "Harbor Volunteers",
    "need.name": "Saturday food drive",
    "need.decision": "published",
  },
  VolunteerMessage: {
    "message.subject": "Parking for Saturday",
    "message.body": "Please park in the north lot.\nDoors open at 8am.",
    "need.name": "Saturday food drive",
  },
};

export function isEmailTemplateFor(value: unknown): value is EmailTemplateFor {
  return typeof value === "string" && (emailTemplateFors as readonly string[]).includes(value);
}

export type EmailContextValue = string | number | null | undefined | EmailContext;
export type EmailContext = { [key: string]: EmailContextValue };

const placeholderPattern = /\{\{\s*([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)\s*\}\}/g;

export function placeholdersIn(...texts: string[]) {
  const found = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(placeholderPattern)) found.add(match[1]);
  }
  return [...found];
}

export function unknownPlaceholders(kind: EmailTemplateFor, ...texts: string[]) {
  const fields = emailTemplateFields[kind];
  return placeholdersIn(...texts).filter((path) => !(path in fields));
}

function lookup(context: EmailContext, path: string) {
  let current: EmailContextValue = context;
  for (const part of path.split(".")) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = current[part];
  }
  return typeof current === "string" || typeof current === "number" ? String(current) : undefined;
}

/** Sample context for previews, built from the field catalog. */
export function sampleEmailContext(kind: EmailTemplateFor) {
  const context: EmailContext = {};
  for (const [path, value] of Object.entries(emailTemplateFields[kind])) {
    const parts = path.split(".");
    let node = context;
    for (const part of parts.slice(0, -1)) {
      node[part] = (node[part] as EmailContext | undefined) ?? {};
      node = node[part] as EmailContext;
    }
    node[parts.at(-1)!] = value;
  }
  return context;
}

export function htmlEncode(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Single pass, so a value that looks like a placeholder is never expanded. */
export function fillEmailText(source: string, context: EmailContext, encode: (value: string) => string = (value) => value) {
  return source.replace(placeholderPattern, (match, path: string) => {
    const value = lookup(context, path);
    return value === undefined ? match : encode(value);
  });
}

export function missingEmailFields(context: EmailContext, ...texts: string[]) {
  return placeholdersIn(...texts).filter((path) => lookup(context, path) === undefined);
}

const allowedTags = new Set(["p", "h1", "h2", "h3", "strong", "em", "a", "ul", "ol", "li", "br", "span"]);
const droppedWithContent = new Set(["script", "style", "head", "title", "iframe", "object", "embed", "textarea", "noscript", "template", "svg", "math"]);
const tagPattern = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
const attributePattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const placeholderPath = /^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*$/;
const literalHref = /^(?:https?:\/\/|mailto:)/i;
const placeholderHref = /^\{\{\s*[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*\s*\}\}$/;

/** A link is a fixed URL or exactly one field. Mixing them could mail a code or password to another site. */
function safeHref(href: string) {
  return placeholderHref.test(href) || (literalHref.test(href) && !href.includes("{{"));
}

function escapeText(text: string) {
  return text
    .replace(/&(?!(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);)/g, "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value: string) {
  return escapeText(value).replaceAll('"', "&quot;");
}

function attributes(source: string) {
  const values = new Map<string, string>();
  for (const match of source.matchAll(attributePattern)) {
    values.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }
  return values;
}

/** Rebuilds every tag from an allowlist, so nothing outside it reaches a stored template. */
export function sanitizeEmailHtml(html: string) {
  let output = "";
  let index = 0;
  let skipUntil: string | null = null;
  for (const match of html.matchAll(tagPattern)) {
    const start = match.index ?? 0;
    const closing = match[1] === "/";
    const tag = (match[2] ?? "").toLowerCase();
    if (skipUntil) {
      if (closing && tag === skipUntil) {
        skipUntil = null;
        index = start + match[0].length;
      }
      continue;
    }
    output += escapeText(html.slice(index, start));
    index = start + match[0].length;
    if (!match[2]) continue;
    if (droppedWithContent.has(tag)) {
      if (!closing && !/\/\s*$/.test(match[3] ?? "")) skipUntil = tag;
      continue;
    }
    if (!allowedTags.has(tag)) continue;
    if (tag === "br") {
      if (!closing) output += "<br>";
      continue;
    }
    if (closing) {
      output += `</${tag}>`;
      continue;
    }
    const attrs = attributes(match[3] ?? "");
    if (tag === "a") {
      const href = (attrs.get("href") ?? "").trim().replaceAll("&amp;", "&");
      output += safeHref(href) ? `<a href="${escapeAttribute(href)}">` : "<a>";
    } else if (tag === "span") {
      const path = attrs.get("data-placeholder") ?? "";
      output += placeholderPath.test(path) ? `<span data-placeholder="${path}">` : "<span>";
    } else {
      output += `<${tag}>`;
    }
  }
  if (!skipUntil) output += escapeText(html.slice(index));
  return output;
}

const colors = {
  primary: "#001836",
  highlight: "#D4AC59",
  success: "#4EBFAE",
  surface: "#FFFFFF",
  muted: "#5C6B7A",
  page: "#F4F6F8",
  rule: "#E6E8EB",
};
const fontFamily = `"Nunito Sans", "Segoe UI", Helvetica, Arial, sans-serif`;
const tagStyles: Record<string, string> = {
  p: `color:${colors.primary};font-size:16px;line-height:24px;margin:0 0 16px`,
  h1: `color:${colors.primary};font-size:24px;line-height:30px;font-weight:700;margin:0 0 16px`,
  h2: `color:${colors.primary};font-size:20px;line-height:28px;font-weight:700;margin:0 0 14px`,
  h3: `color:${colors.primary};font-size:17px;line-height:24px;font-weight:700;margin:0 0 12px`,
  ul: `color:${colors.primary};font-size:16px;line-height:24px;margin:0 0 16px;padding-left:22px`,
  ol: `color:${colors.primary};font-size:16px;line-height:24px;margin:0 0 16px;padding-left:22px`,
  li: "margin:0 0 6px",
  a: `color:${colors.primary};text-decoration:underline`,
  em: `color:${colors.muted}`,
};
const codeBox = `background-color:#FBF7EE;border:1px solid ${colors.highlight};border-radius:10px;margin:0 0 20px;padding:18px 12px`;
const codeText = `color:${colors.primary};font-size:32px;font-weight:700;letter-spacing:0.18em;line-height:40px;margin:0;text-align:center`;
const codeParagraph =
  /<p>\s*((?:<span data-placeholder="[^"]*">)?\{\{\s*[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*\.code\s*\}\}(?:<\/span>)?)\s*<\/p>/g;

/** Inline styles for email clients. A paragraph holding only a `*.code` field becomes the gold code box. */
export function styleEmailBody(html: string) {
  return html
    .replace(codeParagraph, (_match, inner: string) => `<div style="${codeBox}"><p style="${codeText}">${inner}</p></div>`)
    .replace(/<(p|h1|h2|h3|ul|ol|li|em)>/g, (_match, tag: string) => `<${tag} style="${tagStyles[tag]}">`)
    .replace(/<a href="/g, `<a style="${tagStyles.a}" href="`);
}

/** The VolunTime chrome from emails/components/layout.tsx around an already-styled body. */
export function wrapEmailHtml({ heading, preview, body }: { heading: string; preview: string; body: string }) {
  return [
    '<!DOCTYPE html><html lang="en"><head><meta content="text/html; charset=UTF-8" http-equiv="Content-Type"><meta name="x-apple-disable-message-reformatting"></head>',
    `<body style="background-color:${colors.page};font-family:${fontFamily};margin:0;padding:32px 12px">`,
    `<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0">${preview}</div>`,
    `<table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background-color:${colors.surface};border-radius:12px;margin:0 auto;max-width:560px;overflow:hidden"><tbody><tr><td>`,
    `<div style="background-color:${colors.primary};padding:28px 32px 24px">`,
    `<p style="color:${colors.highlight};font-size:12px;font-weight:700;letter-spacing:0.16em;line-height:16px;margin:0">VolunTime</p>`,
    `<h1 style="color:${colors.surface};font-size:28px;font-weight:650;line-height:34px;margin:14px 0 0">${heading}</h1>`,
    `<div style="background-color:${colors.success};height:3px;margin-top:22px;width:48px"></div>`,
    "</div>",
    `<div style="padding:28px 32px 8px">${body}</div>`,
    `<hr style="border:none;border-top:1px solid ${colors.rule};margin:8px 32px 0">`,
    `<p style="color:${colors.muted};font-size:13px;line-height:20px;margin:16px 32px 28px">Every volunteer hour, counted and valued.</p>`,
    "</td></tr></tbody></table>",
    `<p style="color:${colors.muted};font-size:12px;line-height:18px;margin:16px 0 0;text-align:center">This message was sent by VolunTime.</p>`,
    "</body></html>",
  ].join("");
}

function decodeEntities(text: string) {
  return text
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replaceAll("&nbsp;", " ")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

/** Plain-text part from a sanitized body. Placeholders survive, so fill raw values afterward. */
export function emailHtmlToText(html: string) {
  const text = html
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (_match, href: string, label: string) => {
      const inner = label.replace(/<[^>]+>/g, "");
      return inner.trim() === href.trim() ? inner : `${inner} (${href})`;
    })
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<li[^>]*>/g, "- ")
    .replace(/<\/(p|h1|h2|h3)>/g, "\n\n")
    .replace(/<\/(li|ul|ol)>/g, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type EmailTemplateContent = { subject: string; heading: string; preview: string; template: string };

function encodeWithBreaks(value: string) {
  return htmlEncode(value).replace(/\r?\n/g, "<br>");
}

function forSubject(value: string) {
  return value.replace(/[\r\n]+/g, " ");
}

/** Subject, full HTML, and plain text. Throws when the template uses a field the context lacks. */
export function renderEmail(content: EmailTemplateContent, context: EmailContext) {
  // Stored templates may predate a sanitizer rule, so the current rules apply at send time too.
  const template = sanitizeEmailHtml(content.template);
  const missing = missingEmailFields(context, content.subject, content.heading, content.preview, template);
  if (missing.length > 0) {
    throw new Error(`Missing email field ${missing[0]}.`);
  }
  const heading = fillEmailText(htmlEncode(content.heading), context, encodeWithBreaks);
  const preview = fillEmailText(htmlEncode(content.preview), context, htmlEncode);
  const body = fillEmailText(styleEmailBody(template), context, encodeWithBreaks);
  const plainHeading = fillEmailText(content.heading, context);
  const plainBody = fillEmailText(emailHtmlToText(template), context);
  return {
    subject: fillEmailText(content.subject, context, forSubject),
    html: wrapEmailHtml({ heading, preview, body }),
    text: `${plainHeading}\n\n${plainBody}\n\nEvery volunteer hour, counted and valued.`,
  };
}

/** Like renderEmail, but leaves unfilled placeholders visible for the editor preview. */
export function previewEmail(content: EmailTemplateContent, kind: EmailTemplateFor) {
  const context = sampleEmailContext(kind);
  const body = fillEmailText(styleEmailBody(sanitizeEmailHtml(content.template)), context, encodeWithBreaks);
  return {
    subject: fillEmailText(content.subject, context, forSubject),
    html: wrapEmailHtml({
      heading: fillEmailText(htmlEncode(content.heading), context, encodeWithBreaks),
      preview: fillEmailText(htmlEncode(content.preview), context, htmlEncode),
      body,
    }),
  };
}
