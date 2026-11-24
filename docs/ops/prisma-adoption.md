# Prisma Adoption and Backend Cutover

Next.js is the only backend. Prisma is the only DDL owner. These instructions are operator-run: repository changes do not migrate existing databases or stop deployed services. Preserve all local, staging, and production data.

## Before Adoption

1. Back up each database, including the `ef` schema, and rehearse restoring it to a disposable database. Record the current application revision, row counts, representative IDs, and EF migration history. Keep the old source revision available for investigation.
2. Disable EF migration/deployment jobs and coordinate a maintenance window. No EF DDL, Prisma DDL, or schema writers may run concurrently. Restrict application writes during the final verification and adoption window. Removing workflow files does not cancel already queued/running jobs.
3. Use the same PostgreSQL major version and application extensions as the target for rehearsal. The baseline uses the `public` application schema and `citext`. The provider-owned `prisma_postgres` extension is preserved but excluded from extension-name comparison; all other extra extensions and application-object differences still fail verification. Never install, drop, or recreate the provider extension as application DDL.
4. Create an empty, disposable reference database using administrative tooling. Point `DATABASE_URL` at that reference **for this command only**, with `APP_ENV=local`, and run `npm run db:deploy`. Never use the actual target as the reference. Record its connection as `BASELINE_REFERENCE_URL` in the operator shell, not committed files.
5. On the restored target copy, compare schema and required reference data using the adoption command below. Missing migrations or custom drift must be reconciled with reviewed, data-preserving catch-up SQL from the old revision. Do not stamp a mismatched database, blindly run historical data transforms twice, or reset it.

## Existing Databases

Set `DATABASE_URL` to the intended target and `BASELINE_REFERENCE_URL` to the separate, freshly deployed reference. Shell/platform variables take precedence over env files. Check the target database identity before running commands. Use a direct database connection with DDL permissions, not a transaction pooler, for migration operations.

```bash
APP_ENV=local npm run db:baseline
APP_ENV=local npm run db:status
APP_ENV=local npm run db:deploy
```

Repeat first against a restored copy, then against the actual local database when approved. For staging/production replace `APP_ENV=local` with `APP_ENV=staging` or `APP_ENV=production`. The environment loader selects the matching env file unless platform/shell variables override it. Never paste connection secrets into tickets or commit them.

`db:baseline` first performs read-only comparison of columns, defaults, nullability, primary/foreign/CHECK constraints, indexes and predicates, enums, extensions, custom functions, views, and triggers. Equivalent implicit/explicit timestamp precision is normalized. It also checks required system role definitions, theme/template IDs, and permission grants. Reference migration history must match this checkout's baseline checksum.

System-role scopes are configurable in the application. Verification accepts the supported `tenant`, `assigned_groups`, and `self` scopes without resetting existing settings to baseline defaults. In particular, Staff scoped to assigned groups must not be changed to tenant-wide access during adoption. Invalid scopes still block adoption.

For Prisma Postgres backups restored to vanilla PostgreSQL, keep the full backup unchanged. Use a reviewed `pg_restore --use-list` TOC that omits only the `prisma_postgres` EXTENSION and its COMMENT entries for the disposable rehearsal. Extension-owned objects are provider-managed and are not recreated locally. Do not remove any application schema or data entries. Round-trip the reference through backup/restore too when PostgreSQL reprints CHECK expressions differently; keep strict constraint comparison.

An existing database missing only the tenant slug column/index can use the reviewed catch-up SQL after backup and restored-copy rehearsal:

```bash
APP_ENV=staging node scripts/with-env.mjs -- prisma db execute --config prisma7.config.ts --file prisma/adoption/tenant-slug.sql
```

This transaction adds a nullable `citext` column and its partial unique index without backfilling or changing existing values. Lock and statement timeouts bound the operation. It is not a new migration and does not change the immutable baseline: fresh databases already receive those objects from the baseline. Rerun verification after catch-up; `IF NOT EXISTS` does not prove that preexisting objects have the correct definitions.

Only after verification succeeds does it run `prisma migrate resolve --applied 0_baseline --config prisma7.config.ts`. This records migration metadata; it does **not** execute baseline CREATE/INSERT statements or add missing schema changes. The inactive `ef.__EFMigrationsHistory` remains untouched. `db:deploy` should then be a no-op until subsequent migrations are committed. A second baseline attempt is unnecessary; inspect `db:status` instead.

After adoption, compare application row counts and representative records to the restored pre-adoption state, run smoke tests, and confirm only Prisma's history metadata changed. Do not drop EF history as part of this rollout. Dispose of the reference database after verification.

The baseline was verified against a complete disposable replay of the EF migrations through `20261028204228_TenantSlug`, including custom SQL. It contains 18 CHECK constraints and 39 system reference rows (3 roles, 7 themes, 25 permission grants, 4 report templates). Tenant-specific users, tenants, hours, and customizations are never part of the baseline. Actual environment parity is a separate operator verification gate.

## Fresh Databases

For a genuinely empty database, use `npm run db:deploy`, then `npm run db:generate`. Do not mark the baseline applied on an empty database. The migration creates the schema and required system reference rows.

## Future Changes

```bash
npm run db:migrate -- --name describe_change
npm run db:generate
APP_ENV=staging npm run db:deploy
APP_ENV=production npm run db:deploy
```

Development migration creation is restricted to `APP_ENV=local` and loopback hosts. Review generated SQL before applying it. Add SQL explicitly for unsupported CHECK constraints and reference-data changes. Preserve the baseline; never regenerate it after adoption. Do not use schema reset, `db push`, or introspection as the release workflow.

Run deployment once per database in a serialized release step before deploying a compatible application revision. Builds, postinstall, server startup, requests, and arbitrary Preview branches must not migrate or baseline a shared database. CI verifies migrations against disposable PostgreSQL only. Use expand/contract migrations when old and new application versions overlap.

## Backend Cutover

1. Adopt the baseline in staging and smoke-test the Next.js revision there before production. Verify login/refresh, tenant access, time entry CRUD/punch, reports and CSV, need/access approval, mail integration, API-key management, and authenticated MCP tools.
2. Point public REST/MCP clients at the Next.js origin. Existing scoped tenant keys remain valid for REST and MCP with the same `API_KEY_PEPPER`; key management requires a human admin JWT. Platform-key endpoints are not part of this app. Existing platform-key rows stay in the database and do not grant access.
3. Deploy Next.js after the database gate. Remove retired `CSHARP_API_URL`, `API_TARGET`, and `EF_DATABASE_URL` settings from operator-managed env files/platform configuration; existing local env files are not changed by this task. Keep `DATABASE_URL`, JWT settings, MCP key pepper, mail/GitHub settings, and tenant host configuration intact.
4. Once smoke tests and client URL changes succeed, stop any previous API service and retire its deployment secrets. Check that no queued workflow can redeploy it. Keep backups available until the rollback window closes.

## Rollback

Baseline adoption adds Prisma history only; reverting compatible app code does not require restoring business data. Keep EF history inert and never re-enable its migrations alongside Prisma. After a subsequent schema/data migration, rollback requires that migration's compatibility plan or a verified restore, not deleting migration-history records. A backup restore after new writes requires an explicit data-recovery decision.

## Verification

`MIGRATION_TEST_DATABASE_URL` must point to an isolated PostgreSQL server/database whose test user may create disposable databases. `npm run test:migrations` creates uniquely named databases, verifies fresh deploy, adoption/data preservation, drift rejection, idempotent deploy, and schema parity, then deletes only those test databases. Unit/import tests and the Next.js HTTP suite complement this check. HTTP/browser suites mutate data and must never target production.
