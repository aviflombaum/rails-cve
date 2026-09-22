# Publishing the repository

The repository is prepared for publication; these are maintainer actions for when a GitHub destination is chosen.

## Before the first push

- Run `bun install --frozen-lockfile`, `bun run check`, and a Wrangler dry run from a clean copy.
- Confirm `.dev.vars*`, `.secrets*`, `wrangler.deploy.jsonc`, generated binding types, build output, and local D1 state are excluded.
- Scan the public tree and Git history for secrets. Avoid publishing local Git backups or secret-scan reports.
- Check README assets and relative documentation links.
- Confirm the security-report contact and attribution in LICENSE are appropriate.

## On GitHub

1. Create an empty repository and push the reviewed history. Do not include personal deployment configs.
2. Let CI run, then make its `check` job a required status check for pull requests.
3. Enable private vulnerability reporting and repository secret scanning where available.
4. Set the repository description and homepage to describe the project and its hosted demo.
5. Add topics such as `rails`, `security`, `cve`, `webhooks`, `cloudflare-workers`, and `developer-tools`.
6. Optionally replace the static CI badge with the repository's real Actions status badge after its first run.

No deployment workflow or production credentials are required to accept contributions. Repository publishing, branch protection, and settings are intentionally separate from a normal code deployment.

## Releases

Record changes in CHANGELOG.md, run the checks, and review webhook compatibility and database migration requirements. Tag a release only after validation. Include upgrade instructions for schema, config, or secret-handling changes; rolling back Worker code does not roll back D1.
