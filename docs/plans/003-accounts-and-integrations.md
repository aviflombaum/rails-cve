# Accounts, delivery preferences, and agent integrations

Status: implemented on `feat/accounts-agent-integrations`, locally validated and deployed to rails-cve.avi.nyc on 2026-09-22. Research checked 2026-09-22.

## Outcomes and scope

- Preserve existing token workspaces, subscriptions, signed payloads, event IDs, and delivery history.
- Add GitHub App user authorization for registration/login and explicit linking from account settings. Repository installation and automatic issue creation are a subsequent delivery integration, documented here but not enabled by OAuth.
- Give each app/codebase a name, optional webhook, independently verified notification address, and webhook/email/both mode.
- Provide settings, a paginated delivery log, immutable payload detail, and per-channel attempt history.
- Publish OpenClaw and NousResearch Hermes setup guides with copy/paste agent prompts. Native agent gateways require a signature-verifying adapter; do not imply direct compatibility.

## Implementation sequence

1. Establish AGENTS.md and research current first-party interfaces.
2. Create feature branch `feat/accounts-agent-integrations` after recording this plan.
3. Add migration 0002: account profile/GitHub identity, expiring sessions and OAuth states, verified notification addresses, channel settings on existing endpoints, per-channel delivery uniqueness, attempt history. Migrate existing verified webhooks and history in place.
4. Extract authentication: hash session tokens, preserve legacy capabilities, revoke browser sessions on logout; bind single-use OAuth state to browser, use PKCE, limit network reads/timeouts, never retain provider tokens. Existing workspace linking must start authenticated and finish in that same workspace. No automatic email matching.
5. Add account settings and GitHub entry points. Disable GitHub entry points honestly when client credentials are absent. Preserve the saved token recovery path.
6. Implement email confirmation: hashed expiring tokens, explicit POST confirmation under the requesting account, destination cooldown, address cap, no GET mutation. SMTP TLS and Cloudflare EMAIL transports are optional; unconfigured deployments cannot select email modes.
7. Extend app subscriptions: default webhook mode, verified email selection, independent webhook challenge state; editing webhook destination resets ownership; mode changes cancel pending disabled channels. Pausing stops fanout; resume processes queued work. A subscription is not a version filter: every active codebase receives each new/revised Rails advisory.
8. Fan out one outbox row per enabled, verified channel. Snapshot email address identity per delivery. Keep leases/retries independent, record bounded categorical errors, treat mail provider acceptance separately from inbox receipt. No silent fallback from one channel to another.
9. Add tenant-scoped history pagination, channel/status/app filters, raw event payload and attempt details. Never show signing secrets, tokens, or receiver bodies.
10. Write agent, GitHub App, email setup and operation docs; expose integration guidance from the app. Update README, architecture, changelog and self-hosting docs.
11. Validate migrations with existing records; test OAuth CSRF/replay/link conflicts, tenant isolation, email verification/replay, channel fanout/retry independence, and settings changes. Run existing suite/typecheck/format/package checks. Use agent-browser for desktop/mobile forms and empty states.

## GitHub operator setup

Callback: `/auth/github/callback`. Use a GitHub App (not a legacy OAuth App). Client ID and client secret suffice for identity login. Do not request OAuth `repo` scopes or private email access. The application verifies notification mailboxes itself.

For the later issue bot: Issues read/write and mandatory Metadata read; selected repositories only. No Contents, Actions, Pull requests, Administration, or organization permission. Installation JWT/private key, signed installation lifecycle webhooks, installation-to-account authorization, repository selection, deduplication per advisory/repo and revocation handling are required before issue delivery ships. A callback installation ID alone is not proof of access. Do not configure a pretend installation/webhook route in this release.

## Rollout and limitations

Apply numbered migrations before deploying the new Worker. Back up D1 first. Existing codebase IDs are retained (`endpoints` is the historical table name). Email requires configured SMTP credentials and an authorized sender, or an onboarded Cloudflare sending domain and EMAIL binding. EMAIL_FROM is configurable. GitHub requires separately supplied client credentials. Tests use provider/network mocks, never real recipients or repos. SMTP credentials are staged in ignored production configuration with rails-cve@avi.nyc as sender; the operator reports avi.nyc is already verified in SES. GitHub and SMTP secrets were uploaded with the 2026-09-22 production deployment. The live GitHub redirect and client credential check passed. End-user OAuth consent/callback completion and actual SMTP inbox delivery still need an operator session/authorized recipient. No test email has been sent.

Research links and exact setup steps live in `docs/integrations/`.

## Additional self-hosting scope

Cloudflare supports deploy buttons with D1 provisioning and secret collection. Added deployment documentation, an agent prompt, `.env.example` declarations and `deploy:cloudflare` for the public configuration. The repository is now public at https://github.com/aviflombaum/rails-cve. README and the self-hosting page link to its real Deploy to Cloudflare import flow; a fresh-account provisioning test remains separate from the passing runtime/packaging checks.
