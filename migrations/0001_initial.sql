CREATE TABLE advisories (id TEXT PRIMARY KEY, cve TEXT, title TEXT NOT NULL, severity TEXT NOT NULL, published_at TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE accounts (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE endpoints (id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), name TEXT NOT NULL, url TEXT NOT NULL, secret TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', challenge TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE INDEX endpoints_account ON endpoints(account_id);
CREATE TABLE events (id TEXT PRIMARY KEY, advisory_id TEXT NOT NULL, revision TEXT NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(advisory_id, revision));
CREATE TABLE deliveries (id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), endpoint_id TEXT NOT NULL REFERENCES endpoints(id), status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0, lease TEXT, response_code INTEGER, error TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE(event_id,endpoint_id));
CREATE INDEX deliveries_due ON deliveries(status,next_at);
CREATE TABLE state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
