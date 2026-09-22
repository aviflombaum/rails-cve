# Self-hosting

Run Rails CVE on your own Cloudflare account. You get the same site, feed, workspaces, email, and webhooks as the hosted service, with your own database, secrets, and sender. Cloudflare usage charges may apply.

There are two routes:

- **Manual**, following this page. Best if you want to understand each piece.
- **Button or agent**, following [Deploy with an agent](deploy-with-agent.md). The Cloudflare button imports the repository into your account; the prompt lets your coding agent do these steps for you.

Local development needs no Cloudflare account. See the README for that.

## What you need

| Item | Why |
| :--- | :--- |
| Cloudflare account with Workers and D1 | Runs the app and stores its state |
| Bun 1.3.14+ and Node 22+ | Build, tests, and Wrangler |
| Two random 32-byte hex secrets | `ENCRYPTION_KEY` for stored secrets, `ADMIN_TOKEN` for admin endpoints |
| An HTTPS origin | Your `workers.dev` hostname or a custom domain on a Cloudflare zone |

Optional, each enabled separately with your own credentials:

| Feature | Needs |
| :--- | :--- |
| Webhook delivery | The [egress gateway](egress.md) on a host you control |
| Email notifications | SMTP credentials or Cloudflare Email Service ([guide](integrations/email.md#operators-configuring-outbound-email)) |
| GitHub sign-in | A GitHub App you register ([guide](integrations/github-app.md)) |

Without any of them you still get the site, the public feed, workspaces with management tokens, and app subscriptions that wait until a channel is enabled.

## 1. Create a deployment config

```sh
git clone https://github.com/aviflombaum/rails-cve.git
cd rails-cve
bun install --frozen-lockfile
bunx wrangler login
bunx wrangler whoami
cp wrangler.jsonc wrangler.deploy.jsonc
```

`wrangler.deploy.jsonc` is ignored by Git and is what `bun run deploy` and `bun run db:remote` use. Copy it only for a new installation; do not overwrite an existing one.

Edit it:

- `name`: a unique Worker name such as `my-rails-cve`.
- `account_id`: from `whoami`.
- `vars.APP_URL`: your final HTTPS origin with no path or trailing slash. It drives canonical links, social images, example downloads, and `skill_url` in webhooks.
- `d1_databases[0].database_name`: your database name. The ID comes in step 2.
- Keep `main`, the asset and migration paths, the bindings, compatibility settings, observability, rate limiter, and cron trigger as they are.

For a custom hostname on a Cloudflare zone, add:

```json
"routes": [{ "pattern": "security.example.org", "custom_domain": true }]
```

Or set `"workers_dev": true` and use the Worker's `workers.dev` hostname as `APP_URL`.

## 2. Create the database

```sh
bunx wrangler d1 create my-rails-cve --config wrangler.deploy.jsonc
```

Put the returned ID in `d1_databases[0].database_id`. Keep the binding name `DB`. Then apply migrations:

```sh
bun run db:remote
```

## 3. Add secrets

| Secret | Purpose |
| :--- | :--- |
| `ENCRYPTION_KEY` | Encrypts webhook signing secrets and URLs. Back it up; losing it makes existing subscriptions unreadable. |
| `ADMIN_TOKEN` | Authorizes `/api/admin/sync` and `/api/admin/health`. |
| `GITHUB_TOKEN` | Optional. Raises the GitHub API rate limit for advisory polling. Not the sign-in secret. |

Generate the two required values into an ignored, mode-0600 file and upload them:

```sh
bun -e 'import { randomBytes } from "node:crypto"; import { writeFileSync } from "node:fs"; writeFileSync(".secrets.production.json", JSON.stringify({ ENCRYPTION_KEY: randomBytes(32).toString("hex"), ADMIN_TOKEN: randomBytes(32).toString("hex") }, null, 2), { flag: "wx", mode: 0o600 });'
bunx wrangler secret bulk .secrets.production.json --config wrangler.deploy.jsonc
```

The generator refuses to overwrite an existing file. Store the values in your password manager before deleting the file. Do not reuse the keys from `.dev.vars`.

For the optional GitHub token:

```sh
bunx wrangler secret put GITHUB_TOKEN --config wrangler.deploy.jsonc
```

## 4. Check and deploy

```sh
bun run check
bunx wrangler deploy --dry-run --config wrangler.deploy.jsonc
bun run deploy
```

The cron trigger imports advisories every five minutes once it propagates, which can take a few minutes. Until the first successful sync, `/api/health` returns 503. The first import is a quiet baseline: it stores the archive and sends nothing.

To import immediately, call the admin sync with the token loaded from the secrets file so it never appears in a shell argument:

```sh
RAILS_CVE_URL=https://security.example.org bun -e 'const { ADMIN_TOKEN } = await Bun.file(".secrets.production.json").json(); const response = await fetch(new URL("/api/admin/sync", process.env.RAILS_CVE_URL), { method: "POST", headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } }); console.log(response.status, await response.text()); if (!response.ok) process.exitCode = 1;'
```

Open the homepage and `/api/health`, create a workspace, and save its token.

## 5. Enable webhooks

Webhook delivery requires the [egress gateway](egress.md), a small Node service that makes the outbound HTTPS connections from a validated, pinned public address. The Worker never contacts a subscriber URL directly. Until the gateway is configured, the dashboard tells users that webhooks are disabled and queued webhook deliveries wait.

Run the gateway behind an HTTPS reverse proxy, then set in `wrangler.deploy.jsonc`:

```json
"vars": { "EGRESS_PROXY_URL": "https://egress.example.org/deliver" }
```

and upload the shared secret:

```sh
bunx wrangler secret put EGRESS_PROXY_TOKEN --config wrangler.deploy.jsonc
```

Redeploy, then verify a receiver you own and send a test.

## 6. Enable email and GitHub sign-in

- [Email](integrations/email.md#operators-configuring-outbound-email): choose SMTP on port 465 or a Cloudflare `EMAIL` binding, set `EMAIL_TRANSPORT` and `EMAIL_FROM`, and add credentials as secrets.
- [GitHub sign-in](integrations/github-app.md): register a GitHub App with callback `<APP_URL>/auth/github/callback`, set `GITHUB_CLIENT_ID`, and add `GITHUB_CLIENT_SECRET` as a secret.

Each feature shows as unavailable in the UI until its configuration is complete. Use separate credentials for development.

## 7. Operate it

Read [Operations](operations.md) before opening a deployment to others. At minimum: an external check on `/api/health`, an authenticated check on `/api/admin/health` for backlog, and backups of D1 and `ENCRYPTION_KEY`.

Optional operator switches in `vars`, all defaulting to enabled: `SIGNUPS_ENABLED`, `VERIFICATIONS_ENABLED`, and `DELIVERY_ENABLED`. Setting one to the string `false` pauses that operation without losing queued work.

The compatibility date is pinned to `2026-08-22`. Update dependencies and run the checks before changing it. Rolling back the Worker does not roll back D1 migrations.

## Upgrading

Pull, install, run `bun run check`, apply migrations with `bun run db:remote`, then `bun run deploy`. Migrations are additive and numbered; apply them all before deploying the matching Worker. Back up D1 first. Keep `ENCRYPTION_KEY` unchanged across upgrades.

Notable migrations: `0002` introduced per-channel deliveries and email subscriptions; `0004` added hourly budgets and retention. An older Worker cannot run against a newer schema, so roll forward rather than back.

## Branding

Links and metadata use `APP_URL`. The social image at `public/og/rails-cve-v1.jpg` mentions the hosted hostname; replace it with your own 1200×630 JPEG if you like, or update the metadata in `src/views.tsx`. Review the footer attribution and security contact if you distribute a modified version.

## Troubleshooting

| Symptom | Check |
| :--- | :--- |
| No advisories after deploy | Wait for cron or call the admin sync. Check GitHub connectivity and rate limits in Worker logs. |
| `no such table` | Run migrations against the intended database with `bun run db:remote` or `bun run db:local`. |
| "Deployment can't find config" | Create `wrangler.deploy.jsonc`; it is intentionally not tracked. |
| `/api/health` is degraded | Inspect Worker logs, GitHub API responses, the cron trigger, and the last successful sync. |
| Dashboard says webhooks are disabled | Configure `EGRESS_PROXY_URL` and `EGRESS_PROXY_TOKEN` and redeploy. |
| Webhook stays unverified | Verify the HMAC first, then return the exact challenge as plain text with 2xx. |
| Destination rejected | Use public HTTPS on port 443. Local, private, and reserved addresses and redirects are rejected. |
| Deliveries fail after a key change | Restore the original `ENCRYPTION_KEY`. Rotation needs a re-encryption migration. |

Cloudflare references: [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
