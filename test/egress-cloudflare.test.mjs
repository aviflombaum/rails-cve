import { test } from "node:test";
import assert from "node:assert/strict";
import { admit } from "../egress/cloudflare/admission.mjs";
const token = "b".repeat(64);
const request = (path, init = {}) => new Request(`https://gateway.example.net${path}`, init);
const authorization = { Authorization: `Bearer ${token}` };
test("unauthorized, unconfigured and unsupported requests never wake a container", async () => {
  const noWake = () => assert.fail("Container must stay asleep");
  assert.equal((await admit(request("/health"), token, noWake)).status, 401);
  assert.equal((await admit(request("/deliver", { method: "POST" }), token, noWake)).status, 401);
  assert.equal(
    (await admit(request("/health", { headers: authorization }), undefined, noWake)).status,
    503,
  );
  assert.equal(
    (await admit(request("/other", { headers: authorization }), token, noWake)).status,
    404,
  );
  assert.equal(
    (await admit(request("/health?secret=fixture", { headers: authorization }), token, noWake))
      .status,
    404,
  );
  assert.equal(
    (
      await admit(
        new Request("http://gateway.example.net/health", { headers: authorization }),
        token,
        noWake,
      )
    ).status,
    403,
  );
});
test("authenticated forwarding preserves bytes and strips caller forwarding headers", async () => {
  const body = JSON.stringify({ body: "héllo", destination: "https://receiver.example.net/path" });
  const response = await admit(
    request("/deliver", {
      method: "POST",
      headers: { ...authorization, "X-Forwarded-Host": "attacker", Upgrade: "" },
      body,
    }),
    token,
    async (req) => {
      assert.equal(req.url, "http://container/deliver");
      assert.equal(req.redirect, "manual");
      assert.equal(await req.text(), body);
      assert.equal(req.headers.get("authorization"), authorization.Authorization);
      assert.equal(req.headers.get("x-forwarded-host"), null);
      return Response.json({ code: 204, body: "" });
    },
  );
  assert.deepEqual(await response.json(), { code: 204, body: "" });
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("oversized streamed or declared bodies are rejected before container admission", async () => {
  const noWake = () => assert.fail("No container for oversized input");
  assert.equal(
    (
      await admit(
        request("/deliver", {
          method: "POST",
          headers: { ...authorization, "Content-Length": "99999999" },
          body: "{}",
        }),
        token,
        noWake,
      )
    ).status,
    413,
  );
  assert.equal(
    (
      await admit(
        request("/deliver", {
          method: "POST",
          headers: authorization,
          body: "x".repeat(6 * 1048576 + 16385),
        }),
        token,
        noWake,
      )
    ).status,
    413,
  );
});
test("gateway errors, redirects and oversized replies do not disclose upstream details", async () => {
  for (const status of [302, 401, 500]) {
    const response = await admit(
      request("/health", { headers: authorization }),
      token,
      async () => new Response("private provider details", { status }),
    );
    assert.notEqual(response.status, 200);
    assert.ok(!(await response.text()).includes("private"));
  }
  const response = await admit(
    request("/health", { headers: authorization }),
    token,
    async () => new Response("x".repeat(32769)),
  );
  assert.equal(response.status, 503);
});
test("a stalled body is rejected even when cancellation does not settle", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = admit(
    request("/deliver", {
      method: "POST",
      headers: authorization,
      duplex: "half",
      body: new ReadableStream({ cancel: () => new Promise(() => {}) }),
    }),
    token,
    () => assert.fail("A timed-out body must never wake a container"),
  );
  context.mock.timers.tick(15000);
  assert.equal((await pending).status, 413);
});
