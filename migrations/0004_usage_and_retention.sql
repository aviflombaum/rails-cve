CREATE TABLE usage_buckets (operation TEXT NOT NULL, scope TEXT NOT NULL, window_start INTEGER NOT NULL, used INTEGER NOT NULL, PRIMARY KEY(operation,scope,window_start));
CREATE INDEX usage_expiry ON usage_buckets(window_start);
ALTER TABLE accounts ADD COLUMN last_active_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE deliveries ADD COLUMN completed_at INTEGER;
CREATE INDEX deliveries_retention ON deliveries(completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX oauth_expiry ON oauth_states(expires_at);
