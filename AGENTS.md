# Working on Rails CVE

## Project

Rails CVE is an independent Rails advisory relay built with Bun, strict TypeScript, Hono, Cloudflare Workers, static assets, and D1. It supplies verified notifications and investigation context; it never assumes an application is vulnerable or authorizes automatic production changes.

Read README.md, docs/architecture.md, SECURITY.md, and relevant operations/integration docs before changing those areas. Source ingestion is fixed to the official rails/rails advisory API. Preserve exact upstream version ranges and source provenance.

## Local workflow

- Install: `bun install --frozen-lockfile`.
- Set up local secrets without overwriting existing values: `bun run setup`.
- Migrate local D1: `bun run db:local`.
- Run: `bun run dev`.
- Checks: `bun run check` (format, generated types, TypeScript, Workers-runtime tests).
- Package check: `bunx wrangler deploy --dry-run`.
- Default wrangler.jsonc is local-only. Personal deployments use ignored wrangler.deploy.jsonc. Never commit deployment IDs, secrets, local state, or generated worker-configuration.d.ts.

## Implementation boundaries

- Use additive numbered D1 migrations; never rewrite a deployed migration.
- Enforce account ownership on every private resource query and mutation.
- Keep credentials encrypted or hashed as appropriate. Never log tokens, private payloads, mailbox credentials, signing secrets, or receiver response bodies.
- Browser mutations require same-origin protection; OAuth requires expiring, single-use state and a browser binding. Linking identities must require an authenticated account and must never merge accounts based on an unverified email.
- Delivery is at least once. Preserve immutable payloads, stable event IDs, idempotent fanout, bounded attempts, and recoverable leases.
- Verify receiver ownership before delivery. Email destinations must be verified before notifications. Model channel attempts independently so one failure does not resend a successful channel.
- Validate destinations on each request, bound reads, reject redirects, and preserve HMAC verification/freshness guidance. Do not expose an agent gateway directly as an unauthenticated endpoint.
- Agent integration docs must cite current primary documentation, identify prerequisites, and distinguish verified interfaces from assumptions. Prompts must require approval for code changes, production access, secret rotation, merge, and deploy.
- When external credentials are missing, implement and test the disabled/unconfigured state honestly. Never imply an integration is active when it has not been configured and verified.

## Testing and UI

- Add meaningful Workers-runtime regression tests for authentication, OAuth, tenant isolation, migrations, fanout, channel retries, and delivery semantics when changed.
- Keep mocks offline. Never test by sending to real subscribers or third-party repositories.
- Follow the existing Rails-red/ivory design and accessible server-rendered forms. Check desktop/mobile, keyboard access, and empty/error states.
- Use the `agent-browser` skill and CLI for browser automation and verification. Use another browser tool only when agent-browser cannot perform the operation, and explain that limitation first.
- Update docs, setup examples, configuration references, and changelog when public behavior changes. Keep the README clear about shipped versus planned integrations.

## Git and collaboration

Work on a feature branch for substantial changes. Keep commits reviewable. Do not publish the repository, create external issues, or configure production integrations unless the task authorizes those actions. Do not delegate to sub-agents unless the user explicitly requests delegation. Finish authorized implementation and validation before reporting completion; identify external configuration still required.
