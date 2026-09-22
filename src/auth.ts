import type { Context, Next } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { hash, token } from "./security";
export type App = { Bindings: Env; Variables: { accountId: string } };
export type Account = {
  id: string;
  name: string;
  github_id: string | null;
  github_login: string | null;
};
export async function currentAccount(c: Context<App>) {
  // An invalid Authorization header must not fall back to the browser cookie.
  const header = c.req.header("authorization");
  const credential =
    header !== undefined ? /^Bearer (.+)$/.exec(header)?.[1] || "" : getCookie(c, "rcve_session");
  if (!credential) return null;
  const digest = await hash(credential);
  return c.env.DB.prepare(
    "SELECT a.* FROM accounts a WHERE a.token_hash=? OR a.id IN (SELECT account_id FROM sessions WHERE token_hash=? AND expires_at>?)",
  )
    .bind(digest, digest, Date.now())
    .first<Account>();
}
export async function auth(c: Context<App>, next: Next) {
  const account = await currentAccount(c);
  if (!account) return c.redirect("/login");
  c.set("accountId", account.id);
  await next();
}
export async function session(c: Context<App>, accountId: string) {
  const value = token("session_");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM sessions WHERE expires_at<=?").bind(Date.now()),
    c.env.DB.prepare("INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(?,?,?)").bind(
      await hash(value),
      accountId,
      Date.now() + 30 * 86400_000,
    ),
  ]);
  setCookie(c, "rcve_session", value, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: 30 * 86400,
  });
}
export function githubEnabled(env: Env) {
  return !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
}
