import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import pg from "pg";
import { schemaSnapshot, verifyBaseline } from "../scripts/baseline.mjs";

const adminUrl = process.env.MIGRATION_TEST_DATABASE_URL;

function prisma(url, ...args) {
  const result = spawnSync("node_modules/.bin/prisma", [...args, "--config", "prisma7.config.ts"], {
    env: { ...process.env, DATABASE_URL: url },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

async function applicationData(client) {
  const tables = (
    await client.query(`SELECT tablename FROM pg_tables
    WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename`)
  ).rows;
  const snapshot = {};
  for (const { tablename } of tables) {
    const quoted = `"${tablename.replaceAll('"', '""')}"`;
    snapshot[tablename] = (
      await client.query(`SELECT to_jsonb(record) AS row FROM ${quoted} record ORDER BY to_jsonb(record)::text`)
    ).rows;
  }
  return snapshot;
}

function sameRow(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Rows each table gained after migrations ran, so adoption can be compared with a fresh deploy. */
function addedRows(after, before) {
  return Object.fromEntries(
    Object.entries(after).map(([table, rows]) => [
      table,
      rows.filter((row) => !(before[table] ?? []).some((old) => sameRow(old, row))),
    ]),
  );
}

test("migration creation refuses staging and production targets", () => {
  for (const appEnv of ["staging", "production"]) {
    const result = spawnSync(process.execPath, ["scripts/migrate-dev.mjs", "--name", "must_not_run"], {
      env: { ...process.env, APP_ENV: appEnv, DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused" },
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /restricted to local PostgreSQL/);
  }
});

test(
  "fresh deploy and existing-database adoption preserve schema, constraints, and data",
  { skip: !adminUrl },
  async () => {
    const admin = new pg.Client({ connectionString: adminUrl });
    const names = ["fresh", "adopt", "reference"].map((suffix) => `prisma_test_${randomUUID().replaceAll("-", "")}_${suffix}`);
    const clients = [];
    await admin.connect();
    try {
      const urls = names.map((name) => {
        const url = new URL(adminUrl);
        url.pathname = `/${name}`;
        url.searchParams.set("schema", "public");
        return url.toString();
      });
      for (const name of names) await admin.query(`CREATE DATABASE "${name}"`);
      prisma(urls[0], "migrate", "deploy");
      prisma(urls[0], "migrate", "deploy");
      for (const url of urls) {
        const client = new pg.Client({ connectionString: url });
        await client.connect();
        clients.push(client);
      }
      const [fresh, adopted, reference] = clients;
      await reference.query(readFileSync("prisma/migrations/0_baseline/migration.sql", "utf8"));
      prisma(urls[2], "migrate", "resolve", "--applied", "0_baseline");
      await adopted.query(readFileSync("prisma/migrations/0_baseline/migration.sql", "utf8"));
      await adopted.query(`CREATE SCHEMA ef; CREATE TABLE ef."__EFMigrationsHistory" (id text PRIMARY KEY);
      INSERT INTO ef."__EFMigrationsHistory" VALUES ('preserve-history');
      INSERT INTO "User" (id, username, email, "passwordHash", "updatedAt")
      VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'preserve', 'preserve@example.test', 'unchanged', now());
      INSERT INTO "Organization" (id, name) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Preserve organization');`);
      await adopted.query(`UPDATE "Role" SET scope='assigned_groups' WHERE code='MEMBER' AND "organizationId" IS NULL`);
      const before = await applicationData(adopted);
      const beforeSchema = await schemaSnapshot(adopted);
      await adopted.query(`DROP INDEX "IX_Organization_slug"; ALTER TABLE "Organization" DROP COLUMN "slug"`);
      await assert.rejects(verifyBaseline(adopted, reference), /mismatch in columns/);
      const catchup = readFileSync("prisma/adoption/organization-slug.sql", "utf8");
      await adopted.query(catchup);
      await adopted.query(catchup);
      assert.deepEqual(await applicationData(adopted), before);
      assert.deepEqual(await schemaSnapshot(adopted), beforeSchema);
      await adopted.query(`CREATE EXTENSION pg_trgm`);
      await assert.rejects(verifyBaseline(adopted, reference), /mismatch in extensions/);
      await adopted.query(`DROP EXTENSION pg_trgm`);
      const managedProvider = {
        query: (sql, ...args) =>
          adopted.query(
            sql === "SELECT extname FROM pg_extension WHERE extname <> 'prisma_postgres' ORDER BY extname"
              ? "SELECT extname FROM (SELECT extname FROM pg_extension UNION ALL SELECT 'prisma_postgres') extensions WHERE extname <> 'prisma_postgres' ORDER BY extname"
              : sql,
            ...args,
          ),
      };
      await verifyBaseline(managedProvider, reference);
      await adopted.query(`UPDATE "Role" SET scope='invalid' WHERE code='MEMBER' AND "organizationId" IS NULL`);
      await assert.rejects(verifyBaseline(adopted, reference), /missing required system roles/);
      await adopted.query(`UPDATE "Role" SET scope='assigned_groups' WHERE code='MEMBER' AND "organizationId" IS NULL`);
      await verifyBaseline(adopted, reference);
      await adopted.query(`ALTER TABLE "User" ALTER COLUMN "createdAt" TYPE timestamptz`);
      await verifyBaseline(adopted, reference);
      await adopted.query(`ALTER TABLE "User" DROP CONSTRAINT "User_lowercase_identity_check"`);
      await assert.rejects(verifyBaseline(adopted, reference), /mismatch in constraints/);
      await adopted.query(
        `ALTER TABLE "User" ADD CONSTRAINT "User_lowercase_identity_check" CHECK (((username = lower(username)) AND (email = lower(email))))`,
      );
      await verifyBaseline(adopted, reference);
      const adoption = spawnSync(process.execPath, ["scripts/with-env.mjs", "--", "node", "scripts/baseline.mjs"], {
        env: { ...process.env, APP_ENV: "local", DATABASE_URL: urls[1], BASELINE_REFERENCE_URL: urls[2] },
        encoding: "utf8",
      });
      assert.equal(adoption.status, 0, `${adoption.stdout}\n${adoption.stderr}`);
      prisma(urls[1], "migrate", "deploy");
      const deployed = await applicationData(adopted);
      for (const [table, rows] of Object.entries(before)) {
        assert.deepEqual(rows.filter((row) => !deployed[table]?.some((kept) => sameRow(kept, row))), [], `${table} lost rows`);
      }
      assert.deepEqual(
        addedRows(deployed, before),
        addedRows(await applicationData(fresh), await applicationData(reference)),
        "adoption added different rows than a fresh deploy",
      );
      assert.deepEqual(await schemaSnapshot(adopted), await schemaSnapshot(fresh));
      assert.equal(
        (await adopted.query(`SELECT count(*)::int AS total FROM ef."__EFMigrationsHistory"`)).rows[0].total,
        1,
      );
      assert.equal((await adopted.query(`SELECT count(*)::int AS total FROM "Organization"`)).rows[0].total, 1);
      assert.equal(beforeSchema.constraints.filter((row) => row.contype === "c").length, 18);
      assert.equal((await schemaSnapshot(fresh)).constraints.filter((row) => row.contype === "c").length, 18);
      await assert.rejects(adopted.query(`UPDATE "User" SET email='UPPER@example.test'`), { code: "23514" });
      prisma(
        urls[0],
        "migrate",
        "diff",
        "--from-config-datasource",
        "--to-schema",
        "prisma/schema.prisma",
        "--exit-code",
      );
      const probeDir = mkdtempSync(join(tmpdir(), "prisma-migration-probe-"));
      try {
        const probeSchema = join(probeDir, "schema.prisma");
        writeFileSync(
          probeSchema,
          readFileSync("prisma/schema.prisma", "utf8").replace(
            "model User {",
            "model User {\n  migrationProbe String?",
          ),
        );
        const generated = spawnSync(
          "node_modules/.bin/prisma",
          [
            "migrate",
            "diff",
            "--config",
            "prisma7.config.ts",
            "--from-config-datasource",
            "--to-schema",
            probeSchema,
            "--script",
          ],
          { env: { ...process.env, DATABASE_URL: urls[0] }, encoding: "utf8" },
        );
        assert.equal(generated.status, 0, generated.stderr);
        assert.match(generated.stdout, /ADD COLUMN\s+"migrationProbe"/);
        assert.doesNotMatch(generated.stdout, /DROP\s/i);
        const constraints = (await schemaSnapshot(fresh)).constraints;
        await fresh.query(generated.stdout);
        assert.deepEqual((await schemaSnapshot(fresh)).constraints, constraints);
        const value = await fresh.query(`SELECT column_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name='User' AND column_name='migrationProbe'`);
        assert.equal(value.rowCount, 1);
      } finally {
        rmSync(probeDir, { recursive: true, force: true });
      }
    } finally {
      await Promise.all(clients.map((client) => client.end()));
      for (const name of names) await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    }
  },
);
