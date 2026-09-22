# Follow-up implementation plan

## Before broad promotion

1. Add global registration/verification quotas in addition to per-IP limits; exercise abuse budgets without blocking legitimate receiver retries.
2. Define a retention policy for deleted workspaces and historical deliveries; implement scheduled bounded cleanup and validate that live outbox rows are never pruned.
3. Management-token replacement now exists in settings. Add workspace deletion and a UI to revoke all browser sessions.
4. Add signing-secret rotation with two explicit key IDs and a short overlapping verification period. Document rollback; test deliveries across rotation.
5. Configure an external health check for /api/health and delivery-backlog alerts. Simulate GitHub downtime, receiver downtime and scheduler interruption.
6. Decide whether stronger egress isolation is required. If so, implement an egress proxy that validates and pins DNS resolution across connection creation, before enabling private or enterprise endpoint configurations.

## Scale delivery

1. Add Queues as a notification layer over committed D1 outbox rows; a reconciler enqueues rows whose notification handoff was interrupted.
2. Move leased delivery execution into the queue consumer; preserve event IDs, signature contract and receiver deduplication.
3. Load-test source fanout and receiver backpressure. Add per-endpoint concurrency caps and jitter; measure p95 source-to-receiver latency.
4. Add manual replay for owners with explicit historical advisory selection and a distinct replay intent. Test tenant authorization and duplicate event semantics.

## Expand product

1. GitHub App authentication and explicit workspace linking now exist. Add organizations/member roles and repository installation/issue delivery following integrations/github-app.md.
2. Add RubySec ingestion under a separate source identity, normalize aliases and prove CVE/GHSA deduplication before merging feeds.
3. Let users upload or locally inspect Gemfile.lock; minimize retained data and show why a package matches. Use RubyGems version semantics, including prereleases, with independently verified fixtures.
4. Add curated advisory-specific skills with source provenance, reviewed commit pins and maintenance ownership.
5. Build optional agent integrations that open draft PRs. Separate investigation permission from code-writing permission, and require human review before merge/deploy.

## Optional email acceleration

Use a dedicated mail subdomain and Email Routing, confirm the Google Group subscription, verify the real List-ID, and test message-to-canonical-sync behavior. Keep polling as reconciliation. Do not migrate or overwrite existing avi.nyc mail settings.
