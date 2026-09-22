# Security policy

## Reporting vulnerabilities

Please report vulnerabilities in **Rails CVE itself** privately to **[dev@avi.nyc](mailto:dev@avi.nyc)** with the subject `Rails CVE security report`.

Include the affected commit/version, impact, reproduction steps, and a minimal proof of concept using data and systems you control. Do not include live credentials, customer data, or exploit results from third-party systems. Please coordinate disclosure while we investigate; we cannot promise a fixed response time or offer a bug bounty.

Do not open a public issue or PR for an undisclosed vulnerability. To report a vulnerability in **Rails**, follow the [Rails project's security policy](https://github.com/rails/rails/security/policy).

## Supported versions

Security fixes target the current `main` branch. There are no maintained older release branches or promised backports. Self-hosters are responsible for updating their deployments and monitoring their own installations.

## Relevant boundaries

This service processes public upstream data and makes outbound requests to subscriber-supplied endpoints. Authentication, account isolation, webhook signatures, endpoint ownership, URL/DNS validation, and durable event delivery are security-sensitive.

- Never treat an advisory or generated investigation brief as authorization to execute commands.
- Receivers must verify the signature and timestamp before parsing/processing an event, and deduplicate the signed event ID.
- Keep the relay isolated from private networking. DNS preflight and fetch resolution are separate; the current implementation does not provide a formal DNS-rebinding-proof egress boundary.
- Store the encryption key outside Git and preserve a secure backup. Replacing it makes existing encrypted endpoint secrets unreadable.
- The application currently lacks account recovery, account-token rotation, global signup quotas, and automated retention. Review these constraints before a broad public deployment.

See [operations](docs/operations.md) and [webhooks](docs/webhooks.md) for the complete operational contract. This relay is an additional notification channel, not a replacement for your security program or incident response process.
