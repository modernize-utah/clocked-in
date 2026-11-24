import assert from "node:assert/strict";
import test from "node:test";
import { isOwnedNeed, needStatusLabel, needStatusRank } from "../src/lib/need-status.ts";

test("pending needs sort first", () => {
  assert.ok(needStatusRank("pending_approval") < needStatusRank("published"));
  assert.equal(needStatusLabel("pending_approval"), "Pending review");
});

test("admins see every need; managers see ones they own", () => {
  const mine = { createdByUserId: "me", organizationId: "group-a" };
  const theirs = { createdByUserId: "other", organizationId: "group-b" };
  const inGroup = { createdByUserId: "other", organizationId: "group-a" };
  assert.equal(isOwnedNeed(theirs, "me", "all"), true);
  assert.equal(isOwnedNeed(mine, "me", ["group-a"]), true);
  assert.equal(isOwnedNeed(inGroup, "me", ["group-a"]), true);
  assert.equal(isOwnedNeed(theirs, "me", ["group-a"]), false);
});
