# Cloudflare webhook gateway

This deploys the existing Node gateway in a Cloudflare Container. An authenticated
Worker admits requests to one container through a Durable Object. Node resolves
the receiver, rejects non-public DNS answers, and pins the validated address for
the TLS connection while retaining hostname verification. HTTPS interception is
disabled so the connection never falls back to an ordinary Worker `fetch`.

This is a separate deployment from the Rails CVE app. It requires a Cloudflare
account with Containers enabled, Bun, Node 24, Docker, and Wrangler authentication.
It does not use or migrate the app's D1 database. The `v1` Wrangler migration
creates the gateway's container-enabled Durable Object namespace.

## Deploy

Run from the repository root:

```sh
bun install --frozen-lockfile
bun install --frozen-lockfile --cwd egress/cloudflare
cp egress/cloudflare/wrangler.jsonc egress/cloudflare/wrangler.deploy.jsonc
```

Add your `account_id` to the ignored copy. If deploying more than one installation
in an account, give each gateway a different Worker name. Generate a dedicated
gateway credential, stored only in an ignored, protected file:

```sh
node --input-type=module -e 'import { randomBytes } from "node:crypto"; import { writeFileSync } from "node:fs"; writeFileSync("egress/cloudflare/.secrets.gateway.json", JSON.stringify({ EGRESS_PROXY_TOKEN: randomBytes(32).toString("hex") }), { mode: 0o600, flag: "wx" })'
bunx wrangler deploy --config egress/cloudflare/wrangler.deploy.jsonc --secrets-file egress/cloudflare/.secrets.gateway.json
```

`wx` prevents accidentally replacing an existing credential. Reuse that file on
later deployments. The build context allows only the gateway runtime and its
locked dependency manifests; deployment configuration and secrets never enter
the image. The container runs as an unprivileged user from a digest-pinned Node
24 image. Keep the image digest and dependencies updated through reviewed changes.

In the app's ignored `wrangler.deploy.jsonc`, set `vars.EGRESS_PROXY_URL` to the
gateway's printed HTTPS URL plus `/deliver`. Upload the same token to the app:

```sh
bunx wrangler secret bulk egress/cloudflare/.secrets.gateway.json --config wrangler.deploy.jsonc
```

This updates the secrets on the currently deployed app; it does not upload local
app code or run D1 migrations. Preserve the token in the app's protected deployment
secret store as well. Do not replace the app's other credentials. The app rollout
still needs its normal D1 migrations and deployment. Missing or mismatched gateway
configuration fails closed; there is no direct delivery fallback.

## Verify before the app rollout

The only routes are authenticated `GET /health` and `POST /deliver`. Read the token
from its protected file in a local HTTP client and send `Authorization: Bearer
<token>`. A healthy response is HTTP 200 with `{"status":"ok"}`. Without the
credential, health must return 401. Avoid placing the token in command arguments,
terminal output, URLs, or logs.

Initial container provisioning can exceed the app's 15-second request deadline.
Wait for successful authenticated health before enabling delivery. A stopped
container also has startup latency; a failed attempt remains unconfirmed and the
app's retry policy applies. Test the full signed challenge and event paths against
a receiver you control before announcing availability. Never use real subscribers
as deployment probes. A health check alone does not verify receiver connectivity.

## Capacity, cost, and maintenance

The configuration permits one `lite` instance (256 MiB, 1/16 vCPU) and sleeps after
60 seconds of inactivity. The Node gateway accepts at most ten concurrent requests.
This is a small-installation configuration; it provides neither high availability
nor a fixed outbound IP. Check the current [Containers pricing](https://developers.cloudflare.com/containers/platform/pricing/)
before changing capacity or idle duration. Unauthenticated requests are rejected
before they can instantiate or wake the container. Request and container log
collection is disabled to limit retention of sensitive delivery data.

Token rotation must update both deployments and the protected secret stores.
Coordinate rotation with delivery workers: mismatched versions fail closed and
may produce temporary failed attempts. Do not delete the Durable Object migration
from an existing installation or reuse its tag for a different change.

Run the checks without production credentials:

```sh
bun run check
bun run --cwd egress/cloudflare check
bun audit --cwd egress/cloudflare
npm audit --omit=dev --prefix egress/cloudflare/runtime
bunx wrangler deploy --dry-run --config egress/cloudflare/wrangler.jsonc
docker build --platform linux/amd64 -f egress/cloudflare/Dockerfile -t rails-cve-egress:check .
```

The gateway CI workflow checks the adapter, dependency manifests, Worker bundle,
and container image. Application and gateway tests use offline receiver mocks.

Cloudflare references: [setup](https://developers.cloudflare.com/containers/get-started/),
[container lifecycle](https://developers.cloudflare.com/containers/reference/container-class/),
[environment and secrets](https://developers.cloudflare.com/containers/examples/env-vars-and-secrets/),
and [outbound networking](https://developers.cloudflare.com/containers/guides/outbound-traffic/).
