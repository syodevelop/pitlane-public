// Prototype grace for app switching; not proof of a human or a unique player.
export const ACTIVE_GRACE_MS = 90_000;
export class PlayerActivity {
  constructor(private sql: SqlStorage) {
    sql.exec(
      "CREATE TABLE IF NOT EXISTS player_activity (id INTEGER PRIMARY KEY CHECK(id=1), session_hash TEXT NOT NULL, active_until INTEGER NOT NULL, checkpoint_at INTEGER NOT NULL)",
    );
  }
  touch(hash: string, now: number, sessionExpires: number) {
    const until = Math.min(now + ACTIVE_GRACE_MS, sessionExpires);
    this.sql.exec(
      "INSERT INTO player_activity VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET session_hash=excluded.session_hash,active_until=excluded.active_until,checkpoint_at=excluded.checkpoint_at",
      hash,
      until,
      now,
    );
    return until;
  }
  active(now: number) {
    return this.sql
      .exec<{ active_until: number }>(
        "SELECT active_until FROM player_activity WHERE id=1",
      )
      .toArray()
      .some((row) => row.active_until > now);
  }
  revoke(hash: string) {
    this.sql.exec("DELETE FROM player_activity WHERE session_hash=?", hash);
  }
}
