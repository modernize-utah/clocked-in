# White-label subdomain hosting on voluntime.app

VolunTime stays one deployment for every community. CASWJ is one tenant (`caswj.voluntime.app` when its slug is `caswj`). Sister tenants and other communities launch the same way, each with its own slug, theme, and marks. They do not get a separate Vercel project, and the product is not hosted at `portal.wjarts.org` or `wjarts.org/portal`.

Platform chrome stays VolunTime. Each tenant uploads its own wordmark and mark. Do not invent a CASWJ flame in the product.

Each environment is a single deployment of this codebase with its own database and environment variables. The apex host serves multi-tenant VolunTime, and each launched tenant is served on its own subdomain (`{slug}.{APP_HOST}`).

Launching an tenant writes `Tenant.slug` in that environment's database from **Settings → Tenant** on the apex host. It does not require creating a separate Vercel project.

## Host rules and environment variables

| Variable     | Production                          | Staging                                               | Local (default)                             |
| ------------ | ----------------------------------- | ----------------------------------------------------- | ------------------------------------------- |
| `APP_URL`    | `https://voluntime.app`             | `https://staging.voluntime.app`                       | `http://localhost:3025`                     |
| `APP_HOST`   | `voluntime.app`                     | `staging.voluntime.app`                               | unset (or `localhost` for subdomain checks) |
| `EMAIL_FROM` | `VolunTime <noreply@voluntime.app>` | `VolunTime (staging) <noreply@staging.voluntime.app>` | `VolunTime (dev) <noreply@voluntime.app>`   |

- **Apex host**: `APP_HOST`, `www.{APP_HOST}`, `localhost`, `127.0.0.1`, or any host that is not a single DNS label under `APP_HOST` (such as `*.vercel.app` or `*.baddley.us`). Serves multi-tenant VolunTime with public sign-up and the tenant switcher.
- **Tenant host**: `{slug}.{APP_HOST}` (for example, `caswj.voluntime.app` on production and `caswj.staging.voluntime.app` on staging). Tenant resolution pins Next.js pages, server actions, and API requests to that tenant.
- **Reserved labels**: `www`, `app`, `api`, `staging`, `mail`, `admin`, `static`, `blob`, `status`, `support`, `help`, `docs`. Reserving `staging` prevents any production tenant from claiming `staging.voluntime.app`.
- **Unknown tenant slug**: returns 404 Not Found.
- **Tenant host behavior**: invite-only (no public `/signup` or `POST /auth/user`), uses that tenant's theme and marks before and after login, hides the tenant switcher, and requires active membership in that tenant (even for SuperAdmins).
- **Cookies**: session cookies (`ci_access`, `ci_refresh`, `clocked-in-org`) remain host-only (`Domain` attribute is never set), isolating `staging.voluntime.app`, `*.staging.voluntime.app`, `voluntime.app`, and `*.voluntime.app`.

## DNS and Vercel domains

DNS wildcards match only a single label, so `*.voluntime.app` does not match `caswj.staging.voluntime.app`. Configure both environments on the single Vercel project:

### Production (`main` branch)

- `voluntime.app`
- `*.voluntime.app`

### Staging (`staging` branch)

- `staging.voluntime.app` (more specific than production's `*.voluntime.app` wildcard)
- `*.staging.voluntime.app`

## Email and Resend

- Verify `voluntime.app` and `staging.voluntime.app` in Resend so `EMAIL_FROM` can send from each environment's apex.
- When an tenant has a `slug`, invitation links (`https://{slug}.{APP_HOST}/accept?code=...`) and password-reset links (`https://{slug}.{APP_HOST}/forgot-password?code=...`) automatically point to the tenant's launched host. When `slug` is null, links use `APP_URL`.

## Local subdomain verification

Browsers resolve `*.localhost` to loopback automatically:

1. Set a slug (e.g. `caswj`) on an tenant from `http://localhost:3025/settings/tenant`.
2. Open `http://caswj.localhost:3025/login`.

## Production seed

CASWJ staff run the **named** workbook import on the production database (`SEED_ALLOW_REAL_NAMES=1` on that machine). Do not commit real names and do not auto-seed them from CI. Staging uses `npm run db:seed:caswj:anon`.
