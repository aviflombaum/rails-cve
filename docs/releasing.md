# Maintaining the public repository

The public repository is [aviflombaum/rails-cve](https://github.com/aviflombaum/rails-cve), with the hosted service at [rails-cve.avi.nyc](https://rails-cve.avi.nyc).

## Before pushing

- Run `bun install --frozen-lockfile`, `bun run check`, and a Wrangler dry run from a clean copy.
- Confirm `.dev.vars*`, `.secrets*`, `wrangler.deploy.jsonc`, generated binding types, build output, and local D1 state are excluded.
- Scan the public tree and Git history for secrets. Avoid publishing local Git backups or secret-scan reports.
- Check README assets and relative documentation links.
- Confirm the security-report contact and attribution in LICENSE are appropriate.

## On GitHub

1. Push reviewed commits to the existing repository. Never include personal deployment configs.
2. Let CI run, then make its `check` job a required status check for pull requests.
3. Enable private vulnerability reporting and repository secret scanning where available.
4. Set the repository description and homepage to describe the project and its hosted demo.
5. Add topics such as `rails`, `security`, `cve`, `webhooks`, `cloudflare-workers`, and `developer-tools`.
6. Keep the README’s live Actions badge, source links and Deploy to Cloudflare link aligned with this repository. Follow [deployment setup](deploy-with-agent.md) when testing a fork.

No deployment workflow or production credentials are required to accept contributions. Repository publishing, branch protection, and settings are intentionally separate from a normal code deployment.

## Releases

Record changes in CHANGELOG.md, run the checks, and review webhook compatibility and database migration requirements. Tag a release only after validation. Include upgrade instructions for schema, config, or secret-handling changes; rolling back Worker code does not roll back D1.

## Test-toolchain security override

The latest `@cloudflare/vitest-pool-workers` 0.22.0 pins Miniflare with sharp 0.35.2. A narrow `sharp: 0.35.4` override fixes GHSA-rgj7-g3m4-5g8c for every dependency path. Re-evaluate this override when upgrading the pool; remove it once the upstream lock graph is entirely patched. Run `bun audit`, the Workers tests, and a deployment dry run before accepting dependency changes.
