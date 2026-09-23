# Authenticate advisory polling with a GitHub App

The scheduled poller always reads the official `rails/rails` security advisory
API. Unauthenticated requests share GitHub's IP-based rate limit, which can cause
HTTP 403 on shared hosting. Authentication gives the poller a separate budget;
it does not change the feed or give Rails CVE access to subscriber code.

This is separate from [GitHub sign-in](github-app.md). The client secret used for
sign-in is not an API access token. Polling can use either an operator-provided
`GITHUB_TOKEN` secret or automatically renewed GitHub App installation tokens.
An explicitly configured `GITHUB_TOKEN` takes precedence.

## Configure installation tokens

1. Register your own GitHub App, or reuse your login app. No optional repository,
   organization, or account permissions are needed for public advisory polling.
   GitHub's required **Metadata: read-only** permission is sufficient. Keep
   **Request user authorization during installation** off; start user login from
   this site's login page instead. Installation and user sign-in are separate.
2. Install the app on an account you control. Use **Only select repositories**
   and select your own relay repository. You do not need to install it on
   `rails/rails`, and this feature never enumerates or reads installed repositories.
3. Generate and download a private key from the app settings. Store it outside
   Git. Keep your App ID and installation ID in your ignored deployment config:

   ```json
   "vars": {
     "GITHUB_APP_ID": "YOUR_APP_ID",
     "GITHUB_APP_INSTALLATION_ID": "YOUR_INSTALLATION_ID"
   }
   ```

   Merge these into the existing vars; preserve `APP_URL` and other settings.
   These IDs are different from the login Client ID. The installation ID is in
   the installation's settings URL or the authenticated list-installations API.
4. Upload the private key from its file, without putting its contents in arguments:

   ```sh
   bunx wrangler secret put GITHUB_APP_PRIVATE_KEY --config wrangler.deploy.jsonc < /absolute/path/to/your-app.private-key.pem
   ```

   Preserve it in your protected deployment secret store too. This command
   immediately updates the deployed Worker's secrets; deploy the matching code
   and vars with `bun run deploy`. A short-lived installation token must not be
   saved as `GITHUB_TOKEN`, because it expires after an hour.
5. Use the authenticated admin sync endpoint and check `/api/health`. Then verify
   that a subsequent scheduled invocation advances `last_sync` without setting
   `last_error_at`. A successful manual sync alone does not verify cron execution.

## Behavior and failure handling

Each acquired sync lease creates a short-lived RS256 app JWT, exchanges it for a
fresh installation token requesting only `metadata: read`, and uses that token
for the canonical feed. Tokens remain in invocation memory and are not stored in
D1, logs, or browser responses. Refreshing on every sync avoids an expiring token
becoming permanent deployment configuration.

Missing all polling credentials retains unauthenticated operation. Partial app
configuration, invalid keys, suspended/deleted installations, rejected exchanges,
and invalid token responses fail the sync and preserve previously stored
advisories. They do not silently retry without authentication. Token responses
are bounded, requests have deadlines, and redirects are rejected without sending
credentials to another host. Error logs omit provider bodies and credentials.

To rotate a key, upload and verify the replacement before revoking the old key in
GitHub. A private key can act as its whole GitHub App; a dedicated polling app with
no optional permissions provides the narrowest scope. This release does not
implement repository issue delivery, repository discovery, or subscriber app
installation management.

Verified against GitHub's public advisory API with a metadata-only installation
token on 2026-09-23. References: [installation token generation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app),
[private key management](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps),
and [REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).
