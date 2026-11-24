# VolunTime as a CASWJ Portal consumer

VolunTime uses the **CASWJ Portal** as the system of record for sign-in and directory data when a tenant opts in. The portal contract is documented in [Using the CASWJ Portal.md](./Using%20the%20CASWJ%20Portal.md). This page describes how VolunTime maps that contract.

## Entity mapping

| Portal | VolunTime |
|--------|-----------|
| Society (`kind: society`) | **Tenant** (community) |
| Artistic organization (`kind: ao`) | **Organization** |
| Person | `User` (`externalId` = portal person id / ID-token `sub`) |
| Role | `Role` (`externalId`) |
| Membership at society | `TenantMembership` |
| Membership at AO | `OrganizationMembership` |
| Position holding | `title` on the matching membership |

## Configure a tenant

1. Register VolunTime under **Services** in the portal. Callback URL: `{appOrigin}/auth/external/callback`.
2. In VolunTime **Settings → External**, set portal origin, client id/secret, API token, and webhook secret.
3. Enable **Use portal for sign-in** and/or **Sync directory**.
4. Register webhook URL `{appOrigin}/webhooks/tenants/{tenantId}/portal` for the event types you need. Signature header: `CASWJ-Signature`.

## Auth

OIDC authorization code + PKCE. VolunTime discovers endpoints from `{portalOrigin}/.well-known/openid-configuration`, exchanges the code, and verifies the ID token with JWKS (RS256). People are matched on `sub` → `User.externalId`.

## Directory sync

VolunTime pulls `GET /api/v1/{people,organizations,roles,memberships,positions}` with the portal API token, paginating until `complete: true`. A minute cron runs when `portalDirectoryCron` is set. Webhook events trigger a full pull after signature verification.

While directory sync is on, people, roles, and organizations are read-only in VolunTime and invites are hidden.
