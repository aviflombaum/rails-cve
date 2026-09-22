# Validation

Run `bun install --frozen-lockfile`, `bun run check`, and `bunx wrangler deploy --dry-run` against the revision you intend to deploy. Test counts and package sizes change; a historical deployment record is not proof that a new checkout or production configuration is healthy.

## Automated coverage

The offline suite uses the Workers runtime and local D1. It covers HMAC signing, encryption, URL validation, canonical ingestion and provenance, tenant isolation, browser origin checks, session revocation and recovery, GitHub OAuth binding/PKCE/replay/link races, mailbox verification, independent channel retries, lease recovery, migration compatibility, payload byte limits, and bounded SMTP parsing. Provider responses are mocked; tests do not contact subscribers or third-party repositories.

`ruby -c public/receiver.rb` checks the example's syntax. The receiver is not integration-tested in a full Rails application: subscribers must install its inbox model, migration and idempotent consumer and verify their complete admission path.

## Browser verification

Use agent-browser for local desktop and mobile checks. Exercise onboarding, recovery, settings, pending/disabled delivery states, ownership verification, delivery history, integration navigation and copy/download. Check keyboard operation, errors, empty states and horizontal overflow at 390px. Keep screenshots and fixture data in ignored local storage.

## Deployment verification

Keep deployment IDs, migration backups, provider details and production test records in protected operator notes outside the public repository. Deployment-specific checks require the operator's own configured GitHub application, authorized email recipient and controlled webhook receiver. Local mocks and deployment dry runs do not establish that those integrations work in production.

The public import-button flow and agent integration recipes require separate end-to-end verification on the destination account. Follow [operations](operations.md) and the relevant integration guide; never infer that configuration has been installed from documentation alone.
