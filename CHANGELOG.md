# Changelog

## Unreleased

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
