import assert from "node:assert/strict";
import test from "node:test";
import { inviteCode, normalizeInviteCode } from "../src/lib/api/security";

test("invite codes use three groups from an unambiguous alphabet", () => {
  const seen = new Set<string>();
  for (let index = 0; index < 200; index += 1) {
    const code = inviteCode();
    assert.match(code, /^[A-HJKMNP-TV-Z2-9]{4}-[A-HJKMNP-TV-Z2-9]{4}-[A-HJKMNP-TV-Z2-9]{4}$/);
    seen.add(code);
  }
  assert.equal(seen.size, 200);
});

test("typed invite codes ignore case, spaces, and dashes, and older numeric codes still match", () => {
  assert.equal(normalizeInviteCode(" abcd-efgh jkmn "), "ABCDEFGHJKMN");
  assert.equal(normalizeInviteCode("ABCD-EFGH-JKMN"), normalizeInviteCode("abcdefghjkmn"));
  assert.equal(normalizeInviteCode("042917"), "042917");
});
