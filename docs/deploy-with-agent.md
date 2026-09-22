# Deploy with the Cloudflare button or your agent

Two shortcuts for getting your own Rails CVE running. Both end up with the same deployment as the [manual guide](self-hosting.md); read that page if you want to understand each step.

## The Deploy to Cloudflare button

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/aviflombaum/rails-cve)

Cloudflare's [deploy buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/) clone a public repository into your GitHub account, provision the resources declared in its Wrangler config, prompt for the secrets listed in `.env.example`, and set up Workers Builds. It is a guided flow: you still choose names, supply secrets, and confirm settings.

What to do in the flow:

1. Authorize your Cloudflare and GitHub accounts. Choose a new repository, Worker name, and a **new** D1 database. Never point at another project's database.
2. Provide `ENCRYPTION_KEY` and `ADMIN_TOKEN` as two independent random 32-byte hex values. Back up the encryption key. Never commit either.
3. In your new repository, set `vars.APP_URL` in `wrangler.jsonc` to your final HTTPS origin, for example `https://my-rails-cve.my-subdomain.workers.dev`, with no trailing slash. The deploy script refuses to run while it is still `http://localhost:8787`.
4. In Workers Builds, set the build command to `bun install --frozen-lockfile` and the deploy command to **`bun run deploy:cloudflare`**. The default `bun run deploy` expects a personal config that your fork does not have. `deploy:cloudflare` checks `APP_URL`, applies remote migrations, and deploys from the tracked config.
5. Confirm the placeholder D1 ID in `wrangler.jsonc` was replaced with your database's ID before the first build. If not, create a database with `wrangler d1 create`, paste its ID, keep the binding name `DB`, and rerun the build.
6. Leave email, GitHub sign-in, and webhooks for later, or enable them following the [self-hosting guide](self-hosting.md#5-enable-webhooks).
7. After the first cron run, check `/api/health`, create a workspace, and save its token. A 503 before the first sync is expected.

The button does not provision the [egress gateway](egress.md), so webhook delivery starts disabled and the dashboard says so. Email and GitHub sign-in are also off until you add credentials. A full first-time run of this flow on a fresh account has not been independently verified by the project; if something in the import UI does not match this list, fall back to the manual guide.

## Copy this prompt to your agent

Give this to Claude Code, Codex, OpenClaw, Hermes, or any agent that can read the repository and run Wrangler. It asks you for the choices only you can make and never authorizes touching accounts or databases that are not yours. The same prompt is on the site at `/integrations/self-host`.

```text
Deploy my own instance of Rails CVE from https://github.com/aviflombaum/rails-cve into MY Cloudflare account. Clone that repository (or use my existing checkout) and follow https://github.com/aviflombaum/rails-cve/blob/main/docs/deploy-with-agent.md. Read AGENTS.md, README.md, docs/self-hosting.md, docs/deploy-with-agent.md, docs/egress.md and docs/integrations/email.md first. Inspect the checkout and installed tools. Use the existing authenticated Cloudflare session when available; never reuse the original author's credentials or database.

Ask only for missing account/domain choices or external credentials. Do not print secrets or put them in command arguments, tracked files, commits or deployment logs. Use a protected secret store, interactive Wrangler secret input, or an ignored mode-0600 secrets file. Generate independent random 32-byte ENCRYPTION_KEY and ADMIN_TOKEN values; preserve existing keys on upgrades.

Install with bun install --frozen-lockfile. Run the local setup and migrations, bun run check, and a Wrangler dry-run. Create a dedicated D1 database in my selected account. Create or update ignored wrangler.deploy.jsonc, retaining bindings/assets/cron/rate limiter/node compatibility and migration paths. Set the database ID and a unique Worker name. APP_URL must be the exact final HTTPS origin with no trailing slash. Use workers.dev unless I selected an owned custom hostname. Never overwrite an existing deployment file blindly.

Apply numbered remote migrations with the deployment config (back up an existing D1 first), upload required secrets, and deploy using bun run deploy. The baseline sync must be quiet. Wait for cron or call the admin sync using a token loaded privately from secret storage. Verify /api/health, advisory pages, social image and account creation. Document the first-sync 503 while initializing.

Email and GitHub login are optional. Webhooks require the bundled Node egress gateway: read docs/egress.md, prepare an isolated host and TLS reverse proxy, and configure EGRESS_PROXY_URL plus an independent secret EGRESS_PROXY_TOKEN. Obtain approval before provisioning or deploying it. Without that configuration, report webhook delivery as disabled; do not bypass the gateway or claim the Cloudflare button provisions it. For SMTP use implicit TLS port 465, my verified sender domain, EMAIL_TRANSPORT=smtp, EMAIL_FROM, SMTP_HOST and secret SMTP_USERNAME/SMTP_PASSWORD. Use only a sender authorized for my own deployment. Cloudflare Email Service is an alternative if I onboard a sending domain and add an EMAIL binding. Confirm outbound email with a recipient I authorize, not arbitrary subscribers.

For GitHub login, guide me through creating my own GitHub App with callback <APP_URL>/auth/github/callback, then configure GITHUB_CLIENT_ID and secret GITHUB_CLIENT_SECRET. Do not request repo scopes or enable a repository issue bot that this release does not implement. Keep optional integration states visibly disabled until configured.

Use a receiver I control to verify the signed challenge and send a test; ensure event history records the result without exposing credentials. Do not trigger real advisory investigations or production changes as a smoke test. Finish with my URL, deployed version, database/migration status, secret NAMES only, checks performed, remaining optional setup, estimated resource usage caveats and rollback/backup instructions. Leave the checkout free of tracked credentials.
```

## After deployment

Whichever route you took, finish with the [operations guide](operations.md): health checks, backlog monitoring, backups of D1 and the encryption key, and the optional circuit-breaker settings. Then subscribe your own apps following [Getting started](getting-started.md).
