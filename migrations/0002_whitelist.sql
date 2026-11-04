-- Whitelist applications are separate from game profiles and financial state.
CREATE TABLE IF NOT EXISTS whitelist_config (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  revision INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL DEFAULT 'closed' CHECK(state IN ('closed','open')),
  links TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO whitelist_config(id, links, updated_at)
VALUES(1, '{"follow":"","like":"","repost":"","quote":""}', 0);
CREATE TABLE IF NOT EXISTS whitelist_sessions (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  mask INTEGER NOT NULL DEFAULT 0,
  expires INTEGER NOT NULL,
  application_id TEXT
);
CREATE TABLE IF NOT EXISTS whitelist_applications (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  wallet TEXT NOT NULL UNIQUE,
  handle TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  revision INTEGER NOT NULL,
  links TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS whitelist_applications_created ON whitelist_applications(created_at DESC);
CREATE TABLE IF NOT EXISTS whitelist_rate_limits (
  key TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
