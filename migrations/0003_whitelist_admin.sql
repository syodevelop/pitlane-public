CREATE TABLE IF NOT EXISTS whitelist_admin_sessions (
  id TEXT PRIMARY KEY,
  secret_version TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS whitelist_admin_sessions_expires ON whitelist_admin_sessions(expires);
CREATE INDEX IF NOT EXISTS whitelist_sessions_expires ON whitelist_sessions(expires);
CREATE INDEX IF NOT EXISTS whitelist_rate_limits_expires ON whitelist_rate_limits(expires);
