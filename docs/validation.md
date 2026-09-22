# Validation — 2026-09-22

## Automated

`bun run test`: 14 tests passed in the Cloudflare Workers runtime with real local D1 bindings.

- Known HMAC vector; encrypted-secret round trip and rejection under wrong key.
- HTTPS/host validation, encoded IPs, private and reserved addresses, and private DNS answers.
- Quiet initial import; changed revision creates a single event and delivery across repeated ingestion.
- Exact affected-version preservation and matching forensic-toolkit link.
- Upstream failure preserves existing data and marks source health degraded.
- Redirects are rejected, retries preserve event identity, and actual outgoing signatures are checked.
- Paused endpoints are excluded; delivery stops at eight failed attempts.
- Advisory output is escaped, security headers are present, and skills download as attachments.
- POST origin enforcement, authenticated admin sync, and cross-account isolation.
- Account token hashing, HTTPS session cookie flags, and restored access.
- Endpoint activation requires the current challenge echoed exactly.
- Concurrent delivery drains claim a row only once.

`bun run typecheck`: passed with Wrangler-generated bindings.
`wrangler deploy --dry-run`: passed.
`ruby -c public/receiver.rb`: syntax OK. The receiver example is not integration-tested in a full Rails app; its migration/model and inbox consumer must be installed by the subscriber.

## Browser (agent-browser)

- Desktop homepage inspected at 1440px; mobile at 390px.
- Mobile home and advisory detail have no horizontal document overflow.
- Navigation, connection onboarding, token page, new endpoint secret page and pending status exercised.
- Advisory search/severity filter returned the matching Active Storage advisory.
- Copy investigation brief succeeded; download route checked in runtime test and live HTTP.
- Found and fixed a form-origin failure caused by no-referrer policy; same-origin referrer policy verified through successful browser signup.
- Added explicit HTML doctype and confirmed CSS1Compat standards mode.

## Production

- Worker `rails-cve` and separate D1 database deployed on the intended Cloudflare account.
- Custom HTTPS domain: https://rails-cve.avi.nyc.
- Canonical GitHub sync imported 26 published advisories. Health returned 200 / ok.
- Signup, endpoint creation, ownership verification, pause and resume exercised on the live site.
- Temporary receiver Worker independently validated HMAC and timestamp. Signed ownership challenge succeeded. Test delivery returned HTTP 204, recorded delivered after one attempt.
- Test endpoint, delivery, workspace, event and temporary receiver Worker removed after verification.
- Cron configured for every five minutes; email routing remains optional and unconfigured.

## Known v1 limits

See operations.md for capacity, retention, DNS rebinding caveat, and missing account recovery/key rotation. Coverage is the Rails repository advisory feed, not all Ruby gems. No automatic repository modifications, production investigation, or PR creation. These are intentional v1 scope boundaries.

## Payload example — 2026-09-22

Added a clearly labeled example delivery for CVE-2026-66066 at `/docs#example-payload`, linked from the homepage. The complete JSON download at `/examples/cve-2026-66066.json` includes a frozen canonical advisory snapshot (captured September 22), exact affected/patched ranges, full upstream description, and the same generated agent brief used by real deliveries. Event ID/time are illustrative. The docs preview explicitly abbreviates long text fields; copy/download retain full text.

Typecheck and all 14 runtime tests passed. agent-browser verified desktop/mobile layout, no 390px horizontal overflow, and successful clipboard copying locally and on production. Live JSON was parsed and compared with the canonical snapshot; full forensic-toolkit instructions are present. No GitHub App integration was implemented.

## Open-source preparation — 2026-09-22

- A clean copy installed from `bun.lock` and passed formatting, generated types, TypeScript, all 15 Workers-runtime tests, and a deployment dry run before any local secrets were created.
- Local setup generated independent secrets and local migrations succeeded. A repeat setup preserved existing secrets byte for byte.
- Added a regression check that canonical/social metadata and example skill URLs follow the configured site origin.
- The portable tracked Wrangler config uses local defaults and a placeholder D1 ID. Personal deployment configuration and generated binding types are ignored.
- GitHub Actions and issue-template YAML parsed successfully; relative Markdown links resolved.
- Rendered the README as GitHub-flavored Markdown and inspected it with agent-browser. Banner, screenshot, and all six badges loaded.
- Gitleaks passed for the previous Git history and an isolated public file tree. No production credentials were used for CI checks. The GitHub-hosted workflow itself has not run before publication.
