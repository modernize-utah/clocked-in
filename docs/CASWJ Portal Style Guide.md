[Cultural Arts Society of West JordanCASWJPortal style guide](#overview)

- [OverviewOverview](#overview)
- [ColorsColors](#colors)
- [TypographyTypography](#type)
- [Spacing and motionSpacing and motion](#shape)
- [ButtonsButtons](#buttons)
- [LinksLinks](#links)
- [Form fieldsForm fields](#forms)
- [MessagesMessages](#messages)
- [Status labelsStatus labels](#status)
- [TablesTables](#tables)
- [CardsCards](#cards)
- [NavigationNavigation](#navigation)
- [ChartsCharts](#charts)
- [ListsLists](#lists)
- [IconsIcons](#icons)
- [LogoLogo](#logo)
- [LoadingLoading](#loading)
- [PagesPages](#pages)
- [2026 review2026 review](#review)

Sample page · not live data

[Back to wjarts.org](https://wjarts.org)

## Overview

Portal / Design / Style guide

# CASWJ Portal Style Guide

Every element in portal.wjarts.org, live. Hover, press, tab and type to see each one move. Every style has an ID: press an ID to copy it, then tell Claude which ID to use where. Open **Edit styles** to change colors, corners, sizes and motion; your changes show across the whole page and are kept when you save.

Show [x] Motion on Theme Dark theme approved 2026-11-12 (THM-01); built in the portal in 0.32.0 (2026-11-17).

**Approved by Dillon, 2026-11-11.** Every element style on this page is approved. Styles approved today are not in the portal yet; each one goes in through a task with its own acceptance criteria. The 2026 review at the end still lists accessibility work that is not a style and is not yet approved. Names and numbers on this page are examples, not real records.

Example: the People page, built only from the styles below

Portal / People

### People

Tenant

Role

Search

|  |  |  |  | Actions |
| --- | --- | --- | --- | --- |
| [Jordan Example](#tables)jordan@example.com | Board member | West Jordan Symphony | Active |  |
| [Alex Example](#tables)alex@example.com | Chair | West Jordan Youth Theatre | Invited |  |
| [Sam Example](#tables)sam@example.com | Staff | CASWJ | Active |  |
| [Riley Example](#tables)riley@example.com | — | Example Chorale | Access ended |  |

## Colors

Navy text on white; pink, gold and teal are accents and never text on white. Ratios update as you edit.

COL-01

**Navy**Text, headings, sidebar, primary buttons

COL-02

**Paper**Page and card background; text on navy

COL-03

**Panel**Signed-in page background

COL-04

**Mist**Shaded areas, read-only fields, hovers

COL-05

**Rule**Dividers and borders

COL-06

**Muted**Secondary text, field borders

COL-07

**Ink soft**Supporting text; primary hover

COL-08

**Deep teal**Links, always underlined

COL-09

**Gold**Accent; text only on navy

COL-10

**Pink**Accent; problem bar; text only on navy

COL-11

**Teal**Accent; approved; text only on navy

COL-12

**Orange**Gradient band only

COL-13

**Lime**Gradient band only

COL-14

**Gold hover**Gold button on hover

COL-15

**Problem tint**Behind problem messages

COL-16

**On-navy soft**Secondary text on navy

Balance on any screen: 55% white, 25% navy, 10% gold, 5% pink, 5% teal

Gradient band (6px)

Dark themeApproved`[data-portal-theme=dark] on the page root`

Use the **Theme** chips at the top of the page to see every element in dark. Navy stays the brand anchor: deep navy backgrounds, near-white text, lighter teal links, and borders in place of shadows. Primary buttons turn gold with navy text, the brand's own button for navy backgrounds. The swatches above show each color's contrast in the theme you are viewing. People choose Match my device, Light, or Dark under **Appearance** on their own profile (**My profile** in the menu); the choice is saved to their account. Built in 0.32.0 (Style batch 5, 2026-11-17), with one 2px focus ring (P-02), the radius tokens renamed (`--caswj-radius-nav` 10px, `--caswj-radius-button` 6px) and two breakpoints only, 767px and 560px.

## Typography

Headings, labels and buttons in Helvetica Neue (Arimo on the web); body in Avenir Next (Nunito Sans on the web). Sizes and fonts are editable.

Page titleApproved`h1`

# Annual report

Section titleApproved`h2`

## Reporting periods

Card titleApproved`h3`

### Your tasks this month

ScoreApproved`score-big`

8.4

ButtonApproved`button`

Submit report

Table headingApproved`table-head`

Tenant

KickerApproved`kicker`

Monthly check-in

BodyApproved`body`

Enter attendance for each event this month. Counts save as you type, and nothing goes to staff until you press Submit.

HintApproved`body-small`

Calendar weeks run Sunday through Saturday.

CaptionApproved`caption`

Portal / People / Jordan Example

## Spacing, corners and motion

Mostly a 4px grid. Borders, not shadows. Every animation uses the same few timings, and none play for people who turn motion off.

Spacing scaleApproved

`space-4`

`space-8`

`space-12`

`space-16`

`space-24`

`space-32`

`space-40`

`space-48`

CornersApproved

Buttons`radius-button`

Fields`radius-field`

Menu links`radius-nav`

Cards`radius-card`

Status labels`radius-pill`

Space between stacked boxes· Built in 0.37.0 (Step 17): one rule at the end of app/globals.css, on every page; still Proposed until Dillon approvesProposed`card, section, notice, message + the next one · space-24`

Final, version 4, November 10, 2026. [Open the final report](#)

Submitted by Sample Chair on November 10, 2026. The report is read-only.

### Introduction

Each card, section, notice or message that comes right after another gets 24px (space-24) above it. Boxes in a grid or a row keep their own gaps.

### Tenant

Step 17 (issue #54), Proposed 2026-11-18.

Motion, live

Press: sink, then springApproved`transform · dur-press, dur-release, ease-spring`

Sinks to 95% in 80ms, springs back in 300ms.

Rolling numbersApproved`stagger 100ms · ease-spring`

Changed digits roll, 100ms apart.

Success: draw the winApproved`dur-success 470ms`

Circle, then tick: 470ms.

Expand: fast, then slowApproved`grid-template-rows · dur-expand 350ms · ease-out`

Any public performance, workshop or class your tenant runs. Rehearsals are counted separately.

## Buttons

Bold Helvetica 16px, 6px corners, at least 44px tall. One primary action per screen. Hover, press, tab to focus, and try the busy state.

Primary· click to see the busy stateApproved`.btn .btn-primary`

Outline (secondary)Approved`.btn .btn-secondary`

Gold (on navy)· on navy onlyApproved`.btn .btn-gold`

SmallApproved`.btn .btn-small (with -primary or -secondary)`

Link buttonApproved`.link-button`

Questions?

Approve pillApproved`.approve, .approve.done, .approve[aria-disabled]`

Hover or tab to reveal the words; click the first one.

Menu button (phone)· click to openApproved`.menu-button`

Collapse edge button· collapses this page's menuApproved`.collapse-button .edge-circle`

Large call to actionApproved`.btn .btn-cta`

Icon buttonApproved`.icon-btn`

Filter chip· in the portal since 0.30.0 (Metrics Status; Feedback Sent to, Kind, GitHub issue)· 0.33.0 (Step 13): finance form chips in Financial compliance, one at a time, with the Google Form in a full-width 900px frame and an “Open in a new tab” linkProposedApproved`.chip[aria-pressed]`

Filter chip with an icon· Option 2, built in 0.35.0, approved by Dillon 2026-11-18 (Step 15): the finance form chips on the Finance forms page (components/FinanceForms.tsx). The icon sits in a light-teal circle; on the pressed chip the circle turns white with a navy icon. Administrators pick each form's icon from 8. Press a chip to try it. Options 1 and 3 removed.Approved Nov 18`.chip.chip-icon .ci-dot`

Option 2 · Icon in a teal circle (built)

## Links

Deep teal and always underlined; navy on hover. Links go somewhere; buttons do something.

Body linkApproved`a`

Read the [reporting guide](#links) before you start.

Back link on navy· gold on hoverApproved`.back-link`

[Back to wjarts.org](#links)

Skip linkApproved`.skip-link`

Press Tab from the top of any portal page: “Skip to main content” appears first.

BreadcrumbApproved`.breadcrumb`

[Portal](#overview) / [People](#tables) / Jordan Example

## Form fields

Labels above, 16px text so phones don't zoom, 44px tall. Type in the fields: the attendance check and autosave are live.

Text inputApproved`.field input`

Email address

SelectApproved`.field select`

Tenant

Multi-line textApproved`.field textarea`

What went well this season?

CheckboxApproved`.check input`

[x] Send me a copy

Sign-in code (one field)· monospace, approved 2026-11-11Approved`#code / input.code`

Sign-in code

Read-onlyApproved`.field input[readonly]`

Fiscal year

BusyApproved`.field input[aria-busy=true]`

Email address

Field problem line· type a number to clear itApproved`.field-problem`

Attendance

Enter a whole number, 0 or more.

Group (fieldset)Approved`fieldset.field`

Who can see this? Staff only Staff and board

Filters rowApproved`.filters`

Season

Status

Search

Save-state line· type to autosaveApproved`.save-state`

Audience count

Saved earlier today

Dropdown list· every dropdown on this page; in the portal since 0.30.0Approved`select (appearance: base-select)`

Season

Open it: brand list, 44px rows, hover tint, a check on the chosen one. Browsers that cannot style the list yet show their own.

Sign-in code, one box per digit· click any box to replace that digit; Ctrl+A then Backspace clears all; on sign-in in the portal since 0.30.0Approved`.otp (one real input under six boxes)`

Sign-in code

The 6 digits from your email. Paste the whole code, or click a box to change one digit. To clear it, press Ctrl+A (Cmd+A on a Mac), then Backspace.

Rich text answer· Tab and Shift+Tab change levels; Backspace at the start of a bullet ends the list; pasting keeps only the allowed formatting; in the portal since 0.31.0 (every written check-in and annual report answer)· 0.33.0 (Step 13, #55): an empty answer shows “Type or paste your answer” in the muted color, hidden from screen readersProposedApproved`.rte (toolbar + editable area)`

What went well this season?

Link address

Two **sold-out concerts** and a new partnership with the [West Jordan library](https://wjarts.org).

- Fall concert: 1,204 people
  - Sold out both nights
- Holiday concert: 1,120 people

In a list, Tab and Shift+Tab change the level, and Backspace at the start of an item ends the list. Outside a list, Tab moves on.Saved earlier today

## Messages

Words carry the meaning; color is the second cue. Problems say what went wrong and how to fix it.

InformationApproved`.message`

Your changes were saved.

ProblemApproved`.message .message-problem`

The file has 3 rows without an email address. Fix them and upload again.

NoticeApproved`.notice`

This page shows sample data only.

Confirmation panelApproved`.confirm`

### Report submitted

Staff will review it within two weeks. You can still read it on the Annual report page.

Draft flagApproved`.draft-flag`

Draft, not certified

Problem with iconApproved`.message .message-problem .message-icon`

Problem: The file has 3 rows without an email address. Fix them and upload again.

## Status labels

One or two words, sentence case. The tint is secondary.

GoodApproved`.badge .badge-good`

Approved

WarningApproved`.badge .badge-warn`

Draft

ProblemApproved`.badge .badge-bad`

Overdue

NeutralApproved`.badge .badge-muted`

Not started

Attention flagApproved`.flag`

Needs attention

Factor chipApproved`.factor.wellness / .factor.impact`

WellnessImpact

Comment tagApproved`.comment-tag`

Alex ExampleStaff

CountApproved`.rail-count`

3

Section dots· approved, draft, attention, emptyApproved`.dot.approved / .draft / .attention / .empty`

Status with icon· compare with BDG-01 to 04Approved`.badge .badge-icon`

ApprovedDraftOverdue

## Tables

Uppercase muted headings over a 2px navy rule, 48px rows, one hairline. Hover a row: it highlights and its actions appear. Click a heading to sort.

Standard table· frozen first column approved 2026-11-11; includes TBL-03 to TBL-05Approved`.table-wrap > .table`

|  |  |  |  |  |  |  |  | Actions |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [Jordan Example](#tables)jordan@example.com | Board member | West Jordan Symphony | Active | 801-555-0142 | Sep 4, 2025 | Nov 10, 2026 | 2 |  |
| [Alex Example](#tables)alex@example.com | Chair | West Jordan Youth Theatre | Invited | 801-555-0178 | Jan 12, 2026 | Never | 1 |  |
| [Sam Example](#tables)sam@example.com | Staff | CASWJ | Active | 801-555-0110 | Mar 2, 2024 | Nov 11, 2026 | 3 |  |
| [Riley Example](#tables)riley@example.com | — | Example Chorale | Access ended | — | Jun 18, 2023 | Aug 30, 2026 | 0 |  |

Scroll the table sideways: the name column stays put and the other columns stop at its edge, header and rule included. A shadow appears on its edge while columns are tucked under it.

Number columnApproved`.table .num`

Number columns: `.num`, right-aligned, even-width digits: 1,204 · 438 · 12

Missing valueApproved`.cell-missing`

Missing value: — (never a blank)

Sub-lineApproved`.cell-sub`

Jordan Examplejordan@example.com

Phone stacked rows· how the table could look on a phoneApproved`.table-stack`

| Name | Role | Tenant | Status | Actions |
| --- | --- | --- | --- | --- |
| [Jordan Example](#tables)jordan@example.com | Board member | West Jordan Symphony | Active |  |
| [Alex Example](#tables)alex@example.com | Chair | West Jordan Youth Theatre | Invited |  |
| [Sam Example](#tables)sam@example.com | Staff | CASWJ | Active |  |
| [Riley Example](#tables)riley@example.com | — | Example Chorale | Access ended |  |

Calendar

Month grid· Step 14, 0.34.0 · sample events, March 2027 · today shown as the 9th · approved 2026-11-17Approved`.cal .cal-day .cal-event`

Sunday to Saturday with the portal week number first. Each event is text: the tenant's short name and the event name, with the BDG-10 status tint and left line; Tentative and Cancelled also say so in words. A run of several days shows on each day. One day is in the tab order: arrow keys move between days, Home and End go to the week's ends, Tab moves into that day's events. Below 768px the portal's Month view shows the list (TBL-06) instead.

| Wk | Sun | Mon | Tue | Wed | Thu | Fri | Sat |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Week 10 | 28 | 1 | 2 | 3 | 4 | 5 | 6  [**WJS** Spring concert](#tables) |
| Week 11 | 7 | 8 | 9 | 10 | 11 | 12  [**WJYT** Spring musical, runs 2027-03-12 to 2027-03-13](#tables) | 13  [**WJYT** Spring musical, runs 2027-03-12 to 2027-03-13](#tables) |
| Week 12 | 14 | 15 | 16 | 17 | 18  [**CASWJ** Arts open house (Cancelled)](#tables) | 19 | 20  [**WJS** Chamber recital (Tentative)](#tables)  [**CASWJ** Volunteer social](#tables) |
| Week 13 | 21 | 22 | 23 | 24 | 25 | 26 | 27 |
| Week 14 | 28 | 29 | 30 | 31 | 1 | 2 | 3 |

## Cards and surfaces

Cards are used sparingly: one card stands for one thing people pick from. Lists of people or tasks are rows, not cards. Never a card inside a card.

CardApproved`.card`

### Your tasks

2 reports due this month.

SectionApproved`.section`

### Reporting periods

Calendar weeks run Sunday through Saturday.

Linked card· the whole card is the linkApproved`.card .card-link`

[Monthly check-in October, due Nov 15](#cards)

Fact chipApproved`.fact`

**438**Last year

**12**Events

Report coverApproved`.cover`

Cultural Arts Society of West Jordan

Annual report

### 2026 Annual Report

West Jordan Symphony

Due **Jan 31****6 of 9** sections done

Score card· numbers roll inApproved`.score.wellness / .impact / .overall`

/10

Overall performance

Wellness 50%, Impact 50%

Wellness

Impact

Thank-you panelApproved`.thanks`

### Thank you

Your report is with CASWJ staff.

Photo card· 16:9 preview, original kept (2026-11-11)Approved`.photo, .photo.needs`

Photo: Sam ExampleOriginal 1600 × 1200, kept

Needs creditOriginal 1200 × 1600, kept

The card previews every photo at 16:9 by trimming the edges; the original file and its size are stored unchanged. Click a photo to see all of it.

Row list· use instead of a grid of cardsApproved`.row-list (rows with dividers)`

- JE**Jordan Example**Board member, West Jordan Symphony[Open](#cards)
- AE**Alex Example**Chair, West Jordan Youth Theatre[Open](#cards)

Document link· Open leaves the portal, View stays in itApproved`.doc-links > .doc-link`

[**FY 2027-2028 Budget & Actuals**Google Sheets, opens in a new tabOpen](#cards)[**Imported budget in the portal**Proposed, imported Jan 20, 2027View](#cards)

## Navigation

This page's own menu on the left is the real sidebar: hover its links, collapse it with the round edge button, and narrow the window to see the phone top bar.

Sidebar (open)· includes NAV-02 linksApproved`.sidebar`

See the menu at the left of this page. Current section: 12% white overlay, bold.

Collapsed stripApproved`.sidebar[data-collapsed=true], .nav-tip`

Then hover an icon to see its name.

Phone top bar· tap MenuApproved`.sidebar on phones + .menu-button`

CASWJ

- [Home](#navigation)
- [People](#navigation)
- [Reporting](#navigation)

Section menu (rail)Approved`.rail`

1. [1. TenantApproved](#navigation)
2. [2. ProgramsDraft](#navigation)
3. [3. Community impactNeeds attention](#navigation)
4. [4. FinancesNot started](#navigation)

Annual report

### 3. Community impact

Hover or tab into the dots at the left. The section menu opens wide enough to read, and everything else fades behind it instead of being covered.

Describe one partnership that reached people who had not come to your events before.

Gradient bandApproved`.gradient-band`

FooterApproved`.footer-inner`

7879 S 1530 W, Suite 600, West Jordan, UT 84088

[Privacy Policy](#navigation) · [Terms of Use](#navigation)

Menu group· Option C, built in 0.35.0, approved by Dillon 2026-11-18 (Step 15): Finance holds Budgets and Finance forms (components/Sidebar.tsx). The group always starts closed and is marked current while closed on its pages; the chevron turns when open. In the collapsed strip the icon opens a small list beside it (Escape, clicking elsewhere or tabbing out closes it); the phone menu folds like the open menu. Options A and B removed.Approved Nov 18`.nav-group-button .nav-group-list .nav-fly`

Option C · Folding group (built): open menu, then the collapsed strip, where the Finance icon opens a small list

- Reporting
- Finance
- Budgets
- Finance forms
- Volunteer hours

- 
- Budgets**Finance forms**
- 

## Charts

One library of chart types for metric displays. Pick a metric and a display below, as an administrator would when setting up a metric; then see every type on its own. All numbers are made up.

Chart colorsBrand gold, pink and teal are lighter than the 3:1 contrast WCAG asks of chart marks on white; the legend, tooltips and table carry every number as text.

Choose a display (as an administrator)

Metric display pickerApproved`.viz-builder`

Metric

Show it as

Only displays that suit this kind of number are offered. The first is suggested.

Display: · Sample numbers, not real results.

Every chart type

Line with dots· in the portal since 0.28.0, with CHT-07; points about 10px on phones since 0.28.1Approved`data-viz=line`

Best for: Change over time, one or two series. Each point is a dot; a second series is dashed with square dots.

Change rows· in the portal since 0.28.0Approved`data-viz=change`

Best for: Up or down from last year, always with words. New when there was nothing last year.

Goal meter· in the portal since 0.28.0Approved`data-viz=meter`

Best for: Progress toward a goal, with an even-pace marker and an on-track label.

TableApproved`data-viz=table`

Best for: Exact numbers. Every chart offers one.

AreaApproved`data-viz=area`

Best for: One total over time, when the size of the amount matters.

ColumnsApproved`data-viz=column`

Best for: Comparing amounts across months or groups, side by side.

BarsApproved`data-viz=bar`

Best for: Ranking categories, especially with long names. Largest first; Other always last.

DonutApproved`data-viz=donut`

Best for: Parts of a whole, five parts or fewer, with the total in the middle.

PieApproved`data-viz=pie`

Best for: Parts of a whole with three or four parts. Smaller parts join Other.

WaffleApproved`data-viz=waffle`

Best for: A share people can count: 100 squares, one square per percent.

Big numberApproved`data-viz=number`

Best for: One headline figure, its change from last year, and a small trend line.

Progress ringApproved`data-viz=ring`

Best for: One goal in a small space, such as a home page tile.

BulletApproved`data-viz=bullet`

Best for: Actual against a budget or target, several rows at once. Over budget turns pink.

Change columnsApproved`data-viz=divcol`

Best for: Ups and downs at a glance, above and below a zero line.

100% stacked barsApproved`data-viz=stack`

Best for: How answers split, keeping declined and unknown apart from real answers.

Calendar heat mapApproved`data-viz=heat`

Best for: Patterns by day and week. Weeks run Sunday through Saturday.

Chart parts

Legend· in the portal since 0.28.0Approved`.legend`

- This year
- Last year
- Other

Tooltip· on hover or keyboard focus of any markApproved`.chart-tip`

**October**\
This year: 465 people

Score bandsApproved`.bands`

0 to 4

5 to 7

8 to 10

Palette (follows the Chart colors switch above)

123456

Series colors, used in this order and never skipped. Brand: teal, gold, pink, navy, light blue, orange (dark: teal, gold, pink, light blue, lime, orange). Accessible: darker teal, gold, blue, orange, purple, pink.

Amounts: one hue, light to dark.

Above or below a baseline: pink below, gray at zero, teal above.

Rules every chart follows

- One chart answers one question, and the title says what it is.
- One scale per chart. Two measures with different units get two charts.
- A series keeps its color everywhere, even when a filter removes others.
- Lines are 2px with a dot on every point. A second series is dashed with square dots.
- Bars are thin, with rounded ends and 2px of space between neighbors.
- Pie and donut charts show five parts or fewer; smaller parts join Other.
- A legend whenever there are two or more series; labels only where they help.
- Text is navy or gray, never the series color.
- Every number is reachable without a mouse: tab to a mark, or open the table.
- Missing data is gray and hatched, and never drawn as zero.
- Ticket sales are not attendance, pledges are not cash, and seats filled are not venue use over time.
- Comparisons use the same period and definition. A zero baseline reads New.
- Status colors are for status only and always come with words.
- Charts animate in once, briefly, and not at all for people who turn motion off.

## Lists and threads

Details, history, comments and report questions, without extra boxes.

Details listApproved`.details (dl)`

Email

jordan@example.com

Tenant

West Jordan Symphony

Roles

Board member

HistoryApproved`.history`

1. **Approved** by Alex Example, Nov 10
2. **Submitted** by Jordan Example, Nov 8
3. **Started** by Jordan Example, Oct 30

Comment thread· gold edge open, teal resolvedApproved`.thread, .thread.resolved, .comment.reply`

**Alex Example**Staff

Can you add the venue for the October concert?

**Jordan Example**

Added. It was the West Jordan library.

Question blockApproved`.q, .q.needs`

#### How many people attended?

Count each person once per event.

#### Describe one partnership.

Needs attention

Section headApproved`.section-head`

### 3. Community impact

ImpactDraft

## Icons

Lucide line icons (0.460.0, the version the portal uses), stroke 2, beside words or with an accessible name. Press one to copy its name.

Navigation icon· 20px menuApproved`.nav-icon (20px)`

Action icon· 22pxApproved`svg in .approve (22px)`

Inline icon· 18pxApproved`svg in .flag, .edge-circle (18px)`

Needs attention

Dot icon· 14pxApproved`svg in .dot (14px)`

## Logo

Official files only. Never retype, recolor, stretch or add effects. Wordmark and flame badge never appear together.

Wordmark, white· on navyApproved`caswj_text_white_transparent.svg`

Cultural Arts Society of West Jordan

Wordmark, navy· on whiteApproved`caswj_text_blue_transparent.svg`

Cultural Arts Society of West Jordan

Flame badge· 40px collapsed, 24px minimumApproved`caswj_flame_badge_100.png / _500.png`

CASWJ

CASWJ

## Loading and saving

Real progress only. Press Reload to see a skeleton that matches the table it becomes.

Busy button· on choose and filter buttons since 0.29.0Approved`SubmitButton (pending label, disabled)`

Used on: every submit and approve button; also the Open, Next, Show, Filter and Search buttons of the choose and filter forms (through `next/form`, busy until the next page arrives) and Board review Save and exit (Step 9, 0.29.0).

Autosave stateApproved`.save-state`

See FLD-11 above: Saving…, then Saved with the time.

Skeleton· in the portal since 0.25.0; every signed-in page since 0.29.0Approved`.skeleton`

| Name | Tenant | Status |
| --- | --- | --- |
| Jordan Example | West Jordan Symphony | Active |
| Alex Example | West Jordan Youth Theatre | Invited |

Used on: own shapes on Reporting (and each Reporting zone after Open), Event or rehearsal, Annual summary, Annual report, Board review, Board results, Staff review, Budgets, Check-ins, Volunteer hours, Contacts, Imports, Metrics, Board meetings, a board meeting and Feedback (Step 9, 0.29.0), and People and Person (0.25.0); the general skeleton (heading bar, a line, two blocks) on every other signed-in page, each page with its own `loading.tsx` (`components/Skeletons.tsx`). Still with reduced motion.

## Pages

Which styles each page uses, grouped by shared layout. From a scan of the code on 2026-11-11; check a page before relying on this for a change.

| Pages | Layout | Main styles |
| --- | --- | --- |
| Sign in, Access ended, Privacy, Terms | Public: navy wordmark header, no menu | `FLD-01, FLD-05, LDG-01, MSG-04` |
| Home | Cards for roles and tasks (flagged for review: fewer cards) | `CRD-01, BTN-01, BTN-02, MSG-03` |
| People, Contacts, Tenants, Roles, Imports, Metrics, Onboarding, View as | List: page head, filters, table | `FLD-10, TBL-01, BTN-01, BTN-02` |
| Person, Profile, Metric, Import, Role, Event | Record: sections, details, forms, history | `CRD-02, LST-01, FLD-12, LST-02, BTN-04` |
| New person, Bulk add, Periods, Venues, Onboarding setup, Feedback | Setup form | `CRD-02, FLD-01 to FLD-12, BTN-01` |
| Annual report, Monthly check-in | Long report: cover, section menu, questions, approve, threads, photos | `CRD-05, NAV-05, LST-03 to LST-05, BTN-06, CRD-07, CRD-08` |
| Staff review, Board review, Results, Presentation, Final report, Years | Review and scoring | `CRD-06, CHT-06, LST-03, TBL-01` |
| Reporting, Budgets, Volunteer hours, Annual summary | Data entry and totals | `FLD-11, MSG-02, CHT-01 to CHT-08, MSG-05` |
| Profiles | Rows, not cards | `CRD-09, CRD-08, BTN-06` |
| Help, Releases | Guide list and guide text | `CRD-01, MSG-03, LST-02` |

## 2026 review

Accessibility and UX recommendations checked against the code. Five became styles approved 2026-11-11; the rest are not styles and still need a decision. Built so far: P-04, P-05 and P-09 (style batches 1 and 2), P-10 (skeletons on People and Person only) and P-06 (0.28.0). Already met: 44px targets, code sign-in with autofill, button alternatives to dragging, Help in the same place, reduced motion.

| ID | Recommendation | Why | Status |
| --- | --- | --- | --- |
| `P-01` | Keep focused fields clear of sticky bars on phones | WCAG 2.2 Focus Not Obscured; not yet tested | Recommended |
| `P-02` | One focus ring everywhere | Done in 0.32.0: one 2px ring with a 2px gap (navy in light, near-white in dark, white on navy) | Built |
| `P-03` | Windows high-contrast support | Status dots, meters and the current-page highlight disappear | Recommended |
| `P-04` | Icon on problem messages (MSG-06) | Pink bar is 2.9:1, under 3:1 | Style approved |
| `P-05` | Status labels with icons (BDG-10) | Labels differ only in tint today | Style approved |
| `P-06` | Dashed second chart line (CHT-07) | Teal and gold lines have almost the same lightness | Style approved · built 0.28.0 |
| `P-07` | Smooth title sizes and balanced line breaks | Title jumps from 40px to 26px | Recommended |
| `P-08` | Components that respond to their own width | Collapsing the menu changes widths without a breakpoint | Recommended |
| `P-09` | Phone tables as labelled rows (TBL-06) | Phone tables scroll sideways today | Style approved |
| `P-10` | Loading skeletons (LDG-04) | No loading states exist yet | Style approved |
| `P-11` | Problem summary on long-form submit | Problems show only beside each field | Recommended |

## Edit styles

Changes show across the whole page at once. Save keeps them in this page for everyone who opens it; then ask Claude to apply them to the portal. Color changes apply to the light theme; the dark palette (THM-01) is built in the portal (0.32.0).

No changes yet

```

```