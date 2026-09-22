# GitHub App setup: login now, repository issues later

Research checked 2026-09-22. This release implements **GitHub registration, login, and explicit account linking**. It does not install a repository bot, list repositories, or create issues. Those are a separate delivery integration. A user's successful login never implies installation access.

## Create the app for login

In GitHub → Settings → Developer settings → GitHub Apps → New GitHub App:

| Setting | Hosted service | Independent deployment |
| --- | --- | --- |
| App name | Choose a globally unique Rails CVE name | Choose your own name |
| Homepage URL | `https://rails-cve.avi.nyc` | Your `APP_URL` |
| User authorization callback URL | `https://rails-cve.avi.nyc/auth/github/callback` | `<APP_URL>/auth/github/callback` |
| Expire user authorization tokens | Keep enabled | Keep enabled |
| Request user authorization during installation | Leave off for the current login-only release | Same |
| Enable Device Flow | Off | Off |
| Setup URL / redirect on update | Leave unset | Leave unset |
| Webhook Active | Uncheck; this release has no GitHub webhook consumer | Same |
| Repository permissions | No optional permissions needed for identity login | Same |
| Organization permissions | None | None |
| Account permissions | None; do not request email addresses | Same |
| Where installed | Any account for a public service; your account for a private service | Your choice |

Use a separate development GitHub App for local testing. Its callback may be `http://localhost:8787/auth/github/callback`; set APP_URL consistently. Never use a production client secret in a public example or CI fixture.

GitHub's [user authorization flow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app) supports authorization code + PKCE. `/user` supplies the numeric identity. GitHub App user tokens use app permissions rather than OAuth scopes. This service discards access/refresh tokens after identity lookup and does not fetch private email addresses.

## Configure this Worker

Copy the **Client ID**, not the App ID, into `GITHUB_CLIENT_ID` in your private deployment vars. Generate a **client secret**, then store it using the interactive prompt:

```sh
bunx wrangler secret put GITHUB_CLIENT_SECRET --config wrangler.deploy.jsonc
```

Deploy the configured Worker. No private key, installation token, App ID, webhook secret, or `GITHUB_TOKEN` is required for login. `GITHUB_TOKEN` is a separate optional credential for higher upstream advisory polling limits; it is not the login client secret.

With both credentials present, `/connect` and `/login` display Continue with GitHub. An existing token user should first restore their workspace and select Connect GitHub in `/settings`. Signing in without restoring first creates/opens that GitHub identity's workspace; we deliberately do not merge accounts based on email. Linking an identity already owned by another workspace returns a conflict.

Test registration, logout/login, an existing workspace link, canceled authorization, rejected/reused state, and mismatched browser cookies. Test on your actual callback origin; mocks cannot validate GitHub's registration settings. Keep a recovery token in a password manager.

## Troubleshooting sign-in

Restart at `/login` (or `/settings` when linking) in the same browser. Callback URLs contain one-time codes and must not be reused or shared. Authorization state expires after ten minutes. Keep cookies enabled for your deployment origin.

Failed callbacks show a stage and a random reference. Operators can match that reference to the `github_signin_failed` Worker log. Logs include only the stage, reference and available HTTP status; provider bodies, tokens, codes, state and cookies are omitted.

- `browser` / `state`: missing browser binding, expired, replaced or already-used sign-in. Start again in one tab.
- `authorization`: GitHub did not return an authorization code, or the user canceled.
- `account_changed`: the workspace at callback differs from the one that started linking. Restore that workspace and restart. Existing authenticated sessions are refreshed with SameSite=Lax before leaving for GitHub so legacy Strict cookies do not break the return trip.
- `token`: check the Client ID, current client secret, exact callback URL, and GitHub availability. HTTP 200 can still contain a rejected exchange.
- `profile`: identity lookup failed; check GitHub availability and response status.
- `account` / `session`: inspect D1 availability and applied migrations.

A stage identifies where the failure occurred, not its complete cause. Never paste raw callback URLs or provider responses into public bug reports.

## Minimum permissions for the future issue bot

| Permission | Required level | Why |
| --- | --- | --- |
| Repository: Issues | Read and write | Create issues, find existing advisory issues and add/update context |
| Repository: Metadata | Read-only (GitHub requires it) | Repository identity and access metadata |
| Contents, Pull requests, Actions, Administration | None | Unnecessary for posting issues |
| Organization and account permissions | None | Unnecessary for posting issues |

GitHub's [Create an issue API](https://docs.github.com/en/rest/issues/issues#create-an-issue) accepts installation tokens with Issues write. Use **Only select repositories** during installation. You can configure Issues write when initially creating the app if you want the final permission set ready, but this release will not use it; login-only is narrower.

The later bot should request installation access tokens scoped to the chosen repositories and Issues write, using an App private key and App ID. See GitHub's [installation token guide](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app). Keep the private key and future webhook secret in Worker secrets. Do not paste either into the repository.

## Planned installation and issue lifecycle (not implemented)

- Separate Install GitHub App action after login; maintain signed browser state for account association.
- Verify the authenticated user can access the installation via GitHub. Never trust `installation_id` from a callback alone.
- Handle signed installation, installation_repositories and deletion/suspension events. Remove revoked access promptly; subscribe to issue events only if actually needed for reconciliation.
- Offer eligible installed repositories explicitly, allowing only repos with Issues enabled and granted write permission.
- Create one issue per installation/repository/advisory with a deterministic hidden marker. Advisory revisions append/update context; avoid duplicate issues after retries or timeouts. Honor user closure/reopen policy rather than reopening automatically.
- Include CVE, severity, affected ranges, canonical source, investigation link, and a clearly delimited agent brief. An issue is an investigation request, not permission to merge or deploy.
- Track GitHub as another independent delivery channel, with rate limits, attempts, suspension handling, and tenant-scoped history.

Issue creation does not automatically start an agent. A repository's existing issue-to-agent harness, labels, or workflow decides how the issue becomes a job. With current permissions, the bot cannot push patches or merge pull requests.
