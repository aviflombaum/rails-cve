# Operations

## Pipeline

Every five minutes, the scheduled handler fetches all published advisories from rails/rails on GitHub, validates them, and compares normalized content. It retains exact package/version strings. The first import is a quiet baseline. Each subsequent change inserts the advisory, immutable event, and active-endpoint outbox rows in one D1 transaction. Deterministic revision hashes and unique app/event/channel keys make repeated ingestion safe.

A D1 lock prevents overlapping scheduled/email/manual sync runs for four minutes. The fixed source is fetched before any ingestion starts; a failed page leaves the previous snapshot untouched. A mid-ingestion interruption resumes next run; each individual advisory plus its fanout is atomic. API failures set public degraded health, preserving data. There are no removals inferred from missing upstream results. Scope is published rails/rails advisories; public archive coverage is whatever that endpoint exposes, not the entirety of historic Rails CVEs.

The scheduled handler drains deliveries even if GitHub sync fails. D1 is the durable queue. At most 25 due deliveries are processed per invocation in groups of five, with at most five rows per tenant in a batch and hourly account/service dispatch budgets. Atomic two-minute leases avoid concurrent duplicate sends; a crashed lease is recoverable. Delivery is at least once: a crash after receiver acceptance but before recording success can cause a repeat. Event IDs and payload bytes are stable across retries; timestamp/signature are refreshed. Ordering is not guaranteed. Receiver deduplication is mandatory.

Failures retry after 5, 10, 20, 40, 80, 160, and 320 minutes, subject to cron timing/backlog, with at most eight attempts. Any 2xx acknowledges delivery; all other statuses (including redirects and 410) retry. A failed delivery stays visible in the delivery log. V1 has no manual replay of historical events. Pausing stops new event fanout and delivery attempts; resuming processes previously queued rows. Deletion removes the endpoint, encrypted secret and associated delivery rows. An already in-flight network request cannot be recalled.

## Security boundaries

- Authentication: hashed management capabilities plus expiring/revocable browser sessions, optional GitHub App identity with PKCE, HttpOnly/Lax cookies, same-origin POST checks and per-IP rate limits. Settings supports management-token replacement. Lost access can be restored only with a saved token or previously linked GitHub identity; email verification is not a login recovery mechanism.
- Endpoint ownership: unverified webhooks only get explicit signed verification challenges. Return the exact challenge as plain text; successful verification enables events. Challenge changes on each attempt. Read the receiver example before connecting an agent platform.
- Signing: HMAC-SHA256(secret, timestamp + '.' + exact raw body), lowercase hex with v1= prefix. Validate five-minute freshness and signed body event ID. X-Rails-CVE-Id is a convenience header, not an independently signed field.
- At-rest encryption: separate Worker ENCRYPTION_KEY encrypts endpoint secrets. Back it up securely. Changing it without re-encrypting existing rows makes delivery secrets unreadable. Never put it into git.
- Egress: webhook sends require the [pinned-IP gateway](egress.md). Worker DNS preflight is defense in depth; the gateway validates and pins the connection address, retains hostname TLS verification and rejects redirects. Private-network receivers are unsupported. Missing configuration holds webhook delivery without consuming attempts; configured email remains independent.
- Bounds: 8 KB incoming app requests, 8 MB upstream pages, 4 KB verification responses, 10-second receiver requests, 10 connections/account, 10 write requests/minute/IP. Retry/log data is bounded per response. D1 service/account budgets, fixed inventory caps and bounded retention constrain anonymous growth; see the policies below.
- Prompts: deterministic templates, no model-generated security claims. External advisory content is reference data. The generic skill requests read-only assessment and human permission before changes/production access. The officially maintained Rails forensic repository is linked only for the matching CVE; it is not silently installed or executed.

## Monitoring

`GET /api/health` reports the last successful canonical sync; alert if non-200. Worker observability logs report event/delivery ID, attempt, result, and response code, never endpoint secrets or receiver bodies. Query strings are redacted from invocation logs and traces are disabled to avoid recording credential-bearing webhook paths. Apply these observability settings to private deployment configs too; review edge/proxy log exports separately. Inspect D1 delivery counts by status to detect backlog; at more than 25 due rows per five minutes, move to Queues consumers plus a reconciler over the same outbox. Cron-trigger changes may take time to propagate after deployment.

Use an authenticated POST to `/api/admin/sync` to force ingestion and a drain. Load the admin token from a protected local secret file into the request inside a script; do not put it in shell arguments. Back up D1 and the encryption key before changing storage or key management. Worker rollback does not undo D1 migrations or restore secrets.

## Optional incoming email

V1 works without a mailbox. Its exported `email()` handler accepts list IDs containing `rubyonrails-security.googlegroups.com` only, rate-coalesces against the most recent sync, and fetches canonical advisories. It never parses an email body into an advisory and never replies or follows links in incoming mail. A forged List-ID cannot inject advisory content, but it can request an otherwise throttled source sync; header identity is not treated as cryptographic authentication.

To enable email acceleration later:
1. Use a dedicated email subdomain with Cloudflare Email Routing; do not replace existing domain MX records.
2. Create an address routed to the rails-cve Worker.
3. Subscribe that address to the Rails security Google Group and complete its confirmation through the group UI or a temporary controlled mailbox route.
4. Route subsequent mail to the Worker. Check an actual notification's List-ID against the handler, and observe successful canonical sync.

Email routing and subscription are not provisioned by v1, since GitHub polling provides the complete working path without changing domain mail infrastructure. Details: https://developers.cloudflare.com/email-service/api/route-emails/email-handler/.

## Webhook URL encryption upgrade

Webhook URLs are encrypted with the existing ENCRYPTION_KEY and displayed only as an origin. New writes encrypt immediately. Each scheduled or admin sync converts up to 50 legacy plaintext rows using compare-and-swap updates; repeat until `SELECT COUNT(*) FROM endpoints WHERE url<>'' AND url NOT LIKE 'url:v1:%'` returns zero. Back up the key first, keep database backups protected, and retire plaintext backups under your retention policy. The code reads both formats during the rollout. Avoid putting credentials in receiver URLs; prefer the HMAC contract.

## Operator secret storage

Keep deployment secrets in your secret store and outside Git. The self-hosting guide uses an ignored `.secrets.production.json` file with mode 0600 for upload; back it up securely before removing it. `ENCRYPTION_KEY` is required to read existing encrypted endpoint secrets, so do not regenerate it as part of routine deploys. Development keys belong in `.dev.vars` and should be independent of production keys.

## Email and account integration operations

See [email setup](integrations/email.md) for SMTP and Cloudflare transports and [GitHub setup](integrations/github-app.md) for OAuth configuration. Missing optional credentials disable those features explicitly. Destination verification requests have a shared 15-minute cooldown per email and a five-address account cap. Transport errors are categorical; never log SMTP authentication commands, provider response text, mail contents, OAuth codes/tokens, or confirmation URLs. Protect access to platform request logs, which may contain callback URL query parameters.

Email provider acceptance is not inbox receipt. Monitor your provider's bounce/suppression dashboard. `EMAIL_TRANSPORT=disabled` holds pending email deliveries without consuming attempts. A codebase in both mode has independent webhook/mail rows; changing modes cancels pending removed-channel rows, and changing webhook URL resets ownership. Settings changes can race with already in-flight sends. A removed email address must be replaced explicitly on affected apps.

## Upgrade and rollback

Back up D1 before applying 0002 and deploy the matching Worker promptly. The migration rebuilds the deliveries table to change uniqueness while preserving IDs and existing history; do not edit 0001. An older Worker does not understand email-only subscriptions or per-channel rows. Do not roll back to the pre-0002 Worker against a database with email channels enabled: restore a compatible database backup and keys together, or roll forward with a fix. Disable cron/fanout during a coordinated rollback if necessary.

### Interrupted final attempts

Eight attempts is a hard dispatch ceiling, including expired delivery leases. An expired eighth lease is finalized as failed without another send. Its history explicitly records that receipt is unknown: the receiver may have accepted the request before the Worker stopped. Reconcile using the stable event ID at the receiver; do not assume failure proves non-delivery. Unexpired leases are left alone.

## Abuse budgets and circuit breakers

Migration **0004** adds atomic D1 hourly counters and retention metadata. Apply all numbered migrations before this Worker. Budgets count reservations, including interrupted/rejected provider work; they are not invoices or confirmed deliveries. Failed reservations never create an account, mailbox confirmation or test event, or send a request. A conservative account reservation can be consumed when the global budget is exhausted. Quotas do not rely on client IP variation or local in-memory counters.

| Operation | Service/hour | Account/hour |
| --- | ---: | ---: |
| Account creation, token or GitHub | 25 | — |
| Verification email | 100 | 5 |
| Webhook ownership challenge | 100 | 10 |
| Test event | 50 | 5 |
| Delivery dispatch, all channels | 300 | 60 |
| OAuth starts | 300 | 20 when authenticated |

The existing edge IP limiter and exact-mailbox cooldown remain. Counters reset at UTC hour boundaries (two windows can be adjacent); they are ceilings, not guaranteed allocations. Capped requests return 429 with Retry-After. At most 1,000 accounts and 1,000 endpoints can be created, in addition to ten endpoints/five mailboxes per account. A single source revision therefore fans out to at most 2,000 channel rows on a new installation. Existing larger installations must review inventory before opening signup; caps prevent additions rather than silently deleting existing users. At higher scale, replace this bounded single-database fanout with durable batch/queue processing before raising caps.

Set `SIGNUPS_ENABLED=false` to stop new accounts while preserving existing login. Set `VERIFICATIONS_ENABLED=false` to stop new mail/challenge requests. Set `DELIVERY_ENABLED=false` to stop test creation and draining while retaining queued notifications. These are optional Worker vars in the ignored deployment config, defaulting to enabled. They do not recall an already in-flight request. Keep provider-level spending/sending limits and infrastructure alerts as independent controls.

The runner considers at most five due rows from each tenant, interleaves tenant ranks, and excludes accounts already at their dispatch budget so one account cannot fill a batch indefinitely. Many abusive identities can still compete for the global budget; close signup, investigate and remove abuse. No delivery-time SLA is promised.

`GET /api/admin/health` requires the admin Bearer token. It returns only aggregate inventory, current service reservation counts, provider configuration and live backlog age/count. Alert on 503 (oldest live notification exceeds **15 minutes**), near-cap usage, account/endpoint capacity, and rising failed counts; reconcile against provider cost/bounce metrics. A configured provider is not proof of successful delivery. `/api/health` continues to measure canonical source health only. Do not expose the admin response/token in public monitoring pages.

## Retention and deletion

Scheduled/admin maintenance uses bounded batches. It keeps pending/retry/sending notifications regardless of age. Terminal delivered/accepted/failed/cancelled rows and their attempts are kept for **at least 30 days after maintenance first observes completion**, then removed in batches of 500. Monitor/export needed incident history before expiry. Orphan test events older than 30 days are removed; canonical advisory/revision events remain. Expired sessions/OAuth states, cooldown hashes older than a day, unreferenced unverified mailbox requests expired for seven days, and quota buckets older than two days are cleaned in batches of 500. Browser session issuance keeps at most 20 sessions per account.

An unverified workspace can expire after **30 days** only if it has had no recent authenticated activity, no live session or OAuth flow, no linked GitHub identity, no verified destination and no live notification. Up to 25 such accounts are removed per run. Verified workspaces are retained until their owner deletes them. Cleanup rechecks eligibility transactionally; authentication refreshes activity at most daily.

Settings also offers permanent account deletion, protected by the current management token or a fresh five-minute GitHub recovery grant and an explicit DELETE confirmation. It removes account credentials, endpoints, mailboxes, sessions, OAuth flows and private delivery history in one transaction. Failed proof leaves all rows untouched. In-flight network sends cannot be recalled. Shared canonical events and anonymous aggregate quota usage are retained; orphan test events expire as above. Provider/platform logs and backups follow the operator's separate retention policy.
