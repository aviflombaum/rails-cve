import { Hono } from "hono";
import { contextStorage } from "hono/context-storage";
import { examplePayload } from "./examples";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { sync, skill, type Advisory } from "./advisories";
import { drain, send, enqueueTest, type Endpoint } from "./delivery";
import { token, hash, equal, seal, endpointURL } from "./security";
import {
  Home,
  AdvisoryIndex,
  Detail,
  Connect,
  SecretPage,
  Dashboard,
  ErrorPage,
  Docs,
  type DeliveryView,
} from "./views";
type App = { Bindings: Env; Variables: { accountId: string } };
const app = new Hono<App>();
app.use("*", contextStorage());
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "same-origin");
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header("Cache-Control", "no-store");
});
app.use("*", bodyLimit({ maxSize: 8192, onError: (c) => c.text("Request too large", 413) }));
app.use("*", async (c, next) => {
  if (c.req.method === "POST") {
    if (c.req.header("origin") !== new URL(c.req.url).origin && !c.req.header("authorization"))
      return c.html(<ErrorPage message="This request did not originate from this site." />, 403);
    const { success } = await c.env.WRITE_LIMITER.limit({
      key: c.req.header("CF-Connecting-IP") || "local",
    });
    if (!success)
      return c.html(<ErrorPage message="Too many requests. Please try again in a minute." />, 429);
  }
  await next();
});
app.use("/dashboard", auth);
app.use("/endpoints/*", auth);
app.use("/endpoints", auth);
async function auth(c: import("hono").Context<App>, next: import("hono").Next) {
  const credential =
    c.req.header("authorization")?.replace(/^Bearer /, "") || getCookie(c, "rcve_session");
  const a = credential
    ? await c.env.DB.prepare("SELECT id FROM accounts WHERE token_hash=?")
        .bind(await hash(credential))
        .first<{ id: string }>()
    : null;
  if (!a) return c.redirect("/login");
  c.set("accountId", a.id);
  await next();
}
function session(c: import("hono").Context<App>, value: string) {
  setCookie(c, "rcve_session", value, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
async function list(env: Env) {
  const { results } = await env.DB.prepare(
    "SELECT data FROM advisories ORDER BY published_at DESC",
  ).all<{ data: string }>();
  return results.map((r) => JSON.parse(r.data) as Advisory);
}
async function get(env: Env, id: string) {
  const row = await env.DB.prepare("SELECT data FROM advisories WHERE id=? OR cve=?")
    .bind(id, id)
    .first<{ data: string }>();
  return row ? (JSON.parse(row.data) as Advisory) : null;
}
app.get("/", async (c) => {
  const [advisories, last] = await Promise.all([
    list(c.env),
    c.env.DB.prepare("SELECT value FROM state WHERE key='last_sync'").first<{ value: string }>(),
  ]);
  return c.html(
    <Home
      advisories={advisories}
      lastSync={last?.value || null}
    />,
  );
});
app.get("/advisories", async (c) => {
  const q = (c.req.query("q") || "").slice(0, 200),
    severity = c.req.query("severity") || "all";
  const advisories = (await list(c.env)).filter(
    (a) =>
      (severity === "all" || severity === a.severity) &&
      `${a.cve} ${a.title} ${a.packages.map((p) => p.name).join(" ")}`
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  return c.html(
    <AdvisoryIndex
      advisories={advisories}
      q={q}
      severity={severity}
    />,
  );
});
app.get("/advisories/:id/SKILL.md", async (c) => {
  const a = await get(c.env, c.req.param("id"));
  if (!a) return c.notFound();
  c.header("Content-Type", "text/markdown; charset=utf-8");
  c.header("Content-Disposition", 'attachment; filename="SKILL.md"');
  return c.body(skill(a));
});
app.get("/advisories/:id", async (c) => {
  const a = await get(c.env, c.req.param("id"));
  return a
    ? c.html(
        <Detail
          a={a}
          prompt={skill(a)}
        />,
      )
    : c.notFound();
});
app.get("/api/advisories", async (c) =>
  c.json({ source: "rails/rails", advisories: await list(c.env) }),
);
app.get("/api/advisories/:id", async (c) => {
  const a = await get(c.env, c.req.param("id"));
  return a
    ? c.json({
        advisory: a,
        investigation: {
          prompt: skill(a),
          skill_url: `${c.env.APP_URL}/advisories/${a.id}/SKILL.md`,
        },
      })
    : c.json({ error: "Not found" }, 404);
});
app.get("/api/health", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT key,value FROM state WHERE key IN ('last_sync','sync_error')",
  ).all<{ key: string; value: string }>();
  const state = Object.fromEntries(results.map((r) => [r.key, r.value]));
  const ok =
    !!state.last_sync &&
    Date.now() - Date.parse(state.last_sync) < 20 * 60 * 1000 &&
    !state.sync_error;
  return c.json(
    {
      status: ok ? "ok" : "degraded",
      source: "rails/rails",
      last_sync: state.last_sync || null,
      last_error_at: state.sync_error || null,
    },
    ok ? 200 : 503,
  );
});
app.get("/docs", (c) => c.html(<Docs />));
app.get("/examples/cve-2026-66066.json", (c) => {
  c.header("Content-Type", "application/json; charset=utf-8");
  c.header("Content-Disposition", 'attachment; filename="rails-cve-CVE-2026-66066.json"');
  return c.body(JSON.stringify(examplePayload(c.env.APP_URL), null, 2) + "\n");
});
app.get("/connect", (c) => c.html(<Connect />));
app.get("/login", (c) => c.html(<Connect restore />));
app.post("/accounts", async (c) => {
  const value = token("rcve_");
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO accounts(id,token_hash) VALUES(?,?)")
    .bind(id, await hash(value))
    .run();
  session(c, value);
  return c.html(
    <SecretPage
      title="Your workspace is ready."
      secret={value}
      label="Management token"
    />,
  );
});
app.post("/session", async (c) => {
  const form = await c.req.parseBody();
  const value = String(form.token || "").trim();
  const a = await c.env.DB.prepare("SELECT id FROM accounts WHERE token_hash=?")
    .bind(await hash(value))
    .first();
  if (!a)
    return c.html(
      <Connect
        restore
        error="That token wasn’t recognized. Check your saved management token."
      />,
      401,
    );
  session(c, value);
  return c.redirect("/dashboard", 303);
});
app.post("/logout", (c) => {
  deleteCookie(c, "rcve_session", { path: "/" });
  return c.redirect("/", 303);
});
app.get("/dashboard", async (c) => {
  const [endpoints, deliveries] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM endpoints WHERE account_id=? ORDER BY created_at DESC")
      .bind(c.get("accountId"))
      .all<Endpoint>(),
    c.env.DB.prepare(
      "SELECT d.*,e.name,v.type FROM deliveries d JOIN endpoints e ON e.id=d.endpoint_id JOIN events v ON v.id=d.event_id WHERE e.account_id=? ORDER BY d.created_at DESC LIMIT 30",
    )
      .bind(c.get("accountId"))
      .all<DeliveryView>(),
  ]);
  return c.html(
    <Dashboard
      endpoints={endpoints.results}
      deliveries={deliveries.results}
      message={c.req.query("message")?.slice(0, 250)}
    />,
  );
});
app.post("/endpoints", async (c) => {
  const form = await c.req.parseBody(),
    name = String(form.name || "").trim(),
    url = String(form.url || "").trim();
  if (!name || name.length > 80)
    return c.html(<ErrorPage message="Enter an application name of 1–80 characters." />, 400);
  try {
    endpointURL(url);
  } catch (e) {
    return c.html(<ErrorPage message={(e as Error).message} />, 400);
  }
  const secret = token("whsec_"),
    id = crypto.randomUUID();
  const result = await c.env.DB.prepare(
    "INSERT INTO endpoints(id,account_id,name,url,secret,challenge) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM endpoints WHERE account_id=?)<10",
  )
    .bind(
      id,
      c.get("accountId"),
      name,
      url,
      await seal(secret, c.env.ENCRYPTION_KEY),
      token(),
      c.get("accountId"),
    )
    .run();
  if (!result.meta.changes)
    return c.html(<ErrorPage message="This workspace already has ten connections." />, 400);
  const endpoint = await c.env.DB.prepare("SELECT * FROM endpoints WHERE id=?")
    .bind(id)
    .first<Endpoint>();
  return c.html(
    <SecretPage
      title="Meet your signing secret."
      label="Signing secret"
      secret={secret}
      endpoint={endpoint!}
    />,
  );
});
app.post("/endpoints/:id/:action", async (c) => {
  const e = await c.env.DB.prepare("SELECT * FROM endpoints WHERE id=? AND account_id=?")
    .bind(c.req.param("id"), c.get("accountId"))
    .first<Endpoint>();
  if (!e) return c.notFound();
  let message = "";
  const action = c.req.param("action");
  if (action === "verify") {
    if (e.status !== "pending") return c.redirect("/dashboard", 303);
    try {
      const challenge = token();
      e.challenge = challenge;
      await c.env.DB.prepare("UPDATE endpoints SET challenge=? WHERE id=?")
        .bind(challenge, e.id)
        .run();
      const id = `verify_${crypto.randomUUID()}`;
      const r = await send(
        c.env,
        e,
        JSON.stringify({ schema_version: 1, id, type: "endpoint.verification", challenge }),
        id,
        true,
      );
      if (r.code < 200 || r.code >= 300 || !(await equal(r.body, challenge)))
        throw new Error("Challenge failed");
      const result = await c.env.DB.prepare(
        "UPDATE endpoints SET status='active' WHERE id=? AND status='pending' AND challenge=?",
      )
        .bind(e.id, challenge)
        .run();
      message = result.meta.changes
        ? "Endpoint verified. You’re ready for the next advisory."
        : "Another verification superseded this request. Try again.";
    } catch {
      message =
        "Verification failed. Return the signed challenge verbatim as plain text with a 2xx status. Check that your endpoint is public HTTPS.";
    }
  } else if (action === "test") {
    if (e.status !== "active")
      return c.html(
        <ErrorPage message="Verify and activate this endpoint before sending a test." />,
        400,
      );
    await enqueueTest(c.env, e);
    c.executionCtx.waitUntil(drain(c.env));
    message = "Test queued. Refresh shortly to see delivery status.";
  } else if (action === "toggle") {
    await c.env.DB.prepare(
      "UPDATE endpoints SET status=CASE status WHEN 'active' THEN 'paused' WHEN 'paused' THEN 'active' ELSE status END WHERE id=?",
    )
      .bind(e.id)
      .run();
    message = "Connection updated.";
  } else if (action === "delete") {
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM deliveries WHERE endpoint_id=?").bind(e.id),
      c.env.DB.prepare("DELETE FROM endpoints WHERE id=?").bind(e.id),
    ]);
    message = "Connection and delivery history deleted.";
  } else return c.notFound();
  return c.redirect(`/dashboard?message=${encodeURIComponent(message)}`, 303);
});
app.post("/api/admin/sync", async (c) => {
  const value = c.req.header("authorization")?.replace(/^Bearer /, "") || "";
  if (!c.env.ADMIN_TOKEN || !(await equal(value, c.env.ADMIN_TOKEN)))
    return c.json({ error: "Unauthorized" }, 401);
  const result = await sync(c.env);
  await drain(c.env);
  return c.json(result);
});
app.get("*", async (c) => {
  const path = new URL(c.req.url).pathname;
  if (
    [
      "/style.css",
      "/app.js",
      "/favicon.svg",
      "/og/rails-cve-v1.jpg",
      "/receiver.rb",
      "/InterVariable.woff2",
      "/Inter-LICENSE.txt",
    ].includes(path)
  )
    return c.env.ASSETS.fetch(c.req.raw);
  return c.html(<ErrorPage message="We couldn’t find that page." />, 404);
});
app.onError((err, c) => {
  console.error(JSON.stringify({ event: "request_failed", name: err.name }));
  return c.html(
    <ErrorPage message="The request couldn’t be completed. Please try again shortly." />,
    500,
  );
});
export default {
  fetch: app.fetch,
  async scheduled(_event, env, _ctx) {
    try {
      await sync(env);
    } finally {
      await drain(env);
    }
  },
  async email(message, env, _ctx) {
    // Mail can only request a canonical sync; never trust a sender or email body as advisory data.
    if (!message.headers.get("list-id")?.includes("rubyonrails-security.googlegroups.com")) {
      message.setReject("Only Rails security list notifications are accepted.");
      return;
    }
    const last = await env.DB.prepare("SELECT value FROM state WHERE key='last_sync'").first<{
      value: string;
    }>();
    if (last && Date.now() - Date.parse(last.value) < 240_000) return;
    await sync(env);
    await drain(env);
  },
} satisfies ExportedHandler<Env>;
