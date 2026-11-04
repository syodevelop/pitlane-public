-- Rebuildable read projection. No balances or financial authority live here.
CREATE TABLE IF NOT EXISTS player_events (
  identity TEXT NOT NULL,
  generation TEXT NOT NULL,
  event_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  rep INTEGER NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY(identity, generation, event_id)
);
CREATE INDEX IF NOT EXISTS player_events_revision ON player_events(identity,generation,revision);
