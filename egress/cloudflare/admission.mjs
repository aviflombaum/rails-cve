import { createHash, timingSafeEqual } from "node:crypto";
import { MAX_EVENT_BYTES } from "../limits.mjs";
const MAX_ENVELOPE = MAX_EVENT_BYTES * 6 + 16384;
const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
const reply = (status, error) => new Response(JSON.stringify({ error }), { status, headers });
async function readBounded(stream, max, ms) {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  let timer;
  let expired = false;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      reject(new Error("Deadline"));
      void reader.cancel().catch(() => {});
    }, ms);
  });
  try {
    const chunks = [];
    let length = 0;
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (expired) throw new Error("Deadline");
      if (done) break;
      length += value.length;
      if (length > max) throw new Error("Size");
      chunks.push(value);
    }
    const body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
    return body;
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}
export async function admit(request, token, forward) {
  const url = new URL(request.url);
  if (
    url.search ||
    !(
      (request.method === "POST" && url.pathname === "/deliver") ||
      (request.method === "GET" && url.pathname === "/health")
    )
  )
    return reply(404, "Not found");
  if (url.protocol !== "https:") return reply(403, "HTTPS required");
  if (!/^[a-f0-9]{64}$/.test(token || "")) return reply(503, "Gateway not configured");
  const digest = (value) => createHash("sha256").update(value).digest();
  if (
    !timingSafeEqual(digest(`Bearer ${token}`), digest(request.headers.get("authorization") || ""))
  )
    return reply(401, "Unauthorized");
  // Do not instantiate/wake a billed container for untrusted or oversized traffic.
  if (request.headers.get("upgrade")) return reply(400, "Unsupported request");
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_ENVELOPE))
    return reply(413, "Request too large");
  let body;
  try {
    body =
      request.method === "POST" ? await readBounded(request.body, MAX_ENVELOPE, 15000) : undefined;
  } catch {
    return reply(413, "Request body rejected");
  }
  try {
    const result = await forward(
      new Request(`http://container${url.pathname}`, {
        method: request.method,
        redirect: "manual",
        signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body,
      }),
    );
    if (!result.ok) {
      void result.body?.cancel().catch(() => {});
      return reply(result.status === 401 ? 503 : 502, "Delivery rejected or unconfirmed");
    }
    const responseBody = await readBounded(result.body, 32768, 15000);
    return new Response(responseBody, { status: 200, headers });
  } catch {
    return reply(503, "Gateway temporarily unavailable");
  }
}
