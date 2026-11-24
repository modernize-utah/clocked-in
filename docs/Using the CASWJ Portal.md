# Using the CASWJ Portal from another app

Instructions for an app that wants the portal to sign people in, to read the published directory, or to receive a notice when that directory changes. A CASWJ administrator registers your app first. You receive only the grants they turn on.

The portal origin is the site they name. Production is `https://portal.wjarts.org`. Every URL below is on that origin. `iss` on a sign-in token is that same origin.

This page is the contract the portal implements. `docs/guide/service-integration.md` describes how one consumer applies a directory on its own side. Map these resources into your own groups, organizations, and schedules there.

This release is in the repository and is not on the dev or production database yet. Calls fail until an administrator applies it and gives you a client.

## What you can be granted

Each grant is independent.

| Grant   | What your app does                                                                                        |
| ------- | --------------------------------------------------------------------------------------------------------- |
| Sign-in | Send the person's browser to the portal. After they sign in, your server receives a short-lived ID token. |
| Read    | `GET` the published directory with a bearer token.                                                        |
| Events  | Accept an HTTPS `POST` when a published record changes.                                                   |

An empty organization list grants nothing. Revoking the client stops new tokens and stops event delivery immediately.

The portal publishes adults in these tenants only: the society (CASWJ) and its artistic tenants (WJS, WJYT, and any later tenant an administrator includes). Individual youth records are never a resource and never an event. Contacts, finance, agreements, and raw audit history stay inside the portal.

## Ask an administrator to register you

Send them this list. They enter it under **Services**. Secrets are shown once. Store them on your server. A browser app never holds a client secret, an API token, or a webhook secret.

| You send                                               | You receive                                                                               |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Display name                                           | Public `client_id`, shaped `c` plus 20 hex characters                                     |
| Whether your server can keep a secret                  | A client secret (`caswj_cs_…`), or a mark that you are a public client and have no secret |
| Exact callback URLs                                    | Each URL registered character for character                                               |
| Host names for those URLs and for webhooks             | Authorized domains. A callback or webhook whose host is not on this list is refused       |
| Tenants you need (CASWJ, WJS, WJYT, or a subset) | That allow-list. You see nothing outside it                                               |
| Scopes below                                           | That scope allow-list. Asking for a scope that is not on it fails the request             |
| A read with no person signed in                        | An API token (`caswj_at_…`)                                                               |
| An HTTPS URL and the event types you want              | A webhook signing secret (`caswj_wh_…`)                                                   |

Callback URLs are `https`. `http://localhost` and `http://127.0.0.1` (with a port) are accepted for development. No fragment, no user info, no spaces, 500 characters or fewer. The host must already be an authorized domain.

Webhook URLs are `https` on a public host. Localhost, link-local, and private addresses are refused, including after DNS lookup.

### Scopes

Sign-in scopes appear on the ID token. Read scopes allow the matching API and the matching events. Portal permission keys (`people.read` inside the portal, `system.admin`, and the rest) are not copied onto your token.

| Scope                | Grants                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `openid`             | Required on every sign-in request                                                                  |
| `profile`            | `name` on the ID token                                                                             |
| `email`              | `email` on the ID token                                                                            |
| `memberships`        | Active memberships on the ID token, inside your organization allow-list                            |
| `people.read`        | People, and person events                                                                          |
| `organizations.read` | Organizations, and organization events                                                             |
| `roles.read`         | Portal access roles, and role events                                                               |
| `memberships.read`   | Membership rows, and membership events. This does not include the `memberships` sign-in claim      |
| `positions.read`     | Jobs such as Chair and Vice Chair, and position events. These are jobs, separate from portal roles |

## Discover the endpoints

```http
GET /.well-known/openid-configuration
GET /.well-known/jwks.json
```

The discovery document lists the authorize URL, the token URL, and the JWKS URL. Use those values. The JWKS document is `{ "keys": [ … ] }`. Each key is an RSA key with `alg` `RS256`, `use` `sig`, and a `kid`. During a key change, two keys are listed. Verify with the `kid` on the token.

`signing_keys_ready: false` means the portal cannot sign yet. The token URL then returns `server_error`.

## Sign a person in

The portal keeps its own sign-in: an invitation and an email code. Your app does not collect a password and does not create portal accounts.

Use the authorization-code pattern. The browser comes back with a one-time code. Your server exchanges that code. The ID token never travels on the redirect.

### 1. Start on your server

Create a `state` value of 1 to 512 characters, store it, and check it on the way back.

Create a PKCE verifier: 43 to 128 characters from `A–Z`, `a–z`, `0–9`, and `.` `_` `~` `-`. The challenge is the SHA-256 of that verifier, base64url-encoded, with no padding. The method is `S256`.

### 2. Send the browser to the portal

```http
GET /oauth/authorize?response_type=code
  &client_id=CLIENT_ID
  &redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback
  &scope=openid%20profile%20email%20memberships
  &state=STATE
  &code_challenge=CHALLENGE
  &code_challenge_method=S256
```

`redirect_uri` must match a registered callback exactly. `scope` is space-separated, must include `openid`, and every scope must be granted to your client. `response_type` must be `code`.

If the person has no current portal session, they complete the email-code screen and return to this address. They then see a confirmation screen that names your app and the scopes. A CASWJ-owned service can be set to skip that screen.

### 3. Take the code on your callback

Success:

```text
https://app.example.com/callback?code=caswj_ac_…&state=STATE
```

The person chose Cancel:

```text
https://app.example.com/callback?error=access_denied&state=STATE
```

Check `state` before you exchange the code. The code lasts 5 minutes and works once. A wrong client, a wrong callback, or a bad challenge stays on the portal and is not sent to an unregistered address.

### 4. Exchange the code

`POST /oauth/token` as `application/x-www-form-urlencoded` or JSON. The secret goes in the body. HTTP Basic authentication is not accepted. A public client omits `client_secret`. Sending a secret for a public client fails.

```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=caswj_ac_…
&redirect_uri=https://app.example.com/callback
&client_id=CLIENT_ID
&client_secret=CLIENT_SECRET
&code_verifier=VERIFIER
```

```json
{
  "access_token": "caswj_ak_…",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "caswj_rt_…",
  "id_token": "eyJ…",
  "scope": "email memberships openid profile"
}
```

`expires_in` is seconds. The access token lasts 15 minutes. The refresh token lasts 14 days.

Refresh by posting `grant_type=refresh_token`, `refresh_token`, `client_id`, and `client_secret` (omit the secret for a public client). The old refresh token is revoked when the new pair is issued. A revoked client, a person removed from the sign-in list, or a scope the client no longer has will fail the refresh.

Token errors are JSON `{ "error": "…" }` with `Cache-Control: no-store`:

| Status | `error`                  | When                                                                            |
| ------ | ------------------------ | ------------------------------------------------------------------------------- |
| 400    | `unsupported_grant_type` | `grant_type` is not `authorization_code` or `refresh_token`                     |
| 400    | `invalid_client`         | Unknown client, revoked client, or the secret does not match                    |
| 400    | `invalid_grant`          | Code or refresh token is missing, used, expired, or the verifier does not match |
| 400    | `invalid_scope`          | A requested scope is unknown or not granted. `openid` was missing on sign-in    |
| 500    | `server_error`           | The portal has no signing key                                                   |

### 5. Verify the ID token

The ID token is a JWT signed `RS256` by the portal. It is a different token from the portal session cookie. Verify the signature with the JWKS key whose `kid` matches the header. Then check:

| Claim         | Meaning                                                                    |
| ------------- | -------------------------------------------------------------------------- |
| `iss`         | The portal origin                                                          |
| `aud`         | Your `client_id`                                                           |
| `sub`         | The person's id. This is the stable match key. An email address can change |
| `iat`, `exp`  | Issued-at and expiry, Unix seconds. Lifetime is 15 minutes                 |
| `email`       | Present when the `email` scope was granted                                 |
| `name`        | Display name, when `profile` was granted                                   |
| `memberships` | When `memberships` was granted                                             |

Each membership is:

```json
{
  "organization": "WJS",
  "role": "AO Chair",
  "positions": ["Chair"]
}
```

`organization` is the short name. `role` is the portal access role. `positions` lists current jobs in that tenant. Ended, future, and suspended memberships are left out. Organizations outside your allow-list are left out.

The access token in the same response is an opaque string (`caswj_ak_…`). Use it as a bearer token on the read API. It acts as that person, for the scopes on the token, inside organizations that both your client and that person may read.

## Read the directory

```http
GET /api/v1/people
Authorization: Bearer ACCESS_OR_API_TOKEN
```

Resources: `people`, `organizations`, `roles`, `memberships`, `positions`, and `directory`.

Two bearer tokens work:

- The access token from sign-in. The read is limited to what that person can read in the portal, and to your organization allow-list.
- The API token (`caswj_at_…`). There is no person. The read is your client's scopes and organization allow-list. Keep this token on your server.

Query parameters:

| Parameter       | Meaning                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| `limit`         | Page size. Default 100. Values above 200 are treated as 200                                                        |
| `cursor`        | The `next_cursor` from the previous page. A person's, tenant's, role's, membership's, or position-holding id |
| `updated_since` | ISO timestamp. Returns rows whose directory record changed after that time                                         |
| `snapshot`      | `1` returns a full page and ignores `updated_since`                                                                |

A list response:

```json
{
  "data": [],
  "next_cursor": null,
  "complete": true
}
```

Follow `next_cursor` until `complete` is `true`. Apply a snapshot as the full set only when the response succeeded and `complete` is `true`. A failed call or `complete: false` is a partial page. Keep your local copy.

`GET /api/v1/directory` returns one object with a page for each read scope you have, plus `complete`. Each included page is capped at 200 rows and ignores `updated_since` and `cursor`. When `complete` is `false`, page that resource on its own URL.

Read errors:

| Status | `error`              | When                                                            |
| ------ | -------------------- | --------------------------------------------------------------- |
| 401    | `invalid_token`      | Missing, unknown, expired, or revoked bearer                    |
| 403    | `insufficient_scope` | The token does not include that resource's read scope           |
| 400    | `invalid_request`    | Bad `updated_since`, bad `limit`, or a cursor that is not an id |
| 404    | `not_found`          | The resource name is not in the catalog                         |

### Record shapes

People. Match on `id`. `email` can also be used and can change. `active` means the person may still sign in. Stand-in records are omitted. A person appears only with a membership in an allowed tenant.

```json
{ "id": "…", "name": "Ada Admin", "email": "ada@example.com", "active": true }
```

Organizations. Match on `id` or `short_name`. `kind` is `society` or `ao`.

```json
{ "id": "…", "name": "West Jordan Symphony", "short_name": "WJS", "kind": "ao", "active": true }
```

Roles. These are portal access roles. Match on `id`. `scope` is the role's own scope label in the portal.

```json
{ "id": "…", "name": "AO Chair", "description": "…", "scope": "tenant", "active": true }
```

Memberships. One row per person, tenant, and role.

```json
{
  "id": "…",
  "person_id": "…",
  "organization_id": "…",
  "organization": "WJS",
  "role_id": "…",
  "role": "AO Chair",
  "starts_on": "2026-07-01",
  "ends_on": null,
  "suspended": false
}
```

Positions. One row per person holding a job. Match on `id`. Map these to your own groups if you need groups. The portal does not publish organizations.

```json
{
  "id": "…",
  "person_id": "…",
  "organization_id": "…",
  "organization": "WJS",
  "position_id": "…",
  "position": "Chair",
  "starts_on": "2026-07-01",
  "ends_on": null
}
```

## Receive events

An administrator registers your HTTPS URL, the event types, and an optional tenant filter. You get a signing secret once.

The portal `POST`s JSON. Delivery is at-least-once. Store `id` and ignore a repeat. Answer with a `2xx` within 10 seconds. Any other status, a timeout, or a network failure is retried (about 1 minute, 5 minutes, 15 minutes, then hourly) and marked failed after 8 attempts. Redirects are not followed, so return `2xx` from the registered URL itself.

A daily run sends what is still waiting. An administrator can also send the queue immediately.

```http
POST /your/webhook
Content-Type: application/json
CASWJ-Signature: t=1732320000,v1=hex-hmac

{"id":"…","type":"membership.started","occurred_at":"2026-11-23T18:00:00.000Z","data":{}}
```

Compute HMAC-SHA256 over the string `timestamp + "." + raw body`, using your signing secret, and compare the hex digest to `v1` in constant time. Use the raw body bytes. Reject a timestamp more than five minutes from your clock.

`data` is the same object the read API returns for that record. On a delete, `active` is `false` for a person or tenant, and an ended membership or position is the last published row.

| Event                                                                                  | Scope you need       | `data`           |
| -------------------------------------------------------------------------------------- | -------------------- | ---------------- |
| `person.created`, `person.updated`, `person.deactivated`                               | `people.read`        | Person           |
| `organization.created`, `organization.updated`                                         | `organizations.read` | Tenant     |
| `role.created`, `role.updated`                                                         | `roles.read`         | Role             |
| `membership.started`, `membership.updated`, `membership.suspended`, `membership.ended` | `memberships.read`   | Membership       |
| `position.started`, `position.updated`, `position.ended`                               | `positions.read`     | Position holding |

A person event is sent once per tenant they belong to, and only to clients allowed to see that tenant. A new person with no membership yet produces no delivery until a membership exists. A membership change also sends `person.updated` for that tenant.

Role events have no tenant. They go to subscriptions that have no tenant filter, and only when your client has at least one tenant.

A subscription with an tenant set receives events for that tenant only.

You can ignore the body and pull a snapshot when any event arrives. Dedupe on `id` either way. The portal still sends the signed envelope.

## Keep these rules

- Verify the ID token. Check `iss`, `aud`, `exp`, and the signature. Match people on `sub`.
- Call the token URL and the read API from your server. The API token and the client secret stay there.
- Treat `complete: true` as the end of a snapshot. Keep your local rows when the call fails or `complete` is `false`.
- Dedupe events on `id`.
- When the administrator rotates a secret or revokes the client, stop using the old values. Refresh tokens and API tokens from a revoked client stop working.
- Ask before you need a resource beyond this directory. Calendar events, report totals, contacts, and finance are each a separate decision.
