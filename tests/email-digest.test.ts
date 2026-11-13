import assert from "node:assert/strict";
import test from "node:test";
import { shouldSendEmailImmediate, type OrganizationEmailSettings } from "../src/lib/email/templates";

process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:5432/unused";

function loadDigest() {
  return import("../src/lib/email/digest.ts");
}

const settings = {
  LoggedTime: "weekly",
  UnclassifiedEntry: "weekly",
} as OrganizationEmailSettings;

test("weekly does not send immediately", () => {
  assert.equal(shouldSendEmailImmediate(settings, "LoggedTime"), false);
  assert.equal(shouldSendEmailImmediate(settings, "UnclassifiedEntry"), false);
  assert.equal(shouldSendEmailImmediate({ ...settings, LoggedTime: "off" }, "LoggedTime"), false);
  assert.equal(shouldSendEmailImmediate({ ...settings, LoggedTime: "immediate" }, "LoggedTime"), true);
});

test("digest week key is the UTC Monday", async () => {
  const digest = await loadDigest();
  assert.equal(digest.digestWeekKey(new Date("2026-11-05T16:00:00Z")), "2026-11-02");
  assert.equal(digest.digestWeekKey(new Date("2026-11-02T00:00:00Z")), "2026-11-02");
  assert.equal(digest.digestWeekKey(new Date("2026-11-08T23:59:59Z")), "2026-11-02");
  assert.equal(digest.digestWeekKey(new Date("2026-11-09T00:00:00Z")), "2026-11-09");
});

test("the digest sender emails once per week", async () => {
  const digest = await loadDigest();
  const week = "2026-11-02";
  const next = "2026-11-09";
  const empty = digest.readDigestStamp({});
  assert.equal(digest.digestAction("weekly", empty, "LoggedTime", week), "send");
  assert.equal(digest.digestAction("immediate", empty, "LoggedTime", week), "ignore");
  assert.equal(digest.digestAction("off", empty, "UnclassifiedEntry", week), "ignore");

  const sent = digest.readDigestStamp({ emailDigest: { LoggedTime: week } });
  assert.equal(digest.digestAlreadySent(sent, "LoggedTime", week), true);
  assert.equal(digest.digestAction("weekly", sent, "LoggedTime", week), "skip");
  assert.equal(digest.digestAction("weekly", sent, "UnclassifiedEntry", week), "send");
  assert.equal(digest.digestAction("weekly", sent, "LoggedTime", next), "send");
});
