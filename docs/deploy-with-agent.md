# Deploy your own Rails CVE with an agent

You can self-host from a checkout today. The agent brief below covers a dedicated Worker, D1, secrets, migrations, source bootstrap, and verification. GitHub login and email sending remain optional; the base service works with management tokens and signed webhooks.

## Is a one-click Cloudflare deployment possible?

Yes. Cloudflare's [Deploy to Cloudflare buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/) can clone a public GitHub/GitLab repository, provision resources including D1, and configure Workers Builds. They support secret declarations in `.env.example` and custom deploy commands. It is a guided setup flow: users still authorize accounts, supply secrets, and choose configuration.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/aviflombaum/rails-cve)

Source: [aviflombaum/rails-cve](https://github.com/aviflombaum/rails-cve). The button opens Cloudflare's import flow for this public repository.

## Configure your deployment

1. Open the button and authorize your own Cloudflare and GitHub accounts. Choose a new repository, Worker name, and dedicated D1 database. Cloudflare's flow can provision resources from the portable Wrangler configuration; do not reuse this project's production resources.
2. Supply `ENCRYPTION_KEY` and `ADMIN_TOKEN` from `.env.example` as two independently generated random 32-byte hex secrets. Keep a secure backup of the encryption key. Never commit their values to the fork.
3. Set `vars.APP_URL` in your fork's `wrangler.jsonc` to your final HTTPS origin with no path or trailing slash, for example `https://my-rails-cve.my-subdomain.workers.dev`. Replace the local `http://localhost:8787` default **before running the deployment command**. If the import UI doesn't expose Wrangler vars, edit the cloned repo, then retry the build.
4. In Workers Builds, use **`bun install --frozen-lockfile`** as the build command and **`bun run deploy:cloudflare`** as the deploy command. Override any auto-detected `bun run deploy`: that command expects the original operator's ignored personal config. `deploy:cloudflare` checks the HTTPS origin, applies remote D1 migrations, and deploys using your fork's public config.
5. Verify Cloudflare has replaced the placeholder D1 ID with your new database ID before migrations run. If provisioning hasn't completed, create a dedicated database in your account, update the binding ID, then rerun the build. Keep binding name `DB` and the migration directory intact. See [manual self-hosting](self-hosting.md) for the exact resource commands.
6. Leave GitHub login and outbound email unconfigured initially, or follow the [GitHub App](integrations/github-app.md) and [email](integrations/email.md) guides with your own credentials and sender. Neither is required for management-token accounts and webhook delivery.
7. Check `/api/health` after the first cron sync, save a workspace recovery token, verify a receiver you control, and send a harmless connection test. The initial import is quiet. A 503 before the first sync is expected.

The public import link is available now. A complete new-account Cloudflare provisioning run has not been independently exercised; the agent/manual path below provides explicit steps if the import flow needs configuration. CI checks packaging and runtime behavior, not creation of resources in another person's account.

Do not confuse a Workers deployment template with deploying an agent gateway. This service stores notifications, not your application source or model API credentials.

## Copy this prompt to your agent

Use with Codex, Claude Code, OpenClaw, Hermes, or another agent that can inspect the repository and run Wrangler. The prompt asks for missing account choices; it never authorizes touching unrelated accounts or databases.

```text
Deploy my own instance of Rails CVE from https://github.com/aviflombaum/rails-cve into MY Cloudflare account. Clone that repository (or use my existing checkout) and follow https://github.com/aviflombaum/rails-cve/blob/main/docs/deploy-with-agent.md. Read AGENTS.md, README.md, docs/self-hosting.md, docs/deploy-with-agent.md and docs/integrations/email.md first. Inspect the checkout and installed tools. Use the existing authenticated Cloudflare session when available; never reuse the original author's credentials or database.

Ask only for missing account/domain choices or external credentials. Do not print secrets or put them in command arguments, tracked files, commits or deployment logs. Use a protected secret store, interactive Wrangler secret input, or an ignored mode-0600 secrets file. Generate independent random 32-byte ENCRYPTION_KEY and ADMIN_TOKEN values; preserve existing keys on upgrades.

Install with bun install --frozen-lockfile. Run the local setup and migrations, bun run check, and a Wrangler dry-run. Create a dedicated D1 database in my selected account. Create or update ignored wrangler.deploy.jsonc, retaining bindings/assets/cron/rate limiter/node compatibility and migration paths. Set the database ID and a unique Worker name. APP_URL must be the exact final HTTPS origin with no trailing slash. Use workers.dev unless I selected an owned custom hostname. Never overwrite an existing deployment file blindly.

Apply numbered remote migrations with the deployment config (back up an existing D1 first), upload required secrets, and deploy using bun run deploy. The baseline sync must be quiet. Wait for cron or call the admin sync using a token loaded privately from secret storage. Verify /api/health, advisory pages, social image and account creation. Document the first-sync 503 while initializing.

Email and GitHub login are optional. Webhooks require the bundled Node egress gateway: read docs/egress.md, prepare an isolated host and TLS reverse proxy, and configure EGRESS_PROXY_URL plus an independent secret EGRESS_PROXY_TOKEN. Obtain approval before provisioning or deploying it. Without that configuration, report webhook delivery as disabled; do not bypass the gateway or claim the Cloudflare button provisions it. For SMTP use implicit TLS port 465, my verified sender domain, EMAIL_TRANSPORT=smtp, EMAIL_FROM, SMTP_HOST and secret SMTP_USERNAME/SMTP_PASSWORD. Use only a sender authorized for my own deployment. Cloudflare Email Service is an alternative if I onboard a sending domain and add an EMAIL binding. Confirm outbound email with a recipient I authorize, not arbitrary subscribers.

For GitHub login, guide me through creating my own GitHub App with callback <APP_URL>/auth/github/callback, then configure GITHUB_CLIENT_ID and secret GITHUB_CLIENT_SECRET. Do not request repo scopes or enable a repository issue bot that this release does not implement. Keep optional integration states visibly disabled until configured.

Use a receiver I control to verify the signed challenge and send a test; ensure event history records the result without exposing credentials. Do not trigger real advisory investigations or production changes as a smoke test. Finish with my URL, deployed version, database/migration status, secret NAMES only, checks performed, remaining optional setup, estimated resource usage caveats and rollback/backup instructions. Leave the checkout free of tracked credentials.
```
