import assert from "node:assert/strict";
import { before, test } from "node:test";
import {
  tenantGroupsPayloadSchema,
  peopleRolesPayloadSchema,
} from "../src/lib/external-sync/contracts";
import { cronDueInWindow, isValidCronExpression } from "../src/lib/external-sync/cron";
import {
  decryptSecret,
  encryptSecret,
  mintWebhookSecret,
  signSyncWebhook,
  verifySyncWebhookSignature,
} from "../src/lib/external-sync/crypto";
before(() => {
  if (!process.env.API_KEY_PEPPER || process.env.API_KEY_PEPPER.length < 32) {
    process.env.API_KEY_PEPPER = "unit-test-api-key-pepper-32chars-min!!";
  }
});

test("isValidCronExpression accepts 5-field cron strings", () => {
  assert.equal(isValidCronExpression("0 * * * *"), true);
  assert.equal(isValidCronExpression("0 6 * * 1"), true);
  assert.equal(isValidCronExpression("* * * * * *"), false);
  assert.equal(isValidCronExpression("not a cron"), false);
});

test("cronDueInWindow matches the current minute once", () => {
  const now = new Date("2026-11-19T12:00:30.000Z");
  assert.equal(cronDueInWindow("0 * * * *", now, null), true);
  assert.equal(cronDueInWindow("0 * * * *", now, new Date("2026-11-19T12:00:00.000Z")), false);
  assert.equal(cronDueInWindow("30 * * * *", now, null), false);
});

test("encryptSecret round-trips outbound tokens", () => {
  const secret = "cki_test_outbound_token_value";
  const enc = encryptSecret(secret);
  assert.notEqual(enc, secret);
  assert.equal(decryptSecret(enc), secret);
});

test("verifySyncWebhookSignature validates HMAC over timestamp.body", () => {
  const secret = mintWebhookSecret();
  const enc = encryptSecret(secret);
  const body = JSON.stringify({ people: [], roles: [] });
  const header = signSyncWebhook(body, secret);
  assert.equal(verifySyncWebhookSignature(body, header, enc), true);
  assert.equal(verifySyncWebhookSignature(body, "t=1,v1=deadbeef", enc), false);
  assert.equal(verifySyncWebhookSignature(body, null, enc), false);
});

test("peopleRolesPayloadSchema validates contract payloads", () => {
  const ok = peopleRolesPayloadSchema.safeParse({
    roles: [{ code: "STAFF", name: "Staff", scope: "tenant", permissions: ["log_own_time"] }],
    people: [{ email: "alex@example.com", roleCode: "STAFF", rateType: "Volunteer", isActive: true }],
  });
  assert.equal(ok.success, true);

  const bad = peopleRolesPayloadSchema.safeParse({ people: [{ email: "nope", roleCode: "X" }] });
  assert.equal(bad.success, false);
});

test("tenantGroupsPayloadSchema validates contract payloads", () => {
  const ok = tenantGroupsPayloadSchema.safeParse({
    tenant: { name: "Acme" },
    organizations: [{ externalId: "d1", name: "Ops" }],
    memberships: [{ email: "alex@example.com", organizationExternalId: "d1", isPrimary: true }],
  });
  assert.equal(ok.success, true);
});
