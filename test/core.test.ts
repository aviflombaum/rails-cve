import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../src/index";
import {
  sign,
  seal,
  unseal,
  endpointURL,
  publicIP,
  hash,
  token,
  safeDestination,
} from "../src/security";
import { ingest, normalize, skill, sync } from "../src/advisories";
import { drain, enqueueTest, type Endpoint } from "../src/delivery";
import upstream from "./upstream.json";
const bindings = env as Env & { TEST_MIGRATION: string };
const a = normalize(upstream[0]);
beforeAll(async () => {
  for (const statement of bindings.TEST_MIGRATION.split(";").filter((s) => s.trim()))
    await bindings.DB.prepare(statement).run();
});
beforeEach(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Unexpected network request");
    }),
  );
  await bindings.DB.batch(
    ["deliveries", "events", "endpoints", "accounts", "advisories", "state"].map((t) =>
      bindings.DB.prepare(`DELETE FROM ${t}`),
    ),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});
async function request(path: string, init: RequestInit = {}) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(
    new Request(`https://rails-cve.avi.nyc${path}`, init),
    bindings,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return response;
}
async function endpoint(status = "active") {
  await bindings.DB.prepare("INSERT INTO accounts(id,token_hash) VALUES(?,?)")
    .bind("acct", await hash("management"))
    .run();
  await bindings.DB.prepare(
    "INSERT INTO endpoints(id,account_id,name,url,secret,status,challenge) VALUES(?,?,?,?,?,?,?)",
  )
    .bind(
      "ep",
      "acct",
      "Test app",
      "https://receiver.example.net/hook",
      await seal("test-secret", bindings.ENCRYPTION_KEY),
      status,
      token(),
    )
    .run();
  return (await bindings.DB.prepare("SELECT * FROM endpoints WHERE id=?")
    .bind("ep")
    .first<Endpoint>())!;
}
function network(status = 204, privateIP = false, eventId?: string) {
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "cloudflare-dns.com")
      return Response.json({
        Status: 0,
        Answer:
          url.searchParams.get("type") === "A"
            ? [{ type: 1, data: privateIP ? "10.0.0.1" : "93.184.216.34" }]
            : [],
      });
    if (url.hostname === "receiver.example.net") {
      const headers = new Headers(init?.headers),
        body = String(init?.body);
      expect(init?.redirect).toBe("manual");
      expect(headers.get("X-Rails-CVE-Signature")).toBe(
        "v1=" + (await sign("test-secret", headers.get("X-Rails-CVE-Timestamp")!, body)),
      );
      if (eventId) expect(JSON.parse(body).id).toBe(eventId);
      return new Response(null, {
        status,
        headers: status === 302 ? { location: "https://localhost/" } : {},
      });
    }
    throw new Error("Unexpected network request");
  });
}
describe("security", () => {
  it("signs exact body bytes and encrypts credentials with authenticated encryption", async () => {
    expect(await sign("key", "123", "{}")).toBe(
      "28739ce20e2d3d0eb7847a31bca889409d78898aa78efb82e124f99ddd0818a2",
    );
    const cipher = await seal("private-value", bindings.ENCRYPTION_KEY);
    expect(cipher).not.toContain("private-value");
    expect(await unseal(cipher, bindings.ENCRYPTION_KEY)).toBe("private-value");
    await expect(unseal(cipher, "b".repeat(64))).rejects.toThrow();
  });
  it("rejects private, local and encoded destinations", () => {
    for (const value of [
      "http://example.com",
      "https://localhost",
      "https://127.1",
      "https://2130706433",
      "https://[::1]",
      "https://user:pass@example.com",
      "https://example.com:8443",
      "https://example.com/#fragment",
      "https://host.internal",
    ])
      expect(() => endpointURL(value)).toThrow();
    for (const value of [
      "127.0.0.1",
      "10.0.0.1",
      "169.254.169.254",
      "192.168.0.1",
      "100.64.0.1",
      "::1",
      "fc00::1",
      "::ffff:127.0.0.1",
      "192.0.2.1",
    ])
      expect(publicIP(value)).toBe(false);
    expect(publicIP("1.1.1.1")).toBe(true);
  });
  it("rejects a domain resolving to a private address", async () => {
    network(200, true);
    await expect(safeDestination("https://receiver.example.net/hook")).rejects.toThrow("public");
  });
});
describe("advisory pipeline", () => {
  it("quietly imports a baseline, then emits each changed revision once", async () => {
    await endpoint();
    await ingest(bindings, [a]);
    expect(await bindings.DB.prepare("SELECT COUNT(*) n FROM events").first("n")).toBe(0);
    const updated = { ...a, title: "Updated guidance" };
    await ingest(bindings, [updated]);
    await ingest(bindings, [updated]);
    expect(await bindings.DB.prepare("SELECT COUNT(*) n FROM deliveries").first("n")).toBe(1);
    const payload = JSON.parse(
      (await bindings.DB.prepare("SELECT payload FROM events").first<string>("payload"))!,
    );
    expect(payload.type).toBe("advisory.updated");
    expect(payload.investigation.prompt).toContain("Gemfile.lock");
  });
  it("preserves exact package ranges and links the official forensic toolkit", () => {
    expect(a.packages[0].affected).toBe(upstream[0].vulnerabilities[0].vulnerable_version_range);
    expect(skill(a)).toContain("rails/rails-forensics-CVE-2026-66066");
    expect(() => normalize({ ghsa_id: "bad" })).toThrow();
  });
  it("persists source failure without replacing data", async () => {
    await ingest(bindings, [a]);
    vi.mocked(fetch).mockResolvedValue(Response.json({}, { status: 503 }));
    await expect(sync(bindings)).rejects.toThrow("503");
    expect(await bindings.DB.prepare("SELECT COUNT(*) n FROM advisories").first("n")).toBe(1);
    expect(
      await bindings.DB.prepare("SELECT value FROM state WHERE key='sync_error'").first(),
    ).toBeTruthy();
  });
});
describe("delivery outbox", () => {
  it("signs a delivery and never follows redirects; retries preserve event identity", async () => {
    const ep = await endpoint();
    const id = await enqueueTest(bindings, ep);
    network(302, false, id);
    await drain(bindings);
    let row = await bindings.DB.prepare("SELECT * FROM deliveries").first<{
      status: string;
      attempts: number;
      event_id: string;
    }>();
    expect(row?.status).toBe("retry");
    expect(row?.attempts).toBe(1);
    expect(row?.event_id).toBe(id);
    await bindings.DB.prepare("UPDATE deliveries SET next_at=0").run();
    network(204, false, id);
    await drain(bindings);
    row = await bindings.DB.prepare("SELECT * FROM deliveries").first();
    expect(row?.status).toBe("delivered");
    expect(row?.attempts).toBe(2);
  });
  it("stops after eight failures and excludes paused endpoints", async () => {
    const ep = await endpoint("paused");
    await enqueueTest(bindings, ep);
    await drain(bindings);
    expect(await bindings.DB.prepare("SELECT attempts FROM deliveries").first("attempts")).toBe(0);
    await bindings.DB.prepare("UPDATE endpoints SET status='active'").run();
    await bindings.DB.prepare("UPDATE deliveries SET attempts=7").run();
    network(500);
    await drain(bindings);
    expect(await bindings.DB.prepare("SELECT status FROM deliveries").first("status")).toBe(
      "failed",
    );
  });
});
describe("HTTP boundaries", () => {
  it("renders live advisories safely and provides downloadable skill", async () => {
    await ingest(bindings, [{ ...a, title: "<script>alert(1)</script>" }]);
    const response = await request("/");
    const html = await response.text();
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    const download = await request(`/advisories/${a.id}/SKILL.md`);
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toContain("attachment");
  });
  it("requires origin for cookie writes and does not expose a workspace unauthenticated", async () => {
    expect((await request("/accounts", { method: "POST" })).status).toBe(403);
    expect((await request("/dashboard")).headers.get("location")).toBe("/login");
    expect(
      (
        await request("/api/admin/sync", {
          method: "POST",
          headers: { authorization: "Bearer wrong" },
        })
      ).status,
    ).toBe(401);
  });
  it("isolates endpoints between accounts", async () => {
    await endpoint();
    await bindings.DB.prepare("INSERT INTO accounts(id,token_hash) VALUES(?,?)")
      .bind("other", await hash("other-token"))
      .run();
    expect(
      (
        await request("/endpoints/ep/delete", {
          method: "POST",
          headers: { authorization: "Bearer other-token" },
        })
      ).status,
    ).toBe(404);
    expect(await bindings.DB.prepare("SELECT id FROM endpoints").first("id")).toBe("ep");
  });
});
describe("workspace lifecycle", () => {
  it("creates a cookie session, stores only a token hash, and restores access", async () => {
    const r = await request("/accounts", {
      method: "POST",
      headers: { origin: "https://rails-cve.avi.nyc", "CF-Connecting-IP": "1.2.3.10" },
    });
    expect(r.status).toBe(200);
    const html = await r.text();
    const credential = html.match(/rcve_[a-f0-9]{64}/)![0];
    const cookie = r.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    expect(await bindings.DB.prepare("SELECT token_hash FROM accounts").first("token_hash")).toBe(
      await hash(credential),
    );
    expect(
      (await request("/dashboard", { headers: { cookie: cookie.split(";")[0] } })).status,
    ).toBe(200);
    const restored = await request("/session", {
      method: "POST",
      headers: {
        origin: "https://rails-cve.avi.nyc",
        "Content-Type": "application/x-www-form-urlencoded",
        "CF-Connecting-IP": "1.2.3.11",
      },
      body: new URLSearchParams({ token: credential }),
    });
    expect(restored.status).toBe(303);
  });
  it("activates only when a receiver returns the current challenge", async () => {
    await endpoint("pending");
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input).startsWith("https://cloudflare-dns.com"))
        return Response.json({ Status: 0, Answer: [{ type: 1, data: "93.184.216.34" }] });
      const body = JSON.parse(String(init?.body));
      return new Response(body.challenge);
    });
    const response = await request("/endpoints/ep/verify", {
      method: "POST",
      headers: { authorization: "Bearer management", "CF-Connecting-IP": "1.2.3.12" },
    });
    expect(response.status).toBe(303);
    expect(await bindings.DB.prepare("SELECT status FROM endpoints").first("status")).toBe(
      "active",
    );
    await bindings.DB.prepare("UPDATE endpoints SET status='pending'").run();
    network(200);
    await request("/endpoints/ep/verify", {
      method: "POST",
      headers: { authorization: "Bearer management", "CF-Connecting-IP": "1.2.3.13" },
    });
    expect(await bindings.DB.prepare("SELECT status FROM endpoints").first("status")).toBe(
      "pending",
    );
  });
  it("claims a due delivery only once when drains overlap", async () => {
    const ep = await endpoint();
    await enqueueTest(bindings, ep);
    network(204);
    await Promise.all([drain(bindings), drain(bindings)]);
    expect(await bindings.DB.prepare("SELECT attempts FROM deliveries").first("attempts")).toBe(1);
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([url]) => String(url).includes("receiver.example.net/hook")),
    ).toHaveLength(1);
  });
});

describe("self-hosted links", () => {
  it("uses the configured origin in metadata and downloadable example skill links", async () => {
    const page = await request("/docs");
    const html = await page.text();
    expect(html).toContain(`href="${bindings.APP_URL}/docs"`);
    expect(html).toContain(`content="${bindings.APP_URL}/og/rails-cve-v1.jpg"`);
    const response = await request("/examples/cve-2026-66066.json");
    const payload = await response.json<{ investigation: { skill_url: string } }>();
    expect(payload.investigation.skill_url).toBe(`${bindings.APP_URL}/advisories/${a.id}/SKILL.md`);
  });
});
