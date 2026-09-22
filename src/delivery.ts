import { forwardWebhook, webhookEnabled } from "./egress";
import { MAX_EVENT_BYTES, eventBytes } from "./limits";
import { readDestination } from "./destinations";
import { fanout } from "./fanout";
import { sendAdvisoryEmail, emailEnabled } from "./email";
import { safeDestination, sign, unseal } from "./security";
export interface Endpoint {
  id: string;
  account_id: string;
  name: string;
  url: string;
  secret: string;
  status: string;
  challenge: string;
  created_at: string;
  delivery_mode: "webhook" | "email" | "both";
  webhook_verified: number;
  email_id: string | null;
  email_address?: string;
}
export async function send(
  env: Env,
  endpoint: Endpoint,
  body: string,
  id: string,
  challenge = false,
) {
  if (!webhookEnabled(env)) throw new Error("Webhook egress is not configured");
  if (eventBytes(body) > MAX_EVENT_BYTES) throw new Error("Payload exceeds the 1 MiB event limit");
  const destination = await readDestination(endpoint.url, env.ENCRYPTION_KEY);
  await safeDestination(destination);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await sign(await unseal(endpoint.secret, env.ENCRYPTION_KEY), timestamp, body);
  return forwardWebhook(env, {
    destination,
    body,
    id,
    timestamp,
    signature: `v1=${signature}`,
    challenge,
  });
}
export async function enqueueTest(env: Env, endpoint: Endpoint) {
  const id = `evt_${crypto.randomUUID()}`,
    now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO events(id,advisory_id,revision,type,payload,created_at) VALUES(?,?,?,?,?,?)",
    ).bind(
      id,
      "test",
      id,
      "endpoint.test",
      JSON.stringify({
        schema_version: 1,
        id,
        type: "endpoint.test",
        created_at: now,
        message: "Your Rails CVE connection is working. This is a test, not a security advisory.",
      }),
      now,
    ),
    fanout(env, id, endpoint.id),
  ]);
  return id;
}
export async function drain(env: Env) {
  // Finalize expired last attempts without sending a ninth request. The receiver
  // may have accepted the interrupted attempt, so never claim non-delivery.
  const exhausted =
    "SELECT id FROM deliveries WHERE status IN ('pending','retry','sending') AND attempts>=8 AND next_at<=? ORDER BY id LIMIT 25";
  const now = Date.now();
  const interrupted = "Attempt limit reached after interrupted delivery; receipt is unknown";
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO delivery_attempts(id,delivery_id,attempt,status,error) SELECT lower(hex(randomblob(16))),id,attempts,'failed',? FROM deliveries WHERE id IN (${exhausted})`,
    ).bind(interrupted, now),
    env.DB.prepare(
      `UPDATE deliveries SET status='failed',lease=NULL,error=? WHERE id IN (${exhausted})`,
    ).bind(interrupted, now),
  ]);
  const { results } = await env.DB.prepare(
    "SELECT d.id FROM deliveries d JOIN endpoints e ON e.id=d.endpoint_id WHERE d.status IN ('pending','retry','sending') AND d.attempts<8 AND d.next_at<=? AND e.status='active' AND ((d.channel='webhook' AND ?=1) OR (d.channel='email' AND ?=1)) ORDER BY d.next_at,d.created_at LIMIT 25",
  )
    .bind(Date.now(), webhookEnabled(env) ? 1 : 0, emailEnabled(env) ? 1 : 0)
    .all<{ id: string }>();
  for (let i = 0; i < results.length; i += 5)
    await Promise.all(
      results.slice(i, i + 5).map(async ({ id }) => {
        const lease = crypto.randomUUID();
        const row = await env.DB.prepare(
          "UPDATE deliveries SET status='sending',lease=?,next_at=?,attempts=attempts+1 WHERE id=? AND status IN ('pending','retry','sending') AND attempts<8 AND next_at<=? RETURNING *",
        )
          .bind(lease, Date.now() + 120_000, id, Date.now())
          .first<{
            event_id: string;
            endpoint_id: string;
            channel: string;
            email_id: string | null;
            attempts: number;
          }>();
        if (!row) return;
        const endpoint = await env.DB.prepare("SELECT * FROM endpoints WHERE id=?")
          .bind(row.endpoint_id)
          .first<Endpoint>();
        if (!endpoint || endpoint.status !== "active") {
          await env.DB.prepare(
            "UPDATE deliveries SET status='retry',next_at=0,lease=NULL,attempts=attempts-1 WHERE id=? AND lease=?",
          )
            .bind(id, lease)
            .run();
          return;
        }
        const email =
          row.channel === "email"
            ? await env.DB.prepare(
                "SELECT address FROM email_addresses WHERE id=? AND account_id=? AND verified_at IS NOT NULL",
              )
                .bind(row.email_id, endpoint.account_id)
                .first<{ address: string }>()
            : null;
        const enabled =
          row.channel === "webhook"
            ? endpoint.delivery_mode !== "email" && endpoint.webhook_verified === 1
            : endpoint.delivery_mode !== "webhook" && email && endpoint.email_id === row.email_id;
        if (!enabled) {
          await env.DB.prepare(
            "UPDATE deliveries SET status='cancelled',lease=NULL,error='Destination or channel is no longer enabled',attempts=attempts-1 WHERE id=? AND lease=?",
          )
            .bind(id, lease)
            .run();
          return;
        }
        const event = await env.DB.prepare("SELECT payload FROM events WHERE id=?")
          .bind(row.event_id)
          .first<{ payload: string }>();
        const oversized = !!event && eventBytes(event.payload) > MAX_EVENT_BYTES;
        let code: number | null = null,
          error: string | null = null,
          providerId: string | null = null;
        try {
          if (!event) throw new Error("Missing event");
          if (oversized) throw new Error("Oversized legacy event");
          if (row.channel === "email") {
            providerId = (
              await sendAdvisoryEmail(
                env,
                email!.address,
                endpoint.name,
                row.event_id,
                event.payload,
              )
            ).messageId;
          } else {
            code = (await send(env, endpoint, event.payload, row.event_id)).code;
            if (code < 200 || code >= 300) error = `HTTP ${code}`;
          }
        } catch {
          error = oversized
            ? "Payload exceeds the 1 MiB event limit; inspect the canonical advisory"
            : row.channel === "email"
              ? "Email provider did not confirm acceptance"
              : "Connection, DNS, or destination validation failed";
        }
        const status = !error
          ? row.channel === "email"
            ? "accepted"
            : "delivered"
          : oversized || row.attempts >= 8
            ? "failed"
            : "retry";
        await env.DB.batch([
          env.DB.prepare(
            "INSERT INTO delivery_attempts(id,delivery_id,attempt,status,response_code,error) SELECT ?,id,?,?,?,? FROM deliveries WHERE id=? AND lease=? AND status='sending'",
          ).bind(crypto.randomUUID(), row.attempts, status, code, error, id, lease),
          env.DB.prepare(
            "UPDATE deliveries SET status=?,response_code=?,error=?,provider_id=?,next_at=?,lease=NULL WHERE id=? AND lease=? AND status='sending'",
          ).bind(
            status,
            code,
            error,
            providerId,
            Date.now() + Math.min(86_400_000, 300_000 * 2 ** (row.attempts - 1)),
            id,
            lease,
          ),
        ]);
        console.log(
          JSON.stringify({
            event: "delivery_attempt",
            delivery_id: id,
            channel: row.channel,
            status,
            attempt: row.attempts,
            code,
          }),
        );
      }),
    );
}
