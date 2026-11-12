import assert from "node:assert/strict";
import test from "node:test";
import { prismaPoolConfig } from "../src/lib/prisma-connection";

const hosted = "postgres://user:secret@db.prisma.io:5432/postgres";

test("Prisma Postgres uses the pooler with a small pool and a connection timeout", () => {
  const config = prismaPoolConfig(hosted);
  assert.match(String(config.connectionString), /@pooled\.db\.prisma\.io:/);
  assert.equal(config.max, 3);
  assert.equal(config.connectionTimeoutMillis, 5000);
});

test("DATABASE_POOL_MAX overrides the pool size anywhere", () => {
  process.env.DATABASE_POOL_MAX = "1";
  try {
    assert.equal(prismaPoolConfig(hosted).max, 1);
    assert.equal(prismaPoolConfig("postgres://u:p@localhost:5435/db").max, 1);
  } finally {
    delete process.env.DATABASE_POOL_MAX;
  }
  assert.equal(prismaPoolConfig("postgres://u:p@localhost:5435/db").max, undefined);
});
