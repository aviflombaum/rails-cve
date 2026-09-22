import { boundedText, safeDestination, sign, unseal } from "./security";
export interface Endpoint {
  id: string;
  account_id: string;
  name: string;
  url: string;
  secret: string;
  status: string;
  challenge: string;
  created_at: string;
}
export async function send(
  env: Env,
  endpoint: Endpoint,
  body: string,
  id: string,
  challenge = false,
) {
  await safeDestination(endpoint.url);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await sign(await unseal(endpoint.secret, env.ENCRYPTION_KEY), timestamp, body);
  const r = await fetch(endpoint.url, {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Rails-CVE/1.0",
      "X-Rails-CVE-Id": id,
      "X-Rails-CVE-Timestamp": timestamp,
      "X-Rails-CVE-Signature": `v1=${signature}`,
    },
    body,
  });
  if (challenge) return { code: r.status, body: await boundedText(r, 4096) };
  await r.body?.cancel();
  return { code: r.status, body: "" };
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
    env.DB.prepare("INSERT INTO deliveries(id,event_id,endpoint_id) VALUES(?,?,?)").bind(
      crypto.randomUUID(),
      id,
      endpoint.id,
    ),
  ]);
  return id;
}
export async function drain(env: Env) {
  const now = Date.now();
  const { results } = await env.DB.prepare(
    "SELECT d.id FROM deliveries d JOIN endpoints e ON e.id=d.endpoint_id WHERE d.status IN ('pending','retry','sending') AND d.next_at<=? AND e.status='active' ORDER BY d.next_at,d.created_at LIMIT 25",
  )
    .bind(now)
    .all<{ id: string }>();
  for (let i = 0; i < results.length; i += 5)
    await Promise.all(
      results.slice(i, i + 5).map(async ({ id }) => {
        const lease = crypto.randomUUID();
        const row = await env.DB.prepare(
          "UPDATE deliveries SET status='sending',lease=?,next_at=?,attempts=attempts+1 WHERE id=? AND status IN ('pending','retry','sending') AND next_at<=? RETURNING *",
        )
          .bind(lease, Date.now() + 120_000, id, Date.now())
          .first<{ event_id: string; endpoint_id: string; attempts: number }>();
        if (!row) return;
        const endpoint = await env.DB.prepare("SELECT * FROM endpoints WHERE id=?")
          .bind(row.endpoint_id)
          .first<Endpoint>();
        if (!endpoint || endpoint.status !== "active") {
          await env.DB.prepare(
            "UPDATE deliveries SET status='retry',next_at=0 WHERE id=? AND lease=?",
          )
            .bind(id, lease)
            .run();
          return;
        }
        const event = await env.DB.prepare("SELECT payload FROM events WHERE id=?")
          .bind(row.event_id)
          .first<{ payload: string }>();
        let code: number | null = null,
          error: string | null = null;
        try {
          if (!event) throw new Error("Missing event");
          code = (await send(env, endpoint, event.payload, row.event_id)).code;
          if (code < 200 || code >= 300) error = `HTTP ${code}`;
        } catch {
          error = "Connection, DNS, or destination validation failed";
        }
        const status = !error ? "delivered" : row.attempts >= 8 ? "failed" : "retry";
        await env.DB.prepare(
          "UPDATE deliveries SET status=?,response_code=?,error=?,next_at=?,lease=NULL WHERE id=? AND lease=?",
        )
          .bind(
            status,
            code,
            error,
            Date.now() + Math.min(86_400_000, 300_000 * 2 ** (row.attempts - 1)),
            id,
            lease,
          )
          .run();
        console.log(
          JSON.stringify({
            event: "delivery_attempt",
            delivery_id: id,
            status,
            attempt: row.attempts,
            code,
          }),
        );
      }),
    );
}
