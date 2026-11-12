import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { apiBaseUrl, databaseUrl, linearSinkUrl, mailSinkUrl } from "./fixture.mjs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const instantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

let sequence = 0;

export function label(prefix) {
  sequence += 1;
  return `${prefix} ${Date.now().toString(36)}${sequence}${randomBytes(2).toString("hex")}`;
}

export function identity(prefix = "user") {
  sequence += 1;
  const token = `${prefix}${sequence.toString(36)}${randomBytes(3).toString("hex")}`.toLowerCase();
  return {
    username: token.slice(0, 40),
    email: `${token}@example.com`,
    password: "correct-horse-1",
    firstName: "Ada",
    lastName: "Lovelace",
  };
}

export function missingId() {
  return randomUUID();
}

export async function callApi(path, { method = "GET", token, apiKey, tenant, body, query, headers: extraHeaders } = {}) {
  const url = new URL(path, apiBaseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers = {};
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }
  if (tenant) {
    headers["x-voluntime-tenant"] = tenant;
  }
  Object.assign(headers, extraHeaders);

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  return { status: response.status, json, text, headers: response.headers };
}

export async function callForm(path, { method = "POST", token, form } = {}) {
  const headers = {};
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(new URL(path, apiBaseUrl), { method, headers, body: form });
  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  return { status: response.status, json, text, headers: response.headers };
}

export function assertStatus(response, status) {
  assert.equal(response.status, status, `expected ${status}, got ${response.status}: ${response.text.slice(0, 600)}`);
}

export function assertKeys(value, keys) {
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort());
}

export function assertError(response, status, code, message) {
  assertStatus(response, status);
  assert.equal(response.json?.code, code);
  if (message !== undefined) {
    assert.equal(response.json.message, message);
  }
  assertKeys(response.json, ["code", "message"]);
}

export function assertUuid(value) {
  assert.match(value, uuidPattern);
}

export function assertInstant(value) {
  assert.match(value, instantPattern);
  assert.equal(Number.isNaN(Date.parse(value)), false);
}

export function assertDate(value) {
  assert.match(value, datePattern);
}

export function assertMoney(actual, expected) {
  assert.equal(typeof actual, "number");
  assert.ok(Math.abs(actual - expected) < 0.011, `expected ${expected}, got ${actual}`);
}

export function assertList(body, { limit = 50, offset = 0 } = {}) {
  assertKeys(body, ["items", "limit", "offset"]);
  assert.ok(Array.isArray(body.items));
  assert.equal(body.limit, limit);
  assert.equal(body.offset, offset);
}

export function assertNoSecrets(value) {
  const text = JSON.stringify(value);
  assert.equal(text.includes("passwordHash"), false);
  assert.equal(text.includes('"password"'), false);
  assert.equal(text.includes("codeHash"), false);
}

export function assertUser(user, expected = {}) {
  assertKeys(user, [
    "id",
    "username",
    "email",
    "isSuperAdmin",
    "mustChangePassword",
    "createdAt",
    "updatedAt",
    "profile",
  ]);
  assertUuid(user.id);
  assertInstant(user.createdAt);
  assertInstant(user.updatedAt);
  assert.equal(typeof user.isSuperAdmin, "boolean");
  if (expected.username) {
    assert.equal(user.username, expected.username.toLowerCase());
  }
  if (expected.email) {
    assert.equal(user.email, expected.email.toLowerCase());
  }
  if (expected.isSuperAdmin !== undefined) {
    assert.equal(user.isSuperAdmin, expected.isSuperAdmin);
  }
  assert.equal(typeof user.mustChangePassword, "boolean");
  if (expected.mustChangePassword !== undefined) {
    assert.equal(user.mustChangePassword, expected.mustChangePassword);
  } else {
    assert.equal(user.mustChangePassword, false);
  }
  assertKeys(user.profile, [
    "id",
    "firstName",
    "lastName",
    "displayName",
    "timezone",
    "phone",
    "zipCode",
    "notes",
    "memberNumber",
    "avatarUrl",
    "description",
  ]);
  assertUuid(user.profile.id);
  if (expected.firstName) {
    assert.equal(user.profile.firstName, expected.firstName);
  }
  if (expected.lastName) {
    assert.equal(user.profile.lastName, expected.lastName);
  }
  if (expected.timezone) {
    assert.equal(user.profile.timezone, expected.timezone);
  }
  for (const key of ["displayName", "phone", "zipCode", "notes"]) {
    if (Object.prototype.hasOwnProperty.call(expected, key)) {
      assert.equal(user.profile[key], expected[key]);
    }
  }
}

export function assertSession(body, expected = {}) {
  assertKeys(body, ["accessToken", "refreshToken", "expiresAt", "user"]);
  assert.equal(typeof body.accessToken, "string");
  assert.equal(typeof body.refreshToken, "string");
  assert.ok(body.accessToken.length > 20);
  assert.ok(body.refreshToken.length > 20);
  assertInstant(body.expiresAt);
  const expiresAt = Date.parse(body.expiresAt);
  const now = Date.now();
  assert.ok(expiresAt > now + 10 * 60 * 1000, "access token should last about 15 minutes");
  assert.ok(expiresAt < now + 20 * 60 * 1000);
  assertUser(body.user, expected);
  assertNoSecrets(body);
}

export const clockedInThemeId = "44444444-4444-4444-8444-444444444441";

export const defaultEntityLabels = {
  organization: "Organization",
  project: "Project",
  department: "Department",
  taskCategory: "Task category",
};

export function defaultPreferences(overrides = {}) {
  return {
    allowTimeEntryEditing: false,
    allowVolunteersToAddVolunteers: false,
    entityLabels: defaultEntityLabels,
    feedbackNotifyUserIds: [],
    emailSettings: {
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
    },
    ...overrides,
  };
}

export function assertOrganization(org, name) {
  assertKeys(org, [
    "id",
    "name",
    "slug",
    "volunteerHourlyRate",
    "defaultRateType",
    "preferences",
    "themeId",
    "theme",
    "wordmarkUrl",
    "wordmarkOnLightUrl",
    "markUrl",
    "accentImageUrl",
    "description",
    "websiteUrl",
    "publicSlug",
  ]);
  assertUuid(org.id);
  assert.equal(org.name, name);
  assert.equal(org.slug, null);
  assertMoney(org.volunteerHourlyRate, 35.47);
  assert.equal(org.defaultRateType, "Volunteer");
  assert.deepEqual(org.preferences, defaultPreferences());
  assert.equal(org.themeId, clockedInThemeId);
  assert.equal(org.theme.name, "VolunTime");
  assert.equal(org.wordmarkUrl, null);
  assert.equal(org.wordmarkOnLightUrl, null);
  assert.equal(org.markUrl, null);
  assert.equal(org.accentImageUrl, null);
  assert.equal(org.description, null);
  assert.equal(org.websiteUrl, null);
  assert.equal(org.publicSlug, null);
}

export function assertHourlyRate(rate, expected) {
  assertKeys(rate, ["id", "organizationId", "type", "name", "perHourRate", "isDefault", "isArchived", "source"]);
  assertUuid(rate.id);
  assert.equal(rate.organizationId, expected.organizationId);
  assert.equal(rate.type, expected.type);
  assert.equal(rate.name, expected.name);
  assertMoney(rate.perHourRate, expected.perHourRate);
  assert.equal(rate.isDefault, expected.isDefault);
  assert.equal(rate.isArchived, expected.isArchived ?? false);
  assert.equal(rate.source, expected.source ?? null);
}

export function assertNamed(entity, { organizationId, name, isArchived }) {
  assertKeys(entity, ["id", "organizationId", "name", ...(isArchived === undefined ? [] : ["isArchived"])]);
  assertUuid(entity.id);
  assert.equal(entity.organizationId, organizationId);
  assert.equal(entity.name, name);
  if (isArchived !== undefined) assert.equal(entity.isArchived, isArchived);
}

export function assertRole(role, code) {
  assertKeys(role, ["id", "code", "name"]);
  assertUuid(role.id);
  assert.equal(role.code, code);
  const names = { ADMIN: "Admin", MEMBER: "Staff", VOLUNTEER: "Volunteer" };
  assert.equal(role.name, names[code]);
}

export function assertMembership(membership, { organizationId, departmentId, role, userId, departmentIds }) {
  assertKeys(membership, [
    "id",
    "userId",
    "organizationId",
    "departmentId",
    "role",
    "joinedAt",
    "rateType",
    "professionalBillingRate",
    "isActive",
    "primaryDepartmentId",
    "departmentIds",
    ...(departmentId === null ? ["managedDepartmentIds"] : []),
    "orgUserTitle",
    "orgUserDescription",
    "user",
  ]);
  assertUuid(membership.id);
  assert.equal(membership.organizationId, organizationId);
  assert.equal(membership.departmentId, departmentId);
  assert.equal(membership.userId, userId);
  assertInstant(membership.joinedAt);
  assertRole(membership.role, role);
  assert.ok(Array.isArray(membership.departmentIds));
  if (departmentIds) {
    assert.deepEqual([...membership.departmentIds].sort(), [...departmentIds].sort());
  }
  assertKeys(membership.user, ["id", "username", "email", "firstName", "lastName", "displayName"]);
  assert.equal(membership.user.id, userId);
}

export function assertInvitation(invitation, { email, organizationId, departmentId, role }) {
  assertKeys(invitation, [
    "id",
    "email",
    "organizationId",
    "departmentId",
    "role",
    "invitedByUserId",
    "expiresAt",
    "acceptedAt",
    "revokedAt",
    "createdAt",
    "firstName",
    "lastName",
    "username",
  ]);
  assertUuid(invitation.id);
  assert.equal(invitation.email, email.toLowerCase());
  assert.equal(invitation.organizationId, organizationId);
  assert.equal(invitation.departmentId, departmentId);
  assertRole(invitation.role, role);
  assertUuid(invitation.invitedByUserId);
  assertInstant(invitation.expiresAt);
  assertInstant(invitation.createdAt);
  assert.equal(invitation.code, undefined);
}

export function assertProject(project, expected) {
  assertKeys(project, [
    "id",
    "organizationId",
    "departmentId",
    "ownerUserId",
    "title",
    "description",
    "accessType",
    "projectType",
    "startDate",
    "endDate",
    "isActive",
    "editorIds",
  ]);
  assertUuid(project.id);
  assert.equal(project.organizationId, expected.organizationId);
  assert.equal(project.departmentId, expected.departmentId ?? null);
  assert.equal(project.projectType, expected.projectType ?? "Project");
  assert.equal(project.ownerUserId, expected.ownerUserId);
  assert.equal(project.title, expected.title);
  assert.equal(project.accessType, expected.accessType);
  assert.equal(project.isActive, expected.isActive ?? true);
  assert.ok(Array.isArray(project.editorIds));
}

export function assertTimeEntry(entry, expected) {
  assertKeys(entry, [
    "id",
    "userId",
    "enteredByUserId",
    "organizationId",
    "departmentId",
    "projectId",
    "taskCategoryId",
    "mode",
    "startedAt",
    "endedAt",
    "durationMinutes",
    "occurredOn",
    "description",
    "hourlyRateId",
    "hourlyRate",
    "inKindValue",
    "createdAt",
    "sourceRef",
    "tagIds",
  ]);
  assertUuid(entry.id);
  assert.equal(entry.userId, expected.userId);
  assert.equal(entry.enteredByUserId, expected.enteredByUserId);
  assert.equal(entry.organizationId, expected.organizationId);
  assert.equal(entry.departmentId, expected.departmentId ?? null);
  assert.equal(entry.projectId, expected.projectId);
  assert.equal(entry.taskCategoryId, expected.taskCategoryId);
  assert.equal(entry.mode, expected.mode);
  assertDate(entry.occurredOn);
  assertInstant(entry.createdAt);
  assert.ok(Array.isArray(entry.tagIds));
  if (expected.hourlyRateId === null) {
    assert.equal(entry.hourlyRateId, null);
  } else if (expected.hourlyRateId) {
    assert.equal(entry.hourlyRateId, expected.hourlyRateId);
  } else {
    assertUuid(entry.hourlyRateId);
  }
  assertMoney(entry.hourlyRate, expected.hourlyRate ?? 35.47);
  if (expected.durationMinutes !== undefined) {
    assert.equal(entry.durationMinutes, expected.durationMinutes);
  }
  if (expected.inKindValue === null) {
    assert.equal(entry.inKindValue, null);
  } else if (expected.inKindValue !== undefined) {
    assertMoney(entry.inKindValue, expected.inKindValue);
  }
}

export function assertCollective(entry, expected) {
  assertKeys(entry, [
    "id",
    "recordedByUserId",
    "organizationId",
    "departmentId",
    "projectId",
    "taskCategoryId",
    "startedAt",
    "endedAt",
    "participantCount",
    "description",
    "hourlyRateId",
    "hourlyRate",
    "inKindValue",
    "createdAt",
    "tagIds",
  ]);
  assertUuid(entry.id);
  assert.equal(entry.recordedByUserId, expected.recordedByUserId);
  assert.equal(entry.organizationId, expected.organizationId);
  assert.equal(entry.departmentId, expected.departmentId ?? null);
  assert.equal(entry.participantCount, expected.participantCount);
  assertInstant(entry.startedAt);
  assertInstant(entry.endedAt);
  assertInstant(entry.createdAt);
  if (expected.hourlyRateId) {
    assert.equal(entry.hourlyRateId, expected.hourlyRateId);
  } else {
    assertUuid(entry.hourlyRateId);
  }
  assertMoney(entry.hourlyRate, expected.hourlyRate ?? 35.47);
  assertMoney(entry.inKindValue, expected.inKindValue);
  assert.ok(Array.isArray(entry.tagIds));
}

export function inKind(minutes, hourlyRate = 35.47) {
  return Math.round(((minutes * hourlyRate) / 60) * 100) / 100;
}

export async function signUp(prefix = "user", extra = {}) {
  const person = identity(prefix);
  const response = await callApi("/auth/user", {
    method: "POST",
    body: {
      username: person.username,
      email: person.email,
      password: person.password,
      firstName: person.firstName,
      lastName: person.lastName,
      ...extra,
    },
  });
  assertStatus(response, 201);
  assertSession(response.json, {
    ...person,
    displayName: extra.displayName ?? null,
    phone: extra.phone ?? null,
    zipCode: null,
    notes: null,
    timezone: extra.timezone ?? "UTC",
    isSuperAdmin: false,
    ...extra,
  });
  return { ...person, ...response.json };
}

export async function logIn(username, password, expected = {}) {
  const response = await callApi("/auth/login", {
    method: "POST",
    body: { username, password },
  });
  assertStatus(response, 200);
  assertSession(response.json, { username, ...expected });
  return response.json;
}

async function withDatabase(run) {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/** Runs one SQL statement, for tests that must plant rows the API would refuse. */
export async function queryDatabase(sql, params = []) {
  return withDatabase((client) => client.query(sql, params));
}

export async function grantSuperAdmin(userId) {
  await withDatabase(async (client) => {
    const result = await client.query('UPDATE "User" SET "isSuperAdmin" = true WHERE id = $1::uuid', [userId]);
    assert.equal(result.rowCount, 1, "SuperAdmin flag was not updated");
  });
}

export async function countSuperAdmins() {
  return withDatabase(async (client) => {
    const result = await client.query('SELECT COUNT(*)::int AS count FROM "User" WHERE "isSuperAdmin" = true');
    return result.rows[0].count;
  });
}

export async function createJson(token, path, body, status = 201) {
  const response = await callApi(path, { method: "POST", token, body });
  assertStatus(response, status);
  return response.json;
}

export async function remove(token, path) {
  const response = await callApi(path, { method: "DELETE", token });
  assertStatus(response, 204);
  assert.equal(response.text, "");
}

export function themeBody(overrides = {}) {
  return {
    name: "Harbor custom",
    primary: "#112233",
    primaryForeground: "#FFFFFF",
    highlight: "#AABBCC",
    accent: "#445566",
    success: "#117733",
    surface: "#F7F7F4",
    surfaceForeground: "#1C1C1A",
    foreground: "#222222",
    chartColor: "#112233",
    headingFont: "SourceSans3",
    bodyFont: "NunitoSans",
    categoricalPalette: ["#112233", "#AABBCC", "#2A6F97", "#4EBFAE", "#C17B4A", "#6B7C93"],
    sequentialPalette: ["#F4F0E6", "#E8D7A8", "#D4AC59", "#8A6E2F", "#3D3014"],
    divergingPalette: ["#8B3A2A", "#C17B4A", "#E8C9A8", "#F7F4EE", "#A8C4D4", "#2A6F97", "#001836"],
    ...overrides,
  };
}

export async function waitForEmails(email, count = 1) {
  const deadline = Date.now() + 8000;
  let messages = [];
  while (Date.now() < deadline) {
    const response = await fetch(`${mailSinkUrl}/emails?to=${encodeURIComponent(email)}`);
    if (response.ok) {
      messages = await response.json();
      if (messages.length >= count) {
        return messages;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(
    `Expected ${count} email(s) for ${email}. Start tests/http/mail-sink.mjs and point RESEND_API_URL at ${mailSinkUrl}/emails. Got ${messages.length}.`,
  );
}

export async function waitForMatchingEmails(email, pattern, minCount = 1) {
  const deadline = Date.now() + 8000;
  let messages = [];
  while (Date.now() < deadline) {
    const response = await fetch(`${mailSinkUrl}/emails?to=${encodeURIComponent(email)}`);
    if (response.ok) {
      messages = await response.json();
      const matches = messages.filter((message) => pattern.test(message.subject) || pattern.test(message.text ?? ""));
      if (matches.length >= minCount) {
        return matches;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(
    `Expected ${minCount} email(s) matching ${pattern} for ${email}. Start tests/http/mail-sink.mjs and point RESEND_API_URL at ${mailSinkUrl}/emails. Got ${messages.length}.`,
  );
}

export async function waitForLinearIssue(title, predicate) {
  const deadline = Date.now() + 8000;
  let issues = [];
  while (Date.now() < deadline) {
    const response = await fetch(`${linearSinkUrl}/issues`);
    if (response.ok) {
      issues = await response.json();
      const match = issues.find((issue) => issue.title === title && (!predicate || predicate(issue)));
      if (match) {
        return match;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(
    `Expected a Linear issue titled ${title}. Start tests/http/linear-sink.mjs and point LINEAR_API_URL at ${linearSinkUrl}/graphql. Got ${issues.length}.`,
  );
}

export async function waitForCode(email) {
  const deadline = Date.now() + 8000;
  const pattern = /Use this code to (?:reset your VolunTime password|accept the invite):\s*([A-Z0-9][A-Z0-9-]*)/;
  let last = "";
  while (Date.now() < deadline) {
    const response = await fetch(`${mailSinkUrl}/emails?to=${encodeURIComponent(email)}`);
    if (response.ok) {
      const messages = await response.json();
      last = messages.at(-1)?.text ?? "";
      const match = pattern.exec(last);
      if (match) {
        return match[1];
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(
    `No mailed code for ${email}. Start tests/http/mail-sink.mjs and point RESEND_API_URL at ${mailSinkUrl}/emails. Last text: ${last}`,
  );
}

export async function acceptInvite(token, email) {
  const code = await waitForCode(email);
  const response = await callApi("/invitations/accept", {
    method: "POST",
    token,
    body: { code },
  });
  assertStatus(response, 200);
  return response.json;
}

/** Adds an existing account to an organization the way people join: invite, then accept. */
export async function joinOrg(adminToken, organizationId, person, { role = "MEMBER", departmentIds, managedDepartmentIds } = {}) {
  await createJson(adminToken, `/organizations/${organizationId}/invitations`, {
    email: person.email,
    role,
    firstName: person.firstName,
    lastName: person.lastName,
  });
  const accepted = await acceptInvite(person.accessToken, person.email);
  let membership = accepted.organizationMembership;
  if (departmentIds || managedDepartmentIds) {
    const response = await callApi(`/organizations/${organizationId}/memberships/${membership.id}`, {
      method: "PATCH",
      token: adminToken,
      body: { ...(departmentIds ? { departmentIds } : {}), ...(managedDepartmentIds ? { managedDepartmentIds } : {}) },
    });
    assertStatus(response, 200);
    membership = response.json;
  }
  return membership;
}

export const suite = { concurrency: false, timeout: 180_000 };
