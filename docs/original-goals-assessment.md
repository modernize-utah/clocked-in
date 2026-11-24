# Original goals assessment

> Superseded for current status on 27 October 2026. Use [`voluntime-audit.md`](voluntime-audit.md).
> Hosting was amended on 5 November 2026: VolunTime is one multi-tenant deployment, and CASWJ is one tenant. Next.js is the only backend.

**Date:** 21 October 2026  
**Sources:** `docs/base/Volunteer_Hours_Tracker_Project_Brief (1).pdf` (15 October 2026, Dillon Workman), the CASWJ brand files in `docs/base/`, the 2026 Volunteer Hours workbook, `docs/schema/domain.md`, `docs/api/http.md`, the Next.js implementation, and the HTTP / Playwright suites.

This is a product and test assessment against the original brief, not a changelog. The brief asked for a Clockify-and-spreadsheet replacement that volunteers and coordinators can use, and that grant writers can trust.

## Verdict

Launch scope is largely solved. The product tracks individual volunteer time, values it in-kind, imports the 2026 history, and reproduces the workbook reports closely enough to use for grants.

The implementation is also larger and more disciplined than the brief. Roles, security, themes, MCP, and contract tests go well past “replace Clockify.” The remaining gaps at the time of this note were concentrated in four places: the volunteer “total hours” path in the UI, CASWJ brand and portal hosting, seed/PII hygiene, and later-scope coordinator / staff roles.

The original numeric acceptance test holds. The 2026 workbook sums to **14,609.41667 hours** across **249 entries**, **17 unique volunteers**, and **$517,273.91** in-kind. The seed writes those rows as `Total` entries with `sourceRef` keys, and `tests/e2e/caswj-hours.spec.ts` asserts the same rollups from JSON, the Reports UI, Volunteer Log CSV, and Summary CSV.

## Scorecard against the brief

| Brief goal                                                                             | Status                                | Notes                                                                                                                                                |
| -------------------------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replace Clockify + the Google Sheet                                                    | **Met**                               | Web app with live timer, manual entry, reports, and CSV.                                                                                             |
| In-kind value for grants (hours × rate, default $35.47)                                | **Met, then extended**                | Default volunteer rate is $35.47. Catalog rates snapshot onto each entry. Professional rates exist as a catalog, not as paid-staff payroll.          |
| CASWJ plus eight affiliates                                                            | **Met with a better model**           | One `Tenant` (CASWJ) and eight `Organization` groups. Spreadsheet Groups map to organizations.                                                     |
| Accounts: invite by email **or** basic enrollment                                      | **Met**                               | Invite + accept, admin “Add person,” and public signup.                                                                                              |
| Roles: volunteer and admin; no approval step                                           | **Met, then extended**                | `VOLUNTEER`, `MEMBER`, `ADMIN`, organization admin, SuperAdmin. Entries are live on save.                                                              |
| Admin settings: orgs, task categories, tags                                            | **Met, then extended**                | Also projects/events, organizations, hourly rates, themes, brand marks, entity labels.                                                                 |
| Time entry: live timer, start/end, or total hours                                      | **Partial**                           | Timer and start/end/duration are first-class. `Total` exists in the API and seed, but the log form always creates `Duration` rows with a start time. |
| Entry details: date, org, project/event, category, tags, notes, entered-by             | **Met**                               | `userId` vs `enteredByUserId` is explicit. Project and category are required.                                                                        |
| Reports by org, category, person, date range                                           | **Met, then extended**                | Also project, month, volunteer (excluding Participant Hours), and collective sessions.                                                               |
| CSV export                                                                             | **Met, then extended**                | Volunteer Log and Summary CSVs match workbook columns and formats.                                                                                   |
| Import 2026 hours; totals match 14,609                                                 | **Met**                               | Seed from `docs/base/2026 Volunteer Hours.xlsx`. 249 rows, 14,609.42 hours.                                                                          |
| Fix Clockify problems (totals, entered-by, shared accounts, required fields, 999h cap) | **Mostly met**                        | See [Clockify problems](#clockify-problems-the-brief-asked-us-to-fix).                                                                               |
| Board Agenda Builder look: navy sidebar, gold emphasis, CASWJ marks and gradient       | **Partial**                           | Theme tokens match the brief. Login, empty states, and default marks are “VolunTime,” not the approved CASWJ treatments.                             |
| Host at `wjarts.org/portal` or `portal.wjarts.org`                                     | **Not met**                           | App lives on Vercel at `clocked-in.baddley.us` / `staging.clocked-in.baddley.us`.                                                                    |
| Per-role security (internship schema was wide open)                                    | **Exceeded**                          | Membership, volunteer scoping, project visibility, API keys, JWT sessions.                                                                           |
| Keep real names/emails/zips out of development                                         | **Not met**                           | Local CASWJ seed uses real volunteer names. E2E comments say not to run that suite against production.                                               |
| Production owned by a CASWJ account                                                    | **Not met**                           | Current hosting and env files are Jason’s.                                                                                                           |
| Later: volunteer coordinator, admin staff, paid staff                                  | **Not in launch; partial primitives** | Organization admin and `MEMBER` are close to coordinator/staff. Paid staff time is not modeled.                                                        |

## What the original brief asked for

The brief is five pages. The load-bearing requirements are:

1. A Next.js web app that replaces Clockify and the 2026 Volunteer Hours sheet.
2. Hours that become in-kind dollars for grant applications.
3. Individual accounts for volunteers across CASWJ and eight affiliates, including board and committee members.
4. Three ways to log: live timer, start and end, or a total for a period.
5. Required tenant and task category, so Clockify’s missing fields do not return.
6. History import that matches **14,609** hours.
7. CASWJ visual language from the Board Agenda Builder and brand guidelines.
8. Hosting inside a future CASWJ portal, path or subdomain.
9. Development without real volunteer PII.

Stack in the brief was Next.js, Supabase, and Vercel. The app kept Next.js and Vercel and replaced Supabase with PostgreSQL and Prisma.

## Where we met or beat the original goals

### History import and grant-grade reports

This is the strongest match to the original purpose.

- `scripts/caswj-workbook.ts` reads the real workbook: Lists & Settings, Volunteers, Volunteer Log.
- `scripts/seed-caswj.ts` creates CASWJ, the eight groups, categories, projects, people, tags, and 249 `Total` rows keyed by `caswj-log:<sheetRow>`.
- Blank / `CASWJ` / `casWJ` group cells fold into the tenant bucket instead of inventing a organization named CASWJ.
- Project aliases and “No Specific Project” keep log titles aligned with Lists & Settings.
- Reports keep people totals separate from collective sessions.
- `byVolunteer` copies the spreadsheet quirk: Participant Hours drop out of volunteer hours but stay in in-kind. The e2e suite documents this instead of “fixing” the product to match `byPerson`.

Workbook vs app (computed from the current xlsx):

| Measure                | Workbook / seed                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Entries                | 249                                                                                                                                |
| Hours                  | 14,609.41667                                                                                                                       |
| Unique volunteers      | 17                                                                                                                                 |
| In-kind                | $517,273.91                                                                                                                        |
| Task categories        | CASWJ Board Hours, Committee Member Hours, Participant Hours, Volunteer Hours                                                      |
| Groups with 2026 hours | West Jordan Youth Theatre (11,047h), Symphony (3,149h), Visual Arts Society (284h), CASWJ/org (95h), Sugar Factory Playhouse (34h) |

Four seeded affiliates have no 2026 hours yet: Literary Arts Society, West Jordan Community Band, West Jordan Jazz Band, West Jordan Winds. That is data, not a product miss.

### Clockify problems the brief asked us to fix

| Clockify / sheet problem                   | What we built                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Monthly dumps stored as fake start and end | `Total` mode: date + minutes (1–59,940, 999 hours). Seed uses it. API `POST /time/total` exists. |
| Coordinators log for other people          | `userId` vs `enteredByUserId`. `/log/member` for admins.                                         |
| Shared role accounts                       | Individual users. “Clockify Import” is a deactivated stand-in for historical entered-by.         |
| Tenant and category often missing    | Both required, plus project.                                                                     |
| One 999-hour entry                         | Total cap is 999 hours. Duration/punch cap is 24 hours.                                          |
| No approval step                           | Entries are live.                                                                                |

### Domain model

The brief’s person table mixed identity, org, rate, and activity. The schema splits those correctly:

- `User` / `UserProfile` for the person.
- `TenantMembership` for role, active flag, rate type, primary group.
- `Organization` for affiliates (labeled “Group” for CASWJ).
- `HourlyRate` catalog with snapshots on every entry.
- `Project` with `Project` vs `Event`.
- `UserTimeEntry` vs `CollectiveTimeEntry`.

That mapping is written into `docs/schema/domain.md` and is a better fit than nine separate tenants. Coordinators still need a first-class “my group only” story; see [Later-scope roles](#later-scope-roles).

### Security and roles

The internship `schema.sql` gave every signed-in user full access. VolunTime does not.

- Tenant admin, organization admin, member, volunteer, SuperAdmin.
- Volunteers are locked to the default volunteer rate and cannot read other people’s reports.
- Inactive members lose access; history stays.
- Private / public / organization projects.
- JWT access + rotating refresh tokens, password-change gate, hashed invite and reset codes.
- Profile privacy: phone, zip, and notes are hidden from ordinary peers.
- Tenant and platform API keys with scopes.
- CSV formula neutralization (`=`, `+`, `-`, `@`).

This is a genuine exceed of the brief, and the HTTP hardening suite treats it as load-bearing.

### Time entry beyond the sheet

- Live timer (`POST /time/clock-in` / `clock-out`), one open punch per user, running chip in the shell.
- Duration with start/end, start+minutes, or minutes only (API).
- Admins logging for members.
- Multi-day save (same placement and duration, one row per day).
- Collective / group sessions, reported separately so they cannot inflate unique-volunteer counts.
- `allowTimeEntryEditing` so orgs can lock times after the fact.
- Rate snapshots so a later catalog edit does not rewrite grant history.

### Platform beyond a single CASWJ app

The brief described one CASWJ tool. The app is a multi-tenant product:

- Any signed-in user can create an tenant and become its admin.
- Themes, wordmarks, marks, and entity labels (`Group` vs `Organization`, `Project / Event`).
- One HTTP contract in `docs/api/http.md`, served by Next.js.
- MCP tools for the same features.
- Feedback inbox with optional GitHub issues.
- Local / staging / production env split.

Those are the right foundations if VolunTime outlives a single portal install. They also explain why the default UI says “VolunTime” instead of CASWJ.

## Gaps

### Launch gaps that still matter

**1. Total hours is not a first-class log path in the UI**

The brief called this out twice: launch scope (“total hours for a period”) and the Clockify fix list (“Monthly totals are stored as fake start and end times. Support a total-hours entry.”).

The API and seed do this. The log form does not. New rows always submit `mode: "Duration"` and require a start time. Editing a seeded `Total` row keeps date + duration only. A volunteer or coordinator dumping “20 hours this month” still has to invent a start time, which is the Clockify habit the brief wanted to kill.

`POST /time/total` and `NewEntry.mode: "Total"` are ready. The missing work is the form.

**2. CASWJ brand and Agenda Builder treatments**

What matches:

- Navy `#001836`, gold `#D4AC59`, pink `#FF5E9F`, teal `#4EBFAE`.
- Seeded “Base CASWJ” theme uses those tokens plus Helvetica Neue / Avenir Next with Source Sans 3 / Nunito Sans fallbacks.
- Sidebar is theme-primary (navy for CASWJ) with a wordmark slot.
- Uploaded marks are resized and served privately.

What does not:

- Login, signup, and marketing are VolunTime branded. The auth aside is navy with gold/teal orbs, not the approved gradient treatments in `caswj-gradient-usage.png` (reference image, 30% tint on white, 45% tint on navy, cropped accent band).
- Empty states are dashed cards, not gradient panels.
- Favicon / default mark is a clock icon, not the flame badge. CASWJ logo files from the developer-resources pack were never seeded.
- Helvetica Neue and Avenir Next are CSS family names, not shipped webfonts. Machines without those faces fall back.
- `docs/schema/domain.md` and `docs/api/http.md` still list only `SourceSans3`, `NunitoSans`, and `Geist`, while the API accepts `HelveticaNeue` and `AvenirNext`.

For a CASWJ-owned portal this is a real launch gap. For a multi-tenant product it is a default-theme problem.

**3. Portal hosting and ownership**

The brief: host inside the planned CASWJ portal at `wjarts.org/portal` or `portal.wjarts.org`; production database and Vercel project owned by a CASWJ account, Jason as collaborator.

Current state: standalone app on Jason’s Vercel project, Postgres, optional Azure API. No `basePath`, no portal chrome, no CASWJ-owned project. The app can live at a path or subdomain later, but that work is not done.

**4. Data handling and seed hygiene**

The brief: keep real names, emails, and zips out of development; some volunteers may be minors; collect only what reporting needs.

- Local seed creates real people from the workbook, plus `jbaddley` and `dworkman` (`volunteer@wjarts.org`).
- Zip codes exist on profiles and are labeled “Shown on volunteer workbooks,” but the seed does not import them.
- E2E is honest about this (`caswj-hours.spec.ts`: “Real names live in the local seed DB; do not run this suite against production”).
- The anonymized Clockify sample sits unused beside the named workbook.

That is the opposite of the brief’s development rule. It is also why the golden-report suite is local-only.

**5. Professional rates and person fields from the sheet**

The brief’s person table included rate type, professional rate, zip, notes, and primary tenant. Memberships support those fields. The seed sets everyone to Volunteer and the Utah Volunteer Rate ($35.47). Workbook rate columns are read and then ignored except as the snapshot amount on imported rows. If any 2026 rows used a professional rate, the catalog does not say so.

**6. Open enrollment vs CASWJ enrollment**

Signup is a general VolunTime account, then create-or-join an tenant. That matches a platform. It is looser than “users sign up through a basic enrollment form” for one CASWJ portal, where an invite-only or domain-gated path may be what they want.

### Later-scope roles

The brief deferred three roles. We grew past two roles without finishing those three.

| Later item                                               | Closest primitive                                              | Still missing                                                                                                                                                                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Volunteer coordinator, limited to their own tenant | Organization admin; entity label “Group”                         | Coordinators are not limited to one affiliate unless someone makes them organization admin and not org admin. Affiliates are organizations, not tenants, so “their own tenant” needs a product decision. |
| Admin staff role                                         | `MEMBER` (can choose rates, see others, cannot admin settings) | The brief’s staff role is unnamed in the UI. Volunteers vs members is easy to confuse.                                                                                                                           |
| Paid staff time tracking                                 | `Professional` hourly rates for in-kind                        | No payroll, no “this is paid so exclude from volunteer in-kind,” no staff vs volunteer split in reports.                                                                                                         |

If affiliates ever need their own branding, members, or grant packets, the one-org model will have to be revisited. Do that before building a coordinator role on top of organizations.

### Implementation and doc drift

- Role entity table in `docs/schema/domain.md` still says seed `MEMBER` and `ADMIN` only. The next paragraph, HTTP contract, and database seed `VOLUNTEER` as well.
- Theme fonts in schema/HTTP docs omit the two CASWJ faces the API already accepts.
- User JSON in the HTTP doc omits `memberNumber`, which the Volunteer Log CSV uses.
- `docs/base/` is in git and is the original source of truth, but nothing in `/docs` pointed back at the brief until this report.

### Test gaps against the original goals

The HTTP contract suite is the best part of the quality story. The Playwright suite proves the 2026 numbers. Several launch paths the brief named are still untested in the browser.

Covered well:

- Auth, users, orgs, organizations, tags, categories, projects, memberships, invitations, time (punch / duration / total / batch), collective time, rates, reports, CSV formats, API keys, MCP, feedback, hardening.
- HTTP contract tests against Next.js.
- Seeded 2026 report JSON, Summary UI, People tables, empty group-sessions tab, Volunteer Log CSV (249 rows, Total Hours, Utah Volunteer Rate, Volunteer ID), Summary CSV KPIs.
- Admin add-person dialog (success + conflict).
- Multi-day save.
- Production/staging cache-bust crawl of signed-in routes.

Missing or thin relative to the brief:

| Flow                                         | API tests                            | Browser tests                                 |
| -------------------------------------------- | ------------------------------------ | --------------------------------------------- |
| Live timer start/stop                        | Yes                                  | No                                            |
| Volunteer (not admin) logs own time          | Partial (member/volunteer rate lock) | No. E2E logs in as `jbaddley`.                |
| Admin logs time for someone else             | Yes                                  | Navigation only; no save-for-member assertion |
| Invite email → accept                        | Yes                                  | No                                            |
| Signup / enrollment                          | Yes                                  | Cache-bust copy only                          |
| Create a **Total** hours row in the UI       | Yes                                  | No (and the UI cannot do it)                  |
| Forgot password                              | Yes                                  | Cache-bust copy only                          |
| Volunteer-scoped reports (own hours only)    | Logic exists; little direct coverage | No                                            |
| Settings CRUD for categories, tags, projects | Yes                                  | Cache-bust copy only                          |
| Brand / gradient / wordmark                  | Theme HTTP tests                     | No visual check                               |
| Mobile volunteer logging                     | No                                   | Desktop 1440×900 only                         |
| Staging                                      | HTTP + cache-bust + multi-day        | Seed golden suite skipped                     |
| Production                                   | Cache-bust crawl                     | No writes, no 14,609 assertion                |

Unit tests around the edges (email templates, compact number format, chart color, sequential palette) do not carry product risk. The 14,609 guarantee lives in one local Playwright file that needs the named seed.

## Potential next steps

Ordered by how much they close the original brief, not by engineering size.

### 1. Finish the total-hours volunteer path

Expose `Total` on `/log/own` and `/log/member`: date + hours, no invented clock times, cap 999 hours. Keep Duration for start/end. Keep Punch for the timer.

Add a Playwright test that saves a Total row and one HTTP/UI test that a `VOLUNTEER` cannot pick a professional rate.

### 2. Decide CASWJ shipping shape

Pick one:

- **CASWJ portal install** — path or subdomain on wjarts.org, CASWJ-owned Vercel + database, seeded wordmark and flame, approved gradient on login / enrollment / empty states, invite-first enrollment.
- **Multi-tenant VolunTime** — keep current branding as the default; CASWJ is a themed tenant. Portal embedding can wait.

The brief assumed the first. The code is already the second. That decision unblocks brand work and ownership transfer.

### 3. Clean development data

- Keep the named workbook for local golden reports only.
- Add an anonymized seed path that uses `clockify-export-ANONYMIZED-sample.xlsx` (or a stripped workbook) for shared/staging databases.
- Stop implying zips are imported if they are not. If grant reports need them, import them behind the same local-only gate.
- Document that `npm run test:e2e` requires the named local seed and must not point at production.

### 4. Close the volunteer and coordinator loops in tests

Minimum browser coverage that matches the brief:

1. Volunteer signs in, starts and stops a timer, saves duration, sees only their hours on Reports.
2. Admin invites a volunteer, volunteer accepts, volunteer appears on members.
3. Admin logs time for that volunteer; `enteredBy` ≠ `userId` on the log CSV.
4. Keep the 249-row / 14,609-hour golden suite as the grant regression.

### 5. Reconcile later roles on purpose

Before adding more role names:

- Keep affiliates as organizations if CASWJ files one grant packet.
- Promote affiliates to tenants only if they need their own rates, themes, or memberships.
- If coordinators stay at group level, give organization admins a settings home that is not the full org admin surface.
- Do not build paid staff tracking until someone asks to exclude staff hours from volunteer in-kind.

### 6. Repair the source-of-truth docs

- Role table: `ADMIN`, `MEMBER`, `VOLUNTEER`.
- Theme fonts: add `HelveticaNeue` and `AvenirNext`.
- User profile: document `memberNumber`.
- Point `README` or this folder’s index at `docs/base/` so the brief does not get stranded again.

### 7. Optional polish that is not launch-blocking

- Seed CASWJ wordmark and flame when brand files are available.
- Use the gradient image (or a faithful CSS recreation) only on login, enrollment, empty states, and header bands.
- License or drop Helvetica Neue / Avenir Next as webfonts.
- Import professional rates from the workbook if any row is not $35.47.
- Add a re-import / dry-run command so 2026 history can be refreshed without a full reseed.
- Mobile pass on `/log/own` and `/reports`.

## Bottom line

The original job was: **count volunteer hours, value them, and match the 2026 sheet.** We did that, and we built a harder, safer, more reusable system around it.

We did better on domain modeling, security, report fidelity, dual APIs, and testable contracts. We have not yet given volunteers a total-hours form, have not shipped the CASWJ portal/brand/ownership story, and have not kept real volunteer identities out of development.

Treat the 14,609-hour golden suite as the grant invariant. Treat total-hours UI, brand/hosting, and seed hygiene as the remaining launch work. Treat coordinator and paid-staff roles as a product decision, not a missing checkbox.
