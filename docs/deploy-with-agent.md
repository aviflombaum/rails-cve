# Deploy your own Rails CVE with an agent

You can self-host from a checkout today. The agent brief below covers a dedicated Worker, D1, secrets, migrations, source bootstrap, and verification. GitHub login and email sending remain optional; the base service works with management tokens and signed webhooks.

## Is a one-click Cloudflare deployment possible?

Yes. Cloudflare's [Deploy to Cloudflare buttons](https://developers.cloudflare.com/workers/platform/deploy-buttons/) can clone a public GitHub/GitLab repository, provision resources including D1, and configure Workers Builds. They support secret declarations in `.env.example` and custom deploy commands. It is a guided setup flow: users still authorize accounts, supply secrets, and choose configuration.

This checkout has no published Git remote yet, so there is no honest live deploy button to link. After publication, use the actual repository URL:

```md
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/YOUR_OWNER/YOUR_REPO)
```

Before publishing the button:

1. Test with a separate Cloudflare account and a fresh fork. Keep portable placeholder D1 values in the public config; Cloudflare provisions the target resources. Never include the author's account ID or live database ID.
2. Use the provided `.env.example` to collect two independently generated random 32-byte hex secrets. Never ship working defaults. Back up the encryption key; changing it makes existing signing secrets unreadable.
3. Set `APP_URL` in the fork's Wrangler vars to the final HTTPS origin (no trailing slash). The local default is deliberately `http://localhost:8787`; it must not be used for production links, email verification, or OAuth.
4. Set build command to `bun install --frozen-lockfile` and deploy command to `bun run deploy:cloudflare`. This command uses the public `wrangler.jsonc`, validates the HTTPS origin, applies remote D1 migrations, then deploys. The normal `bun run deploy` uses the ignored personal config and is unsuitable for a fresh button clone. Check auto-provisioned D1 IDs are available before migrations in the selected build flow; if not, complete initial resource provisioning first and rerun the deploy command.
5. Keep the base deployment webhook-only. SMTP credentials/sender verification, Cloudflare email onboarding, and GitHub App registration are separate optional setup. They cannot be manufactured by a deploy button.
6. Verify first sync, health, secrets, custom origin and a signed receiver test. Only then add the real button to README and claim that flow is tested. The repo's CI dry-run does not verify Cloudflare account provisioning.

Do not confuse a Workers deployment template with deploying an agent gateway. This service stores notifications, not your application source or model API credentials.

## Copy this prompt to your agent

Use with Codex, Claude Code, OpenClaw, Hermes, or another agent that can inspect the repository and run Wrangler. The prompt asks for missing account choices; it never authorizes touching unrelated accounts or databases.

```text
Deploy my own instance of Rails CVE from this repository into MY Cloudflare account. Read AGENTS.md, README.md, docs/self-hosting.md, docs/deploy-with-agent.md and docs/integrations/email.md first. Inspect the checkout and installed tools. Use the existing authenticated Cloudflare session when available; never reuse the original author's credentials or database.

Ask only for missing account/domain choices or external credentials. Do not print secrets or put them in command arguments, tracked files, commits or deployment logs. Use a protected secret store, interactive Wrangler secret input, or an ignored mode-0600 secrets file. Generate independent random 32-byte ENCRYPTION_KEY and ADMIN_TOKEN values; preserve existing keys on upgrades.

Install with bun install --frozen-lockfile. Run the local setup and migrations, bun run check, and a Wrangler dry-run. Create a dedicated D1 database in my selected account. Create or update ignored wrangler.deploy.jsonc, retaining bindings/assets/cron/rate limiter/node compatibility and migration paths. Set the database ID and a unique Worker name. APP_URL must be the exact final HTTPS origin with no trailing slash. Use workers.dev unless I selected an owned custom hostname. Never overwrite an existing deployment file blindly.

Apply numbered remote migrations with the deployment config (back up an existing D1 first), upload required secrets, and deploy using bun run deploy. The baseline sync must be quiet. Wait for cron or call the admin sync using a token loaded privately from secret storage. Verify /api/health, advisory pages, social image and account creation. Document the first-sync 503 while initializing.

Email and GitHub login are optional. Start webhook-only unless I provide configuration. For SMTP use implicit TLS port 465, my verified sender domain, EMAIL_TRANSPORT=smtp, EMAIL_FROM, SMTP_HOST and secret SMTP_USERNAME/SMTP_PASSWORD. Never use rails-cve@avi.nyc for my independent deployment. Cloudflare Email Service is an alternative if I onboard a sending domain and add an EMAIL binding. Confirm outbound email with a recipient I authorize, not arbitrary subscribers.

For GitHub login, guide me through creating my own GitHub App with callback <APP_URL>/auth/github/callback, then configure GITHUB_CLIENT_ID and secret GITHUB_CLIENT_SECRET. Do not request repo scopes or enable a repository issue bot that this release does not implement. Keep optional integration states visibly disabled until configured.

Use a receiver I control to verify the signed challenge and send a test; ensure event history records the result without exposing credentials. Do not trigger real advisory investigations or production changes as a smoke test. Finish with my URL, deployed version, database/migration status, secret NAMES only, checks performed, remaining optional setup, estimated resource usage caveats and rollback/backup instructions. Leave the checkout free of tracked credentials.
```
