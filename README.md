# Voluntime

Next.js app with Tailwind CSS, shadcn/ui, and Prisma. Local, staging, and production use PostgreSQL.

## Stack

- Next.js (App Router) and TypeScript
- Tailwind CSS
- shadcn/ui
- Prisma with PostgreSQL

## Local setup

```bash
npm install
cp .env.example .env
docker compose up -d
npm run db:deploy
npm run db:generate
npm run dev
```

Open [http://localhost:3025](http://localhost:3025).

These setup commands are for an **empty database**. Existing EF-managed databases must follow the [Prisma adoption runbook](docs/ops/prisma-adoption.md) before `db:deploy`. Never reset an existing database to adopt Prisma.

## Environments

|            | File              | Database   | API     |
| ---------- | ----------------- | ---------- | ------- |
| Local      | `.env`            | PostgreSQL | Next.js |
| Staging    | `.env.staging`    | PostgreSQL | Next.js |
| Production | `.env.production` | PostgreSQL | Next.js |

`APP_ENV` is `local`, `staging`, or `production`. `DATABASE_PROVIDER` is `postgresql`. Next.js is the only backend.

```bash
npm run dev
npm run dev:staging
npm run build:staging
npm run build:production
npm run env:print
```

The Prisma schema uses the PostgreSQL provider and reads a `postgres://` or `postgresql://` `DATABASE_URL`.

## Database

One local Postgres database runs in Docker on port 5435. Prisma owns DDL and migration history. The schema is `prisma/schema.prisma`, connection settings are in `prisma7.config.ts`, and SQL migrations are in `prisma/migrations`.

```bash
npm run db:status
npm run db:migrate -- --name describe_change
npm run db:generate
APP_ENV=staging npm run db:deploy
APP_ENV=production npm run db:deploy
```

`db:migrate` is restricted to local loopback databases. Review generated SQL and add explicit SQL for CHECK constraints or reference-data changes, which Prisma cannot infer. Commit migrations and apply them with `db:deploy` in a controlled release step before the compatible app release. Builds and installation generate client code but never migrate or baseline databases.

The baseline preserves the effective EF schema, 18 CHECK constraints, and required roles, themes, permissions, and report templates. Existing databases must pass adoption checks before recording it. Do not edit the baseline after any environment adopts it.

Next.js implements the [HTTP contract](docs/api/http.md) on port 3025. `JWT_SIGNING_KEY`, `JWT_ISSUER`, `JWT_AUDIENCE`, `API_KEY_PEPPER`, Resend settings, and optional `LINEAR_API_KEY` / `LINEAR_WEBHOOK_SECRET` configure the backend.

Docs live in [docs/README.md](docs/README.md). Brand files and seed workbooks are in [docs/base/](docs/base/). The [original goals assessment](docs/original-goals-assessment.md) tracks brief vs shipped.

## Seed and Playwright

```bash
npm run db:seed:caswj
npm run db:seed:caswj:anon
```

`db:seed:caswj` imports `docs/base/2026 Volunteer Hours.xlsx` (real names) and is **local-only**. The workbook is not in git: get a copy from the project owner and put it at that path, or set `CASWJ_WORKBOOK_PATH`. When the seed creates the `dworkman` admin it prints a one-time `dworkmanTemporaryPassword`. It no-ops on staging/production unless `SEED_ALLOW_REAL_NAMES=1`. Staging uses the anonymized Clockify sample. The Playwright golden suite (`tests/e2e/caswj-hours.spec.ts`) needs that named local seed and must never run against production. Production e2e is the read-only cache-bust crawl.

## MCP and API reference

MCP is Streamable HTTP at `/mcp` on Next.js. Organization API keys work on REST and MCP (Bearer or `X-Api-Key`), subject to their scopes. Key management requires a human admin JWT. Platform-key endpoints are not part of this app. Existing platform-key rows stay in the database and do not grant access.

```json
{
  "mcpServers": {
    "clocked-in": {
      "url": "https://<next-host>/mcp",
      "headers": {
        "Authorization": "Bearer cki_live_…"
      }
    }
  }
}
```

A SuperAdmin is a user flag, not a membership role. Set the first one in the shared database:

```sql
UPDATE "User" SET "isSuperAdmin" = true WHERE "email" = 'you@example.com';
```

HTTP contract tests (`npm run test:http`) target Next.js. Use a disposable database and the mail/Linear sinks under `tests/http`; tests create and change records. `API_BASE_URL` overrides the default origin.

`npm run test:migrations` needs an explicit `MIGRATION_TEST_DATABASE_URL` with permission to create disposable databases. It checks fresh deployment, adoption without data changes, drift rejection, and migration replay. CI runs it against an isolated PostgreSQL service.

`npm run openapi` checks the maintained Next.js snapshot against route exports. After changing routes, `npm run openapi -- --write` reconciles paths; maintain request/response schemas in `src/lib/developer/openapi.json`.

## Deploy

Import this repo in [Vercel](https://vercel.com/new). The build command is `npm run build`.

Vercel sets `NODE_ENV=production` for both Production and Preview, so Next.js would load `.env.production` for a staging deploy if that file were in the repo. Leave `.env`, `.env.staging`, and `.env.production` uncommitted. Set the variables in the Vercel project instead:

- **Production** — the values from `.env.production`: `APP_ENV=production`, `DATABASE_PROVIDER=postgresql`, and the production `postgres://` or `postgresql://` `DATABASE_URL`.
- **Preview** — the values from `.env.staging`: `APP_ENV=staging`, `DATABASE_PROVIDER=postgresql`, and the staging Postgres URL. Preview is staging. A custom environment named `staging` is treated the same way.

The **Staging views** Actions job runs after a successful non-production deployment of the `staging` branch. Vercel's GitHub integration must publish deployment statuses with an `environment_url`. The job checks out that deployment's commit, verifies `/health` reports the same commit, and runs Playwright against that deployment URL rather than the staging alias. Configure the repository secrets `VERCEL_AUTOMATION_BYPASS_SECRET` and `SEED_SUPERADMIN_PASSWORD` for these checks.

Run `db:deploy` once per database in a serialized, controlled release step. Do not run migrations for arbitrary Preview branches against a shared staging database. See the [adoption and cutover runbook](docs/ops/prisma-adoption.md) before the first release of this change.

## License

This project is licensed under the [MIT License](LICENSE).
