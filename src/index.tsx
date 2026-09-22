import { IntegrationIndex, IntegrationGuide } from "./integration-views";
import { Hono } from "hono";
import { contextStorage } from "hono/context-storage";
import { examplePayload } from "./examples";
import { getCookie, deleteCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { sync, skill, type Advisory } from "./advisories";
import { drain, send, enqueueTest, type Endpoint } from "./delivery";
import { token, hash, equal, seal, endpointURL } from "./security";
import { Home, AdvisoryIndex, Detail, Connect, SecretPage, ErrorPage, Docs } from "./views";
import { auth, session, githubEnabled, type App } from "./auth";
import oauth from "./oauth";
import workspace, { addresses } from "./workspace";
import { Dashboard } from "./workspace-views";
import { emailEnabled } from "./email";
const app = new Hono<App>();
app.use("*", contextStorage());
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "same-origin");
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self' https://github.com",
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
app.get("/integrations", (c) => c.html(<IntegrationIndex />));
app.get("/integrations/:slug", (c) => {
  const slug = c.req.param("slug");
  return slug === "openclaw" || slug === "hermes" || slug === "self-host"
    ? c.html(<IntegrationGuide slug={slug} />)
    : c.notFound();
});
app.get("/docs", (c) => c.html(<Docs />));
app.get("/examples/cve-2026-66066.json", (c) => {
  c.header("Content-Type", "application/json; charset=utf-8");
  c.header("Content-Disposition", 'attachment; filename="rails-cve-CVE-2026-66066.json"');
  return c.body(JSON.stringify(examplePayload(c.env.APP_URL), null, 2) + "\n");
});
app.get("/connect", (c) => c.html(<Connect github={githubEnabled(c.env)} />));
app.get("/login", (c) =>
  c.html(
    <Connect
      restore
      github={githubEnabled(c.env)}
    />,
  ),
);
app.post("/accounts", async (c) => {
  const value = token("rcve_");
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO accounts(id,token_hash) VALUES(?,?)")
    .bind(id, await hash(value))
    .run();
  await session(c, id);
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
  const a = await c.env.DB.prepare("SELECT id,auth_version FROM accounts WHERE token_hash=?")
    .bind(await hash(value))
    .first<{ id: string; auth_version: number }>();
  if (!a)
    return c.html(
      <Connect
        restore
        error="That token wasn’t recognized. Check your saved management token."
      />,
      401,
    );
  await session(c, a.id, a.auth_version);
  return c.redirect("/settings", 303);
});
app.post("/logout", async (c) => {
  const credential = getCookie(c, "rcve_session");
  if (credential)
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(await hash(credential))
      .run();
  deleteCookie(c, "rcve_session", { path: "/" });
  return c.redirect("/", 303);
});
app.get("/dashboard", async (c) => {
  const endpoints = await c.env.DB.prepare(
    "SELECT e.*,m.address AS email_address FROM endpoints e LEFT JOIN email_addresses m ON m.id=e.email_id WHERE e.account_id=? ORDER BY e.created_at DESC",
  )
    .bind(c.get("accountId"))
    .all<Endpoint>();
  return c.html(
    <Dashboard
      endpoints={endpoints.results}
      emails={await addresses(c.env, c.get("accountId"))}
      email={emailEnabled(c.env)}
      message={c.req.query("message")?.slice(0, 250)}
    />,
  );
});
async function preferences(c: import("hono").Context<App>) {
  const form = await c.req.parseBody();
  const name = String(form.name || "").trim(),
    url = String(form.url || "").trim(),
    mode = String(form.delivery_mode || "webhook"),
    emailId = String(form.email_id || "");
  if (!name || name.length > 80) throw new Error("Enter an app name of 1–80 characters.");
  if (!["webhook", "email", "both"].includes(mode))
    throw new Error("Choose webhook, email, or both.");
  if (url || mode !== "email") endpointURL(url);
  if (mode !== "webhook") {
    if (!emailEnabled(c.env))
      throw new Error("Email delivery is not configured on this deployment.");
    const email = await c.env.DB.prepare(
      "SELECT id FROM email_addresses WHERE id=? AND account_id=? AND verified_at IS NOT NULL",
    )
      .bind(emailId, c.get("accountId"))
      .first();
    if (!email) throw new Error("Select a verified email address from your settings.");
  }
  return { name, url, mode, emailId: mode === "webhook" ? null : emailId };
}
app.post("/endpoints", async (c) => {
  let config;
  try {
    config = await preferences(c);
  } catch (error) {
    return c.html(<ErrorPage message={(error as Error).message} />, 400);
  }
  const { name, url, mode, emailId } = config;
  const secret = token("whsec_"),
    id = crypto.randomUUID();
  const result = await c.env.DB.prepare(
    "INSERT INTO endpoints(id,account_id,name,url,secret,challenge,delivery_mode,email_id,status) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM endpoints WHERE account_id=?)<10",
  )
    .bind(
      id,
      c.get("accountId"),
      name,
      url,
      await seal(secret, c.env.ENCRYPTION_KEY),
      token(),
      mode,
      emailId,
      mode === "webhook" ? "pending" : "active",
      c.get("accountId"),
    )
    .run();
  if (!result.meta.changes)
    return c.html(<ErrorPage message="This workspace already has ten connections." />, 400);
  if (mode === "email" && !url)
    return c.redirect("/dashboard?message=App%20subscribed%20to%20email%20notifications.", 303);
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
  if (action === "settings") {
    let config;
    try {
      config = await preferences(c);
    } catch (error) {
      return c.html(<ErrorPage message={(error as Error).message} />, 400);
    }
    const changed = config.url !== e.url,
      secret = token("whsec_");
    const status =
      e.status === "paused"
        ? "paused"
        : config.mode === "webhook" && (changed || !e.webhook_verified)
          ? "pending"
          : "active";
    await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE endpoints SET name=?,url=?,delivery_mode=?,email_id=?,status=?,webhook_verified=?,secret=?,challenge=? WHERE id=? AND account_id=?",
      ).bind(
        config.name,
        config.url,
        config.mode,
        config.emailId,
        status,
        changed ? 0 : e.webhook_verified,
        changed ? await seal(secret, c.env.ENCRYPTION_KEY) : e.secret,
        changed ? token() : e.challenge,
        e.id,
        c.get("accountId"),
      ),
      c.env.DB.prepare(
        "UPDATE deliveries SET status='cancelled',lease=NULL,error='Delivery settings changed' WHERE endpoint_id=? AND status IN ('pending','retry','sending') AND ((channel='webhook' AND (?='email' OR ?=1)) OR (channel='email' AND (?='webhook' OR email_id IS NOT ?)))",
      ).bind(e.id, config.mode, changed ? 1 : 0, config.mode, config.emailId),
    ]);
    if (changed && config.url)
      return c.html(
        <SecretPage
          title="Save your new signing secret."
          label="Signing secret"
          secret={secret}
          endpoint={{ ...e, url: config.url }}
        />,
      );
    return c.redirect("/dashboard?message=Delivery%20settings%20saved.", 303);
  } else if (action === "verify") {
    if (e.webhook_verified || e.delivery_mode === "email" || !e.url)
      return c.redirect("/dashboard", 303);
    try {
      const challenge = token();
      e.challenge = challenge;
      const challengeUpdate = await c.env.DB.prepare(
        "UPDATE endpoints SET challenge=? WHERE id=? AND url=? AND secret=? AND webhook_verified=0",
      )
        .bind(challenge, e.id, e.url, e.secret)
        .run();
      if (!challengeUpdate.meta.changes)
        return c.redirect(
          "/dashboard?message=The%20webhook%20changed.%20Verify%20its%20current%20destination.",
          303,
        );
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
        "UPDATE endpoints SET webhook_verified=1,status=CASE WHEN status='pending' THEN 'active' ELSE status END WHERE id=? AND webhook_verified=0 AND challenge=? AND url=? AND secret=?",
      )
        .bind(e.id, challenge, e.url, e.secret)
        .run();
      message = result.meta.changes
        ? "Endpoint verified. You’re ready for the next advisory."
        : "Another verification superseded this request. Try again.";
    } catch {
      message =
        "Verification failed. Return the signed challenge verbatim as plain text with a 2xx status. Check that your endpoint is public HTTPS.";
    }
  } else if (action === "test") {
    const eligibleEmail =
      e.delivery_mode !== "webhook" && emailEnabled(c.env) && e.email_id
        ? await c.env.DB.prepare(
            "SELECT id FROM email_addresses WHERE id=? AND account_id=? AND verified_at IS NOT NULL",
          )
            .bind(e.email_id, e.account_id)
            .first()
        : null;
    const eligibleWebhook = e.delivery_mode !== "email" && e.webhook_verified;
    if (e.status !== "active" || (!eligibleEmail && !eligibleWebhook))
      return c.html(
        <ErrorPage message="Activate this app and verify at least one configured destination before sending a test." />,
        400,
      );
    await enqueueTest(c.env, e);
    c.executionCtx.waitUntil(drain(c.env));
    message = "Test queued. Refresh shortly to see delivery status.";
  } else if (action === "toggle") {
    await c.env.DB.prepare(
      "UPDATE endpoints SET status=CASE WHEN status='paused' THEN CASE WHEN delivery_mode='webhook' AND webhook_verified=0 THEN 'pending' ELSE 'active' END ELSE 'paused' END WHERE id=?",
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
app.route("/", oauth);
app.route("/", workspace);
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
