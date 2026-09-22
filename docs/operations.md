# Operations

## Pipeline

Every five minutes, the scheduled handler fetches all published advisories from rails/rails on GitHub, validates them, and compares normalized content. It retains exact package/version strings. The first import is a quiet baseline. Each subsequent change inserts the advisory, immutable event, and active-endpoint outbox rows in one D1 transaction. Deterministic revision hashes and unique app/event/channel keys make repeated ingestion safe.

A D1 lock prevents overlapping scheduled/email/manual sync runs for four minutes. The fixed source is fetched before any ingestion starts; a failed page leaves the previous snapshot untouched. A mid-ingestion interruption resumes next run; each individual advisory plus its fanout is atomic. API failures set public degraded health, preserving data. There are no removals inferred from missing upstream results. Scope is published rails/rails advisories; public archive coverage is whatever that endpoint exposes, not the entirety of historic Rails CVEs.

The scheduled handler drains deliveries even if GitHub sync fails. D1 is the durable queue. At most 25 due deliveries are processed per invocation in groups of five. Atomic two-minute leases avoid concurrent duplicate sends; a crashed lease is recoverable. Delivery is at least once: a crash after receiver acceptance but before recording success can cause a repeat. Event IDs and payload bytes are stable across retries; timestamp/signature are refreshed. Ordering is not guaranteed. Receiver deduplication is mandatory.

Failures retry after 5, 10, 20, 40, 80, 160, and 320 minutes, subject to cron timing/backlog, with at most eight attempts. Any 2xx acknowledges delivery; all other statuses (including redirects and 410) retry. A failed delivery stays visible in the delivery log. V1 has no manual replay of historical events. Pausing stops new event fanout and delivery attempts; resuming processes previously queued rows. Deletion removes the endpoint, encrypted secret and associated delivery rows. An already in-flight network request cannot be recalled.

## Security boundaries

- Authentication: hashed management capabilities plus expiring/revocable browser sessions, optional GitHub App identity with PKCE, HttpOnly/Lax cookies, same-origin POST checks and per-IP rate limits. Settings supports management-token replacement. Lost access can be restored only with a saved token or previously linked GitHub identity; email verification is not a login recovery mechanism.
- Endpoint ownership: unverified webhooks only get explicit signed verification challenges. Return the exact challenge as plain text; successful verification enables events. Challenge changes on each attempt. Read the receiver example before connecting an agent platform.
- Signing: HMAC-SHA256(secret, timestamp + '.' + exact raw body), lowercase hex with v1= prefix. Validate five-minute freshness and signed body event ID. X-Rails-CVE-Id is a convenience header, not an independently signed field.
- At-rest encryption: separate Worker ENCRYPTION_KEY encrypts endpoint secrets. Back it up securely. Changing it without re-encrypting existing rows makes delivery secrets unreadable. Never put it into git.
- Egress: HTTPS public DNS names on port 443 only; no credentials, fragments, IP literals, private/reserved DNS answers, redirects, private-network bindings, or subscriber-controlled auth headers. Every attempt checks A/AAAA via Cloudflare DNS. There is a DNS check/fetch resolution gap: fetch cannot pin a resolved IP while maintaining host TLS, so DNS preflight alone is not a formal rebinding-proof egress boundary. Keep this Worker isolated from private networking. For stricter enterprise SSRF isolation, use a dedicated egress proxy with pinned resolution before offering private-network receivers.
- Bounds: 8 KB incoming app requests, 8 MB upstream pages, 4 KB verification responses, 10-second receiver requests, 10 connections/account, 10 write requests/minute/IP. Retry/log data is bounded per response. Historical records currently have no automatic retention purge. Free public signup still needs stronger global abuse controls if heavily promoted.
- Prompts: deterministic templates, no model-generated security claims. External advisory content is reference data. The generic skill requests read-only assessment and human permission before changes/production access. The officially maintained Rails forensic repository is linked only for the matching CVE; it is not silently installed or executed.

## Monitoring

`GET /api/health` reports the last successful canonical sync; alert if non-200. Worker observability logs report event/delivery ID, attempt, result, and response code, never endpoint secrets or receiver bodies. Traces are enabled. Inspect D1 delivery counts by status to detect backlog; at more than 25 due rows per five minutes, move to Queues consumers plus a reconciler over the same outbox. Cron-trigger changes may take time to propagate after deployment.

Use an authenticated POST to `/api/admin/sync` to force ingestion and a drain. Load the admin token from a protected local secret file into the request inside a script; do not put it in shell arguments. Back up D1 and the encryption key before changing storage or key management. Worker rollback does not undo D1 migrations or restore secrets.

## Optional incoming email

V1 works without a mailbox. Its exported `email()` handler accepts list IDs containing `rubyonrails-security.googlegroups.com` only, rate-coalesces against the most recent sync, and fetches canonical advisories. It never parses an email body into an advisory and never replies or follows links in incoming mail. A forged List-ID cannot inject advisory content, but it can request an otherwise throttled source sync; header identity is not treated as cryptographic authentication.

To enable email acceleration later:
1. Use a dedicated email subdomain with Cloudflare Email Routing; do not replace existing domain MX records.
2. Create an address routed to the rails-cve Worker.
3. Subscribe that address to the Rails security Google Group and complete its confirmation through the group UI or a temporary controlled mailbox route.
4. Route subsequent mail to the Worker. Check an actual notification's List-ID against the handler, and observe successful canonical sync.

Email routing and subscription are not provisioned by v1, since GitHub polling provides the complete working path without changing domain mail infrastructure. Details: https://developers.cloudflare.com/email-service/api/route-emails/email-handler/.

## Operator secret storage

Keep deployment secrets in your secret store and outside Git. The self-hosting guide uses an ignored `.secrets.production.json` file with mode 0600 for upload; back it up securely before removing it. `ENCRYPTION_KEY` is required to read existing encrypted endpoint secrets, so do not regenerate it as part of routine deploys. Development keys belong in `.dev.vars` and should be independent of production keys.

## Email and account integration operations

See [email setup](integrations/email.md) for SMTP and Cloudflare transports and [GitHub setup](integrations/github-app.md) for OAuth configuration. Missing optional credentials disable those features explicitly. Destination verification requests have a shared 15-minute cooldown per email and a five-address account cap. Transport errors are categorical; never log SMTP authentication commands, provider response text, mail contents, OAuth codes/tokens, or confirmation URLs. Protect access to platform request logs, which may contain callback URL query parameters.

Email provider acceptance is not inbox receipt. Monitor your provider's bounce/suppression dashboard. `EMAIL_TRANSPORT=disabled` holds pending email deliveries without consuming attempts. A codebase in both mode has independent webhook/mail rows; changing modes cancels pending removed-channel rows, and changing webhook URL resets ownership. Settings changes can race with already in-flight sends. A removed email address must be replaced explicitly on affected apps.

## Upgrade and rollback

Back up D1 before applying 0002 and deploy the matching Worker promptly. The migration rebuilds the deliveries table to change uniqueness while preserving IDs and existing history; do not edit 0001. An older Worker does not understand email-only subscriptions or per-channel rows. Do not roll back to the pre-0002 Worker against a database with email channels enabled: restore a compatible database backup and keys together, or roll forward with a fix. Disable cron/fanout during a coordinated rollback if necessary.
