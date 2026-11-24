import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const spec = JSON.parse(readFileSync(new URL("../../src/lib/developer/openapi.json", import.meta.url), "utf8"));

function operation(method, path) {
  const item = spec.paths[path]?.[method];
  assert.ok(item, `${method.toUpperCase()} ${path} is missing`);
  return item;
}

describe("OpenAPI snapshot", () => {
  test("documents servers, auth, health, and not mcp", () => {
    assert.deepEqual(spec.servers, [{ url: "/" }]);
    assert.equal(spec.components.securitySchemes.bearerAuth.type, "http");
    assert.equal(spec.components.securitySchemes.apiKeyAuth.name, "X-Api-Key");
    assert.ok(spec.paths["/health"]?.get);
    assert.equal(spec.paths["/mcp"], undefined);
    assert.equal(
      Object.keys(spec.components.schemas).some((name) => name.startsWith("Optional")),
      false,
    );
  });

  test("documents BindAsync request bodies", () => {
    assert.ok(operation("post", "/auth/user").requestBody.content["application/json"].schema.properties.username);
    assert.ok(operation("patch", "/users/me").requestBody);
    assert.ok(operation("delete", "/tenants/{id}/memberships").requestBody);
    assert.equal(operation("delete", "/tenants/{id}").requestBody, undefined);
    assert.ok(operation("post", "/time/clock-in").requestBody);
    assert.equal(operation("post", "/tenants/{id}/api-keys/{keyId}/rotate").requestBody, undefined);
    assert.ok(operation("post", "/tenants/{id}/imports/people").requestBody.content["application/json"].schema.properties.rows);
    assert.ok(operation("patch", "/feedback/{id}").requestBody.content["application/json"].schema.oneOf);
  });

  test("documents errors, csv, query names, and security", () => {
    const list = operation("get", "/tenants");
    assert.ok(list.security?.some((item) => item.bearerAuth || item.apiKeyAuth));
    assert.equal(operation("post", "/auth/login").security, undefined);
    assert.ok(operation("post", "/tenants").responses["400"]);
    assert.ok(operation("get", "/tenants/{id}/time-entries.csv").responses["200"].content["text/csv"]);
    assert.ok(list.parameters.some((parameter) => parameter.name === "limit"));
    assert.equal(spec.components.schemas.TimeEntryDto.properties.startedAt.format, "date-time");
    assert.ok(spec.components.schemas.TimeEntryDto.properties.startedAt.type.includes("null"));
    assert.equal(spec.components.schemas.UserDto.required.includes("profile"), false);
  });
});
