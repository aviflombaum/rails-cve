# Webhook egress gateway

Rails CVE sends webhooks through a small Node service, the egress gateway, rather than straight from the Worker. The gateway resolves the subscriber's hostname, refuses private or reserved addresses, pins the connection to the validated public address, and forwards the signed request unchanged. The Worker only ever talks to the gateway.

Why the extra piece? Subscribers supply arbitrary URLs. Sending to them directly from a serverless runtime makes it hard to guarantee that a hostname does not resolve to something internal between the check and the connection. The gateway closes that gap and keeps the relay's network position predictable for receivers that want to allow-list it.

Consequences for operators:

- Without `EGRESS_PROXY_URL` and `EGRESS_PROXY_TOKEN`, webhook subscriptions cannot be verified or created, and queued webhook deliveries wait without spending attempts. The dashboard shows a notice. Email delivery is unaffected.
- The Cloudflare deploy button does not provision the gateway. You run it on a host you control.
- One gateway serves one deployment. It sees full destination URLs and signed bodies, so treat it as part of the trusted system.

## Setup

1. On a maintained Node 22 or 24 host with a checkout of this repository, run `bun install --frozen-lockfile` and `bun run test:egress` to confirm the gateway tests pass.
2. Generate an independent random 32-byte hex secret. Provide it to the gateway process as `EGRESS_PROXY_TOKEN` and upload the same value as a Worker secret. Do not reuse the encryption key, admin token, or any signing secret, and keep it out of command lines, URLs, and logs.
3. Run `node egress/gateway.mjs` under your service manager as an unprivileged user. It listens only on `127.0.0.1:8080`; `EGRESS_PORT` changes the port. Put it on an isolated host with no reachable private network, and add an outbound network policy that denies private and reserved ranges, including cloud metadata services, as defense in depth.
4. Put an HTTPS reverse proxy in front of the loopback listener. Publish only `/deliver` on a dedicated hostname with a valid certificate. Pass the `Authorization` header through, cap request bodies at 6 MiB + 16 KiB and request time at 15 seconds, and turn off body and header logging, tracing, and error dumps. Never expose the plain HTTP listener and never use a general-purpose forward proxy in its place.
5. In `wrangler.deploy.jsonc`, set `EGRESS_PROXY_URL` to `https://egress.your-domain.tld/deliver`. It must be HTTPS on port 443 with the path `/deliver` and no credentials, query, or fragment. Upload `EGRESS_PROXY_TOKEN` with `wrangler secret put`. Redeploy.
6. Verify a receiver you own, send a test, and confirm a `delivered` result. Confirm that a hostname resolving to a private address is rejected.

Use a separate development gateway and token for local testing. Rotate the token on both sides together: a missing token holds deliveries, a mismatched one produces retryable errors until fixed.

## What the gateway enforces

For each request it resolves every DNS answer for the hostname once, rejects the whole set if any address is private or reserved, and picks one validated address. The HTTPS socket's lookup returns only that address, connection pooling is disabled, and the original hostname stays as the TLS server name and `Host` header with certificate verification on. A later DNS change cannot redirect the connection. The gateway does not follow redirects, does not accept forwarding headers from the caller, and never sends its own token to the receiver.

Only public hostnames over HTTPS on port 443 are allowed. IP literals, URL credentials, fragments, private or reserved answers, and local names are rejected. DNS plus TLS plus HTTP must complete within 10 seconds. Verification challenges are read up to 4 KiB; ordinary responses return only the status code. Payload bytes pass through unchanged and are capped at 1 MiB, with the JSON transport envelope capped at 6 MiB + 16 KiB. At most ten authenticated requests run at once; extra work gets a 503 and is retried by the Worker.

This does not add support for private-network receivers. Host isolation and outbound network policy remain your responsibility, especially where public IP space is routed internally.

References checked September 22, 2026: [Node HTTPS request and agent options](https://nodejs.org/api/https.html#httpsrequestoptions-callback), [custom socket DNS lookup](https://nodejs.org/api/net.html#socketconnectoptions-connectlistener), and [TLS servername and certificate verification](https://nodejs.org/api/tls.html#tlsconnectoptions-callback). The offline tests in `test/egress.test.mjs` assert the connection options and admission behavior.
