CREATE TABLE IF NOT EXISTS workshop_players (
  wallet TEXT PRIMARY KEY,
  character TEXT,
  credits INTEGER NOT NULL DEFAULT 0,
  rep INTEGER NOT NULL DEFAULT 0,
  serviced INTEGER NOT NULL DEFAULT 0,
  engine_jobs INTEGER NOT NULL DEFAULT 0,
  races INTEGER NOT NULL DEFAULT 0,
  best_score INTEGER NOT NULL DEFAULT 0,
  bays INTEGER NOT NULL DEFAULT 1,
  tools INTEGER NOT NULL DEFAULT 0,
  mechanic INTEGER NOT NULL DEFAULT 0,
  play_seconds REAL NOT NULL DEFAULT 0,
  logins INTEGER NOT NULL DEFAULT 0,
  first_seen INTEGER NOT NULL,
  last_login INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS workshop_players_recent ON workshop_players(last_seen DESC, wallet);
