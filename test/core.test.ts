import { MAX_EVENT_BYTES, eventBytes } from "../src/limits";
import { readDestination, encryptLegacyDestinations } from "../src/destinations";
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
import { advisoryPayload, ingest, normalize, skill, sync } from "../src/advisories";
import { drain, enqueueTest, type Endpoint } from "../src/delivery";
import upstream from "./upstream.json";
import { requestVerification } from "../src/email";
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
    [
      "delivery_attempts",
      "deliveries",
      "events",
      "endpoints",
      "email_addresses",
      "email_cooldowns",
      "sessions",
      "oauth_states",
      "accounts",
      "advisories",
      "state",
    ].map((t) => bindings.DB.prepare(`DELETE FROM ${t}`)),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});
async function request(path: string, init: RequestInit = {}, testEnv: Env = bindings) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(
    new Request(`https://rails-cve.avi.nyc${path}`, init),
    testEnv,
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
  if (status !== "pending")
    await bindings.DB.prepare("UPDATE endpoints SET webhook_verified=1 WHERE id='ep'").run();
  return (await bindings.DB.prepare("SELECT * FROM endpoints WHERE id=?")
    .bind("ep")
    .first<Endpoint>())!;
}
// An offline gateway adapter keeps receiver-level scenarios independent from the
// separate gateway transport tests. Every proxy request still checks its wire contract.
function mockNetwork(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (String(input) !== "https://egress.example.net/deliver") return handler(input, init);
    expect(init?.redirect).toBe("manual");
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${"a".repeat(64)}`);
    const data = JSON.parse(String(init?.body));
    const response = await handler(data.destination, {
      method: "POST",
      redirect: "manual",
      body: data.body,
      headers: {
        "Content-Type": "application/json",
        "X-Rails-CVE-Id": data.id,
        "X-Rails-CVE-Timestamp": data.timestamp,
        "X-Rails-CVE-Signature": data.signature,
      },
    });
    return Response.json({
      code: response.status,
      body: data.challenge ? await response.text() : "",
    });
  });
}
function network(status = 204, privateIP = false, eventId?: string) {
  mockNetwork(async (input, init) => {
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
describe("canonical source redirects", () => {
  it("rejects a redirect without following it or replacing known data", async () => {
    await ingest(bindings, [a]);
    mockNetwork(async (input, init) => {
      const outgoing = new Request(input, init);
      expect(outgoing.url).toBe(
        "https://api.github.com/repos/rails/rails/security-advisories?per_page=100&page=1",
      );
      expect(outgoing.redirect).toBe("manual");
      return new Response(null, {
        status: 302,
        headers: { location: "https://elsewhere.example/advisories" },
      });
    });
    await expect(sync({ ...bindings, GITHUB_TOKEN: "test-upstream-token" })).rejects.toThrow("302");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await bindings.DB.prepare("SELECT data FROM advisories").first("data")).toBe(
      JSON.stringify(a),
    );
    expect(await bindings.DB.prepare("SELECT COUNT(*) n FROM events").first("n")).toBe(0);
    expect(
      await bindings.DB.prepare("SELECT value FROM state WHERE key='sync_error'").first(),
    ).toBeTruthy();
  });
});
describe("delivery outbox", () => {
  it("finalizes an expired eighth lease once without another request", async () => {
    const ep = await endpoint();
    await enqueueTest(bindings, ep);
    await bindings.DB.prepare(
      "UPDATE deliveries SET status='sending',attempts=8,lease='interrupted',next_at=?",
    )
      .bind(Date.now() + 120000)
      .run();
    await drain(bindings);
    expect(await bindings.DB.prepare("SELECT status FROM deliveries").first("status")).toBe(
      "sending",
    );
    await bindings.DB.prepare("UPDATE deliveries SET next_at=0").run();
    await Promise.all([drain(bindings), drain(bindings)]);
    expect(fetch).not.toHaveBeenCalled();
    expect(
      await bindings.DB.prepare("SELECT status,attempts,lease,error FROM deliveries").first(),
    ).toEqual({
      status: "failed",
      attempts: 8,
      lease: null,
      error: "Attempt limit reached after interrupted delivery; receipt is unknown",
    });
    expect(await bindings.DB.prepare("SELECT COUNT(*) n FROM delivery_attempts").first("n")).toBe(
      1,
    );
  });
  it("recovers a seventh interrupted lease with exactly one last attempt", async () => {
    const ep = await endpoint();
    await enqueueTest(bindings, ep);
    await bindings.DB.prepare(
      "UPDATE deliveries SET status='sending',attempts=7,lease='interrupted',next_at=0",
    ).run();
    network(204);
    await Promise.all([drain(bindings), drain(bindings)]);
    expect(await bindings.DB.prepare("SELECT status,attempts FROM deliveries").first()).toEqual({
      status: "delivered",
      attempts: 8,
    });
  });
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
    const ep = await endpoint("active");
    await enqueueTest(bindings, ep);
    await bindings.DB.prepare("UPDATE endpoints SET status='paused'").run();
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
    expect(cookie).toContain("SameSite=Lax");
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
    mockNetwork(async (input, init) => {
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
      vi.mocked(fetch).mock.calls.filter(([url]) => String(url) === bindings.EGRESS_PROXY_URL),
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

let requestNumber = 0;
function post(body: Record<string, string> = {}, credential = "management"): RequestInit {
  return {
    method: "POST",
    headers: {
      authorization: `Bearer ${credential}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "CF-Connecting-IP": `test-${++requestNumber}`,
    },
    body: new URLSearchParams(body),
  };
}
function mailEnvironment() {
  const send = vi.fn(async () => ({ messageId: "mail-accepted" }));
  return {
    send,
    env: {
      ...bindings,
      EMAIL: { send },
      EMAIL_FROM: "notifications@example.org",
      EMAIL_TRANSPORT: "cloudflare",
    } as Env,
  };
}
async function verifiedAddress(account = "acct", id = "email1", address = "owner@example.org") {
  await bindings.DB.prepare(
    "INSERT INTO email_addresses(id,account_id,address,verified_at) VALUES(?,?,?,?)",
  )
    .bind(id, account, address, new Date().toISOString())
    .run();
}
describe("account settings and email", () => {
  it("gates unconfigured providers and serves public integration guides without login", async () => {
    expect((await request("/auth/github", post())).status).toBe(503);
    expect((await request("/settings")).status).toBe(302);
    for (const path of [
      "/integrations",
      "/integrations/openclaw",
      "/integrations/hermes",
      "/integrations/self-host",
      "/style.css",
    ])
      expect((await request(path)).status).not.toBe(302);
    await endpoint();
    expect(
      (
        await request(
          "/endpoints",
          post({ name: "Email app", delivery_mode: "email", email_id: "missing" }),
        )
      ).status,
    ).toBe(400);
  });
  it("saves account profile and revokes expiring browser sessions on logout", async () => {
    await endpoint();
    await request("/settings", post({ name: "Team Security" }));
    expect(
      await bindings.DB.prepare("SELECT name FROM accounts WHERE id='acct'").first("name"),
    ).toBe("Team Security");
    const login = await request("/session", {
      ...post({ token: "management" }),
      headers: { ...post().headers, origin: "https://rails-cve.avi.nyc" },
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const digest = await hash(cookie.split("=")[1]);
    expect(await bindings.DB.prepare("SELECT token_hash FROM sessions").first("token_hash")).toBe(
      digest,
    );
    expect(
      (await request("/settings", { headers: { cookie, authorization: "invalid" } })).status,
    ).toBe(302);
    await request("/logout", {
      method: "POST",
      headers: { cookie, origin: "https://rails-cve.avi.nyc", "CF-Connecting-IP": "logout-test" },
    });
    expect((await request("/settings", { headers: { cookie } })).status).toBe(302);
    const expired = "expired-session";
    await bindings.DB.prepare(
      "INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(?,?,?)",
    )
      .bind(await hash(expired), "acct", Date.now() - 1)
      .run();
    expect(
      (await request("/settings", { headers: { cookie: `rcve_session=${expired}` } })).status,
    ).toBe(302);
  });
  it("verifies mail only once, for the requesting workspace, with destination cooldown", async () => {
    await endpoint();
    const mail = mailEnvironment();
    await requestVerification(mail.env, "acct", "Owner@example.org");
    const message = mail.send.mock.calls[0][0] as unknown as EmailMessageBuilder;
    const secret = new URL(message.text!.match(/http[^\s]+/)![0]).searchParams.get("token")!;
    const row = await bindings.DB.prepare("SELECT * FROM email_addresses").first();
    expect(row?.token_hash).toBe(await hash(secret));
    expect(row?.verified_at).toBeNull();
    await expect(requestVerification(mail.env, "acct", "owner@example.org")).rejects.toThrow(
      "recently",
    );
    await bindings.DB.prepare("INSERT INTO accounts(id,token_hash) VALUES(?,?)")
      .bind("other", await hash("other"))
      .run();
    expect(
      (await request("/settings/email/confirm", post({ token: secret }, "other"), mail.env)).status,
    ).toBe(400);
    expect(
      (
        await request(
          `/settings/email/confirm?token=${secret}`,
          { headers: { authorization: "Bearer management" } },
          mail.env,
        )
      ).status,
    ).toBe(200);
    expect(
      await bindings.DB.prepare("SELECT verified_at FROM email_addresses").first("verified_at"),
    ).toBeNull();
    expect(
      (await request("/settings/email/confirm", post({ token: secret }), mail.env)).status,
    ).toBe(303);
    expect(
      (await request("/settings/email/confirm", post({ token: secret }), mail.env)).status,
    ).toBe(400);
  });
  it("rejects expired confirmation and unverified/foreign email selections", async () => {
    await endpoint();
    const mail = mailEnvironment();
    await bindings.DB.prepare(
      "INSERT INTO email_addresses(id,account_id,address,token_hash,expires_at) VALUES(?,?,?,?,?)",
    )
      .bind("pending", "acct", "pending@example.org", await hash("expired"), Date.now() - 1)
      .run();
    expect(
      (await request("/settings/email/confirm", post({ token: "expired" }), mail.env)).status,
    ).toBe(400);
    expect(
      (
        await request(
          "/endpoints",
          post({ name: "Mail app", delivery_mode: "email", email_id: "pending" }),
          mail.env,
        )
      ).status,
    ).toBe(400);
    await bindings.DB.prepare("INSERT INTO accounts(id,token_hash) VALUES(?,?)")
      .bind("other", await hash("other"))
      .run();
    await verifiedAddress("other");
    expect(
      (
        await request(
          "/endpoints",
          post({ name: "Mail app", delivery_mode: "email", email_id: "email1" }),
          mail.env,
        )
      ).status,
    ).toBe(400);
  });
  it("creates an email-only app without a webhook or signing-secret page", async () => {
    await endpoint();
    await verifiedAddress();
    const mail = mailEnvironment();
    const response = await request(
      "/endpoints",
      post({ name: "Mail app", delivery_mode: "email", email_id: "email1" }),
      mail.env,
    );
    expect(response.status).toBe(303);
    const row = await bindings.DB.prepare("SELECT * FROM endpoints WHERE name='Mail app'").first();
    expect(row?.status).toBe("active");
    expect(row?.url).toBe("");
    expect(row?.delivery_mode).toBe("email");
  });
  it("tenant scopes delivery payloads and settings mutations", async () => {
    const ep = await endpoint();
    await enqueueTest(bindings, ep);
    const id = await bindings.DB.prepare("SELECT id FROM deliveries").first<string>("id");
    await bindings.DB.prepare("INSERT INTO accounts(id,token_hash) VALUES(?,?)")
      .bind("other", await hash("other"))
      .run();
    expect(
      (await request(`/events/${id}`, { headers: { authorization: "Bearer other" } })).status,
    ).toBe(404);
    const html = await (
      await request("/events", { headers: { authorization: "Bearer other" } })
    ).text();
    expect(html).not.toContain("endpoint.test");
    expect(
      (await request("/endpoints/ep/settings", post({ name: "Stolen", url: ep.url }, "other")))
        .status,
    ).toBe(404);
    expect(
      (await request(`/events/${id}`, { headers: { authorization: "Bearer management" } })).status,
    ).toBe(200);
  });
});
describe("independent channel outbox", () => {
  it("fans out both channels once and retries mail without repeating a successful webhook", async () => {
    await endpoint();
    await verifiedAddress();
    const mail = mailEnvironment();
    await bindings.DB.prepare("UPDATE endpoints SET delivery_mode='both',email_id='email1'").run();
    await ingest(mail.env, [a]);
    await ingest(mail.env, [{ ...a, title: "New revision" }]);
    await ingest(mail.env, [{ ...a, title: "New revision" }]);
    expect(await bindings.DB.prepare("SELECT COUNT(*) n FROM deliveries").first("n")).toBe(2);
    network();
    mail.send.mockRejectedValueOnce(new Error("Provider failure containing sensitive text"));
    await drain(mail.env);
    expect(
      await bindings.DB.prepare("SELECT status FROM deliveries WHERE channel='webhook'").first(
        "status",
      ),
    ).toBe("delivered");
    expect(
      await bindings.DB.prepare("SELECT status FROM deliveries WHERE channel='email'").first(
        "status",
      ),
    ).toBe("retry");
    await bindings.DB.prepare("UPDATE deliveries SET next_at=0 WHERE channel='email'").run();
    await drain(mail.env);
    expect(
      await bindings.DB.prepare("SELECT attempts FROM deliveries WHERE channel='webhook'").first(
        "attempts",
      ),
    ).toBe(1);
    expect(
      await bindings.DB.prepare("SELECT status FROM deliveries WHERE channel='email'").first(
        "status",
      ),
    ).toBe("accepted");
    expect(mail.send).toHaveBeenCalledTimes(2);
    expect(await bindings.DB.prepare("SELECT COUNT(*) n FROM delivery_attempts").first("n")).toBe(
      3,
    );
    const errors = JSON.stringify(
      (await bindings.DB.prepare("SELECT error FROM delivery_attempts").all()).results,
    );
    expect(errors).not.toContain("sensitive");
  });
  it("delivers email independently while webhook verification is pending", async () => {
    await endpoint("pending");
    await verifiedAddress();
    const mail = mailEnvironment();
    await bindings.DB.prepare(
      "UPDATE endpoints SET delivery_mode='both',email_id='email1',status='active'",
    ).run();
    await ingest(mail.env, [a]);
    await ingest(mail.env, [{ ...a, title: "Updated" }]);
    await drain(mail.env);
    expect(await bindings.DB.prepare("SELECT COUNT(*) n FROM deliveries").first("n")).toBe(1);
    expect(await bindings.DB.prepare("SELECT channel FROM deliveries").first("channel")).toBe(
      "email",
    );
    expect(mail.send).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("holds unconfigured email without consuming attempts and cancels disabled channels", async () => {
    const ep = await endpoint();
    await verifiedAddress();
    const mail = mailEnvironment();
    await bindings.DB.prepare("UPDATE endpoints SET delivery_mode='both',email_id='email1'").run();
    await enqueueTest(bindings, ep);
    network();
    await drain(bindings);
    expect(
      await bindings.DB.prepare("SELECT attempts FROM deliveries WHERE channel='email'").first(
        "attempts",
      ),
    ).toBe(0);
    expect(
      (
        await request(
          "/endpoints/ep/settings",
          post({ name: ep.name, url: ep.url, delivery_mode: "webhook" }),
          mail.env,
        )
      ).status,
    ).toBe(303);
    expect(
      await bindings.DB.prepare("SELECT status FROM deliveries WHERE channel='email'").first(
        "status",
      ),
    ).toBe("cancelled");
    await drain(mail.env);
    expect(mail.send).not.toHaveBeenCalled();
  });
  it("resets webhook ownership and cancels queued webhooks on URL change", async () => {
    const ep = await endpoint();
    await enqueueTest(bindings, ep);
    const response = await request(
      "/endpoints/ep/settings",
      post({
        name: "Renamed",
        url: "https://new-receiver.example.net/hook",
        delivery_mode: "webhook",
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("whsec_");
    expect(
      await bindings.DB.prepare("SELECT webhook_verified FROM endpoints WHERE id='ep'").first(
        "webhook_verified",
      ),
    ).toBe(0);
    expect(await bindings.DB.prepare("SELECT status FROM deliveries").first("status")).toBe(
      "cancelled",
    );
  });
  it("removes an address without replaying or leaking its queued payload to a new address", async () => {
    const ep = await endpoint();
    await verifiedAddress();
    const mail = mailEnvironment();
    await bindings.DB.prepare("UPDATE endpoints SET delivery_mode='email',email_id='email1'").run();
    await enqueueTest(mail.env, ep);
    expect((await request("/settings/email/email1/remove", post(), mail.env)).status).toBe(303);
    await verifiedAddress("acct", "email2", "replacement@example.org");
    await bindings.DB.prepare("UPDATE endpoints SET email_id='email2'").run();
    await drain(mail.env);
    expect(mail.send).not.toHaveBeenCalled();
    expect(await bindings.DB.prepare("SELECT status FROM deliveries").first("status")).toBe(
      "cancelled",
    );
  });
});
function oauthEnv() {
  return {
    ...bindings,
    GITHUB_CLIENT_ID: "test-client",
    GITHUB_CLIENT_SECRET: "test-client-secret",
  } as Env;
}
async function startOAuth(credential?: string) {
  const init: RequestInit = {
    method: "POST",
    headers: {
      origin: "https://rails-cve.avi.nyc",
      "CF-Connecting-IP": `oauth-${++requestNumber}`,
      ...(credential ? { authorization: `Bearer ${credential}` } : {}),
    },
  };
  const response = await request("/auth/github", init, oauthEnv());
  expect(response.status).toBe(303);
  const url = new URL(response.headers.get("location")!);
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("code_challenge")).toHaveLength(43);
  expect(url.searchParams.has("scope")).toBe(false);
  return {
    cookie: response.headers.get("set-cookie")!.split(";")[0],
    state: url.searchParams.get("state")!,
  };
}
function githubIdentity(id = 1234, login = "octocat") {
  mockNetwork(async (input, init) => {
    if (String(input) === "https://github.com/login/oauth/access_token") {
      const outgoing = new Request(String(input), init);
      expect(outgoing.method).toBe("POST");
      expect(outgoing.redirect).toBe("manual");
      expect(JSON.parse(String(init?.body)).code_verifier).toHaveLength(64);
      return Response.json({ access_token: "provider-token", refresh_token: "provider-refresh" });
    }
    if (String(input) === "https://api.github.com/user") {
      const outgoing = new Request(String(input), init);
      expect(outgoing.redirect).toBe("manual");
      return Response.json({ id, login });
    }
    throw new Error("Unexpected OAuth URL");
  });
}
describe("GitHub App identity", () => {
  it("refreshes a legacy browser session to SameSite=Lax before linking", async () => {
    await endpoint();
    const response = await request(
      "/auth/github",
      {
        method: "POST",
        headers: {
          origin: "https://rails-cve.avi.nyc",
          cookie: "rcve_session=management",
          "CF-Connecting-IP": `oauth-${++requestNumber}`,
        },
      },
      oauthEnv(),
    );
    const cookies = response.headers.getSetCookie();
    const sessionCookie = cookies.find((value) => value.startsWith("rcve_session="))!;
    expect(sessionCookie).toContain("SameSite=Lax");
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("Secure");
    const state = new URL(response.headers.get("location")!).searchParams.get("state");
    githubIdentity();
    const callback = await request(
      `/auth/github/callback?state=${state}&code=code`,
      {
        headers: { cookie: cookies.map((value) => value.split(";")[0]).join("; ") },
      },
      oauthEnv(),
    );
    expect(callback.status).toBe(303);
    expect(
      await bindings.DB.prepare("SELECT github_id FROM accounts WHERE id='acct'").first(
        "github_id",
      ),
    ).toBe("1234");
  });
  it("reports safe failure stages without logging provider bodies or credentials", async () => {
    const flow = await startOAuth();
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ error: "secret-provider-body" }, { status: 403 }),
    );
    const response = await request(
      `/auth/github/callback?state=${flow.state}&code=private-code`,
      { headers: { cookie: flow.cookie } },
      oauthEnv(),
    );
    expect(response.status).toBe(400);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ event: "github_signin_failed", stage: "token", status: 403 }),
    );
    const output = JSON.stringify(log.mock.calls) + (await response.text());
    for (const secret of [
      flow.state,
      flow.cookie,
      "private-code",
      "secret-provider-body",
      "test-client-secret",
    ])
      expect(output).not.toContain(secret);
    log.mockRestore();
  });
  it.each(["token", "profile"])(
    "rejects %s redirects without forwarding credentials",
    async (redirectStage) => {
      const flow = await startOAuth();
      mockNetwork(async (input, init) => {
        const outgoing = new Request(String(input), init);
        expect(outgoing.redirect).toBe("manual");
        if (redirectStage === "profile" && outgoing.url.endsWith("/access_token"))
          return Response.json({ access_token: "provider-token" });
        return new Response(null, {
          status: 302,
          headers: { Location: "https://untrusted.example/" },
        });
      });
      const response = await request(
        `/auth/github/callback?state=${flow.state}&code=code`,
        { headers: { cookie: flow.cookie } },
        oauthEnv(),
      );
      expect(response.status).toBe(400);
      expect(await response.text()).toContain(`${redirectStage}:`);
      expect(fetch).toHaveBeenCalledTimes(redirectStage === "token" ? 1 : 2);
      expect(await bindings.DB.prepare("SELECT COUNT(*) n FROM accounts").first("n")).toBe(0);
    },
  );
  it("registers with PKCE, consumes state once, and never persists provider tokens", async () => {
    const flow = await startOAuth();
    githubIdentity();
    const path = `/auth/github/callback?state=${flow.state}&code=code`;
    const response = await request(path, { headers: { cookie: flow.cookie } }, oauthEnv());
    expect(response.status).toBe(303);
    const account = await bindings.DB.prepare("SELECT * FROM accounts").first();
    expect(account?.github_id).toBe("1234");
    expect(JSON.stringify(account)).not.toContain("provider-token");
    const cookies = response.headers.get("set-cookie")!;
    expect(cookies).toContain("session_");
    expect((await request(path, { headers: { cookie: flow.cookie } }, oauthEnv())).status).toBe(
      400,
    );
    expect(await bindings.DB.prepare("SELECT COUNT(*) n FROM oauth_states").first("n")).toBe(0);
  });
  it("rejects wrong browser binding, expired state, and missing state before contacting GitHub", async () => {
    const flow = await startOAuth();
    expect(
      (
        await request(
          `/auth/github/callback?state=${flow.state}&code=code`,
          { headers: { cookie: "rcve_oauth=wrong" } },
          oauthEnv(),
        )
      ).status,
    ).toBe(400);
    await bindings.DB.prepare("UPDATE oauth_states SET expires_at=0").run();
    expect(
      (
        await request(
          `/auth/github/callback?state=${flow.state}&code=code`,
          { headers: { cookie: flow.cookie } },
          oauthEnv(),
        )
      ).status,
    ).toBe(400);
    expect((await request("/auth/github/callback?code=code", {}, oauthEnv())).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("links only to the workspace that started authorization and rejects identity conflicts", async () => {
    await endpoint();
    const flow = await startOAuth("management");
    githubIdentity();
    expect(
      (
        await request(
          `/auth/github/callback?state=${flow.state}&code=code`,
          { headers: { cookie: flow.cookie } },
          oauthEnv(),
        )
      ).status,
    ).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    const linked = await startOAuth("management");
    expect(
      (
        await request(
          `/auth/github/callback?state=${linked.state}&code=code`,
          { headers: { cookie: linked.cookie, authorization: "Bearer management" } },
          oauthEnv(),
        )
      ).status,
    ).toBe(303);
    expect(
      await bindings.DB.prepare("SELECT github_id FROM accounts WHERE id='acct'").first(
        "github_id",
      ),
    ).toBe("1234");
    await bindings.DB.prepare("INSERT INTO accounts(id,token_hash) VALUES(?,?)")
      .bind("other", await hash("other"))
      .run();
    const conflict = await startOAuth("other");
    expect(
      (
        await request(
          `/auth/github/callback?state=${conflict.state}&code=code`,
          { headers: { cookie: conflict.cookie, authorization: "Bearer other" } },
          oauthEnv(),
        )
      ).status,
    ).toBe(409);
    expect(
      await bindings.DB.prepare("SELECT github_id FROM accounts WHERE id='other'").first(
        "github_id",
      ),
    ).toBeNull();
  });
  it("logs an existing GitHub user back into the same account and handles provider rejection", async () => {
    await endpoint();
    await bindings.DB.prepare("UPDATE accounts SET github_id='1234'").run();
    const flow = await startOAuth();
    githubIdentity(1234, "renamed");
    expect(
      (
        await request(
          `/auth/github/callback?state=${flow.state}&code=code`,
          { headers: { cookie: flow.cookie } },
          oauthEnv(),
        )
      ).status,
    ).toBe(303);
    expect(await bindings.DB.prepare("SELECT COUNT(*) n FROM accounts").first("n")).toBe(1);
    expect(
      await bindings.DB.prepare("SELECT github_login FROM accounts").first("github_login"),
    ).toBe("renamed");
    const fail = await startOAuth();
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ error: "bad_verification_code" }, { status: 400 }),
    );
    expect(
      (
        await request(
          `/auth/github/callback?state=${fail.state}&code=bad`,
          { headers: { cookie: fail.cookie } },
          oauthEnv(),
        )
      ).status,
    ).toBe(400);
  });
});

describe("concurrent webhook ownership", () => {
  it("does not mark a new URL verified when an older handshake completes", async () => {
    await endpoint("pending");
    mockNetwork(async (input, init) => {
      if (String(input).startsWith("https://cloudflare-dns.com"))
        return Response.json({ Status: 0, Answer: [{ type: 1, data: "93.184.216.34" }] });
      const body = JSON.parse(String(init?.body));
      await bindings.DB.prepare(
        "UPDATE endpoints SET url='https://new.example.net/hook',secret='different-encrypted-secret' WHERE id='ep'",
      ).run();
      return new Response(body.challenge);
    });
    expect((await request("/endpoints/ep/verify", post())).status).toBe(303);
    expect(
      await bindings.DB.prepare("SELECT webhook_verified FROM endpoints WHERE id='ep'").first(
        "webhook_verified",
      ),
    ).toBe(0);
  });
});

describe("history and recovery controls", () => {
  it("paginates history and applies channel/status filters within the owning account", async () => {
    const ep = await endpoint();
    for (let i = 0; i < 32; i++) await enqueueTest(bindings, ep);
    const headers = { authorization: "Bearer management" };
    const page1 = await (await request("/events", { headers })).text();
    expect(page1).toContain("Older →");
    expect(page1.match(/<code>endpoint.test<\/code>/g)).toHaveLength(30);
    const page2 = await (await request("/events?page=2", { headers })).text();
    expect(page2.match(/<code>endpoint.test<\/code>/g)).toHaveLength(2);
    expect(await (await request("/events?channel=email", { headers })).text()).not.toContain(
      "<code>endpoint.test</code>",
    );
    expect(await (await request("/events?status=delivered", { headers })).text()).not.toContain(
      "<code>endpoint.test</code>",
    );
  });
  it("invalidates the old management capability when a recovery token is replaced", async () => {
    await endpoint();
    const response = await request("/settings/token", post());
    expect(response.status).toBe(200);
    const replacement = (await response.text()).match(/rcve_[a-f0-9]{64}/)![0];
    expect(
      (await request("/settings", { headers: { authorization: "Bearer management" } })).status,
    ).toBe(302);
    expect(
      (await request("/settings", { headers: { authorization: `Bearer ${replacement}` } })).status,
    ).toBe(200);
  });
});

describe("secure account recovery", () => {
  function cookiePost(cookie: string, body: Record<string, string> = {}): RequestInit {
    return {
      method: "POST",
      headers: {
        cookie,
        origin: "https://rails-cve.avi.nyc",
        "Content-Type": "application/x-www-form-urlencoded",
        "CF-Connecting-IP": `recovery-${++requestNumber}`,
      },
      body: new URLSearchParams(body),
    };
  }
  it("requires proof and revokes old capabilities, sessions and pending linking flows", async () => {
    await endpoint();
    const login = await request("/session", post({ token: "management" }));
    const oldCookie = login.headers.get("set-cookie")!.split(";")[0];
    expect((await request("/auth/github", cookiePost(oldCookie), oauthEnv())).status).toBe(403);
    const pending = await startOAuth("management");
    expect((await request("/settings/token", cookiePost(oldCookie))).status).toBe(403);
    const recovered = await request(
      "/settings/token",
      cookiePost(oldCookie, { current_token: "management" }),
    );
    expect(recovered.status).toBe(200);
    const value = (await recovered.text()).match(/rcve_[a-f0-9]{64}/)![0];
    const newCookie = recovered.headers.get("set-cookie")!.split(";")[0];
    expect((await request("/settings", { headers: { cookie: oldCookie } })).status).toBe(302);
    expect((await request("/settings/token", cookiePost(oldCookie))).status).toBe(302);
    expect((await request("/settings", { headers: { cookie: newCookie } })).status).toBe(200);
    expect(
      (await request("/settings", { headers: { authorization: `Bearer ${value}` } })).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/auth/github/callback?state=${pending.state}&code=code`,
          { headers: { cookie: pending.cookie, authorization: `Bearer ${value}` } },
          oauthEnv(),
        )
      ).status,
    ).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not allow a callback already exchanging with GitHub to restore a recovered account", async () => {
    await endpoint();
    const flow = await startOAuth("management");
    mockNetwork(async (input) => {
      if (String(input).includes("access_token")) {
        expect((await request("/settings/token", post())).status).toBe(200);
        return Response.json({ access_token: "fixture" });
      }
      return Response.json({ id: 1234, login: "octocat" });
    });
    expect(
      (
        await request(
          `/auth/github/callback?state=${flow.state}&code=code`,
          { headers: { cookie: flow.cookie, authorization: "Bearer management" } },
          oauthEnv(),
        )
      ).status,
    ).toBe(400);
    expect(
      await bindings.DB.prepare("SELECT github_id FROM accounts WHERE id='acct'").first(
        "github_id",
      ),
    ).toBeNull();
  });
  it("allows fresh linked-GitHub proof once and removes an unwanted identity", async () => {
    await endpoint();
    await bindings.DB.prepare("UPDATE accounts SET github_id='1234',github_login='octocat'").run();
    const start = await request("/auth/github", post({ purpose: "recovery" }), oauthEnv());
    const state = new URL(start.headers.get("location")!).searchParams.get("state");
    const cookies = start.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .join("; ");
    githubIdentity();
    const callback = await request(
      `/auth/github/callback?state=${state}&code=code`,
      { headers: { cookie: cookies } },
      oauthEnv(),
    );
    const proofCookie = callback.headers
      .getSetCookie()
      .find((v) => v.startsWith("rcve_session="))!
      .split(";")[0];
    const recovery = await request(
      "/settings/token",
      cookiePost(proofCookie, { unlink_github: "on" }),
    );
    expect(recovery.status).toBe(200);
    expect(
      await bindings.DB.prepare("SELECT github_id FROM accounts WHERE id='acct'").first(
        "github_id",
      ),
    ).toBeNull();
    expect((await request("/settings/token", cookiePost(proofCookie))).status).toBe(302);
    const newCookie = recovery.headers.get("set-cookie")!.split(";")[0];
    expect((await request("/settings/token", cookiePost(newCookie))).status).toBe(403);
  });
});

describe("private webhook destinations", () => {
  it("encrypts and masks URL credentials while blank edits keep the exact saved destination", async () => {
    await endpoint();
    const url = "https://receiver.example.net/private-path?key=private-query";
    const created = await request("/endpoints", post({ name: "Private URL", url }));
    const html = await created.text();
    expect(html).not.toContain("private-path");
    expect(html).not.toContain("private-query");
    const row = await bindings.DB.prepare(
      "SELECT * FROM endpoints WHERE name='Private URL'",
    ).first<Endpoint>();
    expect(row!.url).not.toContain("private-query");
    expect(row!.url).toMatch(/^url:v1:/);
    expect(await readDestination(row!.url, bindings.ENCRYPTION_KEY)).toBe(url);
    const dashboard = await (
      await request("/dashboard", { headers: { authorization: "Bearer management" } })
    ).text();
    expect(dashboard).not.toContain("private-path");
    expect(dashboard).not.toContain("private-query");
    expect(
      (await request(`/endpoints/${row!.id}/settings`, post({ name: "Renamed", url: "" }))).status,
    ).toBe(303);
    const stored = await bindings.DB.prepare("SELECT url FROM endpoints WHERE id=?")
      .bind(row!.id)
      .first<string>("url");
    expect(await readDestination(stored!, bindings.ENCRYPTION_KEY)).toBe(url);
  });
  it("upgrades legacy rows without changing delivery bytes or destination", async () => {
    const ep = await endpoint();
    expect(await encryptLegacyDestinations(bindings)).toBe(1);
    expect(await encryptLegacyDestinations(bindings)).toBe(0);
    expect(
      await readDestination(
        (await bindings.DB.prepare("SELECT url FROM endpoints").first<string>("url"))!,
        bindings.ENCRYPTION_KEY,
      ),
    ).toBe(ep.url);
    await enqueueTest(bindings, ep);
    network();
    await drain(bindings);
    expect(await bindings.DB.prepare("SELECT status FROM deliveries").first("status")).toBe(
      "delivered",
    );
  });
});

describe("event byte contract", () => {
  const event = {
    id: "evt_size",
    type: "advisory.published",
    created_at: "2026-09-22T00:00:00.000Z",
  };
  it("uses the exact serialized UTF-8 boundary and preserves compact metadata", () => {
    const empty = advisoryPayload({ ...a, description: "" }, event, bindings.APP_URL);
    const available = MAX_EVENT_BYTES - eventBytes(JSON.stringify(empty));
    const fits = advisoryPayload(
      { ...a, description: "x".repeat(available) },
      event,
      bindings.APP_URL,
    );
    expect(fits.schema_version).toBe(1);
    expect(eventBytes(JSON.stringify(fits))).toBe(MAX_EVENT_BYTES);
    const compact = advisoryPayload(
      { ...a, description: "é".repeat(available) },
      event,
      bindings.APP_URL,
    );
    expect(compact.schema_version).toBe(2);
    expect(compact.advisory).toMatchObject({
      id: a.id,
      packages: a.packages,
      url: a.url,
      description: "",
      description_omitted: true,
      description_url: a.url,
    });
    expect(compact.investigation).toEqual(fits.investigation);
    expect(eventBytes(JSON.stringify(compact))).toBeLessThanOrEqual(MAX_EVENT_BYTES);
  });
  it("rejects oversized range metadata before storing an event", async () => {
    await ingest(bindings, [a]);
    await expect(
      ingest(bindings, [
        {
          ...a,
          packages: [{ name: "rails", affected: "x".repeat(MAX_EVENT_BYTES), patched: null }],
        },
      ]),
    ).rejects.toThrow("metadata exceeds");
    expect(await bindings.DB.prepare("SELECT COUNT(*) n FROM events").first("n")).toBe(0);
    expect(await bindings.DB.prepare("SELECT data FROM advisories").first("data")).toBe(
      JSON.stringify(a),
    );
  });
  it("fails legacy oversized events once without a network request", async () => {
    const ep = await endpoint();
    await enqueueTest(bindings, ep);
    await bindings.DB.prepare("UPDATE events SET payload=?")
      .bind("x".repeat(MAX_EVENT_BYTES + 1))
      .run();
    await drain(bindings);
    await drain(bindings);
    expect(fetch).not.toHaveBeenCalled();
    expect(
      await bindings.DB.prepare("SELECT status,attempts,error FROM deliveries").first(),
    ).toEqual({
      status: "failed",
      attempts: 1,
      error: "Payload exceeds the 1 MiB event limit; inspect the canonical advisory",
    });
  });
});

describe("secure webhook egress", () => {
  it("holds queued webhooks without spending attempts when egress is unconfigured", async () => {
    const ep = await endpoint();
    await enqueueTest(bindings, ep);
    const disabled = { ...bindings, EGRESS_PROXY_TOKEN: undefined };
    await drain(disabled);
    expect(fetch).not.toHaveBeenCalled();
    expect(await bindings.DB.prepare("SELECT attempts FROM deliveries").first("attempts")).toBe(0);
    expect((await request("/endpoints/ep/test", post({}), disabled)).status).toBe(400);
    expect((await request("/endpoints/ep/verify", post({}), disabled)).status).toBe(503);
    const dashboard = await request(
      "/dashboard",
      { headers: { Authorization: "Bearer management" } },
      disabled,
    );
    expect(await dashboard.text()).toContain("Webhook delivery is disabled");
  });
  it("never follows gateway redirects or leaks credentials to receiver URLs", async () => {
    const ep = await endpoint();
    await enqueueTest(bindings, ep);
    network();
    const dns = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input).startsWith("https://cloudflare-dns.com/")) return dns(input, init);
      expect(String(input)).toBe(bindings.EGRESS_PROXY_URL);
      expect(init?.redirect).toBe("manual");
      return new Response(null, {
        status: 302,
        headers: { location: "https://receiver.example.net/leak" },
      });
    });
    await drain(bindings);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(await bindings.DB.prepare("SELECT status FROM deliveries").first("status")).toBe(
      "retry",
    );
  });
});

describe("subscription readiness after mailbox removal", () => {
  it.each([
    ["email", 0, "active", "pending"],
    ["both", 0, "active", "pending"],
    ["both", 1, "active", "active"],
    ["email", 0, "paused", "paused"],
  ])(
    "recomputes %s mode, webhook %s, prior status %s",
    async (mode, verified, status, expected) => {
      await endpoint();
      await verifiedAddress();
      const mail = mailEnvironment();
      await bindings.DB.prepare(
        "UPDATE endpoints SET delivery_mode=?,email_id='email1',webhook_verified=?,status=?",
      )
        .bind(mode, verified, status)
        .run();
      const response = await request("/settings/email/email1/remove", post({}), mail.env);
      expect(response.status).toBe(303);
      expect(await bindings.DB.prepare("SELECT status FROM endpoints").first("status")).toBe(
        expected,
      );
      const html = await (
        await request("/dashboard", { headers: { Authorization: "Bearer management" } }, mail.env)
      ).text();
      if (expected === "pending") expect(html).toContain("Needs destination");
      if (!verified) {
        expect(html).toMatch(/disabled[^>]*>\s*Send test/);
        await request("/endpoints/ep/toggle", post({}), mail.env);
        if (expected !== "paused") await request("/endpoints/ep/toggle", post({}), mail.env);
        expect(await bindings.DB.prepare("SELECT status FROM endpoints").first("status")).toBe(
          "pending",
        );
        expect((await request("/endpoints/ep/test", post({}), mail.env)).status).toBe(400);
        await verifiedAddress();
        expect(
          (
            await request(
              "/endpoints/ep/settings",
              post({ name: "Restored", delivery_mode: "email", email_id: "email1" }),
              mail.env,
            )
          ).status,
        ).toBe(303);
        expect(await bindings.DB.prepare("SELECT status FROM endpoints").first("status")).toBe(
          "active",
        );
      }
    },
  );
});
