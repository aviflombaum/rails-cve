import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { currentAccount, githubEnabled, session, type App, type Account } from "./auth";
import { boundedText, hash, token } from "./security";
const routes = new Hono<App>();
type FailureStage =
  | "configuration"
  | "browser"
  | "state"
  | "authorization"
  | "account_changed"
  | "token"
  | "profile"
  | "account"
  | "session";
function fail(stage: FailureStage, status?: number) {
  const reference = crypto.randomUUID();
  // Never log provider bodies, URLs, codes, state, cookies, or exception messages.
  console.warn({ event: "github_signin_failed", stage, reference, ...(status ? { status } : {}) });
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>GitHub sign-in · Rails CVE</title><link rel="stylesheet" href="/style.css"><main class="shell"><h1>GitHub sign-in could not be completed.</h1><p>Start a fresh sign-in in the same browser. Sign-in links expire after ten minutes and can only be used once.</p><p><a href="/login">Return to sign in</a> · <a href="/settings">Return to settings</a></p><p>If it happens again, share this reference: <code>${stage}: ${reference}</code></p></main></html>`,
    { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
routes.post("/auth/github", async (c) => {
  if (!githubEnabled(c.env))
    return c.text("GitHub sign-in is not configured on this deployment.", 503);
  const account = await currentAccount(c);
  const state = token(),
    browser = token(),
    verifier = token();
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  const challenge = btoa(String.fromCharCode(...digest))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM oauth_states WHERE expires_at<=?").bind(Date.now()),
    c.env.DB.prepare(
      "INSERT INTO oauth_states(state_hash,browser_hash,verifier,account_id,expires_at) VALUES(?,?,?,?,?)",
    ).bind(
      await hash(state),
      await hash(browser),
      verifier,
      account?.id || null,
      Date.now() + 600_000,
    ),
  ]);
  setCookie(c, "rcve_oauth", browser, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/auth/github",
    maxAge: 600,
  });
  // Upgrade legacy SameSite=Strict capability cookies before leaving our origin.
  // Linking still requires the same authenticated account on the callback.
  if (account) await session(c, account.id);
  const url = new URL("https://github.com/login/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: c.env.GITHUB_CLIENT_ID!,
    redirect_uri: `${c.env.APP_URL}/auth/github/callback`,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return c.redirect(url.toString(), 303);
});
routes.get("/auth/github/callback", async (c) => {
  if (!githubEnabled(c.env)) return fail("configuration");
  const browser = getCookie(c, "rcve_oauth"),
    state = c.req.query("state"),
    code = c.req.query("code");
  if (!browser || !state || state.length > 128) return fail("browser");
  const row = await c.env.DB.prepare(
    "DELETE FROM oauth_states WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING *",
  )
    .bind(await hash(state), await hash(browser), Date.now())
    .first<{ account_id: string | null; verifier: string }>();
  deleteCookie(c, "rcve_oauth", { path: "/auth/github" });
  if (!row) return fail("state");
  if (!code || code.length > 512 || c.req.query("error")) return fail("authorization");
  const current = await currentAccount(c);
  if ((row.account_id || null) !== (current?.id || null)) return fail("account_changed");
  let stage: FailureStage = "token";
  try {
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Rails-CVE/1.0",
      },
      body: JSON.stringify({
        client_id: c.env.GITHUB_CLIENT_ID,
        client_secret: c.env.GITHUB_CLIENT_SECRET,
        code,
        code_verifier: row.verifier,
        redirect_uri: `${c.env.APP_URL}/auth/github/callback`,
      }),
    });
    const credentials = JSON.parse(await boundedText(res, 16384));
    if (!res.ok || typeof credentials.access_token !== "string" || credentials.error)
      return fail("token", res.status);
    stage = "profile";
    const userResponse = await fetch("https://api.github.com/user", {
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${credentials.access_token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "Rails-CVE/1.0",
      },
    });
    const user = JSON.parse(await boundedText(userResponse, 32768));
    if (
      !userResponse.ok ||
      !Number.isSafeInteger(user.id) ||
      user.id <= 0 ||
      typeof user.login !== "string" ||
      user.login.length > 100
    )
      return fail("profile", userResponse.status);
    stage = "account";
    const githubId = String(user.id);
    let account = await c.env.DB.prepare("SELECT * FROM accounts WHERE github_id=?")
      .bind(githubId)
      .first<Account>();
    if (row.account_id) {
      if (
        (account && account.id !== row.account_id) ||
        (current?.github_id && current.github_id !== githubId)
      )
        return c.text(
          "That GitHub identity or workspace is already linked. No accounts were merged.",
          409,
        );
      await c.env.DB.prepare(
        "UPDATE accounts SET github_id=?,github_login=? WHERE id=? AND (github_id IS NULL OR github_id=?)",
      )
        .bind(githubId, user.login, row.account_id, githubId)
        .run();
      account = current;
    } else if (!account) {
      // Conflict-safe concurrent first login. Never merge by email or display name.
      await c.env.DB.prepare(
        "INSERT OR IGNORE INTO accounts(id,token_hash,name,github_id,github_login) VALUES(?,?,?,?,?)",
      )
        .bind(crypto.randomUUID(), await hash(token()), user.login, githubId, user.login)
        .run();
      account = await c.env.DB.prepare("SELECT * FROM accounts WHERE github_id=?")
        .bind(githubId)
        .first<Account>();
    } else {
      await c.env.DB.prepare("UPDATE accounts SET github_login=? WHERE id=?")
        .bind(user.login, account.id)
        .run();
    }
    if (!account) return fail("account");
    stage = "session";
    await session(c, account.id);
    return c.redirect(
      "/settings?message=GitHub%20connected.%20Choose%20your%20notification%20preferences.",
      303,
    );
  } catch {
    return fail(stage);
  }
});
export default routes;
