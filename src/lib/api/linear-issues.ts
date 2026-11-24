import { createHmac, timingSafeEqual } from "node:crypto";
import type { FeedbackArea, FeedbackPriority, FeedbackStatus, FeedbackType } from "@/lib/api/json";
import { feedbackAttachmentName, isFeedbackImageUrl } from "@/lib/feedback";

export type LinearIssueDraft = {
  id: string;
  title: string;
  type: FeedbackType;
  priority: FeedbackPriority;
  area: FeedbackArea;
  status?: FeedbackStatus;
  description: string;
  screenshotUrls: string[];
  submitterName: string;
  submitterUsername: string;
  tenantName: string | null;
  adminUrl: string;
};

export type LinearIssue = {
  id: string;
  identifier: string;
  url: string;
};

export type SlackFeedbackAlert = {
  id: string;
  title: string;
  type: FeedbackType;
  priority: FeedbackPriority;
  area: FeedbackArea;
  description: string;
  screenshotUrls: string[];
  submitterName: string;
  submitterUsername: string;
  tenantName: string | null;
  adminUrl: string;
  linearIssueIdentifier: string | null;
  ticketUrl: string | null;
};

type LinearWorkflowState = {
  id: string;
  name: string;
  type: string;
};

type LinearLabel = {
  id: string;
  name: string;
};

type LinearTeam = {
  id: string;
  key: string;
  name: string;
  states?: { nodes?: LinearWorkflowState[] };
  labels?: { nodes?: LinearLabel[] };
};

function config() {
  const apiKey = process.env.LINEAR_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const teamId = process.env.LINEAR_TEAM_ID?.trim() || null;
  const teamKey = process.env.LINEAR_TEAM_KEY?.trim() || "VolunTime";
  const apiUrl = (process.env.LINEAR_API_URL?.trim() || "https://api.linear.app/graphql").replace(/\/$/, "");
  return {
    apiKey,
    teamId,
    teamKey,
    apiUrl,
  };
}

export function feedbackPriorityToLinear(priority: FeedbackPriority): number {
  if (priority === "Urgent") return 1;
  if (priority === "High") return 2;
  if (priority === "Medium") return 3;
  return 4;
}

export function mapLinearPriorityToFeedbackPriority(priority: unknown): FeedbackPriority | null {
  if (priority === 1) return "Urgent";
  if (priority === 2) return "High";
  if (priority === 3) return "Medium";
  if (priority === 4) return "Low";
  return null;
}

export function mapLinearStateToFeedbackStatus(
  state: { name?: string | null; type?: string | null } | null | undefined,
): FeedbackStatus | null {
  if (!state) {
    return null;
  }

  const name = state.name?.trim().toLowerCase() ?? "";
  const type = state.type?.trim().toLowerCase() ?? "";

  if (name === "pending" || name === "triage") return "Pending";
  if (name === "acknowledged" || name === "backlog") return "Acknowledged";
  if (name === "planned" || name === "todo" || name === "to do") return "Planned";
  if (name === "in progress" || name === "inprogress" || name === "in review" || name === "started") {
    return "InProgress";
  }
  if (name === "resolved" || name === "done" || name === "completed") return "Resolved";
  if (name === "could not reproduce" || name === "couldnotreproduce" || name === "cannot reproduce") {
    return "CouldNotReproduce";
  }
  if (name === "archived") return "Archived";
  if (
    name === "cancelled" ||
    name === "canceled" ||
    name === "duplicate" ||
    name === "won't fix" ||
    name === "wontfix"
  ) {
    return "Cancelled";
  }

  if (type === "triage") return "Pending";
  if (type === "backlog") return "Acknowledged";
  if (type === "unstarted") return "Planned";
  if (type === "started") return "InProgress";
  if (type === "completed") return "Resolved";
  if (type === "canceled" || type === "cancelled") return "Cancelled";

  return null;
}

export function pickLinearStateId(states: LinearWorkflowState[], status: FeedbackStatus): string | null {
  if (states.length === 0) {
    return null;
  }

  const byName = (...names: string[]) => {
    const targets = names.map((item) => item.toLowerCase());
    return states.find((state) => targets.includes(state.name.trim().toLowerCase()))?.id ?? null;
  };
  const byType = (...types: string[]) => {
    const targets = types.map((item) => item.toLowerCase());
    return states.find((state) => targets.includes(state.type.trim().toLowerCase()))?.id ?? null;
  };

  switch (status) {
    case "Pending":
      return byName("triage", "pending") ?? byType("triage", "backlog", "unstarted");
    case "Acknowledged":
      return byName("acknowledged", "backlog") ?? byType("backlog", "unstarted");
    case "Planned":
      return byName("planned", "todo", "to do") ?? byType("unstarted", "backlog");
    case "InProgress":
      return byName("in progress", "started") ?? byType("started");
    case "Resolved":
      return byName("done", "resolved", "completed") ?? byType("completed");
    case "CouldNotReproduce":
      return (
        byName("could not reproduce", "cannot reproduce", "duplicate", "canceled", "cancelled") ??
        byType("canceled")
      );
    case "Archived":
      return byName("archived", "canceled", "cancelled") ?? byType("canceled");
    case "Cancelled":
      return byName("canceled", "cancelled") ?? byType("canceled");
  }
}

function labels(type: FeedbackType, area: FeedbackArea) {
  return [type, `area:${area}`];
}

function labelColor(label: string) {
  if (label === "Bug") return "#d73a4a";
  if (label === "Feature") return "#0e8a16";
  return "#cfd3d7";
}

export function formatLinearDescription(draft: LinearIssueDraft) {
  const lines = [
    `**Type:** ${draft.type}`,
    `**Priority:** ${draft.priority}`,
    `**Area:** ${draft.area === "LogTime" ? "Log time" : draft.area}`,
    `**From:** ${draft.submitterName} (\`${draft.submitterUsername}\`)`,
  ];
  if (draft.tenantName) {
    lines.push(`**Tenant:** ${draft.tenantName}`);
  }

  lines.push(`**VolunTime:** ${draft.adminUrl}`, "", draft.description);
  for (const [index, url] of draft.screenshotUrls.entries()) {
    if (isFeedbackImageUrl(url)) {
      lines.push("", `![Screenshot](${url})`);
    } else {
      lines.push("", `[Attachment: ${feedbackAttachmentName(url, index)}](${url})`);
    }
  }

  lines.push("", `VolunTime id: \`${draft.id}\``);
  return lines.join("\n");
}

export function extractFeedbackDescription(linearDescription: string | null | undefined): string | null {
  if (typeof linearDescription !== "string") {
    return null;
  }

  const normalized = linearDescription.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  let start = 0;
  if (lines[0]?.startsWith("**Type:**")) {
    while (start < lines.length && lines[start].startsWith("**")) {
      start += 1;
    }
    while (start < lines.length && lines[start].trim() === "") {
      start += 1;
    }
  }

  let end = lines.length;
  while (end > start) {
    const tail = lines[end - 1].trim();
    if (
      tail === "" ||
      /^VolunTime id:\s*`[0-9a-f-]{36}`$/i.test(tail) ||
      /^!\[Screenshot\]\([^)]+\)$/.test(tail) ||
      /^\[Attachment:[^\]]*\]\([^)]+\)$/.test(tail)
    ) {
      end -= 1;
    } else {
      break;
    }
  }

  const extracted = lines.slice(start, end).join("\n").trim();
  if (!extracted) {
    return null;
  }

  return extracted.slice(0, 4000);
}

export function extractFeedbackIdFromDescription(linearDescription: string | null | undefined): string | null {
  if (typeof linearDescription !== "string") {
    return null;
  }

  const footerMatch = /VolunTime id:\s*`([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})`/i.exec(
    linearDescription,
  );
  if (footerMatch?.[1]) {
    return footerMatch[1].toLowerCase();
  }

  const urlMatch = /\/feedback\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i.exec(
    linearDescription,
  );
  return urlMatch?.[1]?.toLowerCase() ?? null;
}

export function verifyLinearWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.LINEAR_WEBHOOK_SECRET?.trim();
  if (!secret || !signatureHeader) {
    return false;
  }

  const normalized = signatureHeader.trim().replace(/^sha256=/i, "").toLowerCase();
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex").toLowerCase();
  const actualBuf = Buffer.from(normalized, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (actualBuf.length !== expectedBuf.length) {
    return false;
  }

  return timingSafeEqual(actualBuf, expectedBuf);
}

type GraphqlResult<T> = {
  data: T | null;
  error: string | null;
};

async function linearGraphqlDetailed<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<GraphqlResult<T>> {
  const settings = config();
  if (!settings) {
    return { data: null, error: "LINEAR_API_KEY is not configured in this environment." };
  }

  try {
    const response = await fetch(settings.apiUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: settings.apiKey,
        "Content-Type": "application/json",
        "User-Agent": "clocked-in",
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
      const errorText = `Linear API returned HTTP ${response.status}.`;
      console.error(`[linear] ${errorText}`);
      return { data: null, error: errorText };
    }

    const payload = (await response.json()) as {
      data?: T;
      errors?: Array<{ message?: string }>;
    };
    if (payload.errors?.length || !payload.data) {
      const detail =
        payload.errors
          ?.map((err) => (typeof err?.message === "string" ? err.message.trim() : ""))
          .filter(Boolean)
          .join("; ") || "Linear GraphQL request failed.";
      console.error(`[linear] ${detail}`);
      return { data: null, error: detail };
    }

    return { data: payload.data, error: null };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Network error connecting to Linear.";
    console.error(`[linear] ${detail}`);
    return { data: null, error: detail };
  }
}

async function linearGraphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T | null> {
  const result = await linearGraphqlDetailed<T>(query, variables);
  return result.data;
}

async function resolveVolunTimeTeam(): Promise<{ team: LinearTeam | null; error: string | null }> {
  const settings = config();
  if (!settings) {
    return { team: null, error: "LINEAR_API_KEY is not configured in this environment." };
  }

  const { data, error } = await linearGraphqlDetailed<{ teams?: { nodes?: LinearTeam[] } }>(`
    query VolunTimeTeams {
      teams {
        nodes {
          id
          key
          name
          states {
            nodes {
              id
              name
              type
            }
          }
          labels {
            nodes {
              id
              name
            }
          }
        }
      }
    }
  `);
  if (error) {
    return { team: null, error };
  }

  const teams = data?.teams?.nodes ?? [];
  if (teams.length === 0) {
    return { team: null, error: "No Linear teams are accessible with the configured LINEAR_API_KEY." };
  }

  if (settings.teamId) {
    const byId = teams.find((team) => team.id === settings.teamId);
    if (byId) return { team: byId, error: null };
  }

  const target = settings.teamKey.toLowerCase();
  const matched =
    teams.find((team) => team.key.toLowerCase() === target || team.name.toLowerCase() === target) ??
    teams.find((team) => team.name.toLowerCase() === "voluntime" || team.key.toLowerCase() === "vol") ??
    teams[0] ??
    null;

  return { team: matched, error: matched ? null : `Linear team "${settings.teamKey}" was not found.` };
}

async function ensureLinearLabels(team: LinearTeam, names: string[]): Promise<string[]> {
  const existing = new Map<string, string>();
  for (const label of team.labels?.nodes ?? []) {
    existing.set(label.name.toLowerCase(), label.id);
  }

  const ids: string[] = [];
  for (const name of names) {
    const found = existing.get(name.toLowerCase());
    if (found) {
      ids.push(found);
      continue;
    }

    const created = await linearGraphql<{
      issueLabelCreate?: { success?: boolean; issueLabel?: { id?: string; name?: string } };
    }>(
      `
        mutation CreateLinearLabel($input: IssueLabelCreateInput!) {
          issueLabelCreate(input: $input) {
            success
            issueLabel {
              id
              name
            }
          }
        }
      `,
      {
        input: {
          teamId: team.id,
          name,
          color: labelColor(name),
        },
      },
    );
    const id = created?.issueLabelCreate?.issueLabel?.id;
    if (id) {
      ids.push(id);
    }
  }

  return ids;
}

type IssueCreateResult = {
  issueCreate?: {
    success?: boolean;
    issue?: {
      id?: string;
      identifier?: string;
      url?: string;
    };
  };
};

export async function createLinearIssueDetailed(
  draft: LinearIssueDraft,
): Promise<{ issue: LinearIssue | null; error: string | null }> {
  const settings = config();
  if (!settings) {
    const error = "LINEAR_API_KEY is not configured in this environment.";
    console.warn(`[linear] ${error}`);
    return { issue: null, error };
  }

  const { team, error: teamError } = await resolveVolunTimeTeam();
  if (!team) {
    return { issue: null, error: teamError ?? "Could not resolve Linear team." };
  }

  const labelIds = await ensureLinearLabels(team, labels(draft.type, draft.area));
  const stateId = pickLinearStateId(team.states?.nodes ?? [], draft.status ?? "Pending");
  const description = formatLinearDescription(draft);
  const priority = feedbackPriorityToLinear(draft.priority);

  const mutation = `
    mutation CreateFeedbackIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          url
        }
      }
    }
  `;

  let result = await linearGraphqlDetailed<IssueCreateResult>(mutation, {
    input: {
      teamId: team.id,
      title: draft.title,
      description,
      priority,
      ...(stateId ? { stateId } : {}),
      ...(labelIds.length > 0 ? { labelIds } : {}),
    },
  });
  if (!result.data) {
    result = await linearGraphqlDetailed<IssueCreateResult>(mutation, {
      input: {
        teamId: team.id,
        title: draft.title,
        description,
        priority,
      },
    });
  }

  const issue = result.data?.issueCreate?.issue;
  if (!issue?.id || !issue.identifier || !issue.url) {
    return { issue: null, error: result.error ?? "Linear did not return a created issue." };
  }

  return {
    issue: {
      id: issue.id,
      identifier: issue.identifier,
      url: issue.url,
    },
    error: null,
  };
}

export async function createLinearIssue(draft: LinearIssueDraft): Promise<LinearIssue | null> {
  const { issue } = await createLinearIssueDetailed(draft);
  return issue;
}

export async function syncLinearIssueState(linearIssueId: string, status: FeedbackStatus) {
  const settings = config();
  if (!settings) {
    return;
  }

  const issueData = await linearGraphql<{
    issue?: {
      id?: string;
      team?: {
        states?: {
          nodes?: LinearWorkflowState[];
        };
      };
    };
  }>(
    `
      query FeedbackIssueStates($id: String!) {
        issue(id: $id) {
          id
          team {
            states {
              nodes {
                id
                name
                type
              }
            }
          }
        }
      }
    `,
    { id: linearIssueId },
  );

  const states =
    issueData?.issue?.team?.states?.nodes ?? (await resolveVolunTimeTeam()).team?.states?.nodes ?? [];
  const stateId = pickLinearStateId(states, status);
  if (!stateId) {
    return;
  }

  await linearGraphql(
    `
      mutation UpdateFeedbackIssueState($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
          success
        }
      }
    `,
    {
      id: linearIssueId,
      input: { stateId },
    },
  );
}

function escapeSlackMrkdwn(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatSlackFeedbackPayload(alert: SlackFeedbackAlert) {
  const kindLabel = alert.type === "Feature" ? "feature request" : "bug report";
  const areaLabel = alert.area === "LogTime" ? "Log time" : alert.area;
  const identifierPrefix = alert.linearIssueIdentifier ? `[${alert.linearIssueIdentifier}] ` : "";
  const fallbackText = `New ${kindLabel}: ${identifierPrefix}${alert.title}`;
  const headerText = `New ${alert.type === "Feature" ? "Feature Request" : "Bug Report"}: ${identifierPrefix}${alert.title}`.slice(
    0,
    150,
  );

  const fields: Array<{ type: "mrkdwn"; text: string }> = [
    { type: "mrkdwn", text: `*Type:*\n${escapeSlackMrkdwn(alert.type)}` },
    { type: "mrkdwn", text: `*Priority:*\n${escapeSlackMrkdwn(alert.priority)}` },
    { type: "mrkdwn", text: `*Area:*\n${escapeSlackMrkdwn(areaLabel)}` },
    {
      type: "mrkdwn",
      text: `*From:*\n${escapeSlackMrkdwn(alert.submitterName)} (\`${escapeSlackMrkdwn(alert.submitterUsername)}\`)`,
    },
  ];

  if (alert.tenantName) {
    fields.push({
      type: "mrkdwn",
      text: `*Tenant:*\n${escapeSlackMrkdwn(alert.tenantName)}`,
    });
  }

  if (alert.linearIssueIdentifier) {
    const linearValue = alert.ticketUrl
      ? `<${alert.ticketUrl}|${escapeSlackMrkdwn(alert.linearIssueIdentifier)}>`
      : escapeSlackMrkdwn(alert.linearIssueIdentifier);
    fields.push({
      type: "mrkdwn",
      text: `*Linear Issue:*\n${linearValue}`,
    });
  }

  const links: string[] = [`<${alert.adminUrl}|View in VolunTime>`];
  if (alert.ticketUrl) {
    const label = alert.linearIssueIdentifier ? `Open ${escapeSlackMrkdwn(alert.linearIssueIdentifier)} in Linear` : "Open in Linear";
    links.push(`<${alert.ticketUrl}|${label}>`);
  }
  for (const [index, url] of alert.screenshotUrls.entries()) {
    const name = isFeedbackImageUrl(url) ? `Screenshot ${index + 1}` : feedbackAttachmentName(url, index);
    links.push(`<${url}|${escapeSlackMrkdwn(name)}>`);
  }

  const descriptionText = escapeSlackMrkdwn(alert.description.trim()).slice(0, 2900) || "_No description provided._";

  return {
    text: fallbackText,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: headerText,
          emoji: true,
        },
      },
      {
        type: "section",
        fields,
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: descriptionText,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: links.join("  •  "),
          },
        ],
      },
    ],
  };
}

export async function notifySlackFeedbackWebhook(alert: SlackFeedbackAlert): Promise<boolean> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    return false;
  }

  const payload = formatSlackFeedbackPayload(alert);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "clocked-in",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.error(`[slack] Slack webhook returned HTTP ${response.status}.`);
      return false;
    }
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Network error connecting to Slack webhook.";
    console.error(`[slack] ${detail}`);
    return false;
  }
}
