# Your workspace

A workspace holds your apps, notification addresses, signing secrets, and delivery history. This page explains sign-in, recovery, settings, the delivery log, and deletion. For the first-time walkthrough, start with [Getting started](getting-started.md).

## Signing in

There are two ways in, and a workspace can use both.

**Management token.** Creating a workspace at `/connect` gives you a token that starts with `rcve_`. It is shown once. Paste it at `/login` to restore access from any browser. Treat it like a password: anyone with the token controls the workspace.

**GitHub.** When a deployment has GitHub sign-in configured, `/connect` and `/login` show **Continue with GitHub**. Sign-in identifies you by your numeric GitHub ID, so a username change does not lock you out. No repository access is requested and no bot is installed.

Browser sessions last 30 days. **Sign out** ends only the current browser's session.

### Linking GitHub to an existing token workspace

Restore the token workspace first, open **Settings → GitHub sign-in**, enter your current management token, and click **Connect GitHub**. Your apps and history stay where they are.

If you sign in with GitHub before linking, you get a new empty workspace tied to that GitHub identity. Rails CVE never merges workspaces based on an email address. A GitHub identity already linked to one workspace cannot be linked to another.

## Settings

**Display name.** A label for you or your team. Optional.

**Secure your account.** Replaces your management token, signs out every other browser, and cancels any GitHub link in progress. Use it if you think the token leaked. Prove it is you with your current token, or with **Confirm identity with GitHub** if GitHub is linked, which grants a five-minute window. You can remove an unexpected GitHub link at the same time. Workspaces created with GitHub can generate a management token here so they have a second way in.

**Notification addresses.** Add up to five addresses. Each needs a one-hour, single-use confirmation link, confirmed while signed in to the requesting workspace. Re-enter a pending address after 15 minutes to resend. Removing an address cancels its queued deliveries and clears it from any app that used it; those apps show **Needs destination** until you pick a replacement.

A notification address is a destination only. It cannot sign in or recover the workspace. If you lose the management token and have no GitHub link, the workspace cannot be recovered.

## Apps

Each app is one subscription with a name, a delivery mode, and one or two destinations.

| Mode | Needs | Sends |
| :--- | :--- | :--- |
| Email | A verified address selected on the app | A text email with the advisory and the investigation brief |
| Webhook | An HTTPS URL and a passed ownership handshake | A signed JSON event |
| Both | Both | Both, retried independently |

Names are labels, not filters. Every active app receives every future published, updated, or withdrawn Rails advisory. Rails CVE does not read `Gemfile.lock` or replay historical advisories; the investigation brief helps your agent decide whether a codebase is affected.

App status badges:

- **active** delivers on every enabled channel.
- **paused** holds everything until you resume.
- **Needs destination** means no verified webhook and no verified address is selected.
- **Delivery unavailable** means a destination is configured but the deployment has that channel disabled, for example no egress gateway for webhooks.

Editing an app can change its name, mode, address, or URL. Saved webhook paths and query strings are hidden; leave the URL field blank to keep the saved one. A new URL issues a new signing secret and needs a fresh handshake. Removing a channel cancels its pending deliveries. Deleting an app removes its secret and history.

## Delivery log

`/events` lists deliveries across your apps, newest first, thirty per page, filterable by app, channel, and status. Open a delivery to see the immutable event payload and every completed attempt.

### Delivery log statuses

| Status | Meaning |
| :--- | :--- |
| `pending` | Waiting for the next delivery run. Runs happen every five minutes. |
| `sending` | A run has picked it up. An interrupted run releases it after two minutes. |
| `retry` | The last attempt failed. The next attempt waits 5, 10, 20, 40, 80, 160, then 320 minutes. |
| `delivered` | Your webhook returned a 2xx status. |
| `accepted` | The email provider accepted the message. Inbox arrival is not tracked. |
| `failed` | Eight attempts were made without success, or the event was too large to send. |
| `cancelled` | The channel or destination was removed or changed before delivery completed. |

Delivery is at least once. A receiver can accept a request just before Rails CVE loses the connection, in which case the same event is sent again. Webhook receivers must store event IDs and treat duplicates as successes. Email and webhook attempts for the same event are independent: a failing webhook never causes the email to be resent.

Delivery history is kept for at least 30 days after completion and then removed in batches. Export anything you want to keep before then.

## Deleting a workspace

**Settings → Delete workspace** removes the account, its apps, addresses, secrets, sessions, and private delivery history in one transaction. Prove ownership with your management token or a fresh GitHub confirmation, then type `DELETE`. Queued notifications are cancelled; a message already being sent cannot be recalled.

Workspaces that were never verified, have no linked GitHub identity, no verified destination, and no recent activity can expire after 30 days. Verified workspaces stay until you delete them.

## Limits

Ten apps and five addresses per workspace. Hourly service-wide and per-workspace budgets cover sign-ups, verification emails, webhook handshakes, tests, and deliveries; exceeding one returns a 429 with a Retry-After header. Operators can temporarily pause sign-ups, verifications, or delivery, in which case the site says so.
