# Changelog

## Unreleased

- Authenticate canonical advisory polling with automatically renewed, metadata-only GitHub App installation tokens. Keep private keys in Worker secrets; preserve source data and report degraded health when token issuance fails.

- Rewrite the documentation for Rails developers: a getting-started guide, a coding-agent guide, plain-language workspace, email, webhook, self-hosting and egress guides, and a README organised around the hosted service versus your own deployment.
- Add a documentation section to the site at `/docs` with pages for email, webhooks (including the example payload), coding agents, workspace, and self-hosting. Pages show a notice when a channel is not configured on the deployment. The `/docs#example-payload` anchor still resolves.
- Rename the site navigation entry to Docs and link the new pages from the footer, home page, and integrations index.

- Gate CI on full-history redacted secret scanning and dependency advisories, pin action/scanner revisions, and keep private audit reports ignored.

- Add D1 service/account budgets, inventory caps, tenant-aware draining, operator backlog health, bounded retention and proof-protected account deletion. Apply migration 0004 before deploying.

- Recompute subscription readiness after email removal; disable tests and show missing destinations or unavailable delivery providers accurately.

- Require authenticated pinned-IP egress for webhooks; ship a bounded Node gateway and offline tests. Unconfigured deployments hold webhook deliveries without attempts. Provision the separate gateway before upgrading a webhook deployment.

- Replace operator-specific email examples and production validation records with portable documentation.

- Bound complete events to 1 MiB, add explicit compact advisory schema 2, and fail oversized legacy deliveries without retries. Receivers must accept schemas 1 and 2.

- Reject canonical advisory API redirects without following targets or forwarding credentials.

- Enforce the eight-attempt ceiling when recovering interrupted delivery leases and record uncertain receipt.

- Override the test emulator’s transitive sharp dependency to patched 0.35.4 while its upstream package remains pinned to the affected release.

- Encrypt complete webhook destinations, mask URL credentials in forms, upgrade legacy rows in bounded batches, redact query telemetry and disable destination traces.

- Secure-account recovery revokes prior sessions and OAuth flows, requires credential proof, and can remove an unexpected GitHub link.

- Fix GitHub sign-in on Workers by using supported manual redirect handling for token exchange and identity lookup; reject redirects without forwarding credentials.

- Refresh legacy browser sessions before GitHub linking and report safe callback failure references for troubleshooting.
- Link the public GitHub repository from site navigation and footer with a GitHub icon and View Source label.
- Add the live Cloudflare import button, real CI status badge, clone instructions, and published deployment-agent guide links.

## Accounts and integrations

- Account settings, expiring browser sessions and recovery-token replacement.
- GitHub App registration/login and explicit existing-workspace linking, with PKCE and browser-bound single-use state.
- Per-codebase webhook/email/both subscriptions with verified addresses and independent outbox channels.
- Configurable SMTP TLS or Cloudflare email transport; no embedded credentials.
- Filterable, paginated delivery history with immutable payloads and per-attempt outcomes.
- OpenClaw/Hermes setup prompts, minimal GitHub App permissions guide, and agent-led/Cloudflare-button self-hosting docs.
- Migration 0002 preserves existing token workspaces, webhook verification and historical deliveries.


## Unreleased — initial open-source version

- Canonical Rails advisory ingestion with a quiet initial baseline and revision deduplication.
- Verified webhook endpoints, HMAC-SHA256 signatures, encrypted secrets, and durable retries.
- Token-based workspaces and delivery history.
- Searchable advisories, investigation prompts, per-advisory skills, and public JSON endpoints.
- Complete illustrative payload for CVE-2026-66066 and a Rails receiver example.
- Responsive Rails-inspired site and social preview artwork.
- Portable local configuration, safe setup script, self-hosting guides, and contributor CI.

GitHub App delivery, repository matching, account recovery, and automatic patching are not included.
