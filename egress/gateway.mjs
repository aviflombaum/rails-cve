import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import ipaddr from "ipaddr.js";
import { MAX_EVENT_BYTES } from "./limits.mjs";

export function destination(value) {
  if (typeof value !== "string" || value.length > 2048) throw new Error("Destination");
  const url = new URL(value);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== "443") ||
    ipaddr.isValid(host) ||
    !host.includes(".") ||
    /(?:^|\.)(localhost|local|internal|test|invalid|example|onion)$/.test(host) ||
    host.endsWith(".")
  )
    throw new Error("Destination");
  return url;
}
export function publicAddress(address) {
  try {
    return ipaddr.parse(address).range() === "unicast";
  } catch {
    return false;
  }
}
export function envelope(data) {
  const url = destination(data?.destination);
  if (
    typeof data.body !== "string" ||
    Buffer.byteLength(data.body) > MAX_EVENT_BYTES ||
    typeof data.challenge !== "boolean" ||
    !/^(evt|verify)_[a-zA-Z0-9_-]{1,100}$/.test(data.id) ||
    !/^\d{10,12}$/.test(data.timestamp) ||
    !/^v1=[a-f0-9]{64}$/.test(data.signature)
  )
    throw new Error("Envelope");
  return { url, data };
}

// Test seams replace DNS/HTTPS primitives, never validation or connection options.
export async function deliver(input, { resolve = lookup, connect = request } = {}) {
  const { url, data } = envelope(input);
  let timer, outgoing;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      outgoing?.destroy();
      reject(new Error("Deadline"));
    }, 10000);
    timer.unref?.();
  });
  try {
    return await Promise.race([
      timeout,
      (async () => {
        const records = await resolve(url.hostname, { all: true, verbatim: true });
        if (!records.length || records.some((r) => !publicAddress(r.address)))
          throw new Error("DNS");
        const pinned = records[0];
        // A completed DNS timeout must never start a late outbound connection.
        if (!timer) throw new Error("Deadline");
        return await new Promise((resolveResult, reject) => {
          outgoing = connect(
            {
              protocol: "https:",
              hostname: url.hostname,
              port: 443,
              path: url.pathname + url.search,
              servername: url.hostname,
              rejectUnauthorized: true,
              agent: false,
              autoSelectFamily: false,
              family: pinned.family,
              lookup: (_hostname, options, callback) => {
                if (options.all) callback(null, [pinned]);
                else callback(null, pinned.address, pinned.family);
              },
              method: "POST",
              maxHeaderSize: 16384,
              headers: {
                Host: url.host,
                "Content-Type": "application/json",
                "User-Agent": "Rails-CVE/1.0",
                "Content-Length": Buffer.byteLength(data.body),
                "X-Rails-CVE-Id": data.id,
                "X-Rails-CVE-Timestamp": data.timestamp,
                "X-Rails-CVE-Signature": data.signature,
              },
            },
            (response) => {
              const code = response.statusCode;
              // Never follow redirects. Do not read subscriber response bodies except challenges.
              if (!data.challenge || code < 200 || code >= 300) {
                response.destroy();
                resolveResult({ code, body: "" });
                return;
              }
              const chunks = [];
              let size = 0;
              response.on("data", (chunk) => {
                size += chunk.length;
                if (size > 4096) {
                  response.destroy();
                  reject(new Error("Response size"));
                } else chunks.push(chunk);
              });
              response.on("end", () =>
                resolveResult({ code, body: Buffer.concat(chunks).toString("utf8") }),
              );
              response.on("error", reject);
              response.on("aborted", () => reject(new Error("Aborted response")));
            },
          );
          outgoing.on("error", reject);
          outgoing.end(data.body);
        });
      })(),
    ]);
  } finally {
    clearTimeout(timer);
    timer = null;
  }
}

export function gateway({ token, forward = deliver, concurrency = 10 }) {
  if (!/^[a-f0-9]{64}$/.test(token || ""))
    throw new Error("Configure a random 32-byte hex EGRESS_PROXY_TOKEN");
  const digest = (value) => createHash("sha256").update(value).digest();
  const expected = digest(`Bearer ${token}`);
  let active = 0;
  const server = createServer(
    { requestTimeout: 15000, headersTimeout: 5000, maxHeaderSize: 8192 },
    async (req, res) => {
      const reply = (status, body) => {
        res.writeHead(status, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          Connection: "close",
        });
        res.end(JSON.stringify(body));
      };
      if (req.method !== "POST" || req.url !== "/deliver") {
        reply(404, { error: "Not found" });
        return;
      }
      if (!timingSafeEqual(expected, digest(req.headers.authorization || ""))) {
        reply(401, { error: "Unauthorized" });
        return;
      }
      if (active >= concurrency) {
        reply(503, { error: "Busy" });
        return;
      }
      active++;
      // Bound authenticated inbound time too, including slow/chunked requests.
      const deadline = setTimeout(() => req.destroy(), 15000);
      try {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > MAX_EVENT_BYTES * 6 + 16384) throw new Error("Request size");
          chunks.push(chunk);
        }
        const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        envelope(data);
        reply(200, await forward(data));
      } catch {
        if (!res.destroyed) reply(502, { error: "Delivery rejected or unconfirmed" });
      } finally {
        clearTimeout(deadline);
        active--;
      }
    },
  );
  server.maxConnections = 100;
  server.keepAliveTimeout = 1000;
  server.setTimeout(15000, (socket) => socket.destroy());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Terminate inbound TLS in an operator-controlled reverse proxy. Never expose this listener.
  gateway({ token: process.env.EGRESS_PROXY_TOKEN }).listen(
    Number(process.env.EGRESS_PORT || 8080),
    "127.0.0.1",
  );
}
