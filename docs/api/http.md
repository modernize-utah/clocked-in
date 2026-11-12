# HTTP API

The Next.js app implements this contract. Authentication uses user JWTs or scoped organization API keys; human-only operations require a user JWT.

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
4. Rules that need stored data (400). Examples: a tag, project, task category, or department must belong to the entry's organization, and project editors must be organization members.
5. Conflicts (409).

A request body must be a JSON object. An empty body is treated as `{}`. Anything else returns 400 `Request body must be JSON.`. An empty query parameter such as `?from=` is treated as absent.

Conflict messages:

| Message                                           | When                                                                              |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| `That username is already in use.`                | Duplicate username                                                                |
| `That email is already in use.`                   | Duplicate account email                                                           |
| `That sourceRef is already in use.`               | Duplicate time entry `sourceRef`                                                  |
| `A pending invite already exists for that email.` | Second pending invite for the same email and target                               |
| `That value is already in use.`                   | Any other unique name, such as a department, tag, task category, or project title |
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

`GET /auth/user/forgot-password?email=` stores a code, emails it with Resend, and always returns `{ "ok": true }` when `email` is present. Another request for the same user within 60 seconds does not send a second mail. Codes expire in 15 minutes. `RESEND_API_KEY`, `EMAIL_FROM`, and optional `RESEND_API_URL` configure mail. Mail failures return 502 `email_failed`: `Email is not configured.` when the key or sender is missing, and `The email could not be sent.` when Resend rejects the request or cannot be reached.

`POST /auth/user/forgot-password` body `{ "email": "", "code": "", "password": "" }` sets the password, consumes the code, clears `mustChangePassword`, revokes refresh tokens, and returns `{ "ok": true }`.

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
- `GET /users/me/workspace?organizationId=` returns the caller's apex workspace. `organizationId` is optional. An unknown or inaccessible id is ignored and the first organization is selected, matching the website when no organization cookie is stored. The response is `{ "viewer", "organizations", "organization", "isAdmin", "isCoordinator", "canSelectRate", "role", "permissions", "groupDepartments" }`. `viewer` is `{ "id", "username", "email", "isSuperAdmin", "name", "initials", "avatarUrl", "timezone" }`. `organizations` is the same list as `GET /organizations` with `limit=100`. `organization` is the selected item or null. `role` is the active membership role code, or null. `permissions` is that organization's permission set. `groupDepartments` is `"all"` for an admin and otherwise the department ids the caller administers. `isCoordinator` is true when `groupDepartments` is a non-empty list. A tenant host and `x-voluntime-tenant` do not pin this route. An API key is forbidden. `mustChangePassword` still returns 403 `password_change_required`.
- `GET /users` is SuperAdmin only, sorted by `username`
- `GET /users/{id}` is the user, a SuperAdmin, or someone who shares an organization. Sharing means the caller has an active membership in an organization the user belongs to. `phone`, `zipCode`, and `notes` are null unless the caller is the user, a SuperAdmin, or an admin of a shared organization.
- `PATCH /users/{id}` is the user or a SuperAdmin
- `DELETE /users/{id}` is the user or a SuperAdmin, and fails with 409 while time entries or projects still reference them

Patch fields: `username`, `email`, `password`, `currentPassword`, `firstName`, `lastName`, `displayName` (up to 100 characters), `timezone`, `phone` (up to 40), `zipCode` (up to 20), `notes` (up to 2000), `avatarUrl` (up to 2000), and `description` (Markdown, up to 8000). `password` requires a non-empty `currentPassword`, or the request fails with `currentPassword is required to change the password.`. A wrong `currentPassword` fails with `The current password is incorrect.`. While `mustChangePassword` is true, `PATCH /users/me` must include a new password; other profile-only patches return 403 `password_change_required`. The update and the refresh-token revocation for a password change are saved together and clear `mustChangePassword`. Null or blank clears `displayName`, `phone`, `zipCode`, `notes`, `avatarUrl`, and `description`. `PATCH /users/me` rejects `isSuperAdmin`. `PATCH /users/{id}` accepts `isSuperAdmin` only from a SuperAdmin. The last SuperAdmin cannot be removed.

Usernames are stored lowercase, 3 to 50 characters, matching `[a-z0-9][a-z0-9._-]*`. Emails are stored lowercase. Passwords are 8 to 200 characters and are bcrypt hashes.

## Roles, organizations, departments, tags

`GET /roles` returns `{ "id", "code", "name" }` for `ADMIN`, `MEMBER`, and `VOLUNTEER`. Roles have no write routes.

Any authenticated user can `POST /organizations` with `{ "name" }` and becomes that organization's `ADMIN`.

Organization `{ "id", "name", "slug", "volunteerHourlyRate", "defaultRateType", "preferences", "themeId", "theme", "wordmarkUrl", "wordmarkOnLightUrl", "markUrl", "accentImageUrl", "description", "websiteUrl", "publicSlug" }`. `slug` is the optional white-label subdomain label (1 to 63 lowercase letters, digits, or hyphens, not starting or ending with a hyphen, and not reserved). `publicSlug` is the optional public openings slug. `description` is Markdown, up to 8000 characters. `websiteUrl` is up to 2000 characters. `volunteerHourlyRate` is the current default volunteer `HourlyRate` (`35.47` when an organization is created). `defaultRateType` is `Volunteer`, `Professional`, or `Paid`. `preferences` is `{ "allowTimeEntryEditing": boolean, "allowVolunteersToAddVolunteers": boolean, "entityLabels": { "organization", "project", "department", "taskCategory" }, "feedbackNotifyUserIds": [], "emailSettings": { "LoggedTime": "immediate" | "weekly" | "off", "UnclassifiedEntry": "immediate" | "weekly" | "off", "FeedbackReceived": boolean, "FeedbackNotify": boolean, "FeedbackCompleted": boolean, "AccessRequestReceived": boolean, "AccessRequestDecided": boolean, "NeedSubmitted": boolean, "NeedDecided": boolean, "VolunteerMessage": boolean } }`. `allowTimeEntryEditing` and `allowVolunteersToAddVolunteers` default to false. A preferences patch may omit `allowVolunteersToAddVolunteers` or `emailSettings` (or individual keys inside `emailSettings`), which fills defaults (`immediate` for `LoggedTime` and `UnclassifiedEntry`, `true` for the boolean notification flags). Entity label defaults are Organization, Project, Department, and Task category. Creating an organization assigns the seeded VolunTime global theme.

- `GET /organizations` lists organizations the caller belongs to. SuperAdmin lists all.
- `GET /organizations/{id}` requires membership or SuperAdmin
- `PATCH /organizations/{id}` requires an organization admin. Fields: `name`, `slug`, `volunteerHourlyRate`, `defaultRateType`, `preferences`, `themeId`, `wordmarkUrl`, `wordmarkOnLightUrl`, `markUrl`, `accentImageUrl`, `description`, `websiteUrl`, and `publicSlug`. Null or blank clears `slug`, `description`, `websiteUrl`, and `publicSlug`. Changing `slug` is forbidden when the request is pinned to a tenant host via `x-voluntime-tenant`. `volunteerHourlyRate` updates the organization's default volunteer rate. `themeId` must be a global theme or a theme owned by this organization. Marks stay on the organization.
- `GET/POST /organizations/{id}/themes` and `PATCH/DELETE /organizations/{id}/themes/{themeId}`. List requires membership. Create, edit, and delete require an organization admin and apply only to org-owned themes. Global themes are read-only; saving edits of a global theme creates a new org-owned copy in the UI. Theme body: `name`, hex colors `primary`, `primaryForeground`, `highlight`, `accent`, `success`, `surface`, `surfaceForeground`, `foreground`, and `chartColor`, fonts `headingFont` and `bodyFont` (`HelveticaNeue`, `AvenirNext`, `SourceSans3`, `NunitoSans`, or `Geist`), `categoricalPalette` (6–8 colors), `sequentialPalette` (5–10), and `divergingPalette` (7). Helvetica Neue and Avenir Next use system fonts with Source Sans 3 / Nunito Sans fallbacks. `chartColor` is the single color used by every chart. Deleting the active org theme reassigns the organization to VolunTime.
- `GET/POST /organizations/{id}/hourly-rates` and `PATCH/DELETE /hourly-rates/{id}`. Create and edit require an organization admin. List requires membership. Body `{ "type", "name", "perHourRate", "isDefault", "isArchived", "source" }`. `type` is `Volunteer`, `Professional`, or `Paid`. `source` is optional, 1 to 200 characters, and empty when omitted or blank. A patch can set `source` to `null` to clear it. Each organization has exactly one default volunteer rate. Only a volunteer rate can be the default, and that rate cannot be archived or deleted. Archived rates stay in this list. Time entries snapshot `hourlyRateId` and `hourlyRate`; deleting a rate that is still referenced fails with 409 `Archive this rate instead. Time entries still use it.`.
- `DELETE /organizations/{id}` requires an organization admin and fails with 409 while time entries remain
- `GET/POST /organizations/{id}/task-categories` and `PATCH/DELETE /task-categories/{id}`. Create and edit require an organization admin. Body `{ "name" }`. Delete fails with 409 while time entries remain.
- `GET/POST /organizations/{id}/projects` and `GET/PATCH/DELETE /projects/{id}`. Body includes `title`, `accessType` (`Public`, `Private`, or `Department`), optional `projectType` (`Project` or `Event`, default `Project`), optional `departmentId`, `description`, `startDate`, `endDate`, `isActive`, and `editorIds`. Department projects require `departmentId`, and other projects must leave it empty. Only an organization admin or that department's admin can make a Department project. Editors must be members of the organization. See Project visibility below.
- `GET /organizations/{id}/report` requires membership. See Reports below.
- `GET /organizations/{id}/time-entries.csv` requires membership and returns the filtered Volunteer Log as CSV. See Reports below.
- `GET /organizations/{id}/summary.csv` requires membership and returns the Summary sheet as CSV. See Reports below.

### Import

`POST /organizations/{id}/imports/people` and `POST /organizations/{id}/imports/projects` require an organization admin. Body `{ "rows": [ ... ] }` with at most 1000 rows. Blank rows are ignored. A row that fails validation is listed in `errors` and the rest continue. Existing records are skipped and not updated: people by email, departments by name, and projects by title. Names and titles match case-insensitively. A repeated key later in the same file is also skipped. `POST /organizations/{id}/imports/departments` remains available for scripts and seed work; the import UI does not expose group import.

Response `{ "created", "skipped", "errors": [{ "row", "message" }] }`. Row numbers start at 1 for the first submitted data row. People also return `passwords`: `{ "email", "username", "temporaryPassword" }` for accounts created by that request. New people must change that password the first time they sign in. `username` is derived from the email when it is omitted. `role` defaults to `VOLUNTEER`. `timezone` defaults to `UTC`. `primaryDepartment` and project `department` are existing department names; an unknown name is a row error and does not create a department. Project `accessType` defaults to `Public`, `projectType` to `Project`, and `isActive` to true. Department projects require `department`. Public and Private projects must leave it empty. The project owner is the caller.

People fields: `email`, `firstName`, `lastName`, `displayName`, `timezone`, `phone`, `zipCode`, `notes`, `memberNumber`, `username`, `role`, `primaryDepartment`. Department field: `name`. Project fields: `title`, `description`, `projectType`, `accessType`, `department`, `startDate`, `endDate`, `isActive`. Dates are `yyyy-MM-dd` or `M/d/yyyy`. Booleans accept `true`, `false`, `yes`, and `no`.

### Project visibility

Organization admins and SuperAdmins see every project in the organization. Other members see Public projects, projects they own or edit, and Department projects for departments they belong to. `GET /organizations/{id}/projects` returns only the projects the caller can see, sorted by `title`. `GET /projects/{id}` returns 403 for a project the caller cannot see. Projects can be changed by their owner, their editors, an organization admin, or, for a Department project, that department's admin.

Time can be logged against a Private project only when the worker owns or edits it, or the caller is an organization admin or SuperAdmin.

Department `{ "id", "organizationId", "name" }`:

- `GET/POST /organizations/{id}/departments`. Create requires an organization admin. Body `{ "name" }`.
- `GET /departments/{id}` requires organization membership
- `PATCH/DELETE /departments/{id}` requires an organization admin. Delete fails with 409 while time entries remain. Names are unique per organization, case-insensitively.

Tag `{ "id", "organizationId", "name" }`:

- `GET/POST /organizations/{id}/tags`. Create requires an organization admin. Body `{ "name" }`.
- `PATCH/DELETE /tags/{id}` requires an organization admin. Names are unique per organization, case-insensitively.

Volunteer need `{ "id", "organizationId", "createdByUserId", "publicToken", "name", "description", "type", "countNeeded", "countVetted", "startDate", "endDate", "requiredBy", "allowPublic", "requireVetting", "questions", "projectId", "taskCategoryId", "departmentId", "createdAt", "updatedAt" }`. `type` is `Position` or `Task`. `questions` is `{ "version": 1, "items": [{ "id", "prompt", "kind", "choices": [{ "id", "label" }], "correctChoiceIds" }] }`. `kind` is `single` or `multi`. Dates are `yyyy-MM-dd`. `requiredBy` is a date-time. `countVetted` is not writable.

- `GET/POST /organizations/{id}/volunteer-needs` and `GET/PATCH/DELETE /volunteer-needs/{id}` require an organization admin. List accepts `q`, `type`, `projectId`, `departmentId`, `allowPublic` (`true` or `false`), `sort` (`name`, `type`, `startDate`, `endDate`, `countNeeded`, `countVetted`, `createdAt`), and `order` (`asc` or `desc`), plus `limit` and `offset`. Create body includes `name`, `type`, and `countNeeded`. Optional fields are `description`, `startDate`, `endDate`, `requiredBy`, `allowPublic` (default false), `requireVetting` (default false), `questions`, `projectId`, `taskCategoryId`, and `departmentId`. A patch with none of those fields fails with `Provide at least one field to update.`. `countNeeded` cannot be less than `countVetted`. Optional relations must belong to the organization. Delete removes the need and its signups.
- `GET /volunteer-needs/{id}/signups` requires an organization admin. Each signup is `{ "id", "volunteerNeedId", "userId", "guestId", "name", "email", "phone", "kind", "comment", "answers", "passed", "vetted", "createdAt", "linkedUserId" }`. `kind` is `member` or `guest`. `answers` is the snapshot `{ "questionId", "prompt", "choiceIds", "labels" }`. `linkedUserId` is set when a guest email was later tied to a user.
- `POST /volunteer-needs/{id}/signups/{signupId}/vet` and `POST .../unvet` require an organization admin. Vetting fails with 409 `This need is already filled.` when `countVetted` is already `countNeeded`. Each change updates `countVetted`.
- `DELETE /volunteer-needs/{id}/signups/{signupId}` requires an organization admin and decreases `countVetted` when that signup was vetted.
- `POST /volunteer-needs/{id}/emails` requires an organization admin. Body `{ "signupIds", "subject", "body" }`. One email is sent to each selected volunteer. Recipients are not copied on the same message.
- `GET /volunteer-needs/public/{token}` is anonymous. It returns 404 unless `allowPublic` is true. The body is `{ "name", "description", "type", "countNeeded", "countVetted", "remaining", "startDate", "endDate", "requiredBy", "requireVetting", "closed", "questions", "organizationName" }`. Public questions omit `correctChoiceIds`. `closed` is `deadline`, `full`, or null.
- `POST /volunteer-needs/public/{token}/signups` is anonymous and requires captcha. Body `{ "name", "email", "phone", "comment", "answers", "acknowledged", "captchaToken" }`. `acknowledged` must be true. `answers` is `[{ "questionId", "choiceIds" }]`. A bearer token signs the caller up and ignores guest fields. Without a token, `name`, `email`, and `phone` are required. An email that already belongs to a user fails with 409 `account_exists` and `An account already uses this email. Log in to sign up.` A repeated signup fails with 409 `You are already signed up for this need.` A past `requiredBy` fails with 409 `Sign-up for this need has closed.` A full need fails with 409 `This need is already filled.` When `requireVetting` is false and every answer matches, the signup is vetted and `countVetted` increases. Otherwise the signup is kept and left unvetted. Missing captcha configuration fails with 503 `captcha_unavailable` in staging and production.

## Memberships

```json
{
  "id": "",
  "userId": "",
  "organizationId": "",
  "departmentId": null,
  "role": { "id": "", "code": "MEMBER", "name": "Member" },
  "joinedAt": "",
  "rateType": "Volunteer",
  "professionalBillingRate": null,
  "isActive": true,
  "primaryDepartmentId": null,
  "departmentIds": [],
  "orgUserTitle": null,
  "orgUserDescription": null,
  "user": { "id": "", "username": "", "email": "", "firstName": "", "lastName": "", "displayName": null }
}
```

Organization memberships leave `departmentId` null. Department memberships set both ids, and their `rateType`, `professionalBillingRate`, `isActive`, `primaryDepartmentId`, `orgUserTitle`, and `orgUserDescription` are null. `orgUserTitle` is that person's title in the organization (up to 100 characters). `orgUserDescription` is Markdown about that person in the organization (up to 8000 characters). `departmentIds` lists every department the person belongs to. A person may belong to more than one department.

Only active organization memberships grant access. An inactive member cannot read or write the organization, and their department roles in it stop counting. Their time entries are kept.

- `GET /organizations/{id}/memberships` and `GET /departments/{id}/memberships` require membership in the organization
- `POST /organizations/{id}/memberships` requires an organization admin, unless `preferences.allowVolunteersToAddVolunteers` is true and the caller is an active volunteer. Body `{ "email", "username", "password", "firstName", "lastName", "displayName", "timezone", "phone", "zipCode", "notes", "avatarUrl", "description", "orgUserTitle", "orgUserDescription", "role", "departmentIds", "relationship", "emailUser" }`. `firstName`, `lastName`, `email`, and `role` are required. The request always creates a new account, so it also needs `username` and `password`, and the account starts with `mustChangePassword` true. An email that already has an account fails with 409 `account_exists` (`This email already has an account. Send them an invitation instead.`, or for a volunteer `This person already has an account. Ask an admin to invite them.`); existing accounts join an organization only by accepting an invitation. `departmentIds` is optional. `emailUser` defaults to false. When it is true, the new person is emailed their username and temporary password, with a link to sign in. If that mail fails, the new account is removed and the request returns 502 `email_failed`. A duplicate membership fails with 409 `This person is already in the organization.` A volunteer can only create a `VOLUNTEER`, cannot send `departmentIds`, and must send `relationship` (how the new person relates to the volunteer). That request also creates a member connection. If the email is already a member, a volunteer gets 409 `This person is already a member. Ask an admin to connect you.` Any other role, or the setting off, is rejected.
- `GET /organizations/{id}/connections` requires membership. An organization admin sees every connection. Anyone else sees only connections they are part of. `relationship` is how user B relates to user A.
- `POST /organizations/{id}/connections` requires an organization admin. Body `{ "userId", "connectedUserId", "relationship" }`. `relationship` is how `connectedUserId` relates to `userId`. Both people must be active members. A pair can be connected once. Connecting someone to themselves fails validation. A duplicate fails with 409 `These people are already connected.`
- `PATCH /organizations/{id}/connections/{connectionId}` requires an organization admin. Body `{ "userId", "relationship" }`. `userId` is one end of the connection, and `relationship` is from that person's point of view.
- `DELETE /organizations/{id}/connections/{connectionId}` requires an organization admin.
- `PATCH .../memberships/{membershipId}` body may include `role`, and on an organization membership also `rateType` (`Volunteer`, `Professional`, or `Paid`), `professionalBillingRate`, `isActive`, `primaryDepartmentId`, `departmentIds`, `email`, profile fields `firstName`, `lastName`, `displayName`, `timezone`, `phone`, `zipCode`, `notes`, `avatarUrl`, and `description`, and membership fields `orgUserTitle` and `orgUserDescription`. Null or blank clears those optional text fields. `email` is stored lowercase. A duplicate fails with 409 `That email is already in use.` `email` and the profile fields change the person's account, so an organization may change them only while no other organization shares that person and they are not a SuperAdmin; otherwise a change fails with 403 `This person belongs to another organization, so only they can change their profile.` Changing `email` also requires an account the person has never signed in to (`mustChangePassword` still true); otherwise it fails with 403 `This person has signed in, so only they can change their email.` Sending a field's current value is not a change. Organization memberships require an organization admin. Department memberships require that department's admin or the organization admin. `primaryDepartmentId` must be a department of that organization, or null. `departmentIds` replaces the person's departments in that organization. An organization membership patch with none of these fields fails with `Provide at least one field to update.`. Time entries no longer take their rate from membership `rateType` or `professionalBillingRate`.
- `DELETE` removes the membership. The member, an organization admin, or (for a department) that department's admin may do it. Removing an organization membership also removes that user's department memberships in the organization. The account and time entries are kept. The last organization admin cannot be removed or demoted.
- `DELETE /organizations/{id}/memberships` body `{ "membershipIds": [""] }` removes those organization memberships in one request. The same rules apply: an organization admin, or the member when every id is their own. An unknown id fails the whole request with 404 and removes nobody. Removing the last organization admin fails with 409 `The last organization admin cannot be removed.` `membershipIds` is 1 to 100 ids. Duplicates count once.

## Invitations

```json
{
  "id": "",
  "email": "",
  "organizationId": "",
  "departmentId": null,
  "role": { "id": "", "code": "MEMBER", "name": "Member" },
  "invitedByUserId": "",
  "expiresAt": "",
  "acceptedAt": null,
  "revokedAt": null,
  "createdAt": ""
}
```

`POST /organizations/{id}/invitations` and `POST /departments/{id}/invitations` body `{ "email": "", "role": "MEMBER" }`. This always creates a pending invite, even when the email already has an account. The code is emailed and is not in the response. Invites expire after 7 days. One pending invite is allowed per email and target.

Organization invites require an organization admin. Department invites require that department's admin or the organization admin. `departmentId` is null on an organization invite.

`GET` lists invitations for that target. `DELETE /organizations/{id}/invitations/{invitationId}` and the department equivalent revoke a pending invite and return it. An accepted invite cannot be revoked.

`POST /invitations/accept` requires auth. Body `{ "code": "" }`. The signed-in user's email must match the invite. Signup does not accept invites. Accepting a department invite creates an organization `MEMBER` membership when the user has none, and does not change an organization role they already have. Response:

```json
{
  "invitation": {},
  "organizationMembership": {},
  "departmentMembership": null
}
```

`departmentMembership` is null for an organization invite. `organizationMembership` is present when this call created one, and null when a department invite found an existing organization membership.

## Time

User time entry:

```json
{
  "id": "",
  "userId": "",
  "enteredByUserId": "",
  "organizationId": "",
  "departmentId": null,
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

`mode` is `Punch`, `Duration`, or `Total`. Duration and Total require `projectId` and `taskCategoryId` (`Choose a project and a task category.`). Punch may omit both, and may also omit `departmentId`; blank on all three is unclassified. A department project is only valid when `departmentId` matches that project. Tags must belong to the entry's organization. The entry's user must be an active member of the organization. `departmentId` attributes the hours and does not require a department membership. The caller may be that user, a super admin, an organization admin, a department admin for that department, or a volunteer connected to that user in the organization. `enteredByUserId` is the caller. Optional `hourlyRateId` selects an unarchived rate in that organization. A volunteer always uses the default volunteer rate, including when logging for a connection, unless that person's membership `rateType` is `Paid`. Admins and members may choose any unarchived rate. When `hourlyRateId` is omitted, the default volunteer rate is used, except a Paid membership uses the unarchived Paid catalog rate whose amount matches `professionalBillingRate` (`Add a paid hourly rate that matches this person's pay rate.` when none does). A Paid membership cannot be saved on a Volunteer or Professional rate (`Choose a paid hourly rate.`). The server snapshots `hourlyRateId` and `hourlyRate`. Volunteer and Professional rates set `inKindValue` from the minutes. A Paid rate stores `inKindValue` as `0`; gross pay is hours times the snapshot and is not in-kind. SuperAdmin bypasses membership checks and still has to satisfy the time rules.

A user has at most one open punch. Punch `occurredOn` is the user's local date of `startedAt` in their profile timezone. Closing a punch sets `endedAt`, `durationMinutes` (1–1440), and `inKindValue`. Duration entries require `occurredOn`. Send `durationMinutes` from 1 to 1440 with no times, a `startedAt` and `endedAt` (minutes are calculated), or a `startedAt` and `durationMinutes` (the end is calculated). When all three are sent, the minutes must match the times. Total entries require `occurredOn` and `durationMinutes` from 1 to 59940, with empty start and end.

- `GET/POST /users/{id}/time-entries`. Read is the user, a super admin, someone who shares an organization and is not a volunteer there, or a volunteer connected to that user in a shared organization. Someone who only shares an organization sees entries in the organizations they are allowed to read, and gets 403 when filtering by another organization. Write is the user, a super admin, an organization admin, a department admin for the target department, or a volunteer connected to that user in the organization. Optional filters: `organizationId`, `departmentId`, `from`, `to` (`occurredOn`, inclusive). Sorted by `occurredOn` and then `startedAt`, newest first. Optional `sourceRef` on create is a unique import key of 1 to 200 characters. A duplicate fails with 409 `That sourceRef is already in use.`.
- `GET/PATCH/DELETE /time-entries/{id}` for the owner, the person who entered it, a super admin, an organization admin, that department's admin, or a volunteer connected to the entry's user in that organization. A volunteer still cannot change time fields unless `allowTimeEntryEditing` is on.
- `POST /time/clock-in` (201) body `{ "organizationId", "departmentId", "projectId", "taskCategoryId", "description", "tagIds" }`. `departmentId`, `description`, and `tagIds` are optional. `startedAt` is the current time.
- `POST /time/clock-out` (200) closes the caller's open punch. Body may include `description` and `tagIds`.
- `POST /time/duration` (201) and `POST /time/total` (201) create an entry for the caller.

`POST /users/{id}/time-entries` body includes `mode` and the same fields. An open punch omits `endedAt`. A closed punch includes `startedAt` and `endedAt`. A sent `occurredOn` on a punch must match the local date of `startedAt`. A sent `durationMinutes` on a punch must match the calculated minutes.

Patch updates `description`, `tagIds`, `organizationId`, `departmentId`, `projectId`, and `taskCategoryId`. Time fields (`startedAt`, `endedAt`, `durationMinutes`, `occurredOn`) are accepted only when the entry's organization has `preferences.allowTimeEntryEditing` set. Otherwise a punch responds `You cannot change punch times here.` and any other entry responds `Time entries cannot be edited.`. When editing is allowed, Duration and Total entries can patch `durationMinutes` and `occurredOn`. Duration entries can patch `startedAt` and `endedAt`; a new end recalculates the minutes, and new minutes recalculate the end. Punch entries can patch `startedAt`, `endedAt`, and `durationMinutes` with the same calculation, including an open punch. Rates are recalculated when the duration changes. Moving an entry to another organization, or sending `hourlyRateId`, resolves the rate again and recalculates `inKindValue`. When `tagIds` is not sent, the entry's current tags must also belong to the new organization. The destination organization's preference decides whether the time fields are allowed.

Collective time entry:

```json
{
  "id": "",
  "recordedByUserId": "",
  "organizationId": "",
  "departmentId": null,
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

`endedAt` is after `startedAt`. `participantCount` is at least 1. An organization admin may record one for the organization or any of its departments. A department admin may record one only for that department. Members of the organization may read them.

- `GET/POST /collective-time-entries`. Filters: `organizationId`, `departmentId`. Create body is the fields above except `id` and `recordedByUserId` (the caller).
- `GET/PATCH/DELETE /collective-time-entries/{id}`. Patch uses the same fields as create. `organizationId` cannot change.

## Reports

`GET /organizations/{id}/report`, `GET /organizations/{id}/time-entries.csv`, and `GET /organizations/{id}/summary.csv` take the same optional query: `departmentId`, `taskCategoryId`, `projectId`, `userId`, `from`, and `to`. Each id field takes one id or a comma-separated list (`departmentId=id1,id2`) and matches any of them. User entries are filtered by `occurredOn`. Collective entries are filtered by the UTC date of `startedAt` and ignore `userId`. Organization admins see the whole organization. Department admins (group coordinators) are scoped to the union of departments they admin; asking for any `departmentId` outside that set returns 403. Volunteers stay self-only. `user` is volunteer-rate hours. `staff` is the same rollup for professional-rate hours and stays out of volunteer KPIs. Paid-rate hours are omitted from both, from `time-entries.csv`, and from `summary.csv`. Collective entries with a professional rate are omitted from `collective`. `GET /organizations/{id}/payroll` and `GET /organizations/{id}/payroll.csv` use the same query and require `view_payroll` (Admin by default). The JSON is `{ hours, grossPay, people, entries, rows }`. Each row is `{ id, userId, person, group, hours, payRate, grossPay, entries }`, grouped by person, group, and snapshotted pay rate. The CSV columns are Person, Group, Hours, Pay rate, Gross pay, and Entries. Gross pay is hours times the snapshotted rate. It is not tax withholding, deductions, or a pay stub.

```json
{
  "user": {
    "hours": 0,
    "volunteers": 0,
    "entries": 0,
    "inKind": 0,
    "byDepartment": [],
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
    "byDepartment": [],
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
    "byDepartment": [],
    "byCategory": [],
    "byProject": []
  }
}
```

Saved report designs live at `/organizations/{id}/reports`, separate from the rollup at `/organizations/{id}/report`. A member of the organization can list and read them. Creating, updating, and deleting require an organization admin. Names are unique per organization, compared case-insensitively, and at most one report is `isDefault`.

`GET /organizations/{id}/reports` returns `{ "items", "limit", "offset" }` ordered by name. `POST /organizations/{id}/reports` body is `{ "name", "layout", "filters"?, "isDefault"? }`. `isDefault` defaults to false. `filters` defaults to `{}`. `GET/PATCH/DELETE /organizations/{id}/reports/{reportId}` read or change one design. Patch sends any of `name`, `layout`, `filters`, and `isDefault`. Setting `isDefault` true clears the previous default. Creating, changing, or deleting a report, and writing report templates, needs `manage_organization` or `design_reports`; an API key must be an admin key.

`layout` is `{ "version": 1, "cards": [ ... ] }`. A card has `id`, `kind` (`value`, `chart`, or `list`), `title`, `description`, `column`, `row`, `columns`, `rows`, and `accessor`. Position is 1-based. `column` plus `columns` stays inside 12, and `row` plus `rows` stays inside 48. Cards cannot overlap. A report has at most 40 cards. `accessor` is a lodash-get path into the rollup, such as `user.hours` or `user.byDepartment`. Every card has `format` (`number`, `hours`, or `currency`) and `pattern`, a numeral format string. A missing `pattern` is filled from `format` (`0,0.[00]` for number and hours, `$0,0.00` for currency). A value card also has `color` (`primary`, `highlight`, `accent`, `success`) and optional `icon` (a Lucide icon name, or null). A chart card also has `chartType` (`donut`, `pie`, `bar`, `column`), `palette` (`single`, `categorical`, `sequential`, `diverging`), and `valueKey` (`hours` or `inKind`). A list card also has `visibleColumns`, a unique subset of `name`, `type`, `hours`, `share`, `people`, and `inKind`.

`filters` may include `departmentId`, `taskCategoryId`, `projectId`, `userId`, `from`, and `to`. Id fields accept one id or an array of ids and are always returned as arrays. Empty or null values are omitted. `from` is on or before `to` when both are set.

Report templates live at `/organizations/{id}/report-templates`. A member can list and read them. `GET /organizations/{id}/report-templates` returns the layouts that organization should see: for each global template, the organization's override when one exists, otherwise the global, then templates owned by the organization. Each item has `id`, `organizationId`, `key`, `name`, `layout`, `baseTemplateId`, `scope` (`global`, `organization`, or `override`), `createdAt`, and `updatedAt`. `key` is the global key (`summary`, `people`, `groups`, or `staff`) for a global or for the global an override replaces.

`POST /organizations/{id}/report-templates` (201) requires an organization admin. Body `{ "name", "layout" }` creates a template owned by the organization. Body `{ "baseTemplateId", "layout", "name"? }` creates an override of a global template; a second override for the same global updates the existing row. `GET/PATCH/DELETE /organizations/{id}/report-templates/{templateId}` read or change one template the organization can see, including a global. Patch sends `name` and `layout`. Only a SuperAdmin can patch a global template. An organization admin who wants a different global layout creates an override instead. Delete removes an organization template or an override and makes the global show again. Globals are not deleted.

`GET /organizations/{id}/reports/{reportId}/data` returns the same rollup as `GET /organizations/{id}/report`. It applies the saved filters, then the caller's own scope. Query `from` and `to` replace the saved dates. `clearDates=true` drops the saved dates first, so the request can ask for all time. The response is one payload for every card.

Each group item is `{ "id", "label", "hours", "volunteers", "entries", "inKind" }`. `hours` is total minutes divided by 60, rounded to 5 decimals. `inKind` is rounded to 2 decimals. `volunteers` counts distinct users with a non-empty person label and is always 0 for collective groups and month buckets. Hours without a department use id `organization` and the organization name. `byVolunteer` uses the same people as `byPerson` but excludes hours from the task category named `Participant Hours` while still including all in-kind. `byMonth` is calendar months of `occurredOn`, labeled with the English month name and sorted by year then month. A person's label is their display name, then `firstName lastName`, then their username; empty first and last names stay blank and do not count as unique volunteers. A collective entry counts the minutes between `startedAt` and `endedAt`, rounded to the nearest minute with 30 seconds rounding up. Groups other than `byMonth` are sorted by `hours` descending, then `label`, then `id`, comparing strings by UTF-16 code unit.

The Volunteer Log CSV has content type `text/csv; charset=utf-8`, UTF-8 without a byte order mark. Lines end with `\n`, and there is no newline after the last row. Column names use the organization's entity labels. The first line is:

```text
Date,{project},Volunteer,{department} / {organization},{taskCategory},Entry Method,Start Time,End Time,Manual Duration,Hours,Rate Type,Hourly Rate,In-Kind Value,Tags,Entered By,Date Entered,Hour Attribution,Notes,Volunteer ID
```

Rows are user entries sorted by `occurredOn` and then `createdAt`. Cell formats match Excel display:

- Date and Date Entered are `M/D/YYYY` in UTC.
- `{department} / {organization}` is the department name, or the organization name when there is no department.
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

`GET /organizations/{id}/summary.csv` stacks a KPI block (`Total Volunteer Hours`, `Total In-Kind Value`, `Unique Volunteers`, `Total Entries`) and five tables (organization/department buckets, task category, month, volunteer, project) using the same numbers as the report. Volunteer table hours use `byVolunteer`.

A cell that starts with `=`, `+`, `-`, `@`, a tab, or a carriage return gets a leading `'`. A cell containing `"`, `,`, a newline, or a carriage return is wrapped in double quotes, with each `"` doubled.

## Email templates

Email templates live at `/organizations/{id}/email-templates`. Each organization has one per email type (`for`), seeded when it is created. There is no create or delete.

`GET /organizations/{id}/email-templates` (any member) lists all 13 in a fixed order and adds any that are missing. Each item has `id`, `organizationId`, `name`, `version`, `for`, `subject`, `heading`, `preview`, `template`, `isEnabled`, `isOptional`, `fields` (the placeholders that type allows), `createdAt`, and `updatedAt`. `GET .../email-templates/{templateId}` reads one.

`PATCH .../email-templates/{templateId}` requires an organization admin. Body may include `name` (1–80), `subject` (1–200), `heading` (1–120), `preview` (0–200), `template` (HTML, up to 20000 characters), and `isEnabled`. `template` is sanitized to `p`, `h1`–`h3`, `strong`, `em`, `a` (http, https, mailto, or a `{{field}}` href), `ul`, `ol`, `li`, `br`, and `span[data-placeholder]`; a body with no text after that fails with `template is required.`. A `{{field}}` outside that type's catalog fails with `{{field}} is not a field for this email.`. Sending `for` fails with `for cannot be changed.`. Only `LoggedTime` and `UnclassifiedEntry` can set `isEnabled` to false; any other fails with `This email cannot be turned off.`. A patch with none of these fields fails with `Provide at least one field to update.`. Each successful patch adds 1 to `version`.

`POST .../email-templates/{templateId}/reset` requires an organization admin. It restores the default name, subject, heading, preview, and body, turns the email back on, and adds 1 to `version`.

`LoggedTime` is sent to the person whose hours were saved, once per save: a classified clock-out, a single classified duration or total entry, or a multi-day batch (hours summed). Open punches, edits, and group sessions do not send it. Before any email is sent, the server checks both `Organization.preferences.emailSettings` (`Invite`, `Welcome`, and `PasswordReset` are always enabled; `LoggedTime` and `UnclassifiedEntry` send immediately only when set to `"immediate"`; `weekly` waits for the Monday digest; `off` sends nothing; the remaining 8 notification types send when their boolean flag is `true`) and the template's `isEnabled` flag. A failed send never undoes the save.

`GET /api/cron/email-digest` sends the weekly digests. It requires `Authorization: Bearer <CRON_SECRET>`. For each organization whose Logged time setting is `weekly`, each person receives one email of the classified hours they saved in the previous seven days, using the Logged time template (`entry.hours`, `entry.date`, `entry.url`). For Unclassified entry set to `weekly`, each person who still has unclassified timer entries receives the unclassified template, linking to `/entries?unclassified=1`. The week already sent is stored at `preferences.emailDigest` so a second run in the same UTC week does not send again. When email is not configured the route returns 503 and does not stamp the week.

## Organization API keys

Next.js accepts organization API keys on REST and `/mcp`, subject to their scopes. A key is shown once at create or rotate: `cki_live_<prefix>_<secret>` in production, `cki_test_…` otherwise. Send `Authorization: Bearer <key>` or `X-Api-Key: <key>`. Only the HMAC hash is stored. Key create, list, rotate, and revoke require a human organization admin JWT. A key cannot mint other keys.

Scopes:

- `org:read` — get and list the organization and its catalogs, members, projects, time, reports
- `org:write` — time, projects, tags, task categories, departments, collective time
- `org:admin` — memberships, invitations, rates, themes, organization settings. Not organization delete.

`GET/POST /organizations/{id}/api-keys`. Body `{ "name", "scopes", "expiresAt" }`. `name` is 1 to 80 characters. `scopes` is a non-empty array of the values above. `expiresAt` is optional. Create returns the plaintext `key` once. List omits `key`.

`PATCH /organizations/{id}/api-keys/{keyId}` updates `name`, `scopes`, or `expiresAt`. `POST .../rotate` issues a new secret and prefix. `DELETE` revokes. Clock-in and clock-out with a key require `userId`.

## MCP

MCP is Streamable HTTP at `/mcp` on Next.js. Tools wrap the same feature services as REST. Auth, signup, password reset, SuperAdmin user list, feedback moderation, and deleting an organization are not exposed. Platform-key endpoints are not part of this app. Existing platform-key rows stay in the database and do not grant access.

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

After organization creation, organization admins manage the organization, its theme, departments, projects, task categories, tags, rates, invitations, membership roles, and collective time for the organization or any department. They may also enter user time for a member. Department admins manage that department's invitations, membership roles, collective time, and user time for that department. Members read the organization and manage only their own user time against a target they belong to. User totals and collective totals stay separate in reports.
