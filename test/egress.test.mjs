import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { once } from "node:events";
import { deliver, destination, gateway } from "../egress/gateway.mjs";
import { MAX_EVENT_BYTES } from "../egress/limits.mjs";
const data = {
  destination: "https://receiver.example.net/path?secret=fixture",
  body: '{"hello":"世界"}',
  id: "evt_test",
  timestamp: "1790000000",
  signature: `v1=${"a".repeat(64)}`,
  challenge: false,
};
function transport(check, code = 204, body = "") {
  return (options, callback) => {
    check(options);
    const outgoing = new EventEmitter();
    outgoing.destroy = () => {};
    outgoing.end = (sent) => {
      assert.equal(sent, data.body);
      queueMicrotask(() => {
        const response = new PassThrough();
        response.statusCode = code;
        callback(response);
        response.end(body);
      });
    };
    return outgoing;
  };
}
test("pins validated DNS without re-resolution and preserves TLS name, Host and exact bytes", async () => {
  let resolutions = 0;
  const result = await deliver(data, {
    resolve: async () => {
      resolutions++;
      return [{ address: "93.184.216.34", family: 4 }];
    },
    connect: transport((options) => {
      assert.equal(options.hostname, "receiver.example.net");
      assert.equal(options.servername, "receiver.example.net");
      assert.equal(options.headers.Host, "receiver.example.net");
      assert.equal(options.path, "/path?secret=fixture");
      assert.equal(options.agent, false);
      assert.equal(options.rejectUnauthorized, true);
      assert.equal(options.headers.Authorization, undefined);
      assert.equal(options.headers["Content-Length"], Buffer.byteLength(data.body));
      // Even a later DNS change cannot change the address returned to the socket.
      options.lookup(options.hostname, {}, (error, address, family) => {
        assert.equal(error, null);
        assert.equal(address, "93.184.216.34");
        assert.equal(family, 4);
      });
      options.lookup(options.hostname, { all: true }, (error, records) => {
        assert.equal(error, null);
        assert.deepEqual(records, [{ address: "93.184.216.34", family: 4 }]);
      });
    }),
  });
  assert.deepEqual(result, { code: 204, body: "" });
  assert.equal(resolutions, 1);
});
test("rejects mixed public/private answers and reserved IPv4/IPv6 before connecting", async () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "192.168.1.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "64:ff9b::7f00:1",
  ])
    await assert.rejects(
      deliver(data, {
        resolve: async () => [
          { address: "93.184.216.34", family: 4 },
          { address, family: address.includes(":") ? 6 : 4 },
        ],
        connect: () => assert.fail("No connection"),
      }),
      /DNS/,
    );
});
test("rejects unsupported destinations, oversized bodies and header injection", async () => {
  for (const url of [
    "http://receiver.example.net",
    "https://127.1",
    "https://user:pass@receiver.example.net",
    "https://receiver.example.net:444/",
    "https://receiver.example.net/#fragment",
    "https://service.internal/",
  ])
    assert.throws(() => destination(url));
  await assert.rejects(deliver({ ...data, body: "é".repeat(MAX_EVENT_BYTES) }), /Envelope/);
  await assert.rejects(deliver({ ...data, id: "evt_ok\r\nAuthorization: bad" }), /Envelope/);
});
test("does not follow redirects or return ordinary response bodies and bounds challenges", async () => {
  const resolve = async () => [{ address: "93.184.216.34", family: 4 }];
  assert.deepEqual(
    await deliver(data, { resolve, connect: transport(() => {}, 302, "private body") }),
    { code: 302, body: "" },
  );
  assert.deepEqual(
    await deliver(
      { ...data, challenge: true },
      { resolve, connect: transport(() => {}, 200, "challenge") },
    ),
    { code: 200, body: "challenge" },
  );
  await assert.rejects(
    deliver(
      { ...data, challenge: true },
      { resolve, connect: transport(() => {}, 200, "x".repeat(4097)) },
    ),
    /Response size/,
  );
});
test("gateway requires its own credential before accepting work and returns redacted errors", async () => {
  let forwarded = 0;
  const token = "b".repeat(64);
  const server = gateway({
    token,
    forward: async () => {
      forwarded++;
      throw new Error("sensitive upstream details");
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}/deliver`;
  try {
    const denied = await fetch(url, { method: "POST", body: JSON.stringify(data) });
    assert.equal(denied.status, 401);
    assert.equal(forwarded, 0);
    const allowed = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
    assert.equal(allowed.status, 502);
    assert.equal(forwarded, 1);
    assert.deepEqual(await allowed.json(), { error: "Delivery rejected or unconfirmed" });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("a timed-out DNS resolution cannot start a late connection", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let finishDNS;
  const pending = deliver(data, {
    resolve: () =>
      new Promise((resolve) => {
        finishDNS = resolve;
      }),
    connect: () => assert.fail("Late connection"),
  });
  const rejected = assert.rejects(pending, /Deadline/);
  context.mock.timers.tick(10000);
  await rejected;
  finishDNS([{ address: "93.184.216.34", family: 4 }]);
  await Promise.resolve();
});
