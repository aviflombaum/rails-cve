# Accounts, app subscriptions and delivery history

## Create or restore a workspace

Visit `/connect`. Use GitHub when the operator configured it, or create a workspace with a management token. Save that token immediately; it is shown once. New token accounts continue to settings. Token login and GitHub login also land on settings.

Existing users should restore their token workspace before selecting **Connect GitHub** in settings, and enter the saved management token to authorize a new identity link. An identity already linked elsewhere cannot be merged automatically. GitHub usernames may change; the numeric identity owns the link. Neither login nor linking installs an issue bot.

Settings lets you change the display name, replace the recovery/management token, and verify notification addresses. Securing the account replaces the capability, revokes every previous browser session and pending account-bound OAuth flow, and issues a new session to the recovering browser. Enter your current management token or freshly confirm the already-linked GitHub identity (five-minute, single-use recovery permission). You can remove an unexpected GitHub link at the same time. Review app destinations after a suspected compromise. Signing out alone revokes only that browser’s session. Accounts created with GitHub can generate a recovery token here as well.

## Verify notification addresses

Add an address in settings, open the email and press Confirm while signed into the requesting workspace. The one-hour link is single-use. Mail scanners opening the GET link cannot consume it. If you were logged out, sign in and reopen the original confirmation link. Re-enter a pending address after the 15-minute cooldown to resend. Five saved addresses are allowed; remove unused ones.

A verified notification address does not become a sign-in identity and cannot recover an account. Removing it cancels queued deliveries and clears it from affected apps. Pick a replacement address explicitly. Mail already being sent can still arrive.

## Subscribe an app/codebase

In `/dashboard`, add a name and choose a mode:

| Mode | Requirements | Delivery |
| --- | --- | --- |
| Webhook | HTTPS receiver and successful signed challenge | Signed JSON |
| Email | Configured email transport and verified selected address | Human-readable advisory and agent brief |
| Both | Both destinations | Independently retried webhook and email |

Up to ten apps per workspace. App names are labels, not version filters. Every active app receives future published/updated/withdrawn Rails advisories from this service. No repository upload, Gemfile.lock matching, or historical replay occurs. Your agent decides whether a codebase is affected.

For webhook/both, save the one-time signing secret on your receiver and choose Verify webhook. A both-mode app can already receive email while its webhook remains unverified. Use [agent guides](integrations/openclaw.md) or the [webhook receiver](webhooks.md) to implement the handshake. Test events should not launch security investigations.

Edit delivery settings to change modes, addresses or URLs. Saved webhook paths and queries are hidden; leave the URL field blank to keep the saved destination, or explicitly remove it when switching to email-only. Changing URL creates a new signing secret and requires verification again. Pending deliveries to removed channels/changed destinations are cancelled. Pausing stops new fanout and holds existing queued deliveries; resuming processes queued work. Deleting an app deletes its secret and history.

## Read the delivery log

`/events` filters by app, channel and status, with 30 results per page. Open a delivery to inspect the immutable event payload and completed attempt history. Older migrated deliveries retain aggregate counts but do not invent per-attempt details.

- `pending`: waiting for a runner.
- `sending`: leased by a runner; an interrupted lease becomes eligible again.
- `retry`: failed attempt, waiting for bounded backoff.
- `delivered`: webhook returned 2xx.
- `accepted`: email provider accepted it; inbox arrival remains unconfirmed.
- `failed`: eight unsuccessful attempts.
- `cancelled`: channel/destination removed or changed before completion.

At-least-once delivery means duplicate messages can occur after uncertain network outcomes. Webhook receivers must persist event IDs. Email and webhook attempts are independent: one successful channel is never resent just because the other fails. Unconfigured email is held without consuming attempts. There is no manual historical replay UI in this release.

Removing a notification address cancels its pending email deliveries and recomputes affected app readiness. Email-only apps, and both-mode apps without a verified webhook, become pending (paused apps stay paused). The dashboard shows **Needs destination** and disables Send test until a replacement is verified and selected. A verified webhook can continue independently. Resume does not create a missing destination. Replacing an address resumes future events; cancelled events are not backfilled. A provider disabled by the operator displays **Delivery unavailable** instead of suggesting working notifications.

Settings offers permanent workspace deletion with management-token proof or fresh linked GitHub confirmation and a typed DELETE confirmation. It removes credentials, apps, addresses and private history together. Pending notifications are cancelled by deletion; in-flight sends cannot be recalled. Unverified inactive workspaces can expire after 30 days under the [retention policy](operations.md#retention-and-deletion). Hourly operation budgets can return 429; wait until the next hour or contact the operator when signup or delivery is paused.
