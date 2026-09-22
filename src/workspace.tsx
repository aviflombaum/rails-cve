import { Hono } from "hono";
import { auth, githubEnabled, currentAccount, credential, session, type App } from "./auth";
import { hash, token } from "./security";
import { emailEnabled, requestVerification, type EmailAddressRow } from "./email";
import type { Endpoint } from "./delivery";
import { SecretPage, ErrorPage } from "./views";
import { Settings, ConfirmEmail, Events, EventDetail, type DeliveryView } from "./workspace-views";
const routes = new Hono<App>();
routes.use("/settings", auth);
routes.use("/settings/*", auth);
routes.use("/events", auth);
routes.use("/events/*", auth);
export async function addresses(env: Env, accountId: string) {
  return (
    await env.DB.prepare(
      "SELECT id,account_id,address,verified_at FROM email_addresses WHERE account_id=? ORDER BY address",
    )
      .bind(accountId)
      .all<EmailAddressRow>()
  ).results;
}
routes.get("/settings", async (c) => {
  const account = await currentAccount(c);
  return c.html(
    <Settings
      account={account!}
      emails={await addresses(c.env, account!.id)}
      github={githubEnabled(c.env)}
      email={emailEnabled(c.env)}
      message={c.req.query("message")?.slice(0, 250)}
    />,
  );
});
routes.post("/settings", async (c) => {
  const form = await c.req.parseBody(),
    name = String(form.name || "").trim();
  if (name.length > 80)
    return c.html(<ErrorPage message="Use a display name of at most 80 characters." />, 400);
  await c.env.DB.prepare("UPDATE accounts SET name=? WHERE id=?")
    .bind(name, c.get("accountId"))
    .run();
  return c.redirect("/settings?message=Settings%20saved.", 303);
});
routes.post("/settings/token", async (c) => {
  const form = await c.req.parseBody();
  const value = token("rcve_");
  const proof = String(
    form.current_token || c.req.header("authorization")?.replace(/^Bearer /, "") || "",
  );
  const version = await c.env.DB.prepare(
    "UPDATE accounts SET token_hash=?,auth_version=auth_version+1,github_id=CASE WHEN ? THEN NULL ELSE github_id END,github_login=CASE WHEN ? THEN NULL ELSE github_login END WHERE id=? AND auth_version=? AND (token_hash=? OR EXISTS(SELECT 1 FROM sessions s WHERE s.account_id=accounts.id AND s.auth_version=accounts.auth_version AND s.token_hash=? AND s.expires_at>? AND s.recovery_until>?)) RETURNING auth_version",
  )
    .bind(
      await hash(value),
      form.unlink_github === "on" ? 1 : 0,
      form.unlink_github === "on" ? 1 : 0,
      c.get("accountId"),
      c.get("authVersion"),
      await hash(proof),
      await hash(credential(c)),
      Date.now(),
      Date.now(),
    )
    .first<number>("auth_version");
  if (version === null)
    return c.html(
      <ErrorPage message="Enter your current management token or freshly confirm your linked GitHub identity in settings. No credentials were changed." />,
      403,
    );
  // The version switch already revoked old credentials. Cleanup cannot delete a newer session.
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM sessions WHERE account_id=? AND auth_version<?").bind(
      c.get("accountId"),
      version,
    ),
    c.env.DB.prepare("DELETE FROM oauth_states WHERE account_id=? AND auth_version<?").bind(
      c.get("accountId"),
      version,
    ),
  ]);
  await session(c, c.get("accountId"), version);
  return c.html(
    <SecretPage
      title="Save your new recovery token."
      label="Management token"
      secret={value}
    />,
  );
});
routes.post("/settings/email", async (c) => {
  const form = await c.req.parseBody();
  try {
    await requestVerification(c.env, c.get("accountId"), String(form.email || ""));
  } catch (error) {
    return c.html(<ErrorPage message={(error as Error).message} />, 400);
  }
  return c.redirect("/settings?message=Check%20your%20inbox%20for%20a%20confirmation%20link.", 303);
});
routes.get("/settings/email/confirm", (c) =>
  c.html(<ConfirmEmail token={(c.req.query("token") || "").slice(0, 128)} />),
);
routes.post("/settings/email/confirm", async (c) => {
  const form = await c.req.parseBody();
  const row = await c.env.DB.prepare(
    "UPDATE email_addresses SET verified_at=?,token_hash=NULL,expires_at=NULL WHERE account_id=? AND token_hash=? AND expires_at>? AND verified_at IS NULL RETURNING id",
  )
    .bind(
      new Date().toISOString(),
      c.get("accountId"),
      await hash(String(form.token || "")),
      Date.now(),
    )
    .first();
  if (!row)
    return c.html(
      <ErrorPage message="This confirmation link is expired, already used, or belongs to another workspace. Sign into the requesting workspace, or request another email." />,
      400,
    );
  return c.redirect(
    "/settings?message=Email%20verified.%20You%20can%20now%20select%20it%20for%20an%20app.",
    303,
  );
});
routes.post("/settings/email/:id/remove", async (c) => {
  const id = c.req.param("id"),
    account = c.get("accountId");
  const email = await c.env.DB.prepare("SELECT id FROM email_addresses WHERE id=? AND account_id=?")
    .bind(id, account)
    .first();
  if (!email) return c.notFound();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE deliveries SET status='cancelled',lease=NULL,error='Notification address removed' WHERE email_id=? AND status IN ('pending','retry','sending')",
    ).bind(id),
    c.env.DB.prepare(
      "UPDATE endpoints SET email_id=NULL,status=CASE WHEN status='paused' THEN 'paused' WHEN delivery_mode<>'email' AND webhook_verified=1 THEN 'active' ELSE 'pending' END WHERE email_id=? AND account_id=?",
    ).bind(id, account),
    c.env.DB.prepare("UPDATE deliveries SET email_id=NULL WHERE email_id=?").bind(id),
    c.env.DB.prepare("DELETE FROM email_addresses WHERE id=? AND account_id=?").bind(id, account),
  ]);
  return c.redirect(
    "/settings?message=Address%20removed.%20Choose%20a%20replacement%20for%20affected%20apps.",
    303,
  );
});
routes.get("/events", async (c) => {
  const query = {
    app: (c.req.query("app") || "").slice(0, 100),
    channel: (c.req.query("channel") || "").slice(0, 20),
    status: (c.req.query("status") || "").slice(0, 20),
  };
  const page = Math.max(1, Math.min(10000, Number.parseInt(c.req.query("page") || "1", 10) || 1));
  const rows = await c.env.DB.prepare(
    "SELECT d.*,e.name,v.type FROM deliveries d JOIN endpoints e ON e.id=d.endpoint_id JOIN events v ON v.id=d.event_id WHERE e.account_id=? AND (?='' OR e.id=?) AND (?='' OR d.channel=?) AND (?='' OR d.status=?) ORDER BY d.created_at DESC,d.id DESC LIMIT 31 OFFSET ?",
  )
    .bind(
      c.get("accountId"),
      query.app,
      query.app,
      query.channel,
      query.channel,
      query.status,
      query.status,
      (page - 1) * 30,
    )
    .all<DeliveryView>();
  const endpoints = await c.env.DB.prepare(
    "SELECT * FROM endpoints WHERE account_id=? ORDER BY name",
  )
    .bind(c.get("accountId"))
    .all<Endpoint>();
  return c.html(
    <Events
      deliveries={rows.results.slice(0, 30)}
      endpoints={endpoints.results}
      query={query}
      page={page}
      more={rows.results.length > 30}
    />,
  );
});
routes.get("/events/:id", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT d.*,e.name,v.type,v.payload FROM deliveries d JOIN endpoints e ON e.id=d.endpoint_id JOIN events v ON v.id=d.event_id WHERE d.id=? AND e.account_id=?",
  )
    .bind(c.req.param("id"), c.get("accountId"))
    .first<DeliveryView>();
  if (!row) return c.notFound();
  const attempts = await c.env.DB.prepare(
    "SELECT * FROM delivery_attempts WHERE delivery_id=? ORDER BY attempt",
  )
    .bind(row.id)
    .all<{
      attempt: number;
      status: string;
      response_code: number | null;
      error: string | null;
      created_at: string;
    }>();
  return c.html(
    <EventDetail
      delivery={row}
      attempts={attempts.results}
    />,
  );
});
export default routes;
