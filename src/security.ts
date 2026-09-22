import ipaddr from "ipaddr.js";
const enc = new TextEncoder();
export function token(prefix = "") {
  return (
    prefix +
    Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("")
  );
}
export async function hash(value: string) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(value)));
}
function hex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (n) => n.toString(16).padStart(2, "0")).join("");
}
export async function equal(a: string, b: string) {
  return crypto.subtle.timingSafeEqual(
    await crypto.subtle.digest("SHA-256", enc.encode(a)),
    await crypto.subtle.digest("SHA-256", enc.encode(b)),
  );
}
export async function sign(secret: string, timestamp: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${body}`)));
}
async function encryptionKey(secret: string) {
  if (!secret || secret.length < 64) throw new Error("Encryption key unavailable");
  return crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest("SHA-256", enc.encode(secret)),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
export async function seal(value: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(secret),
    enc.encode(value),
  );
  return (
    btoa(String.fromCharCode(...iv)) + "." + btoa(String.fromCharCode(...new Uint8Array(data)))
  );
}
export async function unseal(value: string, secret: string) {
  const [iv, data] = value.split(".").map((v) => Uint8Array.from(atob(v), (c) => c.charCodeAt(0)));
  return new TextDecoder().decode(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await encryptionKey(secret), data),
  );
}
export function publicIP(ip: string) {
  try {
    return ipaddr.parse(ip).range() === "unicast";
  } catch {
    return false;
  }
}
export function endpointURL(value: string) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.hash ||
    (u.port && u.port !== "443") ||
    value.length > 2048
  )
    throw new Error("Use an HTTPS URL on port 443 without credentials or a fragment.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  // Domain names only: this also rejects alternative encoded IPv4 forms after URL normalization.
  if (
    ipaddr.isValid(host) ||
    !host.includes(".") ||
    /(?:^|\.)(localhost|local|internal|test|invalid|example|onion)$/.test(host) ||
    host.endsWith(".")
  )
    throw new Error("Use a public internet hostname.");
  return u;
}
export async function safeDestination(value: string) {
  const u = endpointURL(value);
  const records = await Promise.all(
    ["A", "AAAA"].map(async (type) => {
      const r = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(u.hostname)}&type=${type}`,
        { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(5000) },
      );
      if (!r.ok) throw new Error("DNS lookup failed.");
      const data = JSON.parse(await boundedText(r, 32_768)) as {
        Status: number;
        Answer?: { type: number; data: string }[];
      };
      if (data.Status !== 0) throw new Error("Hostname could not be resolved.");
      return (data.Answer || []).filter((a) => a.type === 1 || a.type === 28).map((a) => a.data);
    }),
  );
  const ips = records.flat();
  if (!ips.length || ips.some((ip) => !publicIP(ip)))
    throw new Error("Endpoint must resolve only to public internet addresses.");
  return u;
}
export async function boundedText(response: Response, max: number) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > max) throw new Error("Response too large.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const merged = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(merged);
}
