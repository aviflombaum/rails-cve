# Self-hosting Rails CVE

This guide deploys the relay to **your own** Cloudflare account. Local development requires no account; follow the README first. Hosting may incur Cloudflare usage charges.

For a copy/paste deployment brief and Cloudflare deploy-button research, see [Deploy with your agent](deploy-with-agent.md). The [Deploy to Cloudflare button](https://deploy.workers.cloudflare.com/?url=https://github.com/aviflombaum/rails-cve) imports the public repository into your account.

## 1. Prepare a deployment config

Clone [aviflombaum/rails-cve](https://github.com/aviflombaum/rails-cve) or your fork, then install dependencies and authenticate:

```sh
git clone https://github.com/aviflombaum/rails-cve.git
cd rails-cve
bun install --frozen-lockfile
bunx wrangler login
bunx wrangler whoami
cp wrangler.jsonc wrangler.deploy.jsonc
```

Copy the file only for a new installation; don't overwrite an existing deployment config. `wrangler.deploy.jsonc` is ignored by Git and is the target for `bun run deploy` and `bun run db:remote`.

Edit it:

- Set `name` to a unique Worker name, such as `my-rails-cve`.
- Set `account_id` to your account ID shown by `whoami`.
- Set `vars.APP_URL` to your final HTTPS origin, with no path or trailing slash. This controls canonical metadata, social image URLs, downloadable examples, and webhook skill links.
- Set `d1_databases[0].database_name` to your database name. Replace its placeholder ID in the next step.
- Keep `main`, asset paths, and migration paths relative to the repository root.
- Keep the existing bindings, compatibility flag, observability, rate limit, and cron.

For a custom hostname in a Cloudflare-managed zone, add:

```json
"routes": [{ "pattern": "security.example.org", "custom_domain": true }]
```

Alternatively, set `workers_dev: true` and use the Worker's `workers.dev` hostname as `APP_URL`. The checked-in config has no production account or route and uses a placeholder D1 ID for local simulation.

## 2. Create and bind a database

```sh
bunx wrangler d1 create my-rails-cve --config wrangler.deploy.jsonc
```

Copy the returned database ID into `d1_databases[0].database_id` in **wrangler.deploy.jsonc**. Keep its binding name `DB`. Do not reuse another application's database.

```sh
bun run db:remote
```

This applies migrations to the remote database. `bun run db:local` always uses the separate local-development config and local D1 storage.

## 3. Create production secrets

The required secrets are:

| Name | Purpose |
| --- | --- |
| `ENCRYPTION_KEY` | Encrypts endpoint signing secrets. Preserve it for the lifetime of existing encrypted records. |
| `ADMIN_TOKEN` | Authorizes manual source sync and delivery draining. |
| `GITHUB_TOKEN` | Optional: raises upstream API rate limits; public advisory reads don't require private-repository access. |

Generate two independent 32-byte hex values into an ignored, protected file:

```sh
bun -e 'import { randomBytes } from "node:crypto"; import { writeFileSync } from "node:fs"; writeFileSync(".secrets.production.json", JSON.stringify({ ENCRYPTION_KEY: randomBytes(32).toString("hex"), ADMIN_TOKEN: randomBytes(32).toString("hex") }, null, 2), { flag: "wx", mode: 0o600 });'
bunx wrangler secret bulk .secrets.production.json --config wrangler.deploy.jsonc
```

Generation intentionally fails if the file already exists. Back up these values in your password manager or secret store before deleting the local file. Do not reuse `.dev.vars` keys. Secret upload can create a placeholder Worker before its first code deployment.

To add the optional GitHub token, use Wrangler's interactive secret prompt:

```sh
bunx wrangler secret put GITHUB_TOKEN --config wrangler.deploy.jsonc
```

## 4. Check, deploy, and bootstrap

```sh
bun run check
bunx wrangler deploy --dry-run --config wrangler.deploy.jsonc
bun run deploy
```

The cron trigger will import advisories automatically. Its initial propagation may take several minutes. `/api/health` returns 503 until the first successful sync; that initial import is quiet and creates no historical delivery storm.

To bootstrap immediately, send a POST to `/api/admin/sync` with a Bearer admin token. For example, this script loads the ignored local secret file without putting the value in command arguments or printing it:

```sh
RAILS_CVE_URL=https://security.example.org bun -e 'const { ADMIN_TOKEN } = await Bun.file(".secrets.production.json").json(); const response = await fetch(new URL("/api/admin/sync", process.env.RAILS_CVE_URL), { method: "POST", headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } }); console.log(response.status, await response.text()); if (!response.ok) process.exitCode = 1;'
```

Configure the [egress gateway](egress.md) before enabling webhooks. It is a separate Node service; the Worker alone holds webhook deliveries. Set `EGRESS_PROXY_URL` in the private config and upload the independent `EGRESS_PROXY_TOKEN` secret.

Visit your homepage and `/api/health`. Create a workspace, save its management token, and verify a receiver you control. Send a test and confirm a delivered result in the dashboard.

## Optional login and delivery channels

- [GitHub App login](integrations/github-app.md): configure your own Client ID and client secret, with callback `<APP_URL>/auth/github/callback`. No repository permissions are needed for login.
- [Email notifications](integrations/email.md): choose SMTP on TLS port 465 or a Cloudflare EMAIL binding, configure your authorized sender, and save credentials as Worker secrets. Users then verify addresses in settings and select per-app modes.
- [Account workflow](accounts.md): linking existing workspaces, recovery tokens, subscription settings and history.

Both integrations are disabled without their configuration. Tests mock providers and never send mail. Use separate development credentials, not production SMTP or GitHub secrets.

## 5. Operate it

Read [operations.md](operations.md) before a broad deployment. Configure an external health check, monitor the delivery backlog, and back up D1 plus the encryption key. The GitHub Actions workflow in this repository performs checks only; it does not deploy or require your Cloudflare credentials.

The compatibility date is intentionally pinned to `2026-08-22`, supported by the installed runtime when v1 was built. Update dependencies and test before changing it. Worker rollbacks do not revert database migrations.

## Branding and data

Metadata and skill links use `APP_URL`. The bundled social image contains the hosted demo hostname; replace `public/og/rails-cve-v1.jpg` if you want your own branding. Keep its 1200×630 JPEG dimensions or update the metadata in `src/views.tsx`. Review the site's footer attribution and security contact if you distribute a modified version.

The source is fixed to published `rails/rails` advisories. Email routing is optional and deliberately separate from this setup. Do not change existing domain MX records just to enable the optional email trigger.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Local page has no advisories | Trigger the local scheduled URL; check GitHub connectivity and rate limits. |
| `no such table` | Run the migration command for the intended local or remote database. |
| Deployment can't find config | Create `wrangler.deploy.jsonc`; it is intentionally not supplied with personal IDs. |
| Production health is degraded | Inspect Worker logs, GitHub API responses, cron configuration, and last successful sync. |
| Endpoint remains pending | Verify HMAC first, then return the exact challenge as plain text with 2xx. |
| Destination is rejected | Use public HTTPS on port 443; local/private/reserved addresses and redirects are rejected. |
| Delivery started failing after key change | Restore the correct encryption key; key rotation needs a migration, not a blind replacement. |

Cloudflare references: [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
