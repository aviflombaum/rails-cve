# Email notifications and configurable transports

Each app chooses webhook, email, or both. Email requires a verified address saved in the account's settings. A workspace can save five addresses and use different addresses for different codebases. Webhook ownership and email verification are independent; in both mode, a verified email can receive advisories while its webhook awaits verification.

Confirmation links expire after one hour and work only in the requesting workspace. Opening a link does not confirm it; the user presses a POST form. Each destination has a shared 15-minute verification cooldown to limit abuse. Removal cancels queued emails and clears app selections. Changing an address selection cancels pending emails to the previous address; historical payloads remain available. An already in-flight send can still arrive after a settings change.

An `accepted` result means the email provider accepted the message, not guaranteed inbox receipt. The outbox retries failures independently of webhook deliveries. If sending is disabled, pending email rows remain queued without consuming attempts; webhook delivery continues. New email-only/both selections are rejected until sending is configured. Check provider bounces and suppressions separately; this release does not ingest provider delivery receipts.

## SMTP (the avi.nyc deployment pattern)

Rails CVE includes a small implicit-TLS SMTP transport using [Cloudflare TCP sockets](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/). It uses AUTH LOGIN on **port 465 only**, a bounded response parser, a 30-second overall timeout, and multipart plain-text/HTML email. Port 25 and plaintext/STARTTLS configurations are not supported by this adapter. A post-DATA acceptance ends the send; cleanup failures do not resend an accepted message.

Set these non-secret values in your ignored deployment config:

```json
"vars": {
  "APP_URL": "https://your-service.example.org",
  "EMAIL_TRANSPORT": "smtp",
  "EMAIL_FROM": "security@your-verified-domain.example",
  "SMTP_HOST": "email-smtp.us-east-2.amazonaws.com",
  "SMTP_PORT": "465"
}
```

Store credentials interactively or in an ignored protected secret file:

```sh
bunx wrangler secret put SMTP_USERNAME --config wrangler.deploy.jsonc
bunx wrangler secret put SMTP_PASSWORD --config wrangler.deploy.jsonc
```

The avi.nyc operator intends `EMAIL_FROM=rails-cve@avi.nyc`. Independent deployments must use their own authorized sender. Amazon SES verifies sender identities and is region-specific; verifying `mail.avi.nyc` does not by itself establish authorization for the parent-domain sender `rails-cve@avi.nyc`. Check the configured SES region and sender identity before sending. Also check SES sandbox/production access, recipient restrictions, DKIM/SPF/DMARC and sending limits. See [SES verified identities](https://docs.aws.amazon.com/ses/latest/dg/verify-addresses-and-domains.html).

SMTP credentials found in a sibling application can be transferred privately for the same operator, but are never project defaults. A new deployment should provision a narrowly scoped sending credential. No real SMTP credential is needed for tests or local UI work.

## Cloudflare Email Service alternative

Onboard an authorized sending domain, add a `send_email` binding named `EMAIL`, and set `EMAIL_TRANSPORT=cloudflare` and your `EMAIL_FROM`. The application uses the generated Workers `SendEmail` interface and includes both text and HTML. See [Workers sending API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/) and [binding restrictions](https://developers.cloudflare.com/email-service/configuration/send-bindings/).

```json
"send_email": [{ "name": "EMAIL" }]
```

Do not assume legacy Email Routing destination verification is equivalent to Email Service sending-domain onboarding. Configure the product's actual sending capability. In local development, an ordinary local binding simulates mail, while a remote binding sends real email; see [local sending behavior](https://developers.cloudflare.com/email-service/local-development/sending/).

## Disable and verify

Set `EMAIL_TRANSPORT=disabled` to disable outbound sending explicitly. The portable repo has no credentials or email binding. Unit/runtime tests use mocks and must not send to real recipients.

After configuring an authorized sender, verify one operator-owned notification address through settings, create an email-only test app, send a connection test, and confirm both provider acceptance in the delivery log and actual inbox arrival. Then test both mode: failure in one channel must not resend the successful channel. Do not use an existing subscriber or trigger a real advisory to test the transport.
