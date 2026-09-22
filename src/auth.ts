import type { Context, Next } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { hash, token } from "./security";
export type App = { Bindings: Env; Variables: { accountId: string; authVersion: number } };
export type Account = {
  id: string;
  name: string;
  github_id: string | null;
  github_login: string | null;
  auth_version: number;
  recovery_ready?: number;
};
export function credential(c: Context<App>) {
  const header = c.req.header("authorization");
  // An invalid Authorization header must not fall back to the browser cookie.
  return header !== undefined
    ? /^Bearer (.+)$/.exec(header)?.[1] || ""
    : getCookie(c, "rcve_session") || "";
}
export async function currentAccount(c: Context<App>) {
  const value = credential(c);
  if (!value) return null;
  const digest = await hash(value);
  return c.env.DB.prepare(
    "SELECT a.*, EXISTS(SELECT 1 FROM sessions s WHERE s.account_id=a.id AND s.token_hash=? AND s.auth_version=a.auth_version AND s.expires_at>? AND s.recovery_until>?) AS recovery_ready FROM accounts a WHERE a.token_hash=? OR EXISTS(SELECT 1 FROM sessions s WHERE s.account_id=a.id AND s.token_hash=? AND s.expires_at>? AND s.auth_version=a.auth_version)",
  )
    .bind(digest, Date.now(), Date.now(), digest, digest, Date.now())
    .first<Account>();
}
export async function auth(c: Context<App>, next: Next) {
  const account = await currentAccount(c);
  if (!account) return c.redirect("/login");
  c.set("accountId", account.id);
  c.set("authVersion", account.auth_version);
  await next();
}
export async function session(c: Context<App>, accountId: string, version = 0, recovery = false) {
  const value = token("session_");
  const result = await c.env.DB.prepare(
    "INSERT INTO sessions(token_hash,account_id,expires_at,auth_version,recovery_until) SELECT ?,id,?,auth_version,? FROM accounts WHERE id=? AND auth_version=?",
  )
    .bind(
      await hash(value),
      Date.now() + 30 * 86400_000,
      recovery ? Date.now() + 300_000 : 0,
      accountId,
      version,
    )
    .run();
  if (!result.meta.changes) throw new Error("Authentication changed; sign in again");
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
