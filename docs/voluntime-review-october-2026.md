# VolunTime review for Dillon

**27–29 October 2026**

Jason, thank you for the letter. We really love where this is headed too. Below is an honest score against the October 15 brief and your October 27 staging notes, plus answers to the five questions.

I walked the **current app** (the build with your feedback items) as an admin: log time, reports, people, import, roles, Needs, and the dashboard. The public staging and production sites were not reachable when I wrote this (Vercel returned “deployment not found”). Treat this as what the product does **now**, not what you could click on staging that night.

Status words: **Met**, **Partial**, **Not yet**, **Beyond the ask**.

---

## Grant numbers still hold

The 2026 Volunteer Hours workbook still loads as:

| Measure | Value |
| --- | --- |
| Entries | 249 |
| Hours | 14,609.42 |
| Unique volunteers | 17 |
| In-kind | $517,273.91 |
| Default rate | $35.47 |

Those totals are the grant invariant. Staging uses anonymized names so real volunteer identities stay off shared databases.

---

## 1. Minimum requirements (15 October brief)

| What you asked for | Status | What’s there now |
| --- | --- | --- |
| Replace Clockify and the sheet; in-kind at $35.47 | **Met** | Live timer, start and duration, total hours, reports, CSV. Default volunteer rate is $35.47. Professional rates exist for people who need them. |
| Invite by email **or** a basic enrollment form | **Met** | Invite (name + email + role), admin “Add person,” and optional public Create account. The CASWJ portal can turn Create account off. |
| Volunteer and admin; no approval step for entries | **Met**, then **Beyond the ask** | Entries go live on save. We also have Group manager, Staff, and custom roles. |
| Settings for groups, task categories, and tags | **Met** | Groups (called Organizations until CASWJ labels are on), projects/events, categories, tags, rates, brand, theme, and email controls/templates. |
| Live timer, start and end, or total hours | **Met** | Timer on Log time. Manual form: “Start and duration” or “Total hours” (date + HH:MM, no fake clock times). |
| Date, group, project/event, category, tags, notes, who entered it | **Met** | Project and category can be left blank on the timer (and, today, on handwritten hours) so people can classify later. Entered-by is stored separately from whose hours they are. |
| Reports by group, category, person, date range + CSV | **Met**, then **Beyond the ask** | Summary, People, Group sessions, and Staff tabs. Volunteer Log and Summary CSVs in grant format, plus “Download this view.” |
| Import 2026 hours; match 14,609 | **Met** | Local named seed matches the workbook. Staging seed is anonymized. |
| Fix Clockify problems (fake times, entered-by, shared accounts, missing fields, 999-hour cap) | **Met** | Total-hours mode, individual accounts, entered-by vs volunteer, 999-hour cap on totals (24 hours on a timer/duration punch). Missing fields become **unclassified** instead of disappearing. |
| CASWJ look (navy sidebar, gold, wordmark, flame, approved gradients) | **Met for a tenant** | Platform chrome stays VolunTime. Navy and gold tokens, gradients, and upload slots are there. CASWJ uploads its own wordmark and mark. The product does not ship a flame. |
| Host at `portal.wjarts.org` or `wjarts.org/portal`; CASWJ-owned production | **Amended** | VolunTime stays one multi-tenant deployment. CASWJ is a tenant at `{slug}.voluntime.app`, alongside sister tenants and other communities. A CASWJ-owned project and a path on wjarts.org are not the plan. |
| Keep real names, emails, and zips out of development | **Met** | Named workbook is local-only. Staging uses the anonymized Clockify sample. |

Later items from the brief:

| Later item | Status |
| --- | --- |
| Volunteer coordinator limited to their group(s) | **Met** as Group manager (one or more groups) |
| Admin staff role | **Met** as the optional Staff role. Every tenant can assign it. It is not hidden on the CASWJ tenant. |
| Paid staff time tracking | **Met** as gross pay, not a payroll processor. A Paid rate stores zero in-kind, stays out of the grant CSVs, and appears on the admin-only Payroll report (person, group, hours, pay rate, gross pay). |

---

## 2. Your 27 October feedback

### Roles and access

| Ask | Status | What’s there now |
| --- | --- | --- |
| Three levels that can log time for everyone below | **Met** | **Admin** (CASWJ staff) → **Group manager** (one or more groups) → **Volunteer**. Each can log for the people they cover. |
| Group managers on several groups, combined reports | **Met** | People and invite screens assign Group manager per group. Reports combine the groups they lead. |
| Event-level totals (a show night with 40 helpers) | **Met** | Log Group Time: a session with a headcount, kept off unique-volunteer counts. |
| Volunteer requests more access; admin approves or declines | **Met** | Request from the profile; admin sees it on People. |
| Custom roles / permissions table | **Met**, **Beyond the ask** | Settings → Roles. Admins can add a role and tick what it can do. |

### Inviting and importing people

| Ask | Status | What’s there now |
| --- | --- | --- |
| First and last name on the invite | **Met** | Invite form asks for both. |
| Username from first initial + last name (`jsmith`, then `jsmith1`) | **Met** | Reserved when you invite; the email tells them their username. |
| Subject like “CASWJ invited you to join VolunTime” | **Met** | Subject is “{tenant} invited you to join VolunTime.” Preview: “Log your volunteer hours with {tenant}.” Editable under Settings → Email along with all 13 tenant email templates. |
| Review list before mass invitations; say whether import sends mail | **Met** | Import copy is explicit: it **creates accounts** and does **not** send invitations unless you check “Email users welcome credentials after import” (off by default). Review list supports skip or merge on matches. |
| Duplicate / near-match flags | **Met** | Same email, or same name with a different email, is flagged. |
| CSV templates | **Met** | “Download template” for People and for Projects / Events. |
| Drop the Groups import | **Met** | Import is People and Projects only. Add groups one at a time on the Groups screen. |

### Projects and events

| Ask | Status | What’s there now |
| --- | --- | --- |
| Archive old projects (stay in reports, leave dropdowns) | **Met** | Same pattern as hourly rates. |
| “+ New project / event” from any picker | **Met** | On logging time, group sessions, and Needs. |

### Needs

| Ask | Status | What’s there now |
| --- | --- | --- |
| One public listings page for wjarts.org and social | **Met** | `/openings/{tenant-slug}` lists every public need. Each need still has its own sign-up link. |
| Group manager posts a need; admin approves | **Met** | Without approval permission, the need stays pending until an admin publishes or rejects it. |
| Vetting and custom questions | **Met** | Already fit this flow. |

### Classifying time and the dashboard

| Ask | Status | What’s there now |
| --- | --- | --- |
| Reminder after stopping the timer | **Met** | “Check this time before saving.” You can leave project, category, and group blank and classify later. |
| Unclassified entries + a nudge | **Met** | Blank project, category, **and** group = unclassified. Banner in the app and an email that points at those entries. Under Settings → Email, admins control when emails go out (`Immediately`, `Weekly digest`, or `Off` for logged-time and unclassified-entry emails, plus On/Off toggles for optional notifications). |
| Hide Tags when the org has none | **Met** | Volunteers do not see Tags until you add some. Admins still see the field so they can create the first one. |
| Clickable dashboard cards | **Met** | Cards and charts open the entries behind them. You can also edit the dashboard layout. |

### Reports and exports

| Ask | Status | What’s there now |
| --- | --- | --- |
| Export what you see, or the full log for a date range | **Met** | Actions → **Download this view**, plus Volunteer Log and Summary in grant format. Date range is on the page. |
| Shape columns, filters, sorts; save as a custom report | **Met** | Actions → **Create custom report**, and **Edit template** on the standard views. |

### Cleanup

| Ask | Status | What’s there now |
| --- | --- | --- |
| Triple-listed groups (group + project + “(Org)” tag; categories as “(Type)” tags) | **Met** on a fresh CASWJ seed | The Clockify leftovers are archived so they drop out of dropdowns and stay out of new entries. If an older staging database was never re-seeded, those rows can still be sitting there — worth a once-over before launch. |

---

## 3. Answers to your open questions

### Does importing people send invitations automatically?

**No.** Import creates the person’s account right away. It does not send an invite unless the admin checks **Email users welcome credentials after import** (off by default). That email is a welcome with username and a temporary password, not the “CASWJ invited you to join VolunTime” invite. Existing emails are skipped (or merged if the admin picks merge on the review list).

If you want someone to accept an invite and pick their own password, use **Invite**, not Import.

### Can a group coordinator manage more than one group today?

**Yes.** On People (and on invite / access-request), an admin can assign someone to several groups and mark **Group manager** on each one they lead. That person can log time and run reports for those groups together. They do not see groups they were not assigned.

### Should the timer save without project, task category, and group?

**Yes for the timer.** The original brief made tenant and category required so Clockify’s blank fields would not come back. Your letter asked for a classify-after path. The app does both:

- **Timer:** you can start and stop without a project, category, or group. After Stop, “Check this time before saving” asks you to confirm those fields, and says you can leave them blank and classify later.
- Blank on all three is **unclassified**. The volunteer gets a banner and an email pointing at those entries (admins can set both **Logged time** and **Unclassified entry** emails to **Immediately**, **Weekly digest**, or **Off** under **Settings → Email**).
- **Handwritten duration and total hours:** project and task category are required before save. Group may stay the whole tenant. Those rows cannot sit unclassified.

That is the rule: classify-after stays on the timer; typed grant hours must name a project and a category.

### What should we call the levels?

Match how volunteers talk. CASWJ is already labeled this way when we seed it:

- **CASWJ** — the tenant
- **Group** — Symphony, Youth Theatre, and the other affiliates (not “organization”)
- **Project / Event** and **Task Category** — unchanged

Access levels to use in the product and in conversation:

- **Admin** — CASWJ staff. Your “Super admin.” Do not call this Super admin in the app; that name is reserved for platform ops.
- **Group manager** — a leader of one or more groups
- **Volunteer** — everyone else; own time and own history, and they can request more access

We also have an optional **Staff** role (they can see reports, including a Staff tab). It stays available for every tenant, including CASWJ. An tenant that does not want it simply does not assign it.

### Is sign-up from a public Need the same as self-signup?

**No.** Signing up for a public Need records interest (name, email, optional vetting). It does **not** create a VolunTime login.

The form has a separate checkbox: **Also request an account so I can log hours in VolunTime.** That sends an access request an Admin approves. Until then, the person is a guest on that Need only.

Open **Create account** is a different path, and the CASWJ portal can turn it off so people join by invite or by that Need request.

---

## 4. Improvements you did not have to ask for

You already named the big ones: in-kind on every hour, group sessions, and the Needs board.

On top of the brief we also shipped:

- Custom roles and a permissions table (beyond volunteer / admin)
- Saved and designed reports, including “download this view”
- A public openings page plus vetting
- People only see what their role allows (the internship prototype did not)
- Invite-first portal mode so CASWJ can turn off open signup
- An anonymized staging seed so real volunteer names stay off shared databases
- A Staff report tab (hours that used a professional rate), without pretending this is payroll
- Email send controls and editable templates under **Settings → Email** (admins choose **Immediately**, **Weekly digest**, or **Off** for logged-time and unclassified-entry emails, toggle optional notifications on or off, and edit the subject, preview, heading, and body of all 13 tenant email templates)

---

## 5. Decisions since this letter

Updated 5 November 2026.

1. **Hosting.** VolunTime is multi-tenant on `voluntime.app`. CASWJ is one tenant. Sister tenants and other communities each get a slug on the same deployment. `portal.wjarts.org` and a CASWJ-owned project are not the plan. The runbook is [ops/caswj-portal.md](ops/caswj-portal.md).
2. **Chrome.** The platform name stays VolunTime. Each tenant uploads its own wordmark and mark. We do not invent a flame.
3. **Staff.** The Staff role stays available. Tenants that do not want it do not assign it.
4. **Public needs URL.** `/openings/{tenant-slug}` is the page to share.
5. **Handwritten hours.** Duration and Total require a project and a task category. The timer may stay unclassified. Immediate email still goes out on an unclassified clock-out. Weekly digest sends when that setting is Weekly.
6. **Paid time.** A Paid rate records gross pay, stores in-kind as zero, and is left out of the volunteer grant CSVs. Admins with `view_payroll` see the Payroll report. This is not tax withholding or pay stubs.
7. **Clockify leftovers.** A fresh CASWJ seed archives duplicate projects and `(Org)` / `(Type)` tags. The same pass can be run again with `tsx scripts/archive-caswj-clockify-duplicates.ts` on an older database.

The grant math is unchanged. The product is a multi-tenant hour tracker, not a CASWJ-owned portal.
