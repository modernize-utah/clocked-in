# Docs

VolunTime is one multi-tenant deployment. Each community, including CASWJ and any sister organization, is a tenant at `{slug}.{APP_HOST}`. CASWJ does not own the deployment and does not need a path on wjarts.org. See the [portal runbook](ops/caswj-portal.md).

Handwritten duration and total hours require a project and a task category. The timer may stay unclassified. Paid rates are gross pay with zero in-kind and an admin-only payroll report. The Staff role stays available to every organization. Public needs stay at `/openings/{publicSlug}`.

- [VolunTime review for Dillon](voluntime-review-october-2026.md) — shareable score against the Oct 15 brief and the Oct 27 letter, including answers to the five questions. Hosting and paid time in that note were updated on 5 November 2026.
- [VolunTime Feedback for Jason — resolved](base/VolunTime%20Feedback%20for%20Jason%20%E2%80%94%20resolved.pdf) — Dillon’s Oct 27 letter with how each item was resolved and the five questions answered. HTML source: [voluntime-feedback-resolved.html](voluntime-feedback-resolved.html).
- [VolunTime requirements and feedback audit](voluntime-audit.md) — internal status notes vs the same sources.
- [Original goals assessment](original-goals-assessment.md) — Oct 21 snapshot against the brief. Historical only.
- [HTTP contract](api/http.md) — Next.js REST and MCP API.
- [Prisma adoption](ops/prisma-adoption.md) — data-preserving migration ownership and backend cutover.
- [Domain schema](schema/domain.md) — entities, roles, rates, and time modes.
- [Portal runbook](ops/caswj-portal.md) — white-label subdomains on voluntime.app. CASWJ is one tenant.

## Base materials

Brand, brief, and seed workbooks live in [`docs/base/`](base/):

- `2026 Volunteer Hours.xlsx` — named local seed and the 14,609-hour golden suite. It holds real names, so it is not in git; keep a local copy at this path (or set `CASWJ_WORKBOOK_PATH`). Never point Playwright `caswj-hours` at production.
- `clockify-export-ANONYMIZED-sample.xlsx` — synthetic names for `npm run db:seed:caswj:anon` on staging.
- `caswj-gradient-usage.png` — approved brand-hero treatments.
- CASWJ brand guidelines and the original project brief.

Named workbook import is local-only (`APP_ENV=local`) unless `SEED_ALLOW_REAL_NAMES=1`.
