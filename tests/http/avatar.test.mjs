import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { assertError, callApi, callForm, signUp, suite } from "./client.mjs";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function imageForm() {
  const form = new FormData();
  form.set("file", new File([png], "avatar.png", { type: "image/png" }));
  return form;
}

describe("avatar", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.user = await signUp("avataruser");
  });

  test("a person cannot point their avatar at someone else's file", async () => {
    const other = await signUp("avatarother");
    const response = await callApi("/users/me", {
      method: "PATCH",
      token: ctx.user.accessToken,
      body: { avatarUrl: `https://abc123.private.blob.vercel-storage.com/avatars/${other.user.id}/a.webp` },
    });
    assertError(response, 400, "validation_error", "avatarUrl must be an image uploaded for this person.");
    const orgFile = await callApi("/users/me", {
      method: "PATCH",
      token: ctx.user.accessToken,
      body: { avatarUrl: "orgs/11111111-1111-4111-8111-111111111111/mark.webp" },
    });
    assertError(orgFile, 400, "validation_error", "avatarUrl must be an image uploaded for this person.");
  });

  test("rejects a missing image and an anonymous caller", async () => {
    const missing = await callForm("/users/me/avatar", { token: ctx.user.accessToken, form: new FormData() });
    assertError(missing, 400, "validation_error", "Choose an image to upload.");
    const anonymous = await callForm("/users/me/avatar", { form: imageForm() });
    assertError(anonymous, 401, "unauthorized", "Authentication is required.");
    const removed = await callApi("/users/me/avatar", { method: "DELETE" });
    assertError(removed, 401, "unauthorized", "Authentication is required.");
  });

  test("clears the avatar and uploads one when blob storage is configured", async () => {
    const cleared = await callApi("/users/me/avatar", { method: "DELETE", token: ctx.user.accessToken });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.json.id, ctx.user.user.id);
    assert.equal(cleared.json.profile.avatarUrl, null);
    if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
      return;
    }

    const uploaded = await callForm("/users/me/avatar", { token: ctx.user.accessToken, form: imageForm() });
    assert.equal(uploaded.status, 200, uploaded.text.slice(0, 400));
    assert.equal(typeof uploaded.json.profile.avatarUrl, "string");
    const again = await callApi("/users/me/avatar", { method: "DELETE", token: ctx.user.accessToken });
    assert.equal(again.status, 200);
    assert.equal(again.json.profile.avatarUrl, null);
  });
});