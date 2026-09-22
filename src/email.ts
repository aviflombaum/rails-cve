import { smtpSend } from "./smtp";
import { hash, token } from "./security";
export type EmailAddressRow = {
  id: string;
  account_id: string;
  address: string;
  verified_at: string | null;
};
export function emailEnabled(env: Env) {
  if (!env.EMAIL_FROM || env.EMAIL_TRANSPORT === "disabled") return false;
  return env.EMAIL_TRANSPORT === "smtp"
    ? !!(
        env.SMTP_HOST &&
        env.SMTP_USERNAME &&
        env.SMTP_PASSWORD &&
        (!env.SMTP_PORT || env.SMTP_PORT === "465")
      )
    : !!env.EMAIL;
}
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
export async function sendMail(
  env: Env,
  to: string,
  subject: string,
  text: string,
  action?: { href: string; label: string },
) {
  if (!emailEnabled(env)) throw new Error("Email sending is not configured");
  const message = {
    from: env.EMAIL_FROM!,
    to,
    subject: subject.replace(/[\r\n]/g, " ").slice(0, 200),
    text,
    html: `<div style="font-family:system-ui;max-width:640px;margin:auto"><h1 style="color:#c71920">Rails CVE</h1><div style="white-space:pre-wrap">${escape(text)}</div>${action ? `<p><a style="color:#c71920;font-weight:600" href="${escape(action.href)}">${escape(action.label)}</a></p>` : ""}</div>`,
  };
  return env.EMAIL_TRANSPORT === "smtp" ? smtpSend(env, message) : env.EMAIL!.send(message);
}
export async function requestVerification(env: Env, accountId: string, input: string) {
  if (!emailEnabled(env)) throw new Error("Email sending is not configured on this deployment.");
  const address = input.trim().toLowerCase();
  if (
    address.length > 254 ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(address)
  )
    throw new Error("Enter a valid email address.");
  const existing = await env.DB.prepare(
    "SELECT * FROM email_addresses WHERE account_id=? AND address=?",
  )
    .bind(accountId, address)
    .first<EmailAddressRow>();
  if (existing?.verified_at) return;
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM email_addresses WHERE account_id=?")
    .bind(accountId)
    .first<{ n: number }>();
  if (!existing && count!.n >= 5)
    throw new Error("You can save up to five notification addresses.");
  const cooldown = await env.DB.prepare(
    "INSERT INTO email_cooldowns(address_hash,sent_at) VALUES(?,?) ON CONFLICT(address_hash) DO UPDATE SET sent_at=excluded.sent_at WHERE sent_at<? RETURNING address_hash",
  )
    .bind(await hash(address), Date.now(), Date.now() - 900_000)
    .first();
  if (!cooldown)
    throw new Error(
      "A verification was requested recently. Check your inbox or try again in 15 minutes.",
    );
  const secret = token(),
    id = existing?.id || crypto.randomUUID();
  const added = await env.DB.prepare(
    "INSERT INTO email_addresses(id,account_id,address,token_hash,expires_at) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM email_addresses WHERE account_id=?)<5 ON CONFLICT(account_id,address) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at WHERE verified_at IS NULL RETURNING id",
  )
    .bind(id, accountId, address, await hash(secret), Date.now() + 3600_000, accountId)
    .first();
  // At capacity, an existing pending address may still request a new token.
  if (!added && existing)
    await env.DB.prepare(
      "UPDATE email_addresses SET token_hash=?,expires_at=? WHERE id=? AND verified_at IS NULL",
    )
      .bind(await hash(secret), Date.now() + 3600_000, id)
      .run();
  if (!added && !existing) throw new Error("You can save up to five notification addresses.");
  try {
    await sendMail(
      env,
      address,
      "Confirm your Rails CVE notification address",
      `Confirm this address for security notifications:\n\n${env.APP_URL}/settings/email/confirm?token=${secret}\n\nSign in to the workspace that requested this address, then confirm. This link expires in one hour. If you didn't request this, ignore this message. No advisories will be sent until you confirm.`,
      {
        href: `${env.APP_URL}/settings/email/confirm?token=${secret}`,
        label: "Confirm notification address",
      },
    );
  } catch {
    throw new Error("The verification email could not be sent. Please try again in 15 minutes.");
  }
}
export async function sendAdvisoryEmail(
  env: Env,
  address: string,
  name: string,
  eventId: string,
  payload: string,
) {
  const data = JSON.parse(payload);
  const advisory = data.advisory;
  const title = advisory?.title || "Connection test";
  const text = [
    `${name}: ${title}`,
    `Event: ${eventId} (${data.type})`,
    advisory
      ? `Severity: ${advisory.severity}\n${advisory.url || advisory.source_url || ""}`
      : data.message,
    `\nInvestigation brief\n${data.investigation?.prompt || "This is a test notification, not a security advisory."}`,
    `\nManage this app, pause delivery, or change channels: ${env.APP_URL}/dashboard`,
    `Delivery accepted by email provider does not confirm inbox receipt. Your agent must obtain approval before code changes, production access, secret rotation, merge, or deploy.`,
  ].join("\n\n");
  return sendMail(env, address, `[Rails CVE] ${name}: ${advisory?.cve || title}`, text, {
    href: `${env.APP_URL}/dashboard`,
    label: "Manage notification preferences",
  });
}
