import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import pg from "pg";

export const baselineName = "0_baseline";

export async function schemaSnapshot(client) {
  const queries = {
    columns: `SELECT c.relname AS table_name, a.attname AS column_name,
      format_type(a.atttypid, CASE WHEN a.atttypid IN ('timestamptz'::regtype, 'timestamp'::regtype)
        AND a.atttypmod=-1 THEN 6 ELSE a.atttypmod END) AS type, a.attnotnull AS required,
      pg_get_expr(d.adbin, d.adrelid) AS default_value, a.attidentity, a.attgenerated,
      coll.collname AS collation
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.oid
      LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
      LEFT JOIN pg_collation coll ON coll.oid=a.attcollation
      WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname <> '_prisma_migrations'
      AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname, a.attname`,
    constraints: `SELECT c.relname AS table_name, con.conname, con.contype,
      pg_get_constraintdef(con.oid) AS definition, con.convalidated
      FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname <> '_prisma_migrations' ORDER BY c.relname, con.conname`,
    indexes: `SELECT tablename, indexname, indexdef FROM pg_indexes
      WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename, indexname`,
    enums: `SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
      FROM pg_type t JOIN pg_enum e ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname='public' GROUP BY t.typname ORDER BY t.typname`,
    extensions: `SELECT extname FROM pg_extension WHERE extname <> 'prisma_postgres' ORDER BY extname`,
    views: `SELECT c.relname, c.relkind, pg_get_viewdef(c.oid) AS definition
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('v','m') ORDER BY c.relname`,
    triggers: `SELECT c.relname, t.tgname, pg_get_triggerdef(t.oid) AS definition
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname, t.tgname`,
    functions: `SELECT p.proname, pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.prokind IN ('f','p') AND NOT EXISTS
      (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
      ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)`,
  };
  const snapshot = {};
  for (const [name, sql] of Object.entries(queries)) {
    snapshot[name] = (await client.query(sql)).rows;
  }
  return snapshot;
}

export async function verifyBaseline(target, reference) {
  const checksum = createHash("sha256")
    .update(readFileSync(new URL("../prisma/migrations/0_baseline/migration.sql", import.meta.url)))
    .digest("hex");
  const migrations = await reference.query(`SELECT migration_name, checksum FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`);
  if (
    migrations.rows.length !== 1 ||
    migrations.rows[0].migration_name !== baselineName ||
    migrations.rows[0].checksum !== checksum
  ) {
    throw new Error("Reference must be a fresh database deployed from this baseline only.");
  }
  const expected = await schemaSnapshot(reference);
  const actual = await schemaSnapshot(target);
  for (const name of Object.keys(expected)) {
    if (JSON.stringify(actual[name]) !== JSON.stringify(expected[name])) {
      throw new Error(`Baseline mismatch in ${name}. Stop and reconcile schema drift before adoption.`);
    }
  }
  const referenceQueries = {
    roles: `SELECT id, code, name, "isSystem" FROM "Role" WHERE "tenantId" IS NULL
      AND scope IN ('tenant', 'assigned_groups', 'self') ORDER BY id`,
    themes: `SELECT id FROM "Theme" WHERE "tenantId" IS NULL ORDER BY id`,
    templates: `SELECT id, key FROM "ReportTemplate" WHERE "tenantId" IS NULL ORDER BY id`,
    permissions: `SELECT p."roleId", p.permission, p.allowed FROM "RolePermission" p
      JOIN "Role" r ON r.id=p."roleId" WHERE r."tenantId" IS NULL ORDER BY p."roleId", p.permission`,
  };
  for (const [name, sql] of Object.entries(referenceQueries)) {
    const required = (await reference.query(sql)).rows.map((row) => JSON.stringify(row));
    const existing = new Set((await target.query(sql)).rows.map((row) => JSON.stringify(row)));
    if (required.some((row) => !existing.has(row))) {
      throw new Error(`Baseline is missing required system ${name}. Reconcile reference data before adoption.`);
    }
  }
}

async function main() {
  const targetUrl = new URL(process.env.DATABASE_URL ?? "");
  const referenceUrl = new URL(process.env.BASELINE_REFERENCE_URL ?? "");
  if (targetUrl.host === referenceUrl.host && targetUrl.pathname === referenceUrl.pathname) {
    throw new Error("The reference must be a separate, disposable database.");
  }
  if (
    [targetUrl, referenceUrl].some(
      (url) =>
        !["postgres:", "postgresql:"].includes(url.protocol) ||
        (url.searchParams.get("schema") ?? "public") !== "public",
    )
  ) {
    throw new Error("Baseline adoption supports PostgreSQL public schemas only.");
  }
  const target = new pg.Client({ connectionString: targetUrl.toString() });
  const reference = new pg.Client({ connectionString: referenceUrl.toString() });
  try {
    await target.connect();
    await reference.connect();
    await target.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await reference.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await verifyBaseline(target, reference);
  } finally {
    await Promise.all([target.end(), reference.end()]);
  }
  console.log("Schema, custom objects, and required reference data match the baseline.");
  const result = spawnSync(
    "prisma",
    ["migrate", "resolve", "--config", "prisma7.config.ts", "--applied", baselineName],
    {
      env: process.env,
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
