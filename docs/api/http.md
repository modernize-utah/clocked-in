# HTTP API

The Next.js app implements this contract. Authentication uses user JWTs or scoped tenant API keys; human-only operations require a user JWT.

Instants are UTC ISO-8601. `occurredOn` is `YYYY-MM-DD`. Ids are UUIDs. Unknown JSON fields are ignored. Passwords, password hashes, and secret codes are never returned.

## Errors

```json
{ "code": "validation_error", "message": "..." }
```

| Status | code                       |
| ------ | -------------------------- |
| 400    | `validation_error`         |
| 401    | `unauthorized`             |
| 403    | `forbidden`                |
| 403    | `password_change_required` |
| 404    | `not_found`                |
| 405    | `method_not_allowed`       |
| 409    | `conflict`                 |
| 500    | `server_error`             |
| 502    | `email_failed`             |

A missing or invalid token returns 401 with `Authentication is required.`. A valid token whose user no longer exists returns 401 with `This token is not valid for this server.`. An unexpected failure returns 500 with `Something went wrong.`.

Lists are `{ "items": [], "limit": 50, "offset": 0 }`. `limit` defaults to 50 and must be 1 through 100. `offset` defaults to 0 and must be zero or greater.

Deletes return 204 with an empty body. Revoking an invitation returns 200 and the invitation.

### Request handling order

A request is checked in this order, and the first failure is returned:

1. Authentication (401).
2. The shape of the body and query (400). This covers types, required fields, lengths, formats, enum values, and rules between fields of the same request.
3. Existence and authorization (404 and 403).
4. Rules that need stored data (400). Examples: a tag, project, task category, or organization must belong to the entry's tenant, and project editors must be tenant members.
5. Conflicts (409).

A request body must be a JSON object. An empty body is treated as `{}`. Anything else returns 400 `Request body must be JSON.`. An empty query parameter such as `?from=` is treated as absent.

Conflict messages:

| Message                                           | When                                                                              |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| `That username is already in use.`                | Duplicate username                                                                |
| `That email is already in use.`                   | Duplicate account email                                                           |
| `That sourceRef is already in use.`               | Duplicate time entry `sourceRef`                                                  |
| `A pending invite already exists for that email.` | Second pending invite for the same email and target                               |
| `That value is already in use.`                   | Any other unique name, such as a organization, tag, task category, or project title |
| `Delete the time entries first.`                  | Deleting something that time entries still reference                              |
| `This record is still in use.`                    | Deleting something that other records still reference                             |

## Auth

Access tokens last 15 minutes and are HS256 JWTs. Claims are `sub` (user id), `email`, `username`, and `isSuperAdmin`. Issuer, audience, and signing key come from `JWT_ISSUER`, `JWT_AUDIENCE`, and `JWT_SIGNING_KEY`. Send `Authorization: Bearer <accessToken>`.

Refresh tokens last 30 days. Only their hash is stored. Refresh rotates the refresh token. A second use of that same token within 2 minutes also returns a session, so overlapping requests keep the user signed in. After 2 minutes the old token is rejected. Logout and password changes reject the token immediately.

`POST /auth/user` (201) creates a user and profile and signs them in. `isSuperAdmin` cannot be set here.

```json
{
  "username": "",
  "email": "",
  "password": "",
  "firstName": "",
  "lastName": "",
  "displayName": null,
  "timezone": "UTC",
  "phone": null
}
```

`displayName`, `timezone`, and `phone` are optional. `timezone` is an IANA name and defaults to `UTC`.

`POST /auth/login` (200) body `{ "username": "", "password": "" }`. A user created with a temporary password has `mustChangePassword: true`. They can sign in, call `GET /users/me`, change the password with `PATCH /users/me`, and log out. Other authenticated routes return 403 `password_change_required`: `You must change your password before continuing.` Reusing the temporary password fails with `Choose a different password.` Changing the password or completing a reset clears the flag.

Both return:

```json
{
  "accessToken": "",
  "refreshToken": "",
  "expiresAt": "2026-10-15T20:00:00.000Z",
  "user": {}
}
```

`expiresAt` is when the access token expires. `user` is the user object below.

`POST /auth/refresh` (200) body `{ "refreshToken": "" }` returns a new pair. The first use rotates the token. Another use within 2 minutes also returns a new pair. After that, or after logout or a password change, reuse returns 401.

`POST /auth/logout` (200) requires auth. Body `{ "refreshToken": "" }`. Returns `{ "ok": true }`.

`GET /auth/user/forgot-password?email=` stores a code, emails it with Resend, and always returns `{ "ok": true }` when `email` is present. Another request for the same user within 60 seconds does not send a second mail. Codes expire in 15 minutes. On a tenant host, the tenant's PasswordReset template and address are used only when the person is an active member of that tenant; otherwise the request gets the platform email. `RESEND_API_KEY`, `EMAIL_FROM`, and optional `RESEND_API_URL` configure mail. Mail failures return 502 `email_failed`: `Email is not configured.` when the key or sender is missing, and `The email could not be sent.` when Resend rejects the request or cannot be reached.

`POST /auth/user/forgot-password` body `{ "email": "", "code": "", "password": "" }` sets the password, consumes the code, clears `mustChangePassword`, revokes refresh tokens, and returns `{ "ok": true }`. Each wrong code counts against the person's active codes, and a code stops working after five wrong guesses.

Rate limits return 429 `rate_limited` (`Too many attempts. Wait a few minutes and try again.`):

- Login: 10 failed attempts per username, and 50 per client IP, in 15 minutes. A correct password is refused too while the limit holds.
- Reset confirm: 30 failed attempts per client IP in 15 minutes.
- Reset request and sign-up: 20 requests per client IP per hour.

The client IP is the first `x-forwarded-for` value, which Vercel sets. Loopback and private addresses are not limited by IP.

## User

```json
{
  "id": "",
  "username": "",
  "email": "",
  "isSuperAdmin": false,
  "mustChangePassword": false,
  "createdAt": "",
  "updatedAt": "",
  "profile": {
    "id": "",
    "firstName": "",
    "lastName": "",
    "displayName": null,
    "timezone": "UTC",
    "phone": null,
    "zipCode": null,
    "notes": null,
    "memberNumber": null,
    "avatarUrl": null,
    "description": null
  }
}
```

- `GET /users/me` and `PATCH /users/me`
- `GET /users/me/workspace?tenantId=` returns the caller's apex workspace. `tenantId` is optional. An unknown or inaccessible id is ignored and the first tenant is selected, matching the website when no tenant cookie is stored. The response is `{ "viewer", "tenants", "tenant", "isAdmin", "isCoordinator", "canSelectRate", "role", "permissions", "groupOrganizations" }`. `viewer` is `{ "id", "username", "email", "isSuperAdmin", "name", "initials", "avatarUrl", "timezone" }`. `tenants` is the same list as `GET /tenants` with `limit=100`. `tenant` is the selected item or null. `role` is the active membership role code, or null. `permissions` is that tenant's permission set. `groupOrganizations` is `"all"` for an admin and otherwise the organization ids the caller administers. `isCoordinator` is true when `groupOrganizations` is a non-empty list. A tenant host and `x-voluntime-tenant` do not pin this route. An API key is forbidden. `mustChangePassword` still returns 403 `password_change_required`.
- `GET /users` is SuperAdmin only, sorted by `username`
- `GET /users/{id}` is the user, a SuperAdmin, or someone who shares an tenant. Sharing means the caller has an active membership in an tenant the user belongs to. `phone`, `zipCode`, and `notes` are null unless the caller is the user, a SuperAdmin, or an admin of a shared tenant.
- `PATCH /users/{id}` is the user or a SuperAdmin
- `DELETE /users/{id}` is the user or a SuperAdmin, and fails with 409 while time entries or projects still reference them

Patch fields: `username`, `email`, `password`, `currentPassword`, `firstName`, `lastName`, `displayName` (up to 100 characters), `timezone`, `phone` (up to 40), `zipCode` (up to 20), `notes` (up to 2000), `avatarUrl` (up to 2000), and `description` (Markdown, up to 8000). `password` requires a non-empty `currentPassword`, or the request fails with `currentPassword is required to change the password.`. A wrong `currentPassword` fails with `The current password is incorrect.`. While `mustChangePassword` is true, `PATCH /users/me` must include a new password; other profile-only patches return 403 `password_change_required`. The update and the refresh-token revocation for a password change are saved together and clear `mustChangePassword`. Null or blank clears `displayName`, `phone`, `zipCode`, `notes`, `avatarUrl`, and `description`. `PATCH /users/me` rejects `isSuperAdmin`. `PATCH /users/{id}` accepts `isSuperAdmin` only from a SuperAdmin. The last SuperAdmin cannot be removed.

Usernames are stored lowercase, 3 to 50 characters, matching `[a-z0-9][a-z0-9._-]*`. Emails are stored lowercase. Passwords are 8 to 200 characters and are bcrypt hashes.

## Roles, tenants, organizations, tags

`GET /roles` returns `{ "id", "code", "name" }` for `ADMIN`, `MEMBER`, and `VOLUNTEER`. Roles have no write routes.

Any authenticated user can `POST /tenants` with `{ "name" }` and becomes that tenant's `ADMIN`.

Tenant `{ "id", "name", "slug", "volunteerHourlyRate", "defaultRateType", "preferences", "themeId", "theme", "wordmarkUrl", "wordmarkOnLightUrl", "markUrl", "accentImageUrl", "description", "websiteUrl", "publicSlug" }`. `slug` is the optional white-label subdomain label (1 to 63 lowercase letters, digits, or hyphens, not starting or ending with a hyphen, and not reserved). `publicSlug` is the optional public openings slug. `description` is Markdown, up to 8000 characters. `websiteUrl` is up to 2000 characters. `volunteerHourlyRate` is the current default volunteer `HourlyRate` (`35.47` when an tenant is created). `defaultRateType` is `Volunteer`, `Professional`, or `Paid`. `preferences` is `{ "allowTimeEntryEditing": boolean, "allowVolunteersToAddVolunteers": boolean, "entityLabels": { "tenant", "project", "organization", "taskCategory" }, "feedbackNotifyUserIds": [], "emailSettings": { "LoggedTime": "immediate" | "weekly" | "off", "UnclassifiedEntry": "immediate" | "weekly" | "off", "FeedbackReceived": boolean, "FeedbackNotify": boolean, "FeedbackCompleted": boolean, "AccessRequestReceived": boolean, "AccessRequestDecided": boolean, "NeedSubmitted": boolean, "NeedDecided": boolean, "VolunteerMessage": boolean } }`. `allowTimeEntryEditing` and `allowVolunteersToAddVolunteers` default to false. A preferences patch may omit `allowVolunteersToAddVolunteers` or `emailSettings` (or individual keys inside `emailSettings`), which fills defaults (`immediate` for `LoggedTime` and `UnclassifiedEntry`, `true` for the boolean notification flags). Entity label defaults are Tenant, Project, Organization, and Task category. Creating an tenant assigns the seeded VolunTime global theme.

- `GET /tenants` lists tenants the caller belongs to. SuperAdmin lists all.
- `GET /tenants/{id}` requires membership or SuperAdmin
- `PATCH /tenants/{id}` requires an tenant admin. Fields: `name`, `slug`, `volunteerHourlyRate`, `defaultRateType`, `preferences`, `themeId`, `wordmarkUrl`, `wordmarkOnLightUrl`, `markUrl`, `accentImageUrl`, `description`, `websiteUrl`, and `publicSlug`. Null or blank clears `slug`, `description`, `websiteUrl`, and `publicSlug`. Changing `slug` is forbidden when the request is pinned to a tenant host via `x-voluntime-tenant`. `volunteerHourlyRate` updates the tenant's default volunteer rate. `themeId` must be a global theme or a theme owned by this tenant. Marks stay on the tenant.
- `GET/POST /tenants/{id}/themes` and `PATCH/DELETE /tenants/{id}/themes/{themeId}`. List requires membership. Create, edit, and delete require an tenant admin and apply only to org-owned themes. Global themes are read-only; saving edits of a global theme creates a new org-owned copy in the UI. Theme body: `name`, hex colors `primary`, `primaryForeground`, `highlight`, `accent`, `success`, `surface`, `surfaceForeground`, `foreground`, and `chartColor`, fonts `headingFont` and `bodyFont` (`HelveticaNeue`, `AvenirNext`, `SourceSans3`, `NunitoSans`, or `Geist`), `categoricalPalette` (6–8 colors), `sequentialPalette` (5–10), and `divergingPalette` (7). Helvetica Neue and Avenir Next use system fonts with Source Sans 3 / Nunito Sans fallbacks. `chartColor` is the single color used by every chart. Deleting the active org theme reassigns the tenant to VolunTime.
- `GET/POST /tenants/{id}/hourly-rates` and `PATCH/DELETE /hourly-rates/{id}`. Create and edit require an tenant admin. List requires membership. Body `{ "type", "name", "perHourRate", "isDefault", "isArchived", "source" }`. `type` is `Volunteer`, `Professional`, or `Paid`. `source` is optional, 1 to 200 characters, and empty when omitted or blank. A patch can set `source` to `null` to clear it. Each tenant has exactly one default volunteer rate. Only a volunteer rate can be the default, and that rate cannot be archived or deleted. Archived rates stay in this list. Time entries snapshot `hourlyRateId` and `hourlyRate`; deleting a rate that is still referenced fails with 409 `Archive this rate instead. Time entries still use it.`.
- `DELETE /tenants/{id}` requires an tenant admin and fails with 409 while time entries remain
- `GET/POST /tenants/{id}/task-categories` and `PATCH/DELETE /task-categories/{id}`. Create and edit require an tenant admin. Body `{ "name" }`. Delete fails with 409 while time entries remain.
- `GET/POST /tenants/{id}/projects` and `GET/PATCH/DELETE /projects/{id}`. Body includes `title`, `accessType` (`Public`, `Private`, or `Organization`), optional `projectType` (`Project` or `Event`, default `Project`), optional `organizationId`, `description`, `startDate`, `endDate`, `isActive`, and `editorIds`. Organization projects require `organizationId`, and other projects must leave it empty. Creating a project requires `create_projects` (admins and group managers by default; for a Organization project, as that organization's admin). Only an tenant admin or that organization's admin can make a Organization project. Editors must be members of the tenant. See Project visibility below.
- `GET /tenants/{id}/report` requires membership. See Reports below.
- `GET /tenants/{id}/time-entries.csv` requires `export_reports` and returns the filtered Volunteer Log as CSV. See Reports below.
- `GET /tenants/{id}/summary.csv` requires `export_reports` and returns the Summary sheet as CSV. See Reports below.

### Import

`POST /tenants/{id}/imports/people` and `POST /tenants/{id}/imports/projects` require an tenant admin. Body `{ "rows": [ ... ] }` with at most 1000 rows. Blank rows are ignored. A row that fails validation is listed in `errors` and the rest continue. Existing records are skipped and not updated: people by email, organizations by name, and projects by title. Names and titles match case-insensitively. A repeated key later in the same file is also skipped. `POST /tenants/{id}/imports/tenants` remains available for scripts and seed work; the import UI does not expose group import.

Response `{ "created", "skipped", "errors": [{ "row", "message" }] }`. Row numbers start at 1 for the first submitted data row. People also return `passwords`: `{ "email", "username", "temporaryPassword" }` for accounts created by that request. New people must change that password the first time they sign in. `username` is derived from the email when it is omitted. `role` defaults to `VOLUNTEER`. `timezone` defaults to `UTC`. `primaryOrganization` and project `organization` are existing organization names; an unknown name is a row error and does not create a organization. Project `accessType` defaults to `Public`, `projectType` to `Project`, and `isActive` to true. Organization projects require `organization`. Public and Private projects must leave it empty. The project owner is the caller.

People fields: `email`, `firstName`, `lastName`, `displayName`, `timezone`, `phone`, `zipCode`, `notes`, `memberNumber`, `username`, `role`, `primaryOrganization`. Organization field: `name`. Project fields: `title`, `description`, `projectType`, `accessType`, `organization`, `startDate`, `endDate`, `isActive`. Dates are `yyyy-MM-dd` or `M/d/yyyy`. Booleans accept `true`, `false`, `yes`, and `no`.

### Project visibility

Tenant admins and SuperAdmins see every project in the tenant. Other members see Public projects, projects they own or edit, and Organization projects for organizations they belong to. `GET /tenants/{id}/projects` returns only the projects the caller can see, sorted by `title`. `GET /projects/{id}` returns 403 for a project the caller cannot see. Projects can be changed by their owner, their editors, an tenant admin, or, for a Organization project, that organization's admin.

Time can be logged against a Private project only when the worker owns or edits it, or the caller is an tenant admin or SuperAdmin.

Organization `{ "id", "tenantId", "name" }`:

- `GET/POST /tenants/{id}/tenants`. Create requires an tenant admin. Body `{ "name" }`.
- `GET /tenants/{id}` requires tenant membership
- `PATCH/DELETE /tenants/{id}` requires an tenant admin. Delete fails with 409 while time entries remain. Names are unique per tenant, case-insensitively.

Tag `{ "id", "tenantId", "name" }`:

- `GET/POST /tenants/{id}/tags`. Create requires an tenant admin. Body `{ "name" }`.
- `PATCH/DELETE /tags/{id}` requires an tenant admin. Names are unique per tenant, case-insensitively.

Volunteer need `{ "id", "tenantId", "createdByUserId", "publicToken", "name", "description", "type", "countNeeded", "countVetted", "startDate", "endDate", "requiredBy", "allowPublic", "requireVetting", "questions", "projectId", "taskCategoryId", "organizationId", "createdAt", "updatedAt" }`. `type` is `Position` or `Task`. `questions` is `{ "version": 1, "items": [{ "id", "prompt", "kind", "choices": [{ "id", "label" }], "correctChoiceIds" }] }`. `kind` is `single` or `multi`. Dates are `yyyy-MM-dd`. `requiredBy` is a date-time. `countVetted` is not writable.

- `GET/POST /tenants/{id}/volunteer-needs` and `GET/PATCH/DELETE /volunteer-needs/{id}` require an tenant admin. List accepts `q`, `type`, `projectId`, `organizationId`, `allowPublic` (`true` or `false`), `sort` (`name`, `type`, `startDate`, `endDate`, `countNeeded`, `countVetted`, `createdAt`), and `order` (`asc` or `desc`), plus `limit` and `offset`. Create body includes `name`, `type`, and `countNeeded`. Optional fields are `description`, `startDate`, `endDate`, `requiredBy`, `allowPublic` (default false), `requireVetting` (default false), `questions`, `projectId`, `taskCategoryId`, and `organizationId`. A patch with none of those fields fails with `Provide at least one field to update.`. `countNeeded` cannot be less than `countVetted`. Optional relations must belong to the tenant. Delete removes the need and its signups.
- `GET /volunteer-needs/{id}/signups` requires an tenant admin. Each signup is `{ "id", "volunteerNeedId", "userId", "guestId", "name", "email", "phone", "kind", "comment", "answers", "passed", "vetted", "createdAt", "linkedUserId" }`. `kind` is `member` or `guest`. `answers` is the snapshot `{ "questionId", "prompt", "choiceIds", "labels" }`. `linkedUserId` is set when a guest email was later tied to a user.
- `POST /volunteer-needs/{id}/signups/{signupId}/vet` and `POST .../unvet` require an tenant admin. Vetting fails with 409 `This need is already filled.` when `countVetted` is already `countNeeded`. Each change updates `countVetted`.
- `DELETE /volunteer-needs/{id}/signups/{signupId}` requires an tenant admin and decreases `countVetted` when that signup was vetted.
- `POST /volunteer-needs/{id}/emails` requires an tenant admin. Body `{ "signupIds", "subject", "body" }`. One email is sent to each selected volunteer. Recipients are not copied on the same message.
- `GET /volunteer-needs/public/{token}` is anonymous. It returns 404 unless `allowPublic` is true. The body is `{ "name", "description", "type", "countNeeded", "countVetted", "remaining", "startDate", "endDate", "requiredBy", "requireVetting", "closed", "questions", "tenantName" }`. Public questions omit `correctChoiceIds`. `closed` is `deadline`, `full`, or null.
- `POST /volunteer-needs/public/{token}/signups` is anonymous and requires captcha. Body `{ "name", "email", "phone", "comment", "answers", "acknowledged", "captchaToken" }`. `acknowledged` must be true. `answers` is `[{ "questionId", "choiceIds" }]`. A bearer token signs the caller up and ignores guest fields. Without a token, `name`, `email`, and `phone` are required. An email that already belongs to a user fails with 409 `account_exists` and `An account already uses this email. Log in to sign up.` A repeated signup fails with 409 `You are already signed up for this need.` A past `requiredBy` fails with 409 `Sign-up for this need has closed.` A full need fails with 409 `This need is already filled.` When `requireVetting` is false and every answer matches, the signup is vetted and `countVetted` increases. Otherwise the signup is kept and left unvetted. Missing captcha configuration fails with 503 `captcha_unavailable` in staging and production.

## Memberships

```json
{
  "id": "",
  "userId": "",
  "tenantId": "",
  "organizationId": null,
  "role": { "id": "", "code": "MEMBER", "name": "Member" },
  "joinedAt": "",
  "rateType": "Volunteer",
  "professionalBillingRate": null,
  "isActive": true,
  "primaryOrganizationId": null,
  "organizationIds": [],
  "title": null,
  "memberDescription": null,
  "user": { "id": "", "username": "", "email": "", "firstName": "", "lastName": "", "displayName": null }
}
```

Tenant memberships leave `organizationId` null. Organization memberships set both ids, and their `rateType`, `professionalBillingRate`, `isActive`, `primaryOrganizationId`, `title`, and `memberDescription` are null. `title` is that person's title in the tenant (up to 100 characters). `memberDescription` is Markdown about that person in the tenant (up to 8000 characters). `notes` is the tenant's private note about the person (up to 2000 characters). It is null unless the caller has `manage_members`. It is separate from the person's own profile `notes`, which only the person can change. Membership create, membership patch, and people import all write it. `organizationIds` lists every organization the person belongs to. A person may belong to more than one organization.

Only active tenant memberships grant access. An inactive member cannot read or write the tenant, and their organization roles in it stop counting. Their time entries are kept.

- `GET /tenants/{id}/memberships` and `GET /tenants/{id}/memberships` require membership in the tenant. Other members' `user.email` is null unless the caller has `manage_members` or `invite_members`, and their `rateType` and `professionalBillingRate` are null unless the caller has `manage_members`. Your own membership always shows them.
- `POST /tenants/{id}/memberships` requires an tenant admin, unless `preferences.allowVolunteersToAddVolunteers` is true and the caller is an active volunteer. Body `{ "email", "username", "password", "firstName", "lastName", "displayName", "timezone", "phone", "zipCode", "notes", "avatarUrl", "description", "title", "memberDescription", "role", "organizationIds", "relationship", "emailUser" }`. `firstName`, `lastName`, `email`, and `role` are required. The request always creates a new account, so it also needs `username` and `password`, and the account starts with `mustChangePassword` true. An email that already has an account fails with 409 `account_exists` (`This email already has an account. Send them an invitation instead.`, or for a volunteer `This person already has an account. Ask an admin to invite them.`); existing accounts join an tenant only by accepting an invitation. `organizationIds` is optional. `emailUser` defaults to false. When it is true, the new person is emailed their username and temporary password, with a link to sign in. If that mail fails, the new account is removed and the request returns 502 `email_failed`. A duplicate membership fails with 409 `This person is already in the tenant.` A volunteer can only create a `VOLUNTEER`, cannot send `organizationIds`, and must send `relationship` (how the new person relates to the volunteer). That request also creates a member connection. If the email is already a member, a volunteer gets 409 `This person is already a member. Ask an admin to connect you.` Any other role, or the setting off, is rejected.
- `GET /tenants/{id}/connections` requires membership. An tenant admin sees every connection. Anyone else sees only connections they are part of. `relationship` is how user B relates to user A.
- `POST /tenants/{id}/connections` requires an tenant admin. Body `{ "userId", "connectedUserId", "relationship" }`. `relationship` is how `connectedUserId` relates to `userId`. Both people must be active members. A pair can be connected once. Connecting someone to themselves fails validation. A duplicate fails with 409 `These people are already connected.`
- `PATCH /tenants/{id}/connections/{connectionId}` requires an tenant admin. Body `{ "userId", "relationship" }`. `userId` is one end of the connection, and `relationship` is from that person's point of view.
- `DELETE /tenants/{id}/connections/{connectionId}` requires an tenant admin.
- `PATCH .../memberships/{membershipId}` body may include `role`, and on an tenant membership also `rateType` (`Volunteer`, `Professional`, or `Paid`), `professionalBillingRate`, `isActive`, `primaryOrganizationId`, `organizationIds`, `email`, profile fields `firstName`, `lastName`, `displayName`, `timezone`, `phone`, `zipCode`, `notes`, `avatarUrl`, and `description`, and membership fields `title` and `memberDescription`. Null or blank clears those optional text fields. `email` is stored lowercase. A duplicate fails with 409 `That email is already in use.` `email` and the profile fields change the person's account, so an tenant may change them only while no other tenant shares that person and they are not a SuperAdmin; otherwise a change fails with 403 `This person belongs to another tenant, so only they can change their profile.` Changing `email` also requires an account the person has never signed in to (`mustChangePassword` still true); otherwise it fails with 403 `This person has signed in, so only they can change their email.` Sending a field's current value is not a change. Tenant memberships require an tenant admin. Organization memberships require that organization's admin or the tenant admin. `primaryOrganizationId` must be a organization of that tenant, or null. `organizationIds` replaces the person's organizations in that tenant. An tenant membership patch with none of these fields fails with `Provide at least one field to update.`. Time entries no longer take their rate from membership `rateType` or `professionalBillingRate`.
- `DELETE` removes the membership. The member, an tenant admin, or (for a organization) that organization's admin may do it. Removing an tenant membership also removes that user's organization memberships in the tenant. The account and time entries are kept. The last tenant admin cannot be removed or demoted.
- `DELETE /tenants/{id}/memberships` body `{ "membershipIds": [""] }` removes those tenant memberships in one request. The same rules apply: an tenant admin, or the member when every id is their own. An unknown id fails the whole request with 404 and removes nobody. Removing the last tenant admin fails with 409 `The last tenant admin cannot be removed.` `membershipIds` is 1 to 100 ids. Duplicates count once.

## Invitations

```json
{
  "id": "",
  "email": "",
  "tenantId": "",
  "organizationId": null,
  "role": { "id": "", "code": "MEMBER", "name": "Member" },
  "invitedByUserId": "",
  "expiresAt": "",
  "acceptedAt": null,
  "revokedAt": null,
  "createdAt": ""
}
```

`POST /tenants/{id}/invitations` and `POST /tenants/{id}/invitations` body `{ "email": "", "role": "MEMBER" }`. This always creates a pending invite, even when the email already has an account. The code is emailed and is not in the response. Invites expire after 7 days. One pending invite is allowed per email and target.

Tenant invites require an tenant admin. Organization invites require that organization's admin or the tenant admin. `organizationId` is null on an tenant invite.

`GET` lists invitations for that target. `DELETE /tenants/{id}/invitations/{invitationId}` and the organization equivalent revoke a pending invite and return it. An accepted invite cannot be revoked.

`POST /invitations/accept` requires auth. Body `{ "code": "" }`. Invite codes are 12 characters in three groups, such as `ABCD-EFGH-JKMN`. Case, spaces, and dashes are ignored, and 6-digit codes from older invites still work until they expire. Ten wrong codes from one account, or 30 from one client IP, in 15 minutes return 429 `rate_limited`; the signup page's invite lookup shares the IP limit. The signed-in user's email must match the invite. Signup does not accept invites. Accepting a organization invite creates an tenant `MEMBER` membership when the user has none, and does not change an tenant role they already have. Response:

```json
{
  "invitation": {},
  "tenantMembership": {},
  "organizationMembership": null
}
```

`organizationMembership` is null for an tenant invite. `tenantMembership` is present when this call created one, and null when a organization invite found an existing tenant membership.

## Time

User time entry:

```json
{
  "id": "",
  "userId": "",
  "enteredByUserId": "",
  "tenantId": "",
  "organizationId": null,
  "projectId": "",
  "taskCategoryId": "",
  "mode": "Punch",
  "startedAt": null,
  "endedAt": null,
  "durationMinutes": null,
  "occurredOn": "2026-10-15",
  "description": null,
  "hourlyRateId": "",
  "hourlyRate": 35.47,
  "inKindValue": null,
  "sourceRef": null,
  "createdAt": "",
  "tagIds": []
}
```

`mode` is `Punch`, `Duration`, or `Total`. Duration and Total require `projectId` and `taskCategoryId` (`Choose a project and a task category.`). Punch may omit both, and may also omit `organizationId`; blank on all three is unclassified. A organization project is only valid when `organizationId` matches that project. Tags must belong to the entry's tenant. The entry's user must be an active member of the tenant. `organizationId` attributes the hours and does not require a organization membership. The caller may be that user, a super admin, an tenant admin, a organization admin for that organization, or a volunteer connected to that user in the tenant. `enteredByUserId` is the caller. Optional `hourlyRateId` selects an unarchived rate in that tenant. A volunteer always uses the default volunteer rate, including when logging for a connection, unless that person's membership `rateType` is `Paid`. Admins and members may choose any unarchived rate. When `hourlyRateId` is omitted, the default volunteer rate is used, except a Paid membership uses the unarchived Paid catalog rate whose amount matches `professionalBillingRate` (`Add a paid hourly rate that matches this person's pay rate.` when none does). A Paid membership cannot be saved on a Volunteer or Professional rate (`Choose a paid hourly rate.`). The server snapshots `hourlyRateId` and `hourlyRate`. Volunteer and Professional rates set `inKindValue` from the minutes. A Paid rate stores `inKindValue` as `0`; gross pay is hours times the snapshot and is not in-kind. SuperAdmin bypasses membership checks and still has to satisfy the time rules.

A user has at most one open punch. Punch `occurredOn` is the user's local date of `startedAt` in their profile timezone. Closing a punch sets `endedAt`, `durationMinutes` (1–1440), and `inKindValue`. Duration entries require `occurredOn`. Send `durationMinutes` from 1 to 1440 with no times, a `startedAt` and `endedAt` (minutes are calculated), or a `startedAt` and `durationMinutes` (the end is calculated). When all three are sent, the minutes must match the times. Total entries require `occurredOn` and `durationMinutes` from 1 to 59940, with empty start and end.

- `GET/POST /users/{id}/time-entries`. Read is the user, a super admin, someone who shares an tenant and is not a volunteer there, or a volunteer connected to that user in a shared tenant. Someone who only shares an tenant sees entries in the tenants they are allowed to read, and gets 403 when filtering by another tenant. Write is the user, a super admin, an tenant admin, a organization admin for the target organization, or a volunteer connected to that user in the tenant. Optional filters: `tenantId`, `organizationId`, `from`, `to` (`occurredOn`, inclusive). Sorted by `occurredOn` and then `startedAt`, newest first. Optional `sourceRef` on create is a unique import key of 1 to 200 characters. A duplicate fails with 409 `That sourceRef is already in use.`.
- `GET/PATCH/DELETE /time-entries/{id}` for the owner, the person who entered it, a super admin, an tenant admin, that organization's admin, or a volunteer connected to the entry's user in that tenant. A volunteer still cannot change time fields unless `allowTimeEntryEditing` is on.
- `POST /time/clock-in` (201) body `{ "tenantId", "organizationId", "projectId", "taskCategoryId", "description", "tagIds" }`. `organizationId`, `description`, and `tagIds` are optional. `startedAt` is the current time.
- `POST /time/clock-out` (200) closes the caller's open punch. Body may include `description` and `tagIds`.
- `POST /time/duration` (201) and `POST /time/total` (201) create an entry for the caller.

`POST /users/{id}/time-entries` body includes `mode` and the same fields. An open punch omits `endedAt`. A closed punch includes `startedAt` and `endedAt`. A sent `occurredOn` on a punch must match the local date of `startedAt`. A sent `durationMinutes` on a punch must match the calculated minutes.

Patch updates `description`, `tagIds`, `tenantId`, `organizationId`, `projectId`, and `taskCategoryId`. Time fields (`startedAt`, `endedAt`, `durationMinutes`, `occurredOn`) are accepted only when the entry's tenant has `preferences.allowTimeEntryEditing` set. Otherwise a punch responds `You cannot change punch times here.` and any other entry responds `Time entries cannot be edited.`. When editing is allowed, Duration and Total entries can patch `durationMinutes` and `occurredOn`. Duration entries can patch `startedAt` and `endedAt`; a new end recalculates the minutes, and new minutes recalculate the end. Punch entries can patch `startedAt`, `endedAt`, and `durationMinutes` with the same calculation, including an open punch. Rates are recalculated when the duration changes. Moving an entry to another tenant, or sending `hourlyRateId`, resolves the rate again and recalculates `inKindValue`. When `tagIds` is not sent, the entry's current tags must also belong to the new tenant. The destination tenant's preference decides whether the time fields are allowed.

Collective time entry:

```json
{
  "id": "",
  "recordedByUserId": "",
  "tenantId": "",
  "organizationId": null,
  "startedAt": "",
  "endedAt": "",
  "projectId": "",
  "taskCategoryId": "",
  "participantCount": 1,
  "description": null,
  "hourlyRateId": "",
  "hourlyRate": 35.47,
  "inKindValue": 0,
  "tagIds": []
}
```

`endedAt` is after `startedAt`. `participantCount` is at least 1. An tenant admin may record one for the tenant or any of its organizations. A organization admin may record one only for that organization. Members of the tenant may read them.

- `GET/POST /collective-time-entries`. Filters: `tenantId`, `organizationId`. Create body is the fields above except `id` and `recordedByUserId` (the caller).
- `GET/PATCH/DELETE /collective-time-entries/{id}`. Patch uses the same fields as create. `tenantId` cannot change.

## Reports

`GET /tenants/{id}/report`, `GET /tenants/{id}/time-entries.csv`, and `GET /tenants/{id}/summary.csv` take the same optional query: `organizationId`, `taskCategoryId`, `projectId`, `userId`, `from`, and `to`. Each id field takes one id or a comma-separated list (`organizationId=id1,id2`) and matches any of them. User entries are filtered by `occurredOn`. Collective entries are filtered by the UTC date of `startedAt` and ignore `userId`. Tenant admins see the whole tenant. Organization admins (group coordinators) are scoped to the union of organizations they admin; asking for any `organizationId` outside that set returns 403. Volunteers, and anyone else without `view_reports`, stay self-only. `user` is volunteer-rate hours. `staff` is the same rollup for professional-rate hours and stays out of volunteer KPIs. Paid-rate hours are omitted from both, from `time-entries.csv`, and from `summary.csv`. Collective entries with a professional rate are omitted from `collective`. `GET /tenants/{id}/payroll` and `GET /tenants/{id}/payroll.csv` use the same query and require `view_payroll` (Admin by default). The JSON is `{ hours, grossPay, people, entries, rows }`. Each row is `{ id, userId, person, group, hours, payRate, grossPay, entries }`, grouped by person, group, and snapshotted pay rate. The CSV columns are Person, Group, Hours, Pay rate, Gross pay, and Entries. Gross pay is hours times the snapshotted rate. It is not tax withholding, deductions, or a pay stub.

```json
{
  "user": {
    "hours": 0,
    "volunteers": 0,
    "entries": 0,
    "inKind": 0,
    "byOrganization": [],
    "byCategory": [],
    "byPerson": [],
    "byVolunteer": [],
    "byProject": [],
    "byMonth": []
  },
  "staff": {
    "hours": 0,
    "volunteers": 0,
    "entries": 0,
    "inKind": 0,
    "byOrganization": [],
    "byCategory": [],
    "byPerson": [],
    "byVolunteer": [],
    "byProject": [],
    "byMonth": []
  },
  "collective": {
    "hours": 0,
    "entries": 0,
    "inKind": 0,
    "byOrganization": [],
    "byCategory": [],
    "byProject": []
  }
}
```

Saved report designs live at `/tenants/{id}/reports`, separate from the rollup at `/tenants/{id}/report`. A member of the tenant can list and read them. Creating, updating, and deleting require an tenant admin. Names are unique per tenant, compared case-insensitively, and at most one report is `isDefault`.

`GET /tenants/{id}/reports` returns `{ "items", "limit", "offset" }` ordered by name. `POST /tenants/{id}/reports` body is `{ "name", "layout", "filters"?, "isDefault"? }`. `isDefault` defaults to false. `filters` defaults to `{}`. `GET/PATCH/DELETE /tenants/{id}/reports/{reportId}` read or change one design. Patch sends any of `name`, `layout`, `filters`, and `isDefault`. Setting `isDefault` true clears the previous default. Creating, changing, or deleting a report, and writing report templates, needs `manage_tenant` or `design_reports`; an API key must be an admin key.

`layout` is `{ "version": 1, "cards": [ ... ] }`. A card has `id`, `kind` (`value`, `chart`, or `list`), `title`, `description`, `column`, `row`, `columns`, `rows`, and `accessor`. Position is 1-based. `column` plus `columns` stays inside 12, and `row` plus `rows` stays inside 48. Cards cannot overlap. A report has at most 40 cards. `accessor` is a lodash-get path into the rollup, such as `user.hours` or `user.byOrganization`. Every card has `format` (`number`, `hours`, or `currency`) and `pattern`, a numeral format string. A missing `pattern` is filled from `format` (`0,0.[00]` for number and hours, `$0,0.00` for currency). A value card also has `color` (`primary`, `highlight`, `accent`, `success`) and optional `icon` (a Lucide icon name, or null). A chart card also has `chartType` (`donut`, `pie`, `bar`, `column`), `palette` (`single`, `categorical`, `sequential`, `diverging`), and `valueKey` (`hours` or `inKind`). A list card also has `visibleColumns`, a unique subset of `name`, `type`, `hours`, `share`, `people`, and `inKind`.

`filters` may include `organizationId`, `taskCategoryId`, `projectId`, `userId`, `from`, and `to`. Id fields accept one id or an array of ids and are always returned as arrays. Empty or null values are omitted. `from` is on or before `to` when both are set.

Report templates live at `/tenants/{id}/report-templates`. A member can list and read them. `GET /tenants/{id}/report-templates` returns the layouts that tenant should see: for each global template, the tenant's override when one exists, otherwise the global, then templates owned by the tenant. Each item has `id`, `tenantId`, `key`, `name`, `layout`, `baseTemplateId`, `scope` (`global`, `tenant`, or `override`), `createdAt`, and `updatedAt`. `key` is the global key (`summary`, `people`, `groups`, or `staff`) for a global or for the global an override replaces.

`POST /tenants/{id}/report-templates` (201) requires an tenant admin. Body `{ "name", "layout" }` creates a template owned by the tenant. Body `{ "baseTemplateId", "layout", "name"? }` creates an override of a global template; a second override for the same global updates the existing row. `GET/PATCH/DELETE /tenants/{id}/report-templates/{templateId}` read or change one template the tenant can see, including a global. Patch sends `name` and `layout`. Only a SuperAdmin can patch a global template. An tenant admin who wants a different global layout creates an override instead. Delete removes an tenant template or an override and makes the global show again. Globals are not deleted.

`GET /tenants/{id}/reports/{reportId}/data` returns the same rollup as `GET /tenants/{id}/report`. It applies the saved filters, then the caller's own scope. Query `from` and `to` replace the saved dates. `clearDates=true` drops the saved dates first, so the request can ask for all time. The response is one payload for every card.

Each group item is `{ "id", "label", "hours", "volunteers", "entries", "inKind" }`. `hours` is total minutes divided by 60, rounded to 5 decimals. `inKind` is rounded to 2 decimals. `volunteers` counts distinct users with a non-empty person label and is always 0 for collective groups and month buckets. Hours without a organization use id `tenant` and the tenant name. `byVolunteer` uses the same people as `byPerson` but excludes hours from the task category named `Participant Hours` while still including all in-kind. `byMonth` is calendar months of `occurredOn`, labeled with the English month name and sorted by year then month. A person's label is their display name, then `firstName lastName`, then their username; empty first and last names stay blank and do not count as unique volunteers. A collective entry counts the minutes between `startedAt` and `endedAt`, rounded to the nearest minute with 30 seconds rounding up. Groups other than `byMonth` are sorted by `hours` descending, then `label`, then `id`, comparing strings by UTF-16 code unit.

The Volunteer Log CSV has content type `text/csv; charset=utf-8`, UTF-8 without a byte order mark. Lines end with `\n`, and there is no newline after the last row. Column names use the tenant's entity labels. The first line is:

```text
Date,{project},Volunteer,{organization} / {tenant},{taskCategory},Entry Method,Start Time,End Time,Manual Duration,Hours,Rate Type,Hourly Rate,In-Kind Value,Tags,Entered By,Date Entered,Hour Attribution,Notes,Volunteer ID
```

Rows are user entries sorted by `occurredOn` and then `createdAt`. Cell formats match Excel display:

- Date and Date Entered are `M/D/YYYY` in UTC.
- `{organization} / {tenant}` is the organization name, or the tenant name when there is no organization.
- Entry Method is `Total Hours`, `Start / End Time`, or `Duration`.
- Start Time and End Time are `h:mm AM/PM` in UTC, or empty.
- Manual Duration is `H:MM` from `durationMinutes`, or empty.
- Hours has up to 5 decimals with no trailing zeros, and is empty for an open punch.
- Rate Type is the `HourlyRate.name`, or empty.
- Hourly Rate and In-Kind Value have exactly 2 decimals. Hourly Rate is empty when the snapshot is `0`. In-Kind Value is empty when unset.
- Tags are names sorted by UTF-16 code unit and joined with `, `.
- Volunteer and Entered By use the person label above.
- Hour Attribution is empty.
- Notes is the description, or empty.
- Volunteer ID is `UserProfile.memberNumber`, or empty.

`GET /tenants/{id}/summary.csv` stacks a KPI block (`Total Volunteer Hours`, `Total In-Kind Value`, `Unique Volunteers`, `Total Entries`) and five tables (tenant/organization buckets, task category, month, volunteer, project) using the same numbers as the report. Volunteer table hours use `byVolunteer`.

A cell that starts with `=`, `+`, `-`, `@`, a tab, or a carriage return gets a leading `'`. A cell containing `"`, `,`, a newline, or a carriage return is wrapped in double quotes, with each `"` doubled.

## Email templates

Email templates live at `/tenants/{id}/email-templates`. Each tenant has one per email type (`for`), seeded when it is created. There is no create or delete.

`GET /tenants/{id}/email-templates` (any member) lists all 13 in a fixed order and adds any that are missing. Each item has `id`, `tenantId`, `name`, `version`, `for`, `subject`, `heading`, `preview`, `template`, `isEnabled`, `isOptional`, `fields` (the placeholders that type allows), `createdAt`, and `updatedAt`. `GET .../email-templates/{templateId}` reads one.

`PATCH .../email-templates/{templateId}` requires an tenant admin. Body may include `name` (1–80), `subject` (1–200), `heading` (1–120), `preview` (0–200), `template` (HTML, up to 20000 characters), and `isEnabled`. `template` is sanitized to `p`, `h1`–`h3`, `strong`, `em`, `a` (an http, https, or mailto href with no fields in it, or an href that is exactly one `{{field}}`; any other href is dropped, and the same rule applies again when the email is sent), `ul`, `ol`, `li`, `br`, and `span[data-placeholder]`; a body with no text after that fails with `template is required.`. A `{{field}}` outside that type's catalog fails with `{{field}} is not a field for this email.`. Sending `for` fails with `for cannot be changed.`. Only `LoggedTime` and `UnclassifiedEntry` can set `isEnabled` to false; any other fails with `This email cannot be turned off.`. A patch with none of these fields fails with `Provide at least one field to update.`. Each successful patch adds 1 to `version`.

`POST .../email-templates/{templateId}/reset` requires an tenant admin. It restores the default name, subject, heading, preview, and body, turns the email back on, and adds 1 to `version`.

`LoggedTime` is sent to the person whose hours were saved, once per save: a classified clock-out, a single classified duration or total entry, or a multi-day batch (hours summed). Open punches, edits, and group sessions do not send it. Before any email is sent, the server checks both `Tenant.preferences.emailSettings` (`Invite`, `Welcome`, and `PasswordReset` are always enabled; `LoggedTime` and `UnclassifiedEntry` send immediately only when set to `"immediate"`; `weekly` waits for the Monday digest; `off` sends nothing; the remaining 8 notification types send when their boolean flag is `true`) and the template's `isEnabled` flag. A failed send never undoes the save.

`GET /api/cron/email-digest` sends the weekly digests. It requires `Authorization: Bearer <CRON_SECRET>`. For each tenant whose Logged time setting is `weekly`, each person receives one email of the classified hours they saved in the previous seven days, using the Logged time template (`entry.hours`, `entry.date`, `entry.url`). For Unclassified entry set to `weekly`, each person who still has unclassified timer entries receives the unclassified template, linking to `/entries?unclassified=1`. The week already sent is stored at `preferences.emailDigest` so a second run in the same UTC week does not send again. When email is not configured the route returns 503 and does not stamp the week.

`GET /api/cron/external-sync` runs every minute. It requires `Authorization: Bearer <CRON_SECRET>`. For each tenant with a People/Roles or Tenant/Groups management URL and a matching cron expression that is due, ClockedIn pulls from that URL using the org's outbound token and applies the payload as system of record.

## External sync

Tenant preferences may include:

- `portalOrigin` — when set on a tenant host, login redirects to this URL (OAuth 2.1-style). The authority returns a JWT (`id_token` / `token` / `jwt`) to `GET|POST /auth/external/callback` with `state`. The JWT must be HS256 signed with `JWT_SIGNING_KEY` and include `email` or `sub` matching an existing active member.
- `portalOrigin` / `portalDirectoryCron` — external system of record for people and roles. Cron requires the URL. When set, membership/role/invitation mutations and people import are rejected; UI is read-only with a Pull button.
- `__REMOVE_orgUrl__` / `__REMOVE_orgCron__` — external system of record for tenant name/description/website, organizations, and organization memberships. Same mutation and UI rules for those resources.

Admin routes (tenant admin JWT or API key with admin scope):

- `GET /tenants/{id}/external-sync/people-roles/contract` — contract JSON for pull + webhook
- `POST /tenants/{id}/external-sync/people-roles/validate` — call the URL and schema-check the response
- `POST /tenants/{id}/external-sync/people-roles/pull` — pull and apply
- `PUT /tenants/{id}/external-sync/people-roles/outbound-token` — body `{ "token": "..." | null }`
- `POST /tenants/{id}/external-sync/people-roles/webhook-secret` — mint/rotate; returns `{ "secret" }` once
- Same paths under `.../tenant-groups/...`

Inbound webhooks:

- `POST /webhooks/tenants/{id}/people-roles`
- `POST /webhooks/tenants/{id}/tenant-groups`

Header `Clocked-In-Signature: t=<unix>,v1=<hmac_sha256_hex>` over `${timestamp}.${rawBody}` using the minted webhook secret. Body matches the pull contract. People missing from a people/roles payload are soft-deactivated (`isActive=false`).

MCP tools: `get_people_roles_sync_contract`, `get_tenant_groups_sync_contract`, `validate_*`, `pull_*`, `set_*_outbound_token`, `rotate_*_webhook_secret`.

## Tenant API keys

Next.js accepts tenant API keys on REST and `/mcp`, subject to their scopes. A key is shown once at create or rotate: `cki_live_<prefix>_<secret>` in production, `cki_test_…` otherwise. Send `Authorization: Bearer <key>` or `X-Api-Key: <key>`. Only the HMAC hash is stored. Key create, list, rotate, and revoke require a human tenant admin JWT. A key cannot mint other keys.

Scopes:

- `org:read` — get and list the tenant and its catalogs, members, projects, time, reports
- `org:write` — time, projects, tags, task categories, organizations, collective time
- `org:admin` — memberships, invitations, rates, themes, tenant settings. Not tenant delete.

`GET/POST /tenants/{id}/api-keys`. Body `{ "name", "scopes", "expiresAt" }`. `name` is 1 to 80 characters. `scopes` is a non-empty array of the values above. `expiresAt` is optional. Create returns the plaintext `key` once. List omits `key`.

`PATCH /tenants/{id}/api-keys/{keyId}` updates `name`, `scopes`, or `expiresAt`. `POST .../rotate` issues a new secret and prefix. `DELETE` revokes. Clock-in and clock-out with a key require `userId`.

## MCP

MCP is Streamable HTTP at `/mcp` on Next.js. Tools wrap the same feature services as REST. Auth, signup, password reset, SuperAdmin user list, feedback moderation, and deleting an tenant are not exposed. Platform-key endpoints are not part of this app. Existing platform-key rows stay in the database and do not grant access.

```json
{
  "mcpServers": {
    "clocked-in": {
      "url": "https://<next-host>/mcp",
      "headers": { "Authorization": "Bearer cki_live_…" }
    }
  }
}
```

## Authorization summary

SuperAdmin is a user flag, not a membership role. A SuperAdmin can read and write every entity. The first SuperAdmin is set in SQL: `UPDATE "User" SET "isSuperAdmin" = true WHERE "email" = '...'`.

After tenant creation, tenant admins manage the tenant, its theme, organizations, projects, task categories, tags, rates, invitations, membership roles, and collective time for the tenant or any organization. They may also enter user time for a member. Organization admins manage that organization's invitations, membership roles, collective time, and user time for that organization. Members read the tenant and manage only their own user time against a target they belong to. User totals and collective totals stay separate in reports.
