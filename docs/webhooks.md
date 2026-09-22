# Webhook integration

Connect any receiver you control that can accept a public HTTPS POST. A Rails application is one option; an automation service or agent harness can also work if it implements signature verification and the ownership handshake.

## Connect and verify

1. Create a workspace with GitHub or a saved management token. Settings can link GitHub or generate a replacement recovery token.
2. Add a name and endpoint URL. The URL must use HTTPS on port 443, with no embedded credentials or fragment, and resolve only to public addresses.
3. Save the full `whsec_…` signing secret in your receiver's secret store. It is shown once.
4. Implement the signature checks below.
5. Click **Verify endpoint**. After verifying the request signature, return the JSON `challenge` string verbatim as a plain-text response with a 2xx status.
6. Click **Send test** and confirm a delivered result.

Pending endpoints receive only explicit verification requests. Active endpoints receive future events, not a replay of existing advisories. Paused endpoints receive no new events; previously queued deliveries resume after reactivation.

## Request headers and authentication

| Header | Value |
| --- | --- |
| `Content-Type` | `application/json` |
| `X-Rails-CVE-Timestamp` | Unix timestamp in seconds for this attempt |
| `X-Rails-CVE-Signature` | `v1=` followed by a lowercase hexadecimal HMAC-SHA256 digest |
| `X-Rails-CVE-Id` | Event ID for convenience; use the signed body's ID for deduplication |

The signed bytes are:

```text
timestamp + "." + exact_raw_request_body
```

Use the complete signing secret, including its `whsec_` prefix, as the HMAC key. Do not parse and reserialize JSON before verification. Compare digests in constant time and reject timestamps more than five minutes from the receiver's clock. A valid signature authenticates delivery from a holder of your secret; it doesn't establish applicability of an advisory to your app.

There is no static signature in the example download: signatures depend on your unique secret, the attempt timestamp, and the exact delivered bytes. Pretty-printing changes those bytes.

## Event envelope

All events include `schema_version`, `id`, and `type`. Normal events use version 1. Advisory events also include `created_at`, the `advisory` object, and `investigation`.

| Type | Meaning |
| --- | --- |
| `endpoint.verification` | Has a `challenge` to echo; used only for ownership verification. |
| `endpoint.test` | Connectivity test, with a message; not a vulnerability notification. |
| `advisory.published` | Newly observed published advisory after the baseline import. |
| `advisory.updated` | Normalized upstream advisory changed. |
| `advisory.withdrawn` | An ingested advisory has an upstream withdrawal timestamp. |

An advisory carries `id` (GHSA), `cve` (nullable), `title`, `description`, `severity`, `url`, publication/update/withdrawal timestamps, and `packages`. Each package entry includes `name`, the exact `affected` range, and nullable `patched` versions. Multiple entries may refer to the same gem and different release branches. Don't perform lexical string comparisons on gem versions.

`investigation.prompt` is a complete text brief for a repository agent; `investigation.skill_url` downloads its `SKILL.md`. For CVE-2026-66066, the brief includes the Rails team's forensic toolkit link.

See the [complete live example](https://rails-cve.avi.nyc/examples/cve-2026-66066.json) and [readable walkthrough](https://rails-cve.avi.nyc/docs#example-payload). The advisory snapshot is real; its example event ID/time are illustrative. Example downloads create no events and send no notifications.

## Acknowledgment, retries, and deduplication

Validate the signature, parse and validate the envelope, then persist the event in a durable inbox with a **unique constraint on the signed body's `id`**. Return 2xx only after persistence. Handle already-recorded IDs as successful duplicate deliveries.

The relay uses a ten-second request timeout and never follows redirects. All non-2xx responses and network failures retry. Eight attempts are allowed, with increasing delays; see [operations](operations.md) for timing and throughput. The body and event ID remain unchanged during retries, while the timestamp/signature change.

Delivery is at least once and ordering is not guaranteed. Use advisory revision/update metadata where ordering matters. A successful delivery acknowledges receipt, not completion of investigation.

## Rails receiver

[public/receiver.rb](../public/receiver.rb) includes a controller and the required migration/model outline. To use it:

1. Install the route, controller, inbox table, and unique event-ID index shown in the file.
2. Set `RAILS_CVE_WEBHOOK_SECRET` in your application's environment.
3. Keep CSRF exemption limited to the HMAC-authenticated receiver action.
4. Implement an idempotent background consumer for unprocessed inbox rows.
5. Test bad signatures, stale timestamps, malformed JSON, duplicate IDs, challenge responses, and persistence failure in your app.

The example's syntax and the relay's signing logic are checked in this repository. The receiver is not a complete Rails plugin and has not been tested against every Rails version or queue backend.

## Agent handoff

Treat advisory prose, links, and prompt content as reference material from outside your repository. Decide explicitly how and when to launch an agent. The included brief asks for repository evidence and human approval before code changes, production access, secret rotation, merge, or deployment.

A webhook can enqueue an internal task or notify a maintainer. It does not automatically execute the supplied prompt. A GitHub App that creates repository issues is a future integration, not part of v1.

## Payload byte limit and compact advisories

The complete serialized event is at most **1,048,576 UTF-8 bytes**, including the envelope and investigation prompt. If advisory prose would exceed that cap, version **2** sets `advisory.description` to the empty string, `description_omitted: true`, and `description_url` to the canonical Rails advisory. All other metadata, exact version ranges, provenance and the investigation prompt remain intact. This is explicit omission, not a claim that the upstream description is empty. Receivers must accept schemas 1 and 2; update older receivers before deploying this sender change.

If even compact metadata exceeds the cap, ingestion fails with degraded source health before storing that revision or creating its event. Operators must investigate the canonical source. Existing oversized immutable events are not rewritten: delivery records one terminal size error without a network send or repeated retries. Event bytes remain immutable on every ordinary retry.
