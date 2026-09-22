/** One independently retried outbox item per verified enabled channel. */
export function fanout(env: Env, eventId: string, endpointId: string | null = null) {
  return env.DB.prepare(
    `INSERT OR IGNORE INTO deliveries(id,event_id,endpoint_id,channel,email_id)
    SELECT lower(hex(randomblob(16))),?,e.id,'webhook',NULL FROM endpoints e WHERE e.status='active' AND e.webhook_verified=1 AND e.delivery_mode IN ('webhook','both') AND (? IS NULL OR e.id=?)
    UNION ALL
    SELECT lower(hex(randomblob(16))),?,e.id,'email',m.id FROM endpoints e JOIN email_addresses m ON m.id=e.email_id AND m.account_id=e.account_id WHERE e.status='active' AND m.verified_at IS NOT NULL AND e.delivery_mode IN ('email','both') AND (? IS NULL OR e.id=?)`,
  ).bind(eventId, endpointId, endpointId, eventId, endpointId, endpointId);
}
