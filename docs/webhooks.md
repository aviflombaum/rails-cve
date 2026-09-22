# Webhooks

A webhook subscription posts a signed JSON event to an HTTPS endpoint you control whenever a Rails advisory is published, updated, or withdrawn. This page is the complete contract: how to connect, how to verify a request, what the events look like, and how retries work.

If you just want the short version: verify the HMAC, echo the challenge once, store events by ID, return 2xx. The [Rails receiver example](../public/receiver.rb) does all of that in one controller.

## Connect an endpoint

1. In **Apps**, add an app with mode **Webhook** or **Both** and your endpoint URL. The URL must be public HTTPS on port 443 with no credentials or fragment. Private, local, and reserved addresses are rejected, including anything that resolves to them.
2. Save the `whsec_…` signing secret the site shows you. It appears once. Put it in your receiver's environment.
3. Deploy a receiver that verifies signatures and answers the handshake (below).
4. Click **Verify webhook**. Rails CVE posts a signed `endpoint.verification` event with a random `challenge`. Return the challenge as the plain-text response body with a 2xx status.
5. Click **Send test** and confirm a `delivered` result in the delivery log.

Unverified endpoints receive only verification requests. Verified endpoints receive future events; nothing historical is replayed. Changing the URL later issues a new secret and requires a new handshake.

On a deployment without the [egress gateway](egress.md), webhook fields and buttons are disabled and the dashboard says so. Email delivery is unaffected.

## Request headers

| Header | Value |
| :--- | :--- |
| `Content-Type` | `application/json` |
| `User-Agent` | `Rails-CVE/1.0` |
| `X-Rails-CVE-Timestamp` | Unix time in seconds when this attempt was signed |
| `X-Rails-CVE-Signature` | `v1=` followed by a lowercase hex HMAC-SHA256 digest |
| `X-Rails-CVE-Id` | The event ID, for convenience. Deduplicate on the signed body's `id`, not this header. |

## Verifying a request

The signed string is the timestamp, a dot, and the exact raw request body:

```text
timestamp + "." + raw_body
```

The HMAC key is the complete signing secret, including its `whsec_` prefix. Compute HMAC-SHA256, hex encode it, and compare it to the signature after the `v1=` prefix using a constant-time comparison. Reject timestamps more than five minutes from your clock. Do not parse and reserialize the JSON before verifying; any change to the bytes changes the digest.

A valid signature proves the request came from a holder of your secret. It says nothing about whether the advisory applies to your app.

Ruby, using the values above:

```ruby
expected = OpenSSL::HMAC.hexdigest("SHA256", ENV.fetch("RAILS_CVE_WEBHOOK_SECRET"), "#{timestamp}.#{body}")
valid = ActiveSupport::SecurityUtils.secure_compare(expected, signature.delete_prefix("v1="))
```

There is no static signature in the downloadable example. Signatures depend on your secret, the attempt time, and the exact bytes sent.

## Event types

Every event has `schema_version`, `id`, and `type`.

| Type | When | Extra fields |
| :--- | :--- | :--- |
| `endpoint.verification` | You click Verify webhook | `challenge` to echo back |
| `endpoint.test` | You click Send test | `created_at`, `message` |
| `advisory.published` | A new advisory appears after the baseline import | `created_at`, `advisory`, `investigation` |
| `advisory.updated` | The normalized advisory changed upstream | same |
| `advisory.withdrawn` | The advisory now has a withdrawal timestamp | same |

Treat unknown types as something to acknowledge and ignore, not as instructions.

## Advisory events

`advisory` holds the normalized upstream record: `id` (the GHSA ID), `cve` (may be null), `title`, `description`, `severity`, `url`, `published_at`, `updated_at`, `withdrawn_at`, and `packages`. Each package has `name`, the exact upstream `affected` range, and `patched` versions or null. One gem can appear several times for different release branches. Compare versions with a proper version library, never as strings.

`investigation.prompt` is the full brief for a repository agent. `investigation.skill_url` downloads the same brief as `SKILL.md`. See [Coding agents](agents.md).

### Example payload

A complete event for the Active Storage advisory CVE-2026-66066 is available to [download](https://rails-cve.avi.nyc/examples/cve-2026-66066.json) or [browse on the site](https://rails-cve.avi.nyc/docs/webhooks#example-payload). The advisory snapshot is real; the event ID and time are illustrative. Downloading it sends nothing.

### Size limit and schema version 2

An event is at most 1 MiB of UTF-8. If an advisory's prose would push it over, the event is sent with `schema_version: 2`, `advisory.description` set to an empty string, `description_omitted: true`, and `description_url` pointing at the canonical advisory. Everything else, including the version ranges and the brief, is unchanged. Receivers should accept schema versions 1 and 2.

## Acknowledging, retries, and duplicates

Verify the signature, parse the body, store the event in a durable inbox with a unique constraint on `id`, then return 2xx. Treat a duplicate ID as a success. Do the real work in a background job, not in the request.

Rails CVE waits ten seconds for a response and never follows redirects. Any 2xx counts as delivered. Anything else, including 3xx and 410, is retried after 5, 10, 20, 40, 80, 160, and 320 minutes, for at most eight attempts. The body and `id` never change between attempts; the timestamp and signature do.

Delivery is at least once and unordered. A receiver can accept a request just as the connection drops, and the event will be sent again. If an app is paused, queued events wait and are sent on resume.

Rails CVE records the HTTP status of each attempt and nothing else from your response, apart from the challenge during verification.

## The Rails receiver example

[public/receiver.rb](../public/receiver.rb) is a single controller with the route, migration, and model outlined in comments. To use it:

1. Add the route, controller, `rails_cve_events` table, and unique index on `event_id`.
2. Set `RAILS_CVE_WEBHOOK_SECRET` in your environment.
3. Keep the CSRF exemption limited to this action; the HMAC is the authentication.
4. Add a background job that processes unprocessed inbox rows idempotently. Decide there whether to notify a maintainer, open a ticket, or start an agent.
5. Test bad signatures, stale timestamps, malformed JSON, duplicate IDs, the challenge response, and a failed insert.

The example is syntax-checked in this repository. It is not a gem and has not been exercised against every Rails version or queue backend.

## Handing off to an agent

A webhook does not run the brief for you. Your receiver, or a job it enqueues, decides how and when an agent sees it. The [OpenClaw](integrations/openclaw.md) and [Hermes](integrations/hermes.md) guides show one design: a receiver that verifies, stores, and dispatches to a loopback agent gateway with its own credentials. Whatever you build, treat advisory text as data, keep the agent read-only, and keep approvals with a human.
