export class BudgetError extends Error {
  constructor(
    message = "This operation has reached its hourly budget. Please try again next hour.",
  ) {
    super(message);
    this.name = "BudgetError";
  }
}
// Fixed, reviewable per-hour ceilings. Global caps include all tenant/IP traffic.
export const budgets = {
  signup: [25, 0],
  verification_email: [100, 5],
  verification_webhook: [100, 10],
  test: [50, 5],
  delivery: [300, 60],
  oauth: [300, 20],
} as const;
export type Operation = keyof typeof budgets;
export async function reserve(env: Env, operation: Operation, account?: string) {
  if (
    (operation === "signup" && env.SIGNUPS_ENABLED === "false") ||
    (operation === "verification_email" && env.VERIFICATIONS_ENABLED === "false") ||
    (operation === "verification_webhook" && env.VERIFICATIONS_ENABLED === "false") ||
    ((operation === "test" || operation === "delivery") && env.DELIVERY_ENABLED === "false")
  )
    throw new BudgetError("The operator has temporarily paused this operation.");
  const window = Math.floor(Date.now() / 3600000) * 3600000;
  const [global, local] = budgets[operation];
  // Consume the account reservation first so a single capped tenant cannot burn
  // the remaining service budget. Reservations are conservative, never refunded.
  for (const [scope, limit] of [
    ...(account && local ? [[account, local] as const] : []),
    ["global", global] as const,
  ]) {
    const row = await env.DB.prepare(
      "INSERT INTO usage_buckets(operation,scope,window_start,used) VALUES(?,?,?,1) ON CONFLICT(operation,scope,window_start) DO UPDATE SET used=used+1 WHERE used<? RETURNING used",
    )
      .bind(operation, scope, window, limit)
      .first();
    if (!row) throw new BudgetError();
  }
}

export async function maintain(env: Env) {
  const now = Date.now(),
    cutoff = now - 30 * 86400000;
  // Bounded batches; never remove a live pending/retry/sending notification.
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE deliveries SET completed_at=? WHERE id IN (SELECT id FROM deliveries WHERE status IN ('delivered','accepted','failed','cancelled') AND completed_at IS NULL LIMIT 500)",
    ).bind(now),
    env.DB.prepare(
      "DELETE FROM deliveries WHERE id IN (SELECT id FROM deliveries WHERE completed_at<? AND status IN ('delivered','accepted','failed','cancelled') LIMIT 500)",
    ).bind(cutoff),
    env.DB.prepare(
      "DELETE FROM events WHERE id IN (SELECT id FROM events WHERE type='endpoint.test' AND created_at<? AND NOT EXISTS(SELECT 1 FROM deliveries d WHERE d.event_id=events.id) LIMIT 500)",
    ).bind(new Date(cutoff).toISOString()),
    env.DB.prepare(
      "DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE expires_at<=? LIMIT 500)",
    ).bind(now),
    env.DB.prepare(
      "DELETE FROM oauth_states WHERE state_hash IN (SELECT state_hash FROM oauth_states WHERE expires_at<=? LIMIT 500)",
    ).bind(now),
    env.DB.prepare(
      "DELETE FROM email_cooldowns WHERE address_hash IN (SELECT address_hash FROM email_cooldowns WHERE sent_at<? LIMIT 500)",
    ).bind(now - 86400000),
    env.DB.prepare(
      "DELETE FROM email_addresses WHERE id IN (SELECT id FROM email_addresses m WHERE verified_at IS NULL AND expires_at<? AND NOT EXISTS(SELECT 1 FROM endpoints e WHERE e.email_id=m.id) AND NOT EXISTS(SELECT 1 FROM deliveries d WHERE d.email_id=m.id) LIMIT 500)",
    ).bind(now - 7 * 86400000),
    env.DB.prepare(
      "DELETE FROM usage_buckets WHERE rowid IN (SELECT rowid FROM usage_buckets WHERE window_start<? LIMIT 500)",
    ).bind(now - 2 * 86400000),
  ]);
  // Expire abandoned unverified workspaces only. Active sessions, verified
  // destinations, linked GitHub accounts and live notifications all protect them.
  const stale = `SELECT a.id FROM accounts a WHERE a.created_at<? AND a.last_active_at<? AND a.github_id IS NULL
    AND NOT EXISTS(SELECT 1 FROM sessions s WHERE s.account_id=a.id AND s.expires_at>?)
    AND NOT EXISTS(SELECT 1 FROM oauth_states o WHERE o.account_id=a.id AND o.expires_at>?)
    AND NOT EXISTS(SELECT 1 FROM email_addresses m WHERE m.account_id=a.id AND m.verified_at IS NOT NULL)
    AND NOT EXISTS(SELECT 1 FROM endpoints e WHERE e.account_id=a.id AND e.webhook_verified=1)
    AND NOT EXISTS(SELECT 1 FROM deliveries d JOIN endpoints e ON e.id=d.endpoint_id WHERE e.account_id=a.id AND d.status IN ('pending','retry','sending')) ORDER BY a.id LIMIT 25`;
  const values = [new Date(cutoff).toISOString(), cutoff, now, now];
  // Materialize a bounded candidate list, then recheck each account inside its
  // deletion transaction so concurrent activity protects it.
  const candidate = await env.DB.prepare(stale)
    .bind(...values)
    .all<{ id: string }>();
  for (const { id } of candidate.results) {
    const marker = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(`UPDATE accounts SET token_hash=? WHERE id=? AND id IN (${stale})`).bind(
        marker,
        id,
        ...values,
      ),
      ...accountRemoval(env, id, marker),
    ]);
  }
}
export function accountRemoval(env: Env, account: string, marker: string) {
  const owned = "SELECT id FROM accounts WHERE id=? AND token_hash=?";
  return [
    `DELETE FROM deliveries WHERE endpoint_id IN (SELECT id FROM endpoints WHERE account_id IN (${owned}))`,
    `DELETE FROM endpoints WHERE account_id IN (${owned})`,
    `DELETE FROM email_addresses WHERE account_id IN (${owned})`,
    `DELETE FROM sessions WHERE account_id IN (${owned})`,
    `DELETE FROM oauth_states WHERE account_id IN (${owned})`,
    "DELETE FROM accounts WHERE id=? AND token_hash=?",
  ].map((sql) => env.DB.prepare(sql).bind(account, marker));
}
