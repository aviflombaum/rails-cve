import { beforeAll, beforeEach, afterEach, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import { advisoryToken } from "../src/github-polling";
import { sync } from "../src/advisories";
import upstream from "./upstream.json";

let pem: string;
let publicKey: CryptoKey;
const config = () =>
  ({
    ...env,
    GITHUB_APP_ID: "123",
    GITHUB_APP_INSTALLATION_ID: "456",
    GITHUB_APP_PRIVATE_KEY: pem,
  }) as Env;
const minted = () => ({
  token: "installation.fixture.token",
  expires_at: new Date(Date.now() + 3600000).toISOString(),
});
beforeAll(async () => {
  const schema = (env as Env & { TEST_MIGRATION: string }).TEST_MIGRATION;
  for (const statement of schema.split(";").filter((s) => s.trim()))
    await env.DB.prepare(statement).run();
  const keys = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  publicKey = keys.publicKey;
  const bytes = await crypto.subtle.exportKey("pkcs8", keys.privateKey);
  pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(bytes).toString("base64")}\n-----END PRIVATE KEY-----`;
});
beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected network request");
    }),
  ),
);
afterEach(() => vi.unstubAllGlobals());

it("preserves explicit token precedence and unauthenticated local configuration", async () => {
  expect(await advisoryToken(env as Env)).toBeUndefined();
  expect(await advisoryToken({ ...config(), GITHUB_TOKEN: "operator-fixture" })).toBe(
    "operator-fixture",
  );
  expect(fetch).not.toHaveBeenCalled();
});

it("fails closed on partial configuration, URL injection and invalid private keys", async () => {
  for (const values of [
    { GITHUB_APP_ID: "123" },
    { ...config(), GITHUB_APP_INSTALLATION_ID: "456/../../other" },
    { ...config(), GITHUB_APP_PRIVATE_KEY: "private invalid fixture" },
  ])
    await expect(advisoryToken(values as Env)).rejects.toThrow(/GitHub polling app/);
  expect(fetch).not.toHaveBeenCalled();
});

it("signs short-lived app JWTs and renews a metadata-only token for each sync", async () => {
  const mock = vi.fn(async (url: string, options: RequestInit) => {
    expect(url).toBe("https://api.github.com/app/installations/456/access_tokens");
    expect(options.method).toBe("POST");
    expect(options.redirect).toBe("manual");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(options.body as string)).toEqual({ permissions: { metadata: "read" } });
    const jwt = new Headers(options.headers).get("authorization")!.slice(7);
    const [header, payload, signature] = jwt.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
      alg: "RS256",
      typ: "JWT",
    });
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    expect(claims.iss).toBe("123");
    expect(claims.iat).toBeLessThanOrEqual(Date.now() / 1000);
    expect(claims.exp - claims.iat).toBe(600);
    expect(claims.exp).toBeGreaterThan(Date.now() / 1000);
    expect(
      await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        publicKey,
        Buffer.from(signature, "base64url"),
        new TextEncoder().encode(header + "." + payload),
      ),
    ).toBe(true);
    return Response.json(minted());
  });
  vi.stubGlobal("fetch", mock);
  expect(await advisoryToken(config())).toBe(minted().token);
  expect(await advisoryToken(config())).toBe(minted().token);
  expect(mock).toHaveBeenCalledTimes(2);
});

it("rejects redirects, provider errors and transport failures without disclosing credentials", async () => {
  for (const status of [302, 401, 403, 500]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("private provider body", { status })),
    );
    await expect(advisoryToken(config())).rejects.toThrow(
      `GitHub polling token request returned ${status}`,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("private transport credential");
    }),
  );
  await expect(advisoryToken(config())).rejects.toThrow(/^GitHub polling token request failed$/);
});

it("bounds and validates token responses, including expiry and header injection", async () => {
  for (const body of [
    "private invalid JSON",
    "x".repeat(32769),
    JSON.stringify({ ...minted(), token: "fixture\r\nInjected: value" }),
    JSON.stringify({ ...minted(), expires_at: new Date(Date.now() - 1).toISOString() }),
    JSON.stringify({ token: "fixture", expires_at: "invalid" }),
  ]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body)),
    );
    await expect(advisoryToken(config())).rejects.toThrow(
      /^GitHub polling token response is invalid$/,
    );
  }
});

it("uses the installation token only on the canonical feed and releases failed sync leases", async () => {
  const mock = vi.fn(async (url: string, options: RequestInit) => {
    if (url === "https://api.github.com/app/installations/456/access_tokens")
      return Response.json(minted());
    expect(url).toBe(
      "https://api.github.com/repos/rails/rails/security-advisories?per_page=100&page=1",
    );
    expect(new Headers(options.headers).get("authorization")).toBe(`Bearer ${minted().token}`);
    expect(options.redirect).toBe("manual");
    return Response.json([upstream[0]]);
  });
  vi.stubGlobal("fetch", mock);
  expect(await sync(config())).toEqual({ count: 1 });
  expect(mock).toHaveBeenCalledTimes(2);
  const previous = await env.DB.prepare("SELECT data FROM advisories").first();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("private token error", { status: 403 })),
  );
  await expect(sync(config())).rejects.toThrow("GitHub polling token request returned 403");
  expect(await env.DB.prepare("SELECT data FROM advisories").first()).toEqual(previous);
  expect(await env.DB.prepare("SELECT value FROM state WHERE key='sync_lock'").first()).toBeNull();
  expect(
    await env.DB.prepare("SELECT value FROM state WHERE key='sync_error'").first(),
  ).not.toBeNull();
});
