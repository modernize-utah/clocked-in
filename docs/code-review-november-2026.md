# Code review and remediation plan — November 2026

This plan comes from an aggressive review of the whole repository, done on 12 Nov 2026 against `main` at `809a363` plus the working tree. Nine areas were reviewed: security and tenant isolation, duplication, tests, best practices, onboarding, documentation, unused code, performance, and accessibility (WCAG 2.2 AA). Every finding below was confirmed by reading the code. Items marked **(verify)** need a runtime check before or while you fix them.

The plan is ordered by priority, from "stop the line" down to nit-picks. Within each tier, items are grouped by theme so related fixes can ship together.

## Tracking

Every item has a Linear ticket in the [VolunTime Code Review](https://linear.app/baddley/project/voluntime-code-review-c1d253f05082) project (Baddley team). The ticket is linked next to each item below. Ticket titles start with the plan ID, and each ticket is a sub-issue of its tier:

| Tier | Parent ticket | Items |
| --- | --- | --- |
| P0 — Critical | [BAD-123](https://linear.app/baddley/issue/BAD-123) | 8 |
| P1 — High | [BAD-124](https://linear.app/baddley/issue/BAD-124) | 31 |
| P2 — Medium | [BAD-125](https://linear.app/baddley/issue/BAD-125) | 62 |
| P3 — Low | [BAD-126](https://linear.app/baddley/issue/BAD-126) | 23 |
| P4 — Nits | [BAD-127](https://linear.app/baddley/issue/BAD-127) | 9 |

Linear priority follows the tier: P0 is Urgent, P1 High, P2 Medium, and P3 and P4 Low. Each ticket also has a "Review area" label (Security, Tenant isolation, Performance, Accessibility, Testing, Duplication, Best practice, Documentation, Unused code, Operations).

## How to read this plan

| Tier | Meaning | Target |
| --- | --- | --- |
| **P0 — Critical** | Exploitable now, or breaks a core flow in production. | This week, before other work. |
| **P1 — High** | Data exposure, compliance blockers, missing guardrails, or serious performance risk. | Next 2–4 weeks. |
| **P2 — Medium** | Structural debt that slows the team or will become a bug. | Next 1–2 months. |
| **P3 — Low** | Worth fixing when you're in the area. | Opportunistic. |
| **P4 — Nit / optional** | Polish and consistency. | Optional. |

Effort: **S** is under half a day, **M** is 1–3 days, **L** is a week or more.

Each item has an ID (`SEC-`, `PERF-`, `A11Y-`, `TEST-`, `DUP-`, `DOC-`, `BP-` for best practice, `DEAD-`, `OPS-`, `REPO-`) so it can be turned into a Linear issue.

## Executive summary

- **The most urgent problem is a complete account-takeover chain that needs no existing privileges.** Anyone can sign up, create an organization, add an existing user (a SuperAdmin included) by email, rewrite that user's global login email, and reset their password. Five more High security issues make takeover or privilege escalation easy: brute-forceable 6-digit reset and invite codes with no rate limit, tenant-controlled reset emails, cross-org department grants, and self-promoting roles.
- **Tenant isolation is mostly solid at the query level.** Foreign keys are checked against the org almost everywhere. It leaks in four places: access-request department IDs, the global `UserProfile` being edited as if it belonged to one org, Blob asset paths, and feedback submitted into other orgs. Fine-grained permissions are mostly enforced only in the UI.
- **Production likely has a hang in clock-out (verify).** The Prisma pool is capped at **1 connection** on Prisma Postgres, and several transactions call the global client while holding that one connection. Those calls deadlock until the 5 s transaction timeout.
- **The HTTP contract suite is good but never runs in CI.** Pull requests run no lint, typecheck, HTTP tests, or coverage. Tenant-isolation tests mostly use a user with no org, not an admin of another org.
- **Accessibility has three Critical issues.** Error toasts are about 1.1:1 contrast. The report designer has no keyboard path. Clickable table rows have no keyboard path. There are also many unlabeled form controls and no landmarks or skip link.
- **Duplication is driving real behaviour drift.** Permission gates disagree between pages, nav, mobile and server. The mobile app hand-copies about 450 lines of web logic and already calls an endpoint that doesn't exist.
- **The code itself is clean.** It has `strict` TypeScript, no `any`, no `@ts-ignore`, no TODOs, and good JWT, API-key, CSV, and sanitizer hygiene. Most of the debt is in process (CI, docs, env handling) and structure.

---

## P0 — Critical (fix this week)

### SEC-01 — Account takeover through org-scoped email and profile edits · Security, tenant isolation · M · [BAD-128](https://linear.app/baddley/issue/BAD-128)

> **Status: done (12 Nov 2026), on `staging`.** What shipped:
> - `POST /organizations/{id}/memberships` always creates a new account. An email that already has an account gets 409 `account_exists` and is told to send an invitation; existing accounts join only by accepting an invite. This differs from fix step 2, which proposed creating the invitation automatically.
> - `PATCH` on a membership changes the email or global profile only while no other organization shares the person and they aren't a SuperAdmin. The email additionally needs an account the person has never signed in to (`mustChangePassword` true). Re-sending a field's current value isn't a change, so the edit form still works. Verified email changes (fix step 3) come with SEC-04.
> - Import "merge" only touches people already in the organization, and updates names only on accounts no other organization shares.
> - Tests: a new takeover regression test in `tests/http/memberships.test.mjs`, a merge test in `imports.test.mjs`, and a `joinOrg` (invite then accept) helper that the other test files now use for setup.

- **Where:**
  - `src/lib/api/features/memberships.ts` 403–424: adding an existing user by email overwrites their global `UserProfile`.
  - `src/lib/api/features/memberships.ts` 541–546: `updateOrgMembership` writes `User.email`.
  - `src/lib/api/features/imports.ts` 239–273: the person-import "merge" path does the same.
  - `src/lib/api/features/organizations.ts` 318–342: any signed-in user can create an org and becomes its ADMIN.
- **Problem:** `users.ts` 157–159 correctly blocks changing `email`, `username`, `password` and `isSuperAdmin` for other people, but the membership path skips that guard. The attack takes six steps: sign up, create an org, `POST /organizations/{id}/memberships` with the victim's email, `PATCH` the membership with `email: attacker@…`, use forgot-password, then log in. An org-admin API key works too.
- **Fix:**
  1. Org-scoped endpoints must never write `User.email`, `User.username`, or global profile fields for a user who already exists, or who belongs to any other org.
  2. Adding an existing user by email creates an **invitation** that the user must accept, not a membership.
  3. If org admins still need to correct emails for accounts they created and that belong only to their org, require verifying the new address. Refuse when the target is a SuperAdmin.
- **Tests:** HTTP tests where an org-B admin tries to add and then re-email an org-A user, a SuperAdmin, and a user created by the org-B admin. Only the last may succeed, and only after verification.

### SEC-02 — Tenant-edited password-reset template can steal reset codes · Security · S–M · [BAD-129](https://linear.app/baddley/issue/BAD-129)

> **Status: done (12 Nov 2026), on `staging`.** What shipped:
> - A password reset on a tenant host uses that organization's template and address only when the person is an active member there.
> - Email links must be a fixed URL with no fields in it, or exactly one field (for example `{{reset.url}}`). Anything else, such as `https://evil/?c={{reset.code}}`, loses its href. The rule runs when a template is saved and again when each email is sent, so templates saved earlier are covered.
> - Not done: locking the PasswordReset, Invite and Welcome bodies to platform copy (fix step 2). With the link rule in place, an admin can no longer make the code leave the email automatically. Revisit if social-engineering copy becomes a concern.
> - Tests: sanitizer and send-time unit tests in `tests/email-template.test.ts`, and an HTTP test in `tests/http/auth.test.mjs` for member vs non-member resets on a tenant.

- **Where:**
  - `src/lib/api/features/auth.ts` 192–210 (`resetOrganization` picks the pinned tenant even for non-members) and 250–256.
  - `src/lib/email/templates.ts` 296–297 and 351–353 (`{{reset.code}}` is substituted inside `href`).
  - `src/lib/api/features/email-templates.ts` 138–141.
- **Problem:** An attacker creates an org with a slug and edits the PasswordReset template to `<a href="https://evil/?c={{reset.code}}">`. They then request a reset for any email on their subdomain. The victim gets a genuine platform email that carries a valid code to the attacker.
- **Fix:**
  1. Use an org's template only when the user is an active member of that org.
  2. Lock the PasswordReset, Invite and Welcome bodies to platform copy, or let orgs edit only the surrounding copy and render the code and link from a fixed partial.
  3. Never substitute placeholders inside attributes.
- **Tests:** a reset for a non-member on a tenant host uses the platform template. A placeholder inside `href` is rejected when the template is saved.

### SEC-03 — Brute-forceable 6-digit reset codes and no rate limiting · Security · M · [BAD-130](https://linear.app/baddley/issue/BAD-130)

> **Status: done (12 Nov 2026), on `staging`.** What shipped:
> - A reset code stops working after 5 wrong guesses. A new `PasswordResetCode.failedAttempts` column counts them across the person's active codes.
> - A database-backed fixed-window limiter (`src/lib/api/rate-limit.ts`, new `RateLimit` table with hashed keys) returns 429 `rate_limited`. Limits:
>   - Login: 10 failures per username and 50 per IP in 15 minutes.
>   - Reset confirm: 30 failures per IP in 15 minutes.
>   - Reset request and sign-up: 20 per IP per hour.
> - The IP is the Vercel-set `x-forwarded-for`. Loopback and private addresses are skipped, so local runs aren't limited.
> - Migration `20261112210000_auth_rate_limits` was applied to staging, together with the two 5 Nov migrations staging was still missing. All three were applied to production on 12 Nov 2026, before this change was released to `main`.
> - Deferred: making the reset request `POST` (the mobile app uses `GET`), 32-byte link tokens, and identical sign-up responses for taken emails. The last needs the email verification from SEC-04.
> - Tests in `tests/http/auth.test.mjs`: five wrong guesses retire a code, ten wrong passwords lock a username, and the per-IP limit on reset confirmations.

- **Where:**
  - `src/lib/api/features/auth.ts` 269–278 (no counter of failed attempts) and 143–154 (login).
  - `src/lib/api/security.ts` 20–22 (`numericCode`).
  - The routes under `src/app/(api)/auth/**`.
- **Problem:** With 10⁶ codes, a 15-minute lifetime, a new code every 60 s, and no limit on attempts, a takeover of any known email is likely within hours. Login, sign-up and reset have no rate limit or lockout. Sign-up also reveals whether an email exists.
- **Fix:**
  1. Count attempts per user and per code, and invalidate the code after 5 failures.
  2. Add per-IP and per-email rate limits: Vercel WAF rate-limit rules for `/auth/*`, plus a small store such as Upstash for per-account counters.
  3. Make reset requests `POST`, not `GET`, so emails don't end up in access logs.
  4. Consider 32-byte link tokens instead of codes.
  5. Return the same response whether or not the account exists.
- **Tests:** the 6th wrong code fails even with the right code. The rate limit returns 429.

### SEC-04 — Invite codes are guessable, the invite page leaks PII, and email is never verified · Security · M · [BAD-131](https://linear.app/baddley/issue/BAD-131)

> **Status: invite hijacking fixed (12 Nov 2026), on `staging`; email verification split into SEC-04b ([BAD-260](https://linear.app/baddley/issue/BAD-260)).** What shipped:
> - Invite codes are 12 characters from an unambiguous alphabet, about 59 bits, shown as `ABCD-EFGH-JKMN`. Typed codes ignore case, spaces and dashes, and 6-digit invites already sent still work until they expire.
> - Wrong codes are rate limited: 10 per account and 30 per IP in 15 minutes. The signup page's pre-login invite lookup shares the IP limit.
> - Pre-login invite details (fix step 2) now need a code that can't be guessed, so they stay as a convenience for the real invitee.
> - Not in this change: email verification on sign-up and email change, the current-password check on email change, and gating `linkGuest` on a verified email (fix steps 3–4). They need a new verification flow with web and mobile UI, now tracked as SEC-04b.
> - Tests: `tests/invite-code.test.ts`, and a new HTTP test in `tests/http/invitations.test.mjs` for typed variants and the accept limit. The stale tenant test in `organizations.test.mjs` now passes and checks the new code format in invite links.

- **Where:**
  - `src/lib/api/security.ts` 20–33 (6-digit codes valid for 7 days).
  - `src/lib/api/features/invitations.ts` 321–345.
  - `src/app/(auth)/signup/page.tsx` 32–37.
  - `src/app/actions/auth.ts` 122–133.
  - `src/app/actions/profile.ts` 12–28.
  - `src/lib/api/features/users.ts` 188–192.
- **Problem:**
  - Without logging in, `/signup?next=/accept?code=NNNNNN` shows the invitee's email and name. Every tenant's invites share one 10⁶ code space.
  - Sign-up never verifies the email, so an attacker can claim an invite, ADMIN role included.
  - People can also change their own email without verification, which lets them inherit another person's guest volunteer sign-ups (`linkGuest`).
- **Fix:**
  1. Use 32-byte invite link tokens (`randomCode()` already exists).
  2. Don't show invite PII before authentication.
  3. Add email verification on sign-up and on email change, and require it before accepting an invite or running `linkGuest`.
  4. Require the current password to change email.
- **Tests:** an unauthenticated invite lookup returns no PII. An unverified account cannot accept an invite.

### SEC-05 — Access-request approval grants department admin in other orgs · Tenant isolation · S · [BAD-132](https://linear.app/baddley/issue/BAD-132)

> **Status: done (12 Nov 2026), on `staging`.** What shipped:
> - On creation, `requestedDepartmentIds` must be valid ids of departments in that organization, and `volunteerNeedId` must be one of its needs; anything else gets 400.
> - Approval filters again, so requests stored before this fix can't grant foreign departments.
> - The role change and department grants now run in one transaction.
> - Test in `tests/http/voluntime-feedback.test.mjs`: a cross-org request is refused, and a planted legacy request with a foreign department grants nothing when approved.

- **Where:** `src/lib/api/features/access-requests.ts` 70–80 (parse), 112–122 (stored without checks), and 222–231 (approval upserts `DepartmentMembership` with role ADMIN for every ID).
- **Problem:** A volunteer in org B creates org A, files an access request in A listing B's department IDs, and approves it themselves. They become a department ADMIN in org B.
- **Fix:**
  1. At creation **and** at approval, keep only UUIDs where `department.organizationId === row.organizationId`.
  2. Validate `volunteerNeedId` the same way.
  3. Run approval in a transaction.
- **Tests:** a foreign department ID is rejected with 400 at creation and ignored at approval.

### SEC-06 — Privilege escalation through roles, self-approval and import · Security · M · [BAD-133](https://linear.app/baddley/issue/BAD-133)

> **Status: done (12 Nov 2026), on `staging`.** What shipped:
> - A shared rule, `assertCanGrant` in `roles.ts`: anyone but an organization admin can grant only permissions they hold, and no wider scope than their own.
> - It applies when creating a role, and when editing one (only newly added permissions and a changed scope are checked, so renames still work).
> - It applies to the role an access-request approval would give.
> - It applies to each role in a people import. An importer gets the new accounts' passwords, so a row whose role the importer couldn't grant becomes a row error.
> - Nobody can review their own access request, and granting group-manager rights through a request needs an organization admin.
> - Deferred: removing temporary passwords from import responses (fix step 4). Admins use them to hand out accounts, so this needs the email-a-link flow first.
> - Test in `tests/http/voluntime-feedback.test.mjs` covering all three routes. Also fixed the stale reserved-username test in that file.

- **Where:**
  - `src/lib/api/features/roles.ts` 157–200: a `manage_roles` holder can add `manage_organization` to their own role.
  - `src/lib/api/features/access-requests.ts` 103–104 and 217–221: anyone can request ADMIN, and someone holding `approve_access_requests` can approve their own request.
  - `src/lib/api/features/imports.ts` 210–212 and 285–290: `import_people` can create ADMIN accounts and returns their temporary passwords.
- **Fix:**
  1. A caller may grant only permissions and roles they already hold. Granting ADMIN or `manage_organization` requires `manage_organization`.
  2. Block approving your own request.
  3. Restrict which roles an import can assign.
  4. Never return passwords in API responses; email a set-password link instead.
- **Tests:** a role editor cannot escalate their own role, and self-approval returns 403.

### DATA-01 — Production pool of one connection, and transactions that query outside it · Performance, correctness · M **(verify)** · [BAD-134](https://linear.app/baddley/issue/BAD-134)

> **Status: done (12 Nov 2026), on `staging`.** What shipped:
> - Confirmed locally. With the pool forced to one connection, the old code failed 3 more clock and need tests and logged 4 transaction errors. The fixed code logged none.
> - `clockOut`, `cancelClock` and `resetClock` now run their access, project, category, tag and rate checks before the transaction. Inside the lock they re-read the timer and return 409 if it changed in between.
> - Need vetting, un-vetting and sign-up deletion check access before their transactions.
> - The Prisma Postgres pool is now 3 connections with a 5-second connection timeout, instead of 1 with none.
> - A new `DATABASE_POOL_MAX` override exists; set it to `1` locally or in CI to catch this bug class. The full HTTP suite passes with it (189/191, only the two known stale tests failing).
> - Not done: `attachDatabasePool` from `@vercel/functions` (not a dependency yet), and a lint rule against the global client inside transactions. Run TEST-01's CI job with `DATABASE_POOL_MAX=1` to cover this instead.

- **Where:**
  - `src/lib/prisma-connection.ts` 23–28: `max: 1`, no `connectionTimeoutMillis`, 5 s idle timeout.
  - Global `prisma.*` calls inside `transaction()`:
    - `src/lib/api/features/time-entries.ts` 1017–1019 and 1038 (`clockOut`: `assertProject`, `assertTaskCategory`, `tagIdsFor`)
    - `time-entries.ts` 1102 and 1120 (`cancelClock`, `resetClock`)
    - `src/lib/api/features/volunteer-needs.ts` 688 and 717 (`access.requireOrganization` inside the transaction)
  - `memberships.ts` 363–364 already has a comment documenting this rule.
- **Problem:** `@prisma/adapter-pg` checks out the only connection for the transaction. Any global-client call inside the callback then waits for that same connection until Prisma's 5 s timeout (P2028). For example, the header "Stop timer" on an entry with a project likely fails in production but works locally, where the pool is normal size.
- **Verify:** search staging and production logs for `P2028` or "Transaction already closed", and reproduce clock-out with a project on staging.
- **Fix:**
  1. Pass `tx` into every assert helper, or run the checks before the transaction.
  2. Add a lint rule or wrapper so that `prisma` can't be used inside `transaction()` callbacks. A simple option is an ESLint `no-restricted-syntax` rule.
  3. Raise `max` to 3–5 within the Prisma Postgres plan's limit.
  4. Add `connectionTimeoutMillis: 3000` and use `attachDatabasePool` from `@vercel/functions`.
- **Tests:** a CI job that runs the HTTP suite with `max: 1` forced locally. This bug class shows up only under that setting.

### REPO-01 — Credentials and personal data tracked in git · Security, hygiene · S · [BAD-135](https://linear.app/baddley/issue/BAD-135)

> **Status: partly done (12 Nov 2026), on `staging`. Owner decisions needed.**
> - **The GitHub repository (moved to `modernize-utah/clocked-in` on 12 Nov 2026) is public.** Everything below, including the real-name workbook, client feedback PDFs and the project brief in `docs/base/`, has been readable by anyone and stays in git history.
> - Done:
>   - Deleted `Untitled`. Its Azure SQL string had only a placeholder password (`YOUR_PASSWORD`), so no live secret leaked, just the host and user.
>   - Deleted `scripts/diag-add-person.mjs`.
>   - Stopped tracking `docs/base/2026 Volunteer Hours.xlsx` and added it to `.gitignore`. A copy is at `~/code/clocked-in-private/`, because pulling this change removes the file from a checkout. The seed reads `CASWJ_WORKBOOK_PATH` or the old path.
>   - The `dworkman` seed account now gets a random temporary password, printed once, instead of the hard-coded `dworkman_temp`.
> - Still open, for the owner:
>   1. Make the repository private.
>   2. Decide whether to rewrite history (for example with `git filter-repo`) to purge the workbook and PDFs.
>   3. Decide whether the client PDFs and brief belong in the repo.
>   4. Confirm the Azure SQL server `clocked-in.database.windows.net` is decommissioned.
>   5. If any database was seeded with `dworkman_temp` and that account has never signed in, change its password.

- **Where:**
  - `Untitled` at the repo root: an Azure SQL connection string with host `clocked-in.database.windows.net` and user `init_admin`.
  - `docs/base/2026 Volunteer Hours.xlsx`: real names (the README says so).
  - The feedback PDFs in `docs/` may also contain real data **(verify)**.
  - `scripts/diag-add-person.mjs`: hard-codes a personal email, disables TLS verification, and inserts into `"User"`.
  - `scripts/seed-caswj.ts` 178: hard-codes a password for a real-looking account.
- **Fix:**
  1. Rotate the Azure credential, or confirm the server has been decommissioned.
  2. Delete `Untitled` and `diag-add-person.mjs`.
  3. Move the real-name workbook out of the repo, into private storage fetched by the seed script.
  4. Decide whether to rewrite history; at minimum, confirm the GitHub repo is private.
  5. Replace hard-coded seed passwords with generated ones that are printed once.

---

## P1 — High (next 2–4 weeks)

### Security and tenant isolation

#### SEC-04b — Verify email ownership on sign-up and email change · M · [BAD-260](https://linear.app/baddley/issue/BAD-260)

Split out of SEC-04. The app never checks that a person controls their account's email:

- Sign-up and self-service email changes need no verification, and no password for the change.
- `linkGuest` hands an account every guest volunteer sign-up made with that email, across organizations.
- Sign-up reveals whether an email already has an account.
- Org admins can't fix the email on an account they created once the person has signed in.

**Fix:**

1. Add `User.emailVerifiedAt`. Treat accounts created by accepting an invite as verified.
2. Send a verification code on sign-up and on email change. Hold the change as `pendingEmail` until confirmed, and require the current password to start it.
3. Run `linkGuest` only for verified emails.
4. Return the same sign-up response either way.
5. Build the web and mobile UI for the verification step.

#### SEC-07 — Every member can read all members' emails and pay rates · S · [BAD-136](https://linear.app/baddley/issue/BAD-136)

`listOrgMemberships` (`src/lib/api/features/memberships.ts` 304–322) only calls `requireOrganization(id, false)` but returns `user.email`, `rateType` and `professionalBillingRate`.

**Fix:** require `manage_members` or admin for the full view, and return a trimmed directory view to everyone else. The web people picker and the mobile app need updating to match.

#### SEC-08 — A global `UserProfile` is edited per org, so private notes leak between orgs · M · [BAD-137](https://linear.app/baddley/issue/BAD-137)

- **Where:** writes in `memberships.ts` 409–423 and 548–572; reads in `users.ts` 117–137.
- **Problem:** Org admins edit `notes`, `phone`, `zipCode`, `description` and `avatarUrl` on the global profile. Org A's admin can overwrite them, and can read org B's private notes about a shared person.
- **Fix:** move org-specific notes, phone overrides and description onto `OrganizationMembership`. Only the user edits their global profile.

#### SEC-09 — Cross-org Blob delete and read through `orgs/…` paths · S · [BAD-138](https://linear.app/baddley/issue/BAD-138)

- **Where:**
  - `src/lib/brand.ts` 132–139 (`isVercelBlobUrl` accepts any `orgs/` prefix).
  - `src/lib/api/features/organizations.ts` 176–187 (brand URLs accept any string).
  - `src/lib/api/features/brand.ts` 24–42.
  - `src/lib/server/brand-assets.ts` 108–111.
  - `src/app/avatar/[userId]/route.ts` 31.
- **Problem:** Org A's admin sets `markUrl` to `orgs/<orgB>/mark.webp` and then removes their brand, which deletes org B's file. Any user can set their avatar to another org's private blob and read it through `/avatar/<self>`.
- **Fix:** accept stored asset URLs only from your own upload responses. Before any read or delete, check the pathname prefix: `orgs/<thisOrgId>/` for brand assets, `avatars/<userId>/` for avatars.

#### SEC-10 — Fine-grained permissions are checked only in the UI · M–L · [BAD-139](https://linear.app/baddley/issue/BAD-139)

- **Where:**
  - `reports.ts` 343–352 and 405–407 ignore `view_reports` and `export_reports`, although `viewCsv` at 585 checks them.
  - `projects.ts` 266–268 ignores `create_projects`.
  - `manage_lists`, `manage_api_keys`, `manage_members` and `log_member_time` are not checked on writes.
- **Fix:**
  1. Make a server-side permission check the first line of every feature function.
  2. Build this together with **DUP-02**: one shared `gates` module used by the server, web and mobile, so the rules can't drift.
- **Tests:** add a permission × endpoint matrix to **TEST-02**.

#### SEC-11 — Removed or demoted users keep access to time entries · S · [BAD-140](https://linear.app/baddley/issue/BAD-140)

The `owned` check (`time-entries.ts` 578–602) and delete (963–966) grant access through `entry.userId === actor || entry.enteredByUserId === actor` without checking that the membership is active.

**Fix:** require an active membership plus the relevant permission, and stop treating `enteredByUserId` as a permanent grant.

#### SEC-12 — Feedback can be sent into any org · S · [BAD-141](https://linear.app/baddley/issue/BAD-141)

`feedback.ts` 352–365: off a tenant host, `organizationId` is only checked for existence. This sends that org's notification emails and returns its name for any UUID.

**Fix:** `requireOrganization(organizationId, false)`.

#### SEC-13 — No security headers · S · [BAD-142](https://linear.app/baddley/issue/BAD-142)

Neither `next.config.ts` nor `vercel.json` sets CSP, `frame-ancestors` or `X-Frame-Options`, HSTS, `Referrer-Policy`, `X-Content-Type-Options` or `Permissions-Policy`, so admin pages can be framed for clickjacking.

**Fix:** add `headers()` in `next.config.ts`. Start the CSP in report-only mode, because TipTap, Recharts and Blob images need explicit allowances.

#### SEC-14 — Persisted query cache holds personal data and isn't scoped to a user · S · [BAD-143](https://linear.app/baddley/issue/BAD-143)

`src/lib/lookup-persistence.ts` 43–53 persists lookups and every `["feedback", …]` query, including submitter emails, to IndexedDB for 24 h under a fixed key. It is cleared only on explicit sign-out.

**Fix:** key the cache by user ID, clear it on 401 and on user switch, and stop persisting feedback.

### Testing and CI guardrails

These come before the P2 refactors, so the refactors have a safety net.

#### TEST-01 — Run the HTTP contract suite on every pull request · M · [BAD-144](https://linear.app/baddley/issue/BAD-144)

`.github/workflows/unit-tests.yml` runs only unit, import and migration tests. Add a job that:

1. Uses the existing Postgres service and runs `db:deploy`.
2. Starts `tests/http/mail-sink.mjs` and `linear-sink.mjs`.
3. Runs `next build` and `next start --port 3025`, then waits for `/health`.
4. Runs `npm run test:http`.

A fresh database per run also fixes the SuperAdmin build-up described in TEST-07. Move `tests/http/openapi.test.mjs`, which needs no server, into the unit suite.

#### TEST-02 — Generated tenant-isolation and permission matrix · L · [BAD-145](https://linear.app/baddley/issue/BAD-145)

Add `tests/http/tenant-isolation.test.mjs`:

1. Build the route list from `src/lib/developer/openapi.json`.
2. Seed org A with one of every resource, and org B with an admin, a volunteer and an API key.
3. For every `{id}` route, call it with org B's credentials and org A's IDs, and assert 403 or 404. Include the mismatched-parent case: org B in the path with an org A child ID.
4. For every create and update, inject org A's `projectId`, `taskCategoryId`, `departmentId`, `hourlyRateId`, `tagIds`, `roleId` and `requestedDepartmentIds`, and assert 400.
5. Fail when a route has no matrix entry, so new routes are covered by default.
6. Cover MCP too: a read-only key calling a write tool, and a cross-org call.

Resources with no real cross-org test today: tags, task categories, hourly rates, collective entries, volunteer needs and sign-ups, themes, custom roles, access requests, connections, email and report templates, saved reports, payroll, `unclassified-count` and `view.csv`.

#### TEST-03 — Regression tests for every P0 fix · M · [BAD-146](https://linear.app/baddley/issue/BAD-146)

Each P0 item lists its tests. In addition, add:

- token tests: expired, tampered, wrong issuer and wrong audience
- an expired API key returns 401
- refresh-token reuse after the overlap window is rejected
- the cron route without its secret returns 401

#### CI-01 — Lint and typecheck in CI, and typecheck the tests · S · [BAD-147](https://linear.app/baddley/issue/BAD-147)

1. Add `"typecheck": "tsc --noEmit"`, plus a `tests/tsconfig.json` that includes `tests/**`.
2. Fix the 3 stale test type errors: `tests/email-digest.test.ts:3`, and `tests/linear-issues.test.ts:173` and `:186`.
3. Fix the one ESLint error, `react-hooks/purity` at `src/app/(workspace)/log/own/own-view.tsx:61` (`Date.now()` called during render).
4. Run `npm run lint -- --max-warnings=0` and the typecheck on pull requests.

### Accessibility

#### A11Y-01 — Error toasts are about 1.1:1 contrast; success toasts about 2:1 · S — WCAG 1.4.3 · [BAD-155](https://linear.app/baddley/issue/BAD-155)

`src/components/ui/sonner.tsx` 47–50 sets `--error-text: var(--accent)`; the same problem is in `globals.css` 219–221.

**Fix:** use `var(--destructive)` for error text, and a darkened `oklch(from var(--success) 0.45 c h)` for success text. Make error toasts stay until dismissed.

#### A11Y-02 — Report designer works only with a pointer · M — WCAG 2.1.1, 2.5.7, 2.5.8 · [BAD-156](https://linear.app/baddley/issue/BAD-156)

- **Where:** `src/components/report-grid.tsx` 183–255 and `src/components/report-grid-item.tsx` 67–89. Resize handles are 8 px wide and do nothing from the keyboard.
- **Fix:**
  1. Add a focusable "Select {card}" control on each card.
  2. Add Column, Row, Width and Height inputs to `card-fields.tsx`.
  3. Optionally, arrow keys move a card and Shift+arrow resizes it, announced through a `role="status"` region.

#### A11Y-03 — Clickable table rows with no keyboard path · S — WCAG 2.1.1, 4.1.2 · [BAD-157](https://linear.app/baddley/issue/BAD-157)

`src/components/data-table.tsx` 58–62 and 82–86 put `onClick` on `<tr>` and `<li>`. This blocks keyboard users on the needs list and report drill-downs (`group-table.tsx` 117).

**Fix:** render the primary cell as a `<Link>`, and keep the row click as a mouse-only enhancement.

#### A11Y-04 — Charts have no text alternative and are unnamed tab stops · M — WCAG 1.1.1, 2.4.7 · [BAD-158](https://linear.app/baddley/issue/BAD-158)

- **Where:** `src/components/charts.tsx` 290–353, and `src/components/ui/chart.tsx` 67, which hides the outline.
- **Fix:**
  1. Add a "View as table", or a visually hidden table, built from the same rows.
  2. Pass `title` and `desc` to each chart.
  3. Give bar drill-downs the same list-of-links alternative the pie charts already have.
  4. Restore the focus outline, or turn off the Recharts accessibility layer once a table exists.

#### A11Y-05 — Unlabeled controls, and field errors not linked to their inputs · M — WCAG 1.3.1, 3.3.1, 3.3.2, 4.1.2 · [BAD-159](https://linear.app/baddley/issue/BAD-159)

- About 25 controls have no accessible name:
  - `theme-form.tsx`: hex inputs, the font selects, and "Apply theme"
  - the four feedback filters
  - `roles-view.tsx`
  - `person-forms.tsx`
  - `hourly-rates-card.tsx`
  - `profile-form.tsx`
  - the per-row action in `import-view.tsx`
  - `hourly-rate-select.tsx`
  - the "Entry method" toggle group in `time-entry-form.tsx`
- `src/components/field.tsx` 22–31 renders errors and hints as bare `<p>` elements across 156 usages.
- **Fix:** have `Field` generate IDs and pass `aria-describedby` and `aria-invalid` to its child through context; `image-uploader.tsx` 164–165 is the model to copy. Give errors `role="alert"`, and use `useId()` for repeated controls.

#### A11Y-06 — Org themes aren't contrast-checked, and the default theme already fails · M — WCAG 1.4.3, 1.4.11 · [BAD-160](https://linear.app/baddley/issue/BAD-160)

Highlight (#D4AC59) and success (#4EBFAE) used as text reach only about 2.1:1:

- `user-menu.tsx` 40–41
- `entry-row.tsx` 64
- `field.tsx` 46
- the theme preview
- `share-bar.tsx`

**Fix:** add a relative-luminance helper, and validate the key colour pairs in `saveThemeAction` with inline warnings or a hard block. Use darkened text variants of these colours wherever they are text.

#### A11Y-07 — Tag picker can't be used with a keyboard · S — WCAG 2.1.1 · [BAD-161](https://linear.app/baddley/issue/BAD-161)

`src/components/placement-fields.tsx` 250–258: closing the list on blur hides the options before keyboard focus can reach them, and the input has no combobox roles.

**Fix:** switch to the Base UI `Combobox`, as `searchable-select.tsx` already does.

#### A11Y-08 — No navigation landmark or skip link, and the header sits inside `<main>` · S — WCAG 1.3.1, 2.4.1 · [BAD-162](https://linear.app/baddley/issue/BAD-162)

- **Where:** `src/components/ui/sidebar.tsx` 209–250, `app-sidebar.tsx` 90–123, `shell/app-shell.tsx` 43–55.
- **Fix:**
  1. Wrap the sidebar in `<nav aria-label="Main">`.
  2. Make `SidebarInset` a `div`, and render `<main id="main" tabIndex={-1}>` around the page content.
  3. Add a skip link as the first focusable element.

#### A11Y-09 — Two header buttons lose their names on mobile · S — WCAG 4.1.2 · [BAD-163](https://linear.app/baddley/issue/BAD-163)

`shell/timer-chip.tsx` 17–20 and `shell/feedback-button.tsx` 12–15 hide their only text with `hidden sm:inline`.

**Fix:** use `sr-only sm:not-sr-only`.

### Performance and operations

#### PERF-01 — Import hashes passwords inside an org-wide lock · M · [BAD-148](https://linear.app/baddley/issue/BAD-148)

- **Where:** `src/lib/api/features/imports.ts` 228–305, `memberships.ts` 385, and `db.ts` 108–110 (`FOR UPDATE`).
- **Problem:** bcryptjs at cost 12 takes about 0.3 s per row. A 1,000-row import holds the org row lock for 5–7 minutes, which blocks other writes for that org and exceeds the function timeout.
- **Fix:**
  1. Hash before the transaction.
  2. Use `FOR NO KEY UPDATE` or an advisory lock.
  3. Batch the inserts with `createMany`.
  4. Set `maxDuration` on the route, or move imports onto a queue.

#### PERF-02 — The report endpoint runs about 35–40 sequential queries per request · M · [BAD-149](https://linear.app/baddley/issue/BAD-149)

- **Where:** `src/lib/api/features/reports.ts` 343–351, 149–179 and 255–275.
- **Problem:**
  - Some `groupBy` queries are duplicated.
  - Monthly totals are grouped by day in the database and then rolled up to months in JavaScript.
  - Collective entries are loaded with no limit.
  - The org is fetched twice.
- **Fix:**
  1. Write one SQL statement per rollup, using `GROUPING SETS` and `date_trunc('month')`.
  2. Run the rollups in parallel. With one connection that gains little, so do DATA-01 first.
  3. Optionally cache with `'use cache'` plus `cacheTag('org:<id>:report')`, and call `updateTag` when time is written.

#### PERF-03 — The unclassified filter loads every matching ID into an `IN` list · S · [BAD-150](https://linear.app/baddley/issue/BAD-150)

`time-entries.ts` 56–84 and 1136–1153 do this on every dashboard load, and Postgres fails past about 65k parameters.

**Fix:** use the existing but unused `unclassifiedWhere()` at line 52 directly, and add a partial index.

#### PERF-04 — `Access` caches results, not promises, so parallel callers repeat queries · S · [BAD-151](https://linear.app/baddley/issue/BAD-151)

- **Where:** `src/lib/api/access.ts` 97–102, 259–273, 401–478; `src/lib/server/tenant.ts` 13–24.
- **Problem:** `loadLookups` runs about 25 queries instead of about 9.
- **Fix:** cache promises (`this.x ??= load()`), cache org rows by ID, load permissions together with the membership, and pass the tenant lookup into `Access`.

#### OPS-01 — Email failures leave no logs · S · [BAD-152](https://linear.app/baddley/issue/BAD-152)

- **Where:**
  - `.catch(() => undefined)` in `access-requests.ts:247`, `volunteer-needs.ts:500/678/796`, `imports.ts:370` and `time-entries.ts:768/1079`.
  - An empty `catch {}` in `feedback.ts:260`.
  - `mail.ts` 110–115 drops the response status and body.
  - `respond.ts` 19–23 and `server/action.ts` 12–14 log only errors that aren't `ApiError`.
- **Fix:** log the status and body in `mail.ts`, and add a `sendEmailBestEffort()` helper that logs `{ for, organizationId }`. Move sends into `after()` and add `AbortSignal.timeout(5000)` to the Resend, Linear and Turnstile fetches (see PERF-07).

#### OPS-02 — Environment variables aren't validated · S–M · [BAD-153](https://linear.app/baddley/issue/BAD-153)

About 40 `process.env` reads are spread over 15 files. Required settings fail only when first used, and the Blob token and access-mode logic is copied three times.

**Fix:** add a `server-only` module, `src/lib/env.ts`, that parses everything once with zod and fails at boot. Treat it as the env reference (see DOC-04).

#### REPO-02 — The Expo mobile app isn't in git · S · [BAD-154](https://linear.app/baddley/issue/BAD-154)

**Status (12 Nov 2026):** committed to `staging` in `4d251a7` and merged to `main` in `135d486`. Still open: decide whether it stays in this repo (BP-05), lint and typecheck it in CI (BP-08), and add a README (DOC-06).

At review time, `apps/` was untracked: 7,870 lines of source. The uncommitted edits to `.gitignore`, `tsconfig.json` and `eslint.config.mjs` existed only to work around it.

**Fix:** commit `apps/mobile` (its `.gitignore` is already correct), or move it to its own repository. This blocks DUP-01 and the mobile tests in TEST-05.

### Duplication that is already causing bugs

#### DUP-01 — Mobile copies about 450 lines of web logic and types, and has already drifted · L · [BAD-164](https://linear.app/baddley/issue/BAD-164)

- **Where:** `apps/mobile/src/format.ts`, `gates.ts`, `report-path.ts`, `theme.tsx` 108–128, and `api/types.ts` (337 lines).
- **Live bug:** `apps/mobile/src/api/client.ts` 454–460 calls `PATCH` and `DELETE /connections/:id`, which don't exist on the server.
- **Fix:**
  1. Create a framework-free `packages/shared`: `format`, `labels`, `permissions`, `gates`, `report-path`, `need-status`, `member-connection`, `api-types` and `api-paths`.
  2. Have `src/lib/*` re-export from it, and wire mobile in through a tsconfig path plus Metro `watchFolders`, or with npm workspaces (see BP-05).
  3. Fix the connections endpoint first.

#### DUP-02 — Permission gates are copied about 15 times and disagree · M · [BAD-165](https://linear.app/baddley/issue/BAD-165)

They disagree on:

- **Manage needs:** `needs-view.tsx:41`, `need-detail.tsx:38`, mobile `gates.ts:35`, and the server at `volunteer-needs.ts:316`.
- **Group time:** `log-nav.tsx:26` doesn't pass permissions, but `group-view.tsx:41` does. Some users can open the page but don't see it in the nav.
- **Member time:** `member-view.tsx:17` and `person-select.tsx:40` ignore `log_member_time`.
- **Report design:** inlined in 6 places.
- **Create projects:** `entity-select.tsx:35` and `need-form.tsx:127` differ.

**Fix:**

1. Add one `gates(workspace)` function in the shared package, a `useGates()` hook, and a `useGate(allowed, fallbackHref)` hook that replaces the 11 copies of `useClientRedirect(!x); if (!x) return null`.
2. Have the server call the same functions (SEC-10).

---

## P2 — Medium (next 1–2 months)

### Duplication and reuse

Ordered by impact. Each item names the new abstraction and where it should live.

| ID | Pattern (where) | Proposed abstraction | Size |
| --- | --- | --- | --- |
| DUP-03 [BAD-166](https://linear.app/baddley/issue/BAD-166) | Viewer built twice word for word (`server/dal.ts:28-97`, `features/workspace.ts:7-62`); display-name logic in about 10 places, with differences (see list below) | `src/lib/person-name.ts` (`personDisplayName`, `initialsOf`); `buildViewer()`, `workspaceFlags()` | M |
| DUP-04 [BAD-167](https://linear.app/baddley/issue/BAD-167) | Member-connections editor written 3 times (`people/connections-card.tsx`, `person-profile-dialog.tsx:143-263`, `people-view.tsx:52,556-673`); `relationshipOptions` declared 4 times | `useConnectionMutations()`, `<MemberConnectionsEditor layout>`, `connectionChoices()` in `lib/member-connection.ts` | M |
| DUP-05 [BAD-168](https://linear.app/baddley/issue/BAD-168) | Avatar, brand and feedback Blob code about 90% the same (`server/avatar-assets.ts`, `brand-assets.ts`, `feedback-assets.ts`). Feedback hard-codes `access: "public"` | `server/blob-store.ts` (`putWebp`, `readBlob`, `deleteBlob(url, owns)`), `server/uploaded-image.ts`, `lib/image-policy.ts`. Fold in SEC-09 path ownership and the pixel limit (PERF-12) | M |
| DUP-06 [BAD-169](https://linear.app/baddley/issue/BAD-169) | Report CSV copies `csvCell`, including the formula-injection guard (`reports.ts:390-402` vs `lib/csv.ts`) | Import from `lib/csv.ts` and add `csvResponse()`. A fix in one copy doesn't reach the other | S |
| DUP-07 [BAD-170](https://linear.app/baddley/issue/BAD-170) | Coordinator member scoping copied 5 times (`person-select.tsx:43`, `time-entry-form.tsx:119`, `member-view.tsx:21`, `people-view.tsx:199`, `report-filters.tsx:44`) | `membersInGroups()` in `lib/roles.ts`; `useScopedMembers()` | S |
| DUP-08 [BAD-171](https://linear.app/baddley/issue/BAD-171) | Log and entries lists: day grouping (3 copies), day header card (3), "Load more" (3), optimistic removal from an infinite query (2), card titles with an icon (4), and "edit this item" dialog state (16 uses) | `groupByDay()`, `<DayGroup>`, `<LoadMoreButton>`, `removeFromInfinite()`, `useDialogTarget<T>()`, `<IconCardTitle>` | M |
| DUP-09 [BAD-172](https://linear.app/baddley/issue/BAD-172) | Feedback mutation setup copied 7 times (`feedback-view.tsx`, `feedback-detail.tsx`); `formatWhen` twice | `useFeedbackMutation()`, `readFeedbackUpdate()` | S |
| DUP-10 [BAD-173](https://linear.app/baddley/issue/BAD-173) | Query keys and fetchers inline instead of in `keys`: roles (2 places, with different types), access requests, unclassified count, payroll. Action results unwrapped by hand. `FormMessage` built from a mutation's error 6 times | Add them to `keys` and the `*Query` factories; `unwrap()`, `<MutationMessage>`, `useFlatInfinite()` | M |
| DUP-11 [BAD-174](https://linear.app/baddley/issue/BAD-174) | Tags, task categories and departments feature modules are about 80% identical; "delete fails if time entries reference it" repeated 5 times; date-order checks twice; name-uniqueness checks 3 times; a looser UUID regex in `volunteer-needs.ts:120` | `features/shared.ts` (`assertNoTimeEntries`, `loadOwned`, `assertDateOrder`, `assertUniqueName`), with an optional `namedLookupFeature()` factory | M |
| DUP-12 [BAD-175](https://linear.app/baddley/issue/BAD-175) | `projects-card`, `api-keys-view`, `hourly-rates-card` and `invite-card` each rebuild `LookupListCard` | `<EntityListCard>` and `<EntityRow>`; rebuild `LookupListCard` on top | M |
| DUP-13 [BAD-176](https://linear.app/baddley/issue/BAD-176) | Near-identical section shells (`settings-shell`, `people-shell`, `developer-shell`); `EditorLayout` duplicates `SectionLayout` without the nav; `need-detail` shows two titles on mobile; `about-prototype` hand-rolls its `h1` | `<GatedSectionShell>`, an optional `nav` on `SectionLayout`, a `title` override on `PageHeader`, and a `<SectionHeading>` component | S |
| DUP-14 [BAD-177](https://linear.app/baddley/issue/BAD-177) | Plumbing repeated across REST, actions and MCP: 76 copies of `const access = await requireAccess()`, 134 `authenticate()` calls, 5 MCP `page` schemas, 12 `return "deleted"` | `runWithAccess()`, `authed()`, a shared MCP `page`, `registerNamedLookupTools()` | M |
| DUP-15 [BAD-178](https://linear.app/baddley/issue/BAD-178) | Small utilities: query-string builders (8 or more), date, UUID and email regexes (6, 5 and 3 copies), clipboard copy with a toast, synced draft state | `lib/search-params.ts`, `lib/patterns.ts`, `copyToClipboard()`, `useSyncedDraft()` | S |
| DUP-16 [BAD-179](https://linear.app/baddley/issue/BAD-179) | Test fixtures: org setup in 25 HTTP test files, report-card fixtures in 6, and near-identical tags, categories and departments tests | `createOrgFixture()`, `tests/fixtures/report-cards`, `describeNamedLookup()` | M |

Places that reimplement the display-name rule (DUP-03):

- `person-profile-dialog.tsx:32`
- `volunteer-needs.ts:245`
- `feedback.ts:78`
- `access-requests.ts:33` (doesn't trim)
- `reports.ts:40` (returns `""` for empty profiles)
- `person-select.tsx:48`
- `volunteer/[token]/page.tsx:35`
- mobile `format.ts:163`

### Performance

- **PERF-05 — Pages render nothing on the server, then fetch everything after hydration · M.** [BAD-180](https://linear.app/baddley/issue/BAD-180) Every view is a client component that fetches on mount, so each page waits for HTML, then JavaScript, then about 7 API calls that each authenticate again. The prefetch helpers in `src/lib/server/prefetch.ts` exist but are never used. **Fix:** prefetch on the server, `dehydrate`, and wrap views in `HydrationBoundary` inside Suspense. If you don't adopt this, delete the dead code (DEAD-01).
- **PERF-06 — Logo, favicon and avatar routes re-run on every page load · S.** [BAD-181](https://linear.app/baddley/issue/BAD-181)
  - **Where:** `src/app/brand/[kind]/route.ts` 33–38 and `src/app/avatar/[userId]/route.ts`.
  - **Problem:** each request costs about 6 queries, a Blob read with `useCache: false`, and a sharp re-encode for the favicon.
  - **Fix:** the URLs are already versioned with `?v=`, so send `Cache-Control: private, max-age=31536000, immutable`. Create the PNG at upload time.
- **PERF-07 — Email and Linear calls run inline, sequentially, with no timeouts · M.** [BAD-182](https://linear.app/baddley/issue/BAD-182)
  - **Where:** `mail.ts` 38–109, `actions/entries.ts` 51–87, `feedback.ts` 322–388, `volunteer-needs.ts` 740–748, `access-requests.ts` 183–200.
  - **Problem:** in `access-requests.ts`, the decision is saved before the email is sent, so a failed email shows an error even though the decision stuck.
  - **Fix:** send from `after()`, use the Resend batch API, and load each template once per batch.
- **PERF-08 — Over-broad cache invalidation · S.** [BAD-183](https://linear.app/baddley/issue/BAD-183) `use-clock.ts:13` invalidates `["org"]`, which is every org. `keys.organization(id)` is used for single entries in 7 places, so every clock-in re-runs the 35–40-query report. **Fix:** invalidate only the entry, report and unclassified-count keys.
- **PERF-09 — Exports build the whole file in memory with no row limit · M.** [BAD-184](https://linear.app/baddley/issue/BAD-184)
  - **Where:** `reports.ts` 430–452 (CSV) and 515–547 (payroll summed in JavaScript).
  - **Fix:** stream keyset pages through a `ReadableStream`. Compute payroll with `groupBy`, keeping the current per-entry rounding.
- **PERF-10 — The 611 KB `openapi.json` ships to the browser · S.** [BAD-185](https://linear.app/baddley/issue/BAD-185) `developer/api/api-view.tsx` is a client component that imports `api-catalog.ts`. **Fix:** build the groups in the server `page.tsx` and pass them in as props.
- **PERF-11 — The weekly digest does per-person work · S.** [BAD-186](https://linear.app/baddley/issue/BAD-186) `src/lib/email/digest.ts` 150–197 loads every entry and sends one email at a time with 2 settings queries each, and the cron route has no `maxDuration`. **Fix:** use `groupBy(userId)`, load templates and settings once per org, use the batch API, and set `maxDuration`.
- **PERF-12 — Missing indexes and an unbounded table · S.** [BAD-187](https://linear.app/baddley/issue/BAD-187) Add these indexes:
  - `VolunteerSignup(volunteerNeedId, createdAt)`
  - a partial index for open timers on `UserTimeEntry(userId) WHERE mode='Punch' AND "endedAt" IS NULL`
  - `AccessRequest(organizationId, status, createdAt)`
  - `Feedback(status, createdAt)`

  `RefreshToken` rows are never deleted; add a cleanup step to the cron. Set `limitInputPixels` in sharp (`avatar-assets.ts:67`, `brand-assets.ts:59`, `feedback-assets.ts:55`).
- **PERF-13 — Every relation include is a separate query · S.** [BAD-188](https://linear.app/baddley/issue/BAD-188) Enable the `relationJoins` preview feature and use `relationLoadStrategy: "join"` on hot paths: `authenticate`, entry lists and org lists.
- **PERF-14 — Lists re-create lookup maps per row · S.** [BAD-189](https://linear.app/baddley/issue/BAD-189) `EntryRow` calls `useLookups()` once per row (`entry-row.tsx:32`, `use-lookups.ts` 16–23), and grouping copies arrays inside the loop (`entries-view.tsx` 78–84). **Fix:** build the maps once in the parent, wrap `EntryRow` in `memo`, and use `push` when grouping. Consider virtualizing the list.

### Security (Medium and Low that need design work)

- **SEC-15 — Possible open redirect after login · S (verify).** [BAD-190](https://linear.app/baddley/issue/BAD-190) `safeNext` (`src/lib/server/action.ts` 30–32) accepts `/\evil.com`. The `/brand` and `/avatar` routes also 302 to arbitrary `https` URLs. **Fix:** reject backslashes and `//`. Serve only Blob assets and never redirect.
- **SEC-16 — Weak refresh-token reuse detection · M.** [BAD-191](https://linear.app/baddley/issue/BAD-191) `auth.ts` 156–180: reusing a token within 2 minutes silently creates a new session, and later reuse doesn't revoke the token family. **Fix:** store a token family ID, and revoke the whole family on reuse outside the grace window.
- **SEC-17 — Group-session and need-management scope is too broad · S.** [BAD-192](https://linear.app/baddley/issue/BAD-192)
  - `collective.ts` 210–231: `updateCollective` checks only the target department, and any member can read any group session.
  - `volunteer-needs.ts` 316–325 and 627–637: any `create_needs` holder can manage org-wide needs created by others, and published needs can be edited without re-approval. Public sign-up overwrites a guest's name and phone, matched only by email.
- **SEC-18 — Server-action errors may leak internals · S (verify).** [BAD-193](https://linear.app/baddley/issue/BAD-193) `explain()` in `src/lib/api/errors.ts` 81–104 returns the last line of non-API errors to the client. **Fix:** return a generic message plus a correlation ID, and log the detail on the server.

### Testing

- **TEST-04 — Server actions and the session layer · M.** [BAD-194](https://linear.app/baddley/issue/BAD-194) Unit-test `session.ts`, `dal.ts` and `tenant.ts` with mocked cookies and headers. Test that each action returns `{ ok: false }` for a cross-org ID. Fix and test the partial failure in `createEntriesAction`, which saves one person at a time with no transaction (`actions/entries.ts` 47–55).
- **TEST-05 — Money and timezone correctness · M.** [BAD-195](https://linear.app/baddley/issue/BAD-195)
  - Property-style tests for in-kind value, gross pay and collective rounding.
  - An `America/Denver` clock-in that crosses midnight.
  - Report date filters across a daylight-saving change. `time.test.mjs:312` assumes UTC.
- **TEST-06 — Tooling · M.** [BAD-196](https://linear.app/baddley/issue/BAD-196)
  1. Coverage: Vitest with V8, or `--experimental-test-coverage`. Set thresholds on `src/lib/api/**`.
  2. React Testing Library for hooks (`use-clock`, `use-action-mutation`) and key forms.
  3. `@axe-core/playwright` on the existing e2e page visits, so A11Y regressions fail CI.
  4. `jest-expo` for `apps/mobile/src`.
- **TEST-07 — De-flake · S.** [BAD-197](https://linear.app/baddley/issue/BAD-197)
  - Replace the fixed 400 ms sleeps (`feedback.test.mjs` 239 and 361) with a "settled" endpoint on the mail sink.
  - Revoke SuperAdmin in `after()` hooks. It's never revoked today, which silently disables the "last SuperAdmin" assertions (`users.test.mjs` 164–182) on a reused database.
  - Make `waitForCode` match a specific email rather than the last one.
  - Add `retries: 1` for remote Playwright runs only.
- **TEST-08 — `inKind()` test helper re-implements the server formula · S.** [BAD-198](https://linear.app/baddley/issue/BAD-198) `tests/http/client.mjs` 485–487. Assert literal values instead, so a formula bug can't hide in both places.

### Accessibility (Medium)

- **A11Y-10 — No reduced-motion support · S.** [BAD-199](https://linear.app/baddley/issue/BAD-199) Use `motion-safe:` for `animate-ping` in `timer-chip.tsx:27`, the clock animations in `globals.css` 341–381, dialog zooms and chart animations, plus a global `prefers-reduced-motion` rule.
- **A11Y-11 — Highlighted and pressed states are barely visible · S.** [BAD-200](https://linear.app/baddley/issue/BAD-200)
  - Menu, select and searchable-select items use only `focus:bg-accent`, about 1.1:1 against the popup.
  - The toggle's `aria-pressed:bg-muted` is about 1.1:1.
  - The `--input` border colour is about 1.27:1.

  **Fix:** add rings, and bring `--input` to at least 3:1.
- **A11Y-12 — Status changes aren't announced, and errors appear only in toasts · S.** [BAD-201](https://linear.app/baddley/issue/BAD-201) Add `role="status"` or `role="alert"` to the report designer's "Updating…" and error text, the volunteer sign-up success and errors (`volunteer/[token]/signup-form.tsx`), and the markdown editor's errors and counter. Show errors inline, not only as toasts (`people-view.tsx` 104–107).
- **A11Y-13 — State is shown visually only · S.** [BAD-202](https://linear.app/baddley/issue/BAD-202)
  - Org switcher: use `DropdownMenuRadioGroup`.
  - `SectionNav` buttons use `aria-current`; use `aria-pressed` or tabs.
  - Feedback column sort buttons have no `aria-sort`.
  - The feedback-recipient combobox has no `aria-activedescendant`.
- **A11Y-14 — Headings and page titles · S.** [BAD-203](https://linear.app/baddley/issue/BAD-203)
  - `CardTitle` is a `div`, used 44 times.
  - The profile page jumps from h1 to h3.
  - Auth pages have no h1.
  - Three places render a second desktop h1.
  - Page titles **(verify)**: org-name `<title>` tags in `workspace-shell.tsx` 13–15 and `(auth)/layout.tsx` 30 may override per-route titles. Use a `generateMetadata` title template.
  - Detail pages use generic titles ("Need", "Feedback").
- **A11Y-15 — Targets under 24 px · S.** [BAD-204](https://linear.app/baddley/issue/BAD-204)
  - Report card resize handles (8 px)
  - Tag and recipient remove buttons (about 16 px)
  - The EntitySelect create button (`size-5`)
  - "Add day" (`h-5`)
- **A11Y-16 — Markdown editor sets every image's alt text to "Image" · S.** [BAD-205](https://linear.app/baddley/issue/BAD-205) `markdown-editor.tsx:160`. Add an alt-text field. Also check **(verify)** that Cmd/Ctrl+B inside TipTap doesn't toggle the sidebar (`sidebar.tsx` 96–110).
- **A11Y-17 — Mobile app semantics · M.** [BAD-206](https://linear.app/baddley/issue/BAD-206)
  - `FormField` doesn't link its label to the input, and errors aren't announced (`apps/mobile/src/ui.tsx` 250–277).
  - Department and permission toggles have no `accessibilityRole="checkbox"` or state (`people.tsx` 575–637).
  - Tag chips show selection only by colour (`placement.tsx` 245–253).

### Best practices

- **BP-01 — Formatting and line endings · S.** [BAD-207](https://linear.app/baddley/issue/BAD-207) 392 tracked files are CRLF and 246 are LF, and semicolons are mixed. Add `.gitattributes` (`* text=auto eol=lf`), run `git add --renormalize .`, add Prettier and EditorConfig, and add a `format:check` step to CI. Do this in one dedicated commit, before the refactors, so later diffs stay readable.
- **BP-02 — Stricter TypeScript · S–M.** [BAD-208](https://linear.app/baddley/issue/BAD-208)
  - Enable now, at 0 errors each: `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noImplicitReturns`.
  - Then `noUnusedLocals` (5 errors), then `noUncheckedIndexedAccess` (59).
  - Bump `target` to `ES2022`.
  - `scripts/*.mjs` and `tests/http/*.mjs` are never checked. Add `// @ts-check` or move them to TypeScript.
- **BP-03 — One validation system · L.** [BAD-209](https://linear.app/baddley/issue/BAD-209) REST and actions use hand-written `parse*` functions (`src/lib/api/json.ts`); only MCP uses zod. The 611 KB OpenAPI file is maintained by hand. **Fix:** move to zod schemas resource by resource, and generate OpenAPI with `z.toJSONSchema`. Do the security-sensitive resources first.
- **BP-04 — Split `src/lib/api/json.ts` · S.** [BAD-210](https://linear.app/baddley/issue/BAD-210) It is 626 lines with 77 exports, mixing HTTP helpers, parsers, domain unions and money math, and it pulls server code into the client bundle through `queries.ts:2`. Split it into `api/http.ts`, `api/parse.ts`, `domain/enums.ts` and `domain/money.ts`.
- **BP-05 — Node and dependency alignment · S.** [BAD-211](https://linear.app/baddley/issue/BAD-211)
  - Pick Node 24 and set it in `engines`, `.nvmrc`, all 4 workflows (currently 22) and `@types/node` (currently `^20`).
  - Move `shadcn` and `tw-animate-css` to devDependencies.
  - Decide whether to use npm workspaces (`"workspaces": ["apps/*", "packages/*"]`). Versions already drift: TanStack Query `^5.104` vs `^5.106`, and TypeScript 5.9 vs 6.0.
- **BP-06 — Dark mode is half-wired · S.** [BAD-212](https://linear.app/baddley/issue/BAD-212) `next-themes` is used only in `ui/sonner.tsx` and no provider is mounted, so the `.dark` palette and the 26 `dark:` classes can never apply. In OS dark mode, toasts render dark on a light app. **Fix:** pass `theme="light"` and remove the dead code, or mount a provider.
- **BP-07 — Magic strings and missing enums · M.** [BAD-213](https://linear.app/baddley/issue/BAD-213)
  - `rateType`, `accessType`, `projectType`, `HourlyRate.type`, the Feedback, AccessRequest and VolunteerNeed status and type fields, and `Role.code`/`scope` are plain strings.
  - Status casing is inconsistent: `"Pending"` vs `"pending"` vs `"published"`.
  - `RoleCode = string`, and role literals appear 58 times.

  **Fix:** add a constants module (`as const` arrays and derived types) now. Treat Prisma enums as a later, carefully planned migration, because CHECK constraints already exist.
- **BP-08 — Lint rule tuning · S.** [BAD-214](https://linear.app/baddley/issue/BAD-214) Turn `@next/next/no-img-element` off globally with a note (12 inline disables plus 3 warnings), and add `no-console` (allowing warn and error) and `consistent-type-imports`. Lint `apps/mobile` with `expo lint` in CI. It's currently ignored by the root config.
- **BP-09 — One form pattern · S (document), M (migrate).** [BAD-215](https://linear.app/baddley/issue/BAD-215) Forms use either `useActionState` or `useActionMutation`, and `people-view.tsx` and `need-form.tsx` each hold about 14 `useState`s. Standardise on `useActionMutation` plus a `useFormDraft()` helper, and write it down.

### Onboarding and documentation

- **DOC-01 — Architecture overview · M.** [BAD-218](https://linear.app/baddley/issue/BAD-218) Add `docs/architecture.md` covering:
  - The request-flow layers:
    - REST: `src/app/(api)/**`, then `respond()` + `authenticate()`, then `src/lib/api/features/*`
    - Server actions: `src/app/actions/*`, then `run()` + `requireAccess()`, then the same feature modules
    - Pages: `src/lib/server/dal.ts`
    - Client: `src/hooks/*`, then `src/lib/queries.ts`, then `fetchJson`, then REST
    - MCP: `src/lib/mcp/tools/*`, then the feature modules
  - The auth model: JWT, cookies only authenticating GET/HEAD, API keys and scopes, MCP.
  - The tenancy model: subdomains, `pinnedOrganization`, cookie scoping.
  - The permission model: role scopes, `Access.can`, and the gates from DUP-02.
  - Surprising routing: the `(api)` route group at the site root, the `src/app/api/cron` and `(api)/api/feedback` exceptions, `proxy.ts` 84–117 rewriting `/feedback` based on `Accept` and `sec-fetch-dest`, and the `[...slug]` 404 catch-alls.
  - Why the schema uses EF-style `PK_`/`IX_`/`FK_` names, and that `db.ts` 53–70 matches them as substrings, so they must not be renamed.
- **DOC-02 — "Add a resource end to end" checklist · S.** [BAD-219](https://linear.app/baddley/issue/BAD-219) Prisma model and migration → feature module (with an access check) → `route.ts` plus its `[...slug]` catch-all → `npm run openapi -- --write` → server action → query key and hook → MCP tool → HTTP test plus a matrix entry (TEST-02) → `docs/api/http.md`.
- **DOC-03 — Testing guide · S.** [BAD-220](https://linear.app/baddley/issue/BAD-220) Explain which suites need a server on 3025, the mail and Linear sinks, or a database, and how to run each one locally.
- **DOC-04 — Env reference · S.** [BAD-221](https://linear.app/baddley/issue/BAD-221) Generate it from `src/lib/env.ts` (OPS-02).
  - Missing from `.env.example`: `VERCEL_ENV`, `VERCEL_TARGET_ENV`, `API_BASE_URL`, `MAIL_SINK_URL`/`PORT`, `LINEAR_SINK_URL`/`PORT`, `MIGRATION_TEST_DATABASE_URL`, `BASELINE_REFERENCE_URL`, `E2E_*`, `EXPECTED_SHA`, `VERCEL_AUTOMATION_BYPASS_SECRET`, `CASWJ_ORG_NAME`, and mobile's `EXPO_PUBLIC_*`.
  - Listed but never read: `BLOB_STORE_ID`, and `AZURE_*` (used only by a skill).
- **DOC-05 — Fix stale docs · S.** [BAD-222](https://linear.app/baddley/issue/BAD-222)
  - `docs/api/http.md:161` and `voluntime-audit.md` 142 and 177 describe `POST …/imports/departments` as available; it now returns 404.
  - `http.md` is missing `/feedback`, `/brand`, `/webhooks/linear`, access requests, `unclassified-count`, `lookups`, `/usernames/preview`, `clock-cancel` and `clock-reset`.
  - The feature-workflow skill verifies production at `clocked-in.baddley.us`, but the portal doc says `voluntime.app`.
  - `docs/ops/prisma-adoption.md:66` says "GitHub"; it should say Linear.
  - The README setup runs `db:generate`, which `postinstall` already does.
  - The one-time Prisma cutover runbook sits in the setup path; move it to `docs/history/`.
- **DOC-06 — Mobile README · S.** [BAD-223](https://linear.app/baddley/issue/BAD-223) Cover setup, `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WEB_URL`, the Expo-web CORS handling in `proxy.ts` 50–82, and how the app shares code with web (DUP-01).
- **DOC-07 — Product naming · S.** [BAD-224](https://linear.app/baddley/issue/BAD-224) The product appears as `clocked-in` (package and repo), "Voluntime" (README and OpenAPI title), "VolunTime" (UI and manifest) and "ClockedIn" (skills). State in the README that the product is **VolunTime** and the repo codename is `clocked-in`, and fix the README and OpenAPI titles. Don't rename stored identifiers: the `clocked-in-org` cookie, the `clocked-in` IndexedDB name, the MCP server name, or `x-voluntime-tenant`.
- **DOC-08 — Split very large files · M (do it alongside related work, not as one big bang).** [BAD-225](https://linear.app/baddley/issue/BAD-225)

  | File | Lines | Split into |
  | --- | --- | --- |
  | `features/time-entries.ts` | 1153 | parsers; lists; mutations; clock state machine (972–1135); unclassified helpers |
  | `features/feedback.ts` | 860 | the Linear sync and webhook (509–860) move to `feedback-linear.ts` |
  | `features/volunteer-needs.ts` | 799 | question schema; needs; sign-ups; public endpoints |
  | `features/memberships.ts` | 789 | serializers; org memberships; department memberships |
  | `report-layout.ts` | 781 | constants and types; grid geometry; filters; templates |
  | `linear-issues.ts` | 693 | the Slack notifier |

  Also break `people-view.tsx` (725), `feedback-detail.tsx` (679), `time-entry-form.tsx` (643) and `report-designer.tsx` (603) into subcomponents and hooks. Leave the vendored `ui/sidebar.tsx`.
- **DOC-09 — JSDoc on the complex core · S–M.** [BAD-226](https://linear.app/baddley/issue/BAD-226) These files are large and have almost no doc comments:

  | File | Size | Doc blocks |
  | --- | --- | --- |
  | `access.ts` | 536 lines, about 30 methods | 1 |
  | `report-layout.ts` | 61 exports | 2 |
  | `time-entries.ts` | 26 exports | 3 |
  | `memberships.ts` | 23 exports | 0 |
  | `feedback.ts` | 13 exports | 0 |

  Explain `can()` with a department, `visibility()`, `roleScope()`, the clock state machine, and what counts as an unclassified entry.
- **DOC-10 — Make `requireOrganization` calls readable · S.** [BAD-227](https://linear.app/baddley/issue/BAD-227) `Access.requireOrganization(id, admin: boolean)` has 45 call sites passing a bare `true` or `false`. Split it into `requireMember()` and `requireAdmin()`.

### Operations

- **OPS-03 — Committed generated email defaults aren't checked · S.** [BAD-216](https://linear.app/baddley/issue/BAD-216) `emails/defaults.ts`, the `emails/*.tsx` previews and the committed `emails/dist/defaults.json` (imported at `mail.ts:1`) are kept in sync by hand. Add a CI check that regenerates `dist` and diffs it.
- **OPS-04 — Cron hardening · S.** [BAD-217](https://linear.app/baddley/issue/BAD-217) `src/app/api/cron/email-digest/route.ts` 7–9 compares the secret with `!==`; use `timingSafeEqual`. Return the standard API error shape, and set `maxDuration`.

---

## P3 — Low (fix when you're in the area)

### Unused code (each confirmed with a search)

- **DEAD-01 — Files nothing imports.** [BAD-228](https://linear.app/baddley/issue/BAD-228)
  - `src/lib/server/prefetch.ts` (unless you adopt PERF-05), along with the `dal.ts` helpers only it uses (`getLookups`, `getMembers`, `getInvitations`, `getEntries`, `getGroupSessions`, `getOpenPunch`, `getReport`)
  - `src/components/share-bar.tsx`
  - `src/components/stat-card.tsx`
  - `src/components/ui/progress.tsx`
  - `src/lib/utils.ts`: 54 files import `cn` from the `cn` package instead. Pick one; the shadcn convention is `@/lib/utils`.
  - `settings/email-templates/email-templates-view.tsx`
- **DEAD-02 — Dead exports.** [BAD-229](https://linear.app/baddley/issue/BAD-229)
  - `archiveTagAction`
  - `DepartmentForm`, `TaskCategoryForm`, `TagForm`, `CreateTagDialog`
  - `HeaderSkeleton`, `StatsSkeleton`
  - `seedDefaultHourlyRate`
  - `importDepartments` (about 90 lines; its route is a 404 stub)
  - `unclassifiedWhere` (reuse it in PERF-03 instead)
  - `SystemRoleCode`, `sendJson`, `orderUserIds`, `isNeedStatus`, `appHost`, `ValueIcon`, `contentWidth`
  - `hasPermission` and `workspaceCan` (duplicates of each other, both unused)
  - `savedReportDataQuery`, `viewCsvUrl`

  About 120 more exports are used only inside their own file; drop the `export` keyword, or add `knip` to CI to keep this from coming back.
- **DEAD-03 — The `PlatformApiKey` model has 0 references in code.** [BAD-230](https://linear.app/baddley/issue/BAD-230) It survives only as 2 orphan OpenAPI schemas. Drop it with a migration, or mark it inert with a `///` comment.
- **DEAD-04 — Unused scripts and assets.** [BAD-231](https://linear.app/baddley/issue/BAD-231)
  - `scripts/render-feedback-resolved-pdf.mjs`
  - `scripts/archive-caswj-clockify-duplicates.ts`
  - `.brand-mesh` in `globals.css` 154–160
  - 5 create-next-app SVGs in `public/` (`vercel`, `next`, `window`, `globe`, `file`)
  - `@react-email/render`, if nothing imports it
  - the duplicate npm scripts `test:http:next` and `test:contract`, which repeat `test:http`
- **DEAD-05 — Legacy redirect-only pages.** [BAD-232](https://linear.app/baddley/issue/BAD-232) `/groups`, `/settings/members`, `/settings/roles`, `/settings/api-keys` and `/settings/email-templates`. Move them into `next.config` `redirects()`. Also, `settings/email/[id]/page.tsx` imports its component from the sibling `email-templates/[id]` route folder; move that component to a shared location.
- **DEAD-06 — Unreachable and leftover code.** [BAD-233](https://linear.app/baddley/issue/BAD-233)
  - `access.ts:125` can never be true, because line 119 already returned for the same condition.
  - `time-entries.ts:973`: `const pinned` is unused, but the call matters; rename it to `assertTenant()`.
  - `about-prototype-view.tsx:39` has an unused `projects` variable.

### Security (Low)

- **SEC-19 — Org name disclosure.** [BAD-234](https://linear.app/baddley/issue/BAD-234) `getAuthBrand` (`src/lib/server/auth-brand.ts` 26–39) trusts the `clocked-in-org` cookie when logged out, so anyone can read an org's name and branding by UUID.
- **SEC-20 — CORS.** [BAD-235](https://linear.app/baddley/issue/BAD-235) `proxy.ts` 51–82 reflects any localhost or private-IP origin. It's harmless today because credentials aren't allowed, but restrict it to development.
- **SEC-21 — Public metadata.** [BAD-236](https://linear.app/baddley/issue/BAD-236) `/health` exposes the commit SHA, and feedback attachments live in public Blob storage under unguessable paths. Decide whether both are acceptable.
- **SEC-22 — API keys write on every call.** [BAD-237](https://linear.app/baddley/issue/BAD-237) `lastUsedAt` is updated on every API-key request (`access.ts` 508–512). Throttle it to once every 5 minutes; this is also a performance fix.

### Performance (Low)

- **PERF-15 — Large libraries load eagerly.** [BAD-238](https://linear.app/baddley/issue/BAD-238) Load TipTap through `next/dynamic` for read-only viewers (`organization-view.tsx`, `profile-form.tsx`; about 165 KB gzipped). Load Recharts lazily on the dashboard (about 120 KB gzipped).
- **PERF-16 — Workspace payload too large.** [BAD-239](https://linear.app/baddley/issue/BAD-239) It sends up to 100 full orgs, markdown descriptions included (`organizations.ts` 206–242), and `getCurrentOrganization` runs `listOrganizations` again. Send only the switcher fields.
- **PERF-17 — People and feedback pages.** [BAD-240](https://linear.app/baddley/issue/BAD-240) `people-view.tsx` 292 and 375 render both the desktop table and the mobile list. The report-grid drag isn't throttled with `requestAnimationFrame`. Feedback queries use `staleTime: 0` with refetch on focus (`queries.ts` 304–325).
- **PERF-18 — Smaller query fixes.** [BAD-241](https://linear.app/baddley/issue/BAD-241) Look up the open timer with one `findFirst` (`queries.ts` 262–270). Batch-insert multi-day entries with `createManyAndReturn` (`time-entries.ts` 826–842).
- **PERF-19 — Lists silently cap at 100.** [BAD-242](https://linear.app/baddley/issue/BAD-242) Lookups, members and orgs stop at 100 (`lookups.ts:10`, `dal.ts:54,129`). This is a correctness risk for large orgs: paginate, or raise the cap and show a warning.

### Accessibility (Low)

- **A11Y-18 — New-tab links and table semantics.** [BAD-243](https://linear.app/baddley/issue/BAD-243) 10 links open a new tab without saying so; add sr-only "(opens in new tab)". Tables have no caption or link to their card title, and the needs actions column has an empty header.
- **A11Y-19 — Generic or unclear names.** [BAD-244](https://linear.app/baddley/issue/BAD-244) "Entry actions", "Session actions", "Remove question" and repeated "Sign up" links need the item name added. The running timer link is named only by its time, such as "00:12:34".
- **A11Y-20 — Keyboard ergonomics.** [BAD-245](https://linear.app/baddley/issue/BAD-245)
  - The avatar field has three tab stops for one action (`avatar-field.tsx` 97–130).
  - Formatting toolbars aren't arrow-key navigable (`markdown-editor.tsx`, `email-template-editor.tsx`).
  - The mobile sidebar trigger has no `aria-expanded`.
  - Truncated import cells show full text only on hover (`title`).
  - The icon-picker result count isn't in a live region.
- **A11Y-21 — Forms.** [BAD-246](https://linear.app/baddley/issue/BAD-246) Required fields aren't marked visually. Volunteer sign-up disables "Sign up" with no explanation until the checkbox is ticked.
- **A11Y-22 — Mobile.** [BAD-247](https://linear.app/baddley/issue/BAD-247) Report cards and rows aren't announced as buttons or links (`report-grid.tsx` 138–283). The tag-remove touch target is about 24 pt, under the 44 pt platform guideline.

### Onboarding (Low)

- **DOC-11 — Small renames and moves.** [BAD-248](https://linear.app/baddley/issue/BAD-248) Rename the `about-prototype` route, which is really the admin Guide, to `/guide` with a redirect. Rename `prisma7.config.ts` to `prisma.config.ts` so 4 scripts can drop the `--config` flag. Retire the Azure skill (`.cursor/skills/azure-login`) if Azure is gone.
- **DOC-12 — Silent JSON fallback.** [BAD-249](https://linear.app/baddley/issue/BAD-249) `themes.ts:35` and `feedback.ts:99` silently turn invalid stored JSON into `[]`; log a warning instead.
- **DOC-13 — Mobile web-URL helper.** [BAD-250](https://linear.app/baddley/issue/BAD-250) It's copied 5 times in `apps/mobile` (`shell.tsx:41`, `reports.tsx:37`, `settings.tsx:63`, `dashboard.tsx:19`, `needs/[id].tsx:11`).

---

## P4 — Nits and optional polish

- **NIT-01** [BAD-251](https://linear.app/baddley/issue/BAD-251) · 231 `as` casts and 13 non-null `!.` assertions in `src`. Review them as files are touched; the 2 `as unknown as` casts are justified.
- **NIT-02** [BAD-252](https://linear.app/baddley/issue/BAD-252) · `console.*` prefixes are inconsistent (`[linear]`, `[slack]`, none). Consider a small structured logger, `log.warn({ area, ... })`.
- **NIT-03** [BAD-253](https://linear.app/baddley/issue/BAD-253) · `next.config.ts:8` still has the template comment `/* config options here */`.
- **NIT-04** [BAD-254](https://linear.app/baddley/issue/BAD-254) · `ReactQueryDevtools` is in `dependencies`. It's excluded from production builds anyway, so moving it is cosmetic.
- **NIT-05** [BAD-255](https://linear.app/baddley/issue/BAD-255) · `scripts/app-env.mjs` hand-writes an env-file parser even though `dotenv` is a dev dependency.
- *(No ticket; no action needed.)* Vendored shadcn components have unused sub-exports (for example, 10 in `sidebar.tsx`). Leave them.
- **NIT-06** [BAD-256](https://linear.app/baddley/issue/BAD-256) · `.vscode/settings.json` is tracked. Keep it if it's shared intentionally, and add `extensions.json` for Prettier and ESLint.
- **NIT-07** [BAD-257](https://linear.app/baddley/issue/BAD-257) · The 38 `[...slug]/route.ts` catch-alls: 35 are byte-identical, and 3 differ only by CRLF line endings. Keep the pattern (one root catch-all would also swallow page 404s), but add a comment in `src/lib/api/missing.ts` and a test or generator that checks every API prefix has one.
- **NIT-08** [BAD-258](https://linear.app/baddley/issue/BAD-258) · The OpenAPI schemas use a .NET-style `Dto` suffix (238 refs). Rename them only if you regenerate from zod (BP-03).
- **NIT-09** [BAD-259](https://linear.app/baddley/issue/BAD-259) · `tests/proxy.test.ts:12` still sets the retired `CSHARP_API_URL`.

---

## Suggested roadmap

The order matters: P0 fixes first, then guardrails, then refactors under those guardrails.

| Phase | Work | Why in this order |
| --- | --- | --- |
| **0. Stop the line** (week 1) | SEC-01 → SEC-06, DATA-01, REPO-01, each with its regression test (TEST-03). | Exploitable now. Ship as small, separate PRs so each can be reviewed and reverted on its own. |
| **1. Guardrails** (week 2) | CI-01, TEST-01, BP-01 (one dedicated formatting commit), REPO-02, OPS-01, OPS-02. | Every later change runs against lint, typecheck and the HTTP suite. Formatting goes first so later diffs stay readable. |
| **2. Isolation hardening** (weeks 2–4) | TEST-02 matrix, then SEC-07 → SEC-14, and SEC-10 together with DUP-02 (shared gates). | The matrix catches regressions while permission checks move to the server. |
| **3. Accessibility pass** (weeks 3–5, in parallel) | A11Y-01 → A11Y-09, then `@axe-core/playwright` in e2e (TEST-06). | Mostly independent UI work. Axe keeps the fixes from regressing. |
| **4. Performance** (weeks 4–6) | PERF-01 → PERF-04, then PERF-05 → PERF-14. | DATA-01 (pool size) has to land first, or parallelising queries gains nothing. |
| **5. Structure** (month 2) | DUP-01 (shared package), then DUP-03 → DUP-16, BP-02 → BP-09, DOC-01 → DOC-10, splitting large files alongside the refactors. | Needs the guardrails from phase 1. The shared package depends on REPO-02. |
| **6. Ongoing** | P3 and P4 items when touching nearby code; add `knip` to CI for unused exports. | Low risk; keeps the debt from coming back. |

## Items to verify at runtime

These are believed to be real but were found by reading code only:

1. **DATA-01:** P2028 or "Transaction already closed" errors in staging and production logs on clock-out, cancel or reset clock, and need vet/unvet.
2. **SEC-15:** `safeNext("/\\evil.com")` actually redirects off-site in Chrome and Safari.
3. **SEC-18:** which Prisma and Node error messages reach the client through `explain()`.
4. **A11Y-14:** whether the org-name `<title>` overrides per-route titles under React 19 hoisting.
5. **A11Y-16:** whether Cmd/Ctrl+B in TipTap also toggles the sidebar.
6. **REPO-01:** whether the PDFs and workbooks in `docs/` contain real volunteer data, and whether the Azure SQL server still exists.

## What's already solid (keep doing this)

- **Security basics:**
  - JWT: HS256 pinned, issuer, audience and `exp` required, key of at least 32 characters.
  - Cookies: `httpOnly`, `SameSite=Lax`, `Secure`, host-only, and they authenticate only GET/HEAD API calls.
  - Passwords and reset requests: bcrypt cost 12 with a dummy hash for unknown users, generic reset responses, and a password change revokes refresh tokens.
  - API keys: HMAC with a pepper, constant-time compare, enforced scopes.
- **Tenant pinning only narrows access.** Foreign-key ownership is checked for most resources: projects, task categories, tags, departments, rates, themes, roles, templates, saved reports, connections and invitations.
- **Injection and rendering:** all raw SQL is parameterized. Markdown is rendered without raw HTML. The email sanitizer uses an allowlist, and the template preview iframe is sandboxed. CSV exports are formula-escaped. Uploads are size- and type-checked and re-encoded with sharp. The Linear webhook checks its HMAC with a timestamp window, and Turnstile fails closed.
- **Code quality:** `strict` TypeScript, 0 `any`, 0 `@ts-ignore`, no TODOs or commented-out code, and `src` typechecks cleanly. REST, server actions and MCP all go through the same feature modules, so business logic isn't written three times.
- **Tests:** HTTP contract tests assert full response shapes and literal money values. CI already runs migration tests against an isolated Postgres.
- **Accessibility:** dialogs are built on Base UI with titles. Almost all icon buttons are labelled, and lucide hides decorative icons. The image uploader and avatar editor are good models to copy, and pie charts already have text legends with links.
