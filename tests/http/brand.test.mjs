import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { assertError, callApi, callForm, createJson, label, missingId, signUp, suite } from "./client.mjs";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function imageForm(kind = "mark") {
  const form = new FormData();
  form.set("kind", kind);
  form.set("file", new File([png], "mark.png", { type: "image/png" }));
  return form;
}

describe("organization brand", suite, () => {
  const ctx = {};

  before(async () => {
    ctx.admin = await signUp("brandadmin");
    ctx.member = await signUp("brandmember");
    ctx.org = await createJson(ctx.admin.accessToken, "/organizations", { name: label("Brand org") });
    await createJson(ctx.admin.accessToken, `/organizations/${ctx.org.id}/invitations`, {
      email: ctx.member.email,
      role: "MEMBER",
    });
  });

  test("an organization cannot point its brand at another organization's file", async () => {
    const other = await createJson(ctx.admin.accessToken, "/organizations", { name: label("Other brand org") });
    for (const markUrl of [
      `orgs/${other.id}/mark.webp`,
      `https://abc123.private.blob.vercel-storage.com/orgs/${other.id}/mark.webp`,
    ]) {
      const response = await callApi(`/organizations/${ctx.org.id}`, {
        method: "PATCH",
        token: ctx.admin.accessToken,
        body: { markUrl },
      });
      assertError(response, 400, "validation_error", "markUrl must be an image uploaded for this organization.");
    }
    const own = await callApi(`/organizations/${ctx.org.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { markUrl: `orgs/${ctx.org.id}/mark.webp` },
    });
    assert.equal(own.status, 200, own.text);
    const reset = await callApi(`/organizations/${ctx.org.id}`, {
      method: "PATCH",
      token: ctx.admin.accessToken,
      body: { markUrl: null },
    });
    assert.equal(reset.status, 200, reset.text);
  });

  test("rejects a missing image, a bad kind, and a non-admin", async () => {
    const empty = new FormData();
    empty.set("kind", "mark");
    const missingFile = await callForm(`/organizations/${ctx.org.id}/brand`, {
      token: ctx.admin.accessToken,
      form: empty,
    });
    assertError(missingFile, 400, "validation_error", "Choose an image to upload.");
    const badKind = await callForm(`/organizations/${ctx.org.id}/brand`, {
      token: ctx.admin.accessToken,
      form: imageForm("logo"),
    });
    assertError(badKind, 400, "validation_error", "kind must be mark, wordmark, or wordmarkOnLight.");
    const unauthenticated = await callForm(`/organizations/${ctx.org.id}/brand`, { form: imageForm() });
    assertError(unauthenticated, 401, "unauthorized", "Authentication is required.");
    const forbidden = await callForm(`/organizations/${ctx.org.id}/brand`, {
      token: ctx.member.accessToken,
      form: imageForm(),
    });
    assertError(forbidden, 403, "forbidden", "Forbidden.");
    const removed = await callApi(`/organizations/${ctx.org.id}/brand/not-a-kind`, {
      method: "DELETE",
      token: ctx.admin.accessToken,
    });
    assertError(removed, 400, "validation_error", "kind must be mark, wordmark, or wordmarkOnLight.");
    const missing = await callApi(`/organizations/${missingId()}/brand/mark`, {
      method: "DELETE",
      token: ctx.admin.accessToken,
    });
    assertError(missing, 404, "not_found", "Not found.");
  });

  test("clears a brand image and uploads one when blob storage is configured", async () => {
    const cleared = await callApi(`/organizations/${ctx.org.id}/brand/mark`, {
      method: "DELETE",
      token: ctx.admin.accessToken,
    });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.json.id, ctx.org.id);
    assert.equal(cleared.json.markUrl, null);
    if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
      return;
    }

    const uploaded = await callForm(`/organizations/${ctx.org.id}/brand`, {
      token: ctx.admin.accessToken,
      form: imageForm("wordmark"),
    });
    assert.equal(uploaded.status, 200, uploaded.text.slice(0, 400));
    assert.equal(typeof uploaded.json.wordmarkUrl, "string");
    const again = await callApi(`/organizations/${ctx.org.id}/brand/wordmark`, {
      method: "DELETE",
      token: ctx.admin.accessToken,
    });
    assert.equal(again.status, 200);
    assert.equal(again.json.wordmarkUrl, null);
  });
});
