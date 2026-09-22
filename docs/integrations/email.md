# Email notifications

Email is the simplest way to hear about a Rails advisory: verify an address, choose it for an app, and the next advisory arrives as a plain message with the investigation brief included. The first half of this page is for subscribers. The second half is for operators configuring outbound mail on their own deployment.

## Subscribers: getting advisories by email

### Verify an address

In **Settings → Notification addresses**, enter an address and click **Send verification email**. Open the message, follow the link, and press **Confirm notification address** while signed in to the workspace that requested it. Links expire after one hour and work once. Simply opening the link does nothing; the confirmation is a button press, so mail scanners cannot consume it.

You can save up to five addresses per workspace. If a confirmation does not arrive, wait 15 minutes and enter the address again to resend.

An address is a destination only. It cannot sign in or recover the workspace.

### Choose it for an app

In **Apps**, set the mode to **Email** or **Both** and pick a verified address. Email-only apps are active immediately. In **Both** mode the email channel can start delivering while the webhook is still awaiting its handshake.

### What the email contains

Each notification is a plain-text message, with a matching HTML version, from the deployment's sender address. It has:

- The subject `[Rails CVE] <app name>: <CVE or title>`.
- The advisory title, severity, and canonical link.
- The event ID and type (`advisory.published`, `advisory.updated`, or `advisory.withdrawn`).
- The complete investigation brief, ready to paste into your coding agent.
- A link to your dashboard to pause or change the subscription.

A connection test uses the same format and says explicitly that it is a test, not an advisory.

### Delivery and retries

Email attempts follow the same schedule as webhooks: up to eight attempts, waiting 5, 10, 20, 40, 80, 160, and 320 minutes between them. The delivery log shows `accepted` when the provider took the message. Rails CVE does not track bounces or inbox arrival, so add the sender to your allow list if messages go missing.

Removing an address cancels its pending deliveries and clears it from any app that used it; those apps show **Needs destination** until you choose a replacement. Changing an app's address cancels pending deliveries to the old one. A message already being sent may still arrive.

Email and webhook attempts for the same event are independent. A failing webhook never causes the email to be resent.

### Availability

Email works only when the deployment's operator has configured outbound mail. The hosted service has. On a deployment without it, the address form and email modes are disabled with a notice, and any queued email deliveries wait without using attempts.

## Operators: configuring outbound email

Rails CVE ships with no mail credentials. Choose one of two transports and configure it in your ignored deployment config and Worker secrets. Nothing is sent until you do.

### Option A: SMTP with your own sender

The built-in transport uses [Cloudflare TCP sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/) with implicit TLS on **port 465** and `AUTH LOGIN`. It has a bounded response parser and a 30-second overall timeout, and sends multipart text and HTML. Port 25, plaintext, and STARTTLS are not supported.

Non-secret values go in `wrangler.deploy.jsonc`:

```json
"vars": {
  "APP_URL": "https://your-service.example.org",
  "EMAIL_TRANSPORT": "smtp",
  "EMAIL_FROM": "security@your-verified-domain.example",
  "SMTP_HOST": "smtp.provider.example",
  "SMTP_PORT": "465"
}
```

Credentials go in Worker secrets, entered interactively so they never touch a shell history:

```sh
bunx wrangler secret put SMTP_USERNAME --config wrangler.deploy.jsonc
bunx wrangler secret put SMTP_PASSWORD --config wrangler.deploy.jsonc
```

Use a sender your provider has verified for this deployment, and the SMTP endpoint for your provider's region. With Amazon SES, check the region, the verified identity, sandbox versus production access, DKIM/SPF/DMARC, and sending limits; see [SES verified identities](https://docs.aws.amazon.com/ses/latest/dg/verify-addresses-and-domains.html). Provision a narrowly scoped sending credential rather than reusing one from another application.

### Option B: Cloudflare Email Service

Onboard a sending domain in Cloudflare Email Service, add a `send_email` binding named `EMAIL`, and set `EMAIL_TRANSPORT=cloudflare` plus `EMAIL_FROM`:

```json
"send_email": [{ "name": "EMAIL" }]
```

See the [Workers sending API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/) and [binding restrictions](https://developers.cloudflare.com/email-service/configuration/send-bindings/). Legacy Email Routing destination verification is not the same as Email Service sending-domain onboarding. In local development a local binding simulates mail; a remote binding sends real email ([local sending behavior](https://developers.cloudflare.com/email-service/local-development/sending/)).

### Disabling and verifying

Set `EMAIL_TRANSPORT=disabled` to turn outbound mail off explicitly. Pending email deliveries then wait without consuming attempts, and the UI disables email modes.

After configuring a sender, verify an address you own, create an email-only test app, send a test, and confirm both the `accepted` status in the delivery log and the message in your inbox. Then test **Both** mode and confirm that a failing webhook does not resend the email. Do not test against real subscribers or by triggering a real advisory.

Transport errors are recorded as categories only. SMTP commands, provider responses, message bodies, and confirmation URLs are never logged. Verification requests have a 15-minute cooldown per address and a five-address cap per workspace; service-wide hourly budgets are listed in [Operations](../operations.md#abuse-budgets-and-circuit-breakers).
