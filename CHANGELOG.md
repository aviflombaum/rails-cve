# Changelog

## Unreleased

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
