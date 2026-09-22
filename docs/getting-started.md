# Getting started

This guide walks through using Rails CVE as a Rails developer. It applies to the hosted service at [rails-cve.avi.nyc](https://rails-cve.avi.nyc) and to any self-hosted copy. Where the two differ, the guide says so.

You will end up with a workspace, one or more subscribed apps, and a delivery channel that has passed a test. From then on, every new, updated, or withdrawn Rails advisory reaches you with an investigation brief attached.

## 1. Create a workspace

Open `/connect`.

- **Continue with GitHub** signs you in with your GitHub identity. No repository access is requested. This button appears only when the deployment has GitHub sign-in configured; the hosted service does.
- **Create your workspace** gives you a management token instead of a password. It starts with `rcve_` and is shown exactly once. Save it in your password manager. You use it to restore access on another browser and to prove ownership when changing account settings.

Either way you land in **Settings**. A workspace is private to you. Nothing in it is shared with other users.

If you created a token workspace and later want GitHub sign-in, restore the token workspace first and use **Connect GitHub** in Settings. Signing in with GitHub before linking creates a separate, empty workspace.

## 2. Verify an email address

Skip this step if you only want webhooks.

In **Settings → Notification addresses**, enter an address and click **Send verification email**. Open the email, click the link, and press **Confirm notification address** while signed in to the same workspace. Links expire after an hour and work once. You can save up to five addresses and use different ones for different apps.

A notification address is only a destination. It cannot sign you in or recover the workspace.

The form is disabled with a notice when a deployment has no outbound email configured. The hosted service has email configured.

## 3. Add an app

In **Apps**, fill in the **Add an app** panel.

| Field | What to enter |
| :--- | :--- |
| App / codebase name | A label such as `storefront` or `billing-api`. Labels do not filter advisories. Every app receives every Rails advisory. |
| Delivery mode | **Email**, **Webhook**, or **Both**. |
| Webhook URL | Public HTTPS URL on port 443 that you control. Not needed for email-only. |
| Verified notification address | One of the addresses from Settings. Not needed for webhook-only. |

Click **Subscribe app**. Email-only apps are active immediately. Apps with a webhook show you a signing secret next; see step 4.

You can have ten apps per workspace. Use one app per codebase so that each delivery log and each signing secret stays separate.

## 4. Set up a webhook (optional)

After you subscribe an app with a webhook, the site shows a signing secret that starts with `whsec_`. It is shown once. Store it in your receiver's environment, for example as `RAILS_CVE_WEBHOOK_SECRET`.

Your receiver has to do two things:

1. Verify every request's HMAC-SHA256 signature before doing anything else.
2. Answer the ownership handshake by returning the `challenge` string from an `endpoint.verification` event as a plain-text response with a 2xx status.

The [Rails receiver example](../public/receiver.rb) does both, plus durable storage with deduplication. The [webhook guide](webhooks.md) explains the contract in full.

Once the receiver is deployed, click **Verify webhook** on the app. Rails CVE sends the signed challenge. When your receiver echoes it correctly, the app becomes active.

On a deployment without the egress gateway, the dashboard shows "Webhook delivery is disabled until the operator configures secure egress." Webhook fields and buttons are disabled until it is configured. Email works independently.

## 5. Send a test

Click **Send test** on any active app. Rails CVE queues an `endpoint.test` event to every enabled channel of that app and delivers it within the next few minutes. The test says clearly that it is not a security advisory. Your receiver should acknowledge it and not start an investigation.

Open **Delivery log** to watch the result. A webhook shows `delivered` when your receiver returned 2xx. An email shows `accepted` when the provider took the message.

## 6. When an advisory lands

Rails CVE checks the Rails maintainers' advisories every five minutes. When one is published, updated, or withdrawn, it creates one event and queues a delivery for every active app.

**By email** you receive a message with the app name, advisory title, severity, canonical link, and the complete investigation brief. Paste the brief into your coding agent from inside the repository.

**By webhook** your receiver gets a signed JSON event with the full advisory, the exact affected and patched version ranges, the brief as text, and a URL to download it as `SKILL.md`. Queue it, notify a maintainer, or wake an agent. Your receiver decides.

Then hand the brief to your agent. It asks for repository evidence, a verdict, and a proposed fix, and it requires your approval before changing anything. See [Coding agents](agents.md).

Receiving an advisory does not mean your application is affected. Many advisories only apply to specific configurations or versions. The brief helps your agent work that out.

## 7. Manage your apps

Each app card has:

- **Pause / Resume.** Pausing stops new deliveries and holds queued ones. Resuming sends what was held.
- **Edit delivery settings.** Change the name, mode, address, or URL. Changing the URL issues a new signing secret and requires a fresh handshake. Removing a channel cancels its pending deliveries.
- **Delivery log.** Every delivery for that app, filterable by channel and status.
- **Delete app and history.** Removes the app, its secret, and its delivery history.

The **Delivery log** tab lists every delivery across your apps, thirty per page. Open one to see the immutable event payload and each attempt's result. Statuses are explained in [Your workspace](accounts.md#delivery-log-statuses).

## Where to go next

- [Webhooks](webhooks.md) for the signing contract and receiver requirements.
- [Email notifications](integrations/email.md) for what the email contains and how it retries.
- [Coding agents](agents.md) for using the brief with Claude Code, Codex, Cursor, OpenClaw, or Hermes.
- [Your workspace](accounts.md) for recovery tokens, GitHub linking, and deletion.
- [Self-hosting](self-hosting.md) if you would rather run this on your own Cloudflare account.
