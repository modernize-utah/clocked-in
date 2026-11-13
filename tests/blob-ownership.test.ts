import assert from "node:assert/strict";
import test from "node:test";
import { isOwnedAvatarBlob, isOwnedBrandBlob } from "../src/lib/brand";

const orgA = "11111111-1111-4111-8111-111111111111";
const orgB = "22222222-2222-4222-8222-222222222222";
const store = "https://abc123.private.blob.vercel-storage.com";

test("a brand file belongs only to the organization in its path", () => {
  assert.equal(isOwnedBrandBlob(orgA, `${store}/orgs/${orgA}/mark.webp`), true);
  assert.equal(isOwnedBrandBlob(orgA, `orgs/${orgA}/mark.webp`), true);
  assert.equal(isOwnedBrandBlob(orgA, `${store}/orgs/${orgB}/mark.webp`), false);
  assert.equal(isOwnedBrandBlob(orgA, `orgs/${orgB}/mark.webp`), false);
  assert.equal(isOwnedBrandBlob(orgA, `${store}/avatars/${orgA}/x.webp`), false);
  assert.equal(isOwnedBrandBlob(orgA, "https://example.com/orgs/" + orgA + "/mark.webp"), false);
});

test("an avatar belongs only to the person in its path", () => {
  assert.equal(isOwnedAvatarBlob(orgA, `${store}/avatars/${orgA}/a.webp`), true);
  assert.equal(isOwnedAvatarBlob(orgA, `${store}/avatars/${orgB}/a.webp`), false);
  assert.equal(isOwnedAvatarBlob(orgA, `${store}/orgs/${orgA}/mark.webp`), false);
});
