# Webhook egress gateway

Webhook delivery requires the bundled Node gateway (`egress/gateway.mjs`) on infrastructure you control. The Worker **never fetches a subscriber URL directly**. Without valid gateway configuration, verification and new webhook configuration are disabled, and queued webhook deliveries are held without spending attempts. Configured email continues independently. The Cloudflare import button does not provision this gateway.

## Setup

1. Use a maintained Node 22+ or 24+ installation and `bun install --frozen-lockfile` in a checkout. Run `bun run test:egress`.
2. Generate an independent random 32-byte hex secret in your secret manager. Supply it as `EGRESS_PROXY_TOKEN` to the Node process and as a Worker secret. Do not reuse the encryption/admin/signing keys. Do not put it into command arguments, source, URLs or logs.
3. Run `node egress/gateway.mjs` under your service manager. It listens **only on 127.0.0.1:8080** (`EGRESS_PORT` can change the port). Run as an unprivileged user on an isolated host with no private network access. Apply a network policy that denies private/reserved destinations, including metadata services, as defense in depth.
4. Put your HTTPS reverse proxy in front of that loopback listener. Publish only `/deliver` on a dedicated hostname with a valid certificate. Preserve the Authorization header. Bound incoming bodies to 6 MiB + 16 KiB and request time to 15 seconds. Disable request-body/header logging, tracing and error dumps. Never expose the HTTP listener publicly or use a general forward proxy. Use one gateway instance for each operator trust boundary.
5. Set Worker `EGRESS_PROXY_URL=https://egress.your-domain.tld/deliver` and the same `EGRESS_PROXY_TOKEN` secret in your ignored deployment configuration/secret store. The URL must be HTTPS on 443 with no credentials, query or fragment. It is operator-controlled, never supplied by subscribers. Use an independent development gateway for local delivery tests.
6. After deployment, verify one receiver you own and explicitly authorize a test. Check HMAC, stable ID, normal delivery and refusal of private DNS answers. No production gateway or receiver is configured by the repository's offline tests.

The gateway is a trusted processor: it sees full destination URLs, signed event bodies and verification responses. Keep its host, TLS termination, logs, updates and token protected. Rotate the gateway token on both sides together; an absent token holds queued deliveries, while an incorrect configured token produces retryable delivery errors. Do not expose gateway telemetry to subscribers.

## Connection boundary

For every request the gateway resolves all system DNS addresses once, rejects the entire answer set if any address is private/reserved, and selects a validated address. The HTTPS socket's custom `lookup` returns only that pinned address, with connection pooling disabled. The original hostname remains the TLS server name and HTTP Host; certificate verification stays enabled. A later DNS change cannot redirect this connection to another address. The gateway does not follow Location headers, accept caller-supplied forwarding headers, or send its authentication token to the receiver.

Only public hostname HTTPS on port 443 is supported. IPv4/IPv6 literals, URL userinfo/fragments, private/reserved answers and local names are rejected. Outbound DNS plus TLS/HTTP work has a 10-second deadline, including late DNS completion. Challenges read at most 4 KiB; normal responses return only status. Payload bytes remain unchanged and at most 1 MiB. The JSON transport envelope allows worst-case escaping, bounded to 6 MiB + 16 KiB. At most ten authenticated requests run concurrently; excess work receives 503 and retries later. The server also bounds connections and inbound time.

This addresses the former DNS preflight/fetch race. It does not grant support for private-network receivers. Outbound network policy and host isolation remain necessary operational controls, particularly where public IP space is routed internally.

Implementation references checked September 22, 2026: [Node HTTPS request and agent options](https://nodejs.org/api/https.html#httpsrequestoptions-callback), [custom socket DNS lookup](https://nodejs.org/api/net.html#socketconnectoptions-connectlistener), and [TLS servername/certificate verification](https://nodejs.org/api/tls.html#tlsconnectoptions-callback). The design uses these interfaces to pin a public address while retaining hostname verification; tests assert the actual connection options and gateway admission behavior.
