import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { apiBaseUrl } from "./fixture.mjs";
import { suite } from "./client.mjs";

describe("security headers", suite, () => {
  for (const path of ["/login", "/health", "/brand/mark"]) {
    test(`${path} cannot be framed and carries the baseline headers`, async () => {
      const response = await fetch(new URL(path, apiBaseUrl), { redirect: "manual" });
      await response.arrayBuffer();
      const csp = response.headers.get("content-security-policy") ?? "";
      assert.match(csp, /frame-ancestors 'none'/);
      assert.match(csp, /object-src 'none'/);
      assert.equal(response.headers.get("x-frame-options"), "DENY");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
      assert.match(response.headers.get("permissions-policy") ?? "", /camera=\(\)/);
      assert.match(response.headers.get("strict-transport-security") ?? "", /max-age=\d+/);
      const reportOnly = response.headers.get("content-security-policy-report-only") ?? "";
      assert.match(reportOnly, /default-src 'self'/);
      assert.match(reportOnly, /https:\/\/challenges\.cloudflare\.com/);
    });
  }
});
