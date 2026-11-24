import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHmac } from "node:crypto";
import {
  portalMembershipSchema,
  portalOrganizationSchema,
  portalPersonSchema,
  portalPositionSchema,
  portalEventSchema,
} from "../src/lib/external-sync/portal-client";
import { signSyncWebhook } from "../src/lib/external-sync/crypto";

describe("portal contracts", () => {
  it("parses portal person/org/membership/position shapes", () => {
    assert.equal(
      portalPersonSchema.parse({ id: "p1", name: "Ada", email: "ada@example.com", active: true }).id,
      "p1",
    );
    assert.equal(
      portalOrganizationSchema.parse({
        id: "o1",
        name: "West Jordan Symphony",
        short_name: "WJS",
        kind: "ao",
        active: true,
      }).kind,
      "ao",
    );
    assert.equal(
      portalMembershipSchema.parse({
        id: "m1",
        person_id: "p1",
        organization_id: "o1",
        role_id: "r1",
        suspended: false,
      }).person_id,
      "p1",
    );
    assert.equal(
      portalPositionSchema.parse({
        id: "h1",
        person_id: "p1",
        organization_id: "o1",
        position: "Chair",
      }).position,
      "Chair",
    );
  });

  it("parses portal webhook envelope", () => {
    const event = portalEventSchema.parse({
      id: "evt_1",
      type: "membership.started",
      occurred_at: "2026-11-23T18:00:00.000Z",
      data: { id: "m1" },
    });
    assert.equal(event.type, "membership.started");
  });

  it("signs with CASWJ-compatible HMAC format", () => {
    const body = '{"id":"evt_1","type":"person.updated","data":{}}';
    const secret = "caswj_wh_test";
    const header = signSyncWebhook(body, secret, 1732320000);
    assert.match(header, /^t=1732320000,v1=[0-9a-f]+$/);
    const digest = createHmac("sha256", secret).update(`1732320000.${body}`, "utf8").digest("hex");
    assert.equal(header, `t=1732320000,v1=${digest}`);
  });
});
