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
2. Let CI run, then make its `check` and `secrets` jobs required status checks for pull requests.
3. Enable private vulnerability reporting and repository secret scanning where available.
4. Set the repository description and homepage to describe the project and its hosted demo.
5. Add topics such as `rails`, `security`, `cve`, `webhooks`, `cloudflare-workers`, and `developer-tools`.
6. Keep the README’s live Actions badge, source links and Deploy to Cloudflare link aligned with this repository. Follow [deployment setup](deploy-with-agent.md) when testing a fork.

No deployment workflow or production credentials are required to accept contributions. Repository publishing, branch protection, and settings are intentionally separate from a normal code deployment.

## Releases

Record changes in CHANGELOG.md, run the checks, and review webhook compatibility and database migration requirements. Tag a release only after validation. Include upgrade instructions for schema, config, or secret-handling changes; rolling back Worker code does not roll back D1.

## Test-toolchain security override

The latest `@cloudflare/vitest-pool-workers` 0.22.0 pins Miniflare with sharp 0.35.2. A narrow `sharp: 0.35.4` override fixes GHSA-rgj7-g3m4-5g8c for every dependency path. Re-evaluate this override when upgrading the pool; remove it once the upstream lock graph is entirely patched. Run `bun audit`, the Workers tests, and a deployment dry run before accepting dependency changes.

## Automated security gates

CI runs on PRs, main pushes and weekly: `bun audit` rejects known vulnerabilities across the complete locked dependency graph, including development tools. The separate secrets job checks out full history and runs Gitleaks 8.30.1 with 100% redaction across all fetched refs. The scanner binary has a pinned release SHA-256 and every action has a full commit pin. No production secrets, deployment privileges, report uploads or `pull_request_target` execution are used.

Locally, install [Gitleaks](https://github.com/gitleaks/gitleaks), then run `bun run security:verify`, `bun run security:secrets` and `bun run security:deps`. The scanner self-check generates a fake token in a temporary repository, deletes it in a later commit and confirms historical detection and redaction; it removes that repository afterward. No fake live-looking token is added to project history. Dependency audit uses the configured package registry's advisory service ([Bun audit](https://bun.com/docs/pm/cli/audit)). A clean scan is evidence about known patterns/advisories, not proof of absence of all secrets or vulnerabilities.

Before committing, also scan an isolated copy of the intended public files: Git-history scanning does not inspect uncommitted changes. Keep audit reports and reproductions under ignored `tmp/security-audit/`; never upload their contents to public CI artifacts. Review any findings privately and rotate genuine exposed credentials. Do not add broad path allowlists or ignore all test fixtures to make a failed gate green. Inline `gitleaks:allow` comments are disabled by the project command.

The workflow only becomes active after these commits are pushed; required checks, secret-scanning push protection and private vulnerability reporting must be configured in repository settings by the maintainer. CI is detection after a Git push, not prevention of initial exposure. No repository settings are changed by local validation. Review dependency advisories and pinned action/scanner revisions regularly rather than allowing pins to grow stale.
