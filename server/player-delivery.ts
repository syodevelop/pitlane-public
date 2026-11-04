export const DELIVERY_BATCH = 25;
const MAX_ATTEMPTS = 8;
type PendingEvent = { id: string; topic: string; payload: string };

// Delivery metadata belongs to this player's SQLite, never to the D1 projection.
export class PlayerDelivery {
  constructor(private sql: SqlStorage) {
    sql.exec(
      "CREATE INDEX IF NOT EXISTS game_outbox_pending ON game_outbox(delivered_at)",
    );
    sql.exec(
      "CREATE TABLE IF NOT EXISTS projection_delivery (id INTEGER PRIMARY KEY CHECK(id=1), attempts INTEGER NOT NULL, next_at INTEGER)",
    );
    sql.exec("INSERT OR IGNORE INTO projection_delivery VALUES(1,0,NULL)");
  }
  pending() {
    return this.sql
      .exec<PendingEvent>(
        "SELECT id,topic,payload FROM game_outbox WHERE delivered_at IS NULL ORDER BY rowid LIMIT ?",
        DELIVERY_BATCH,
      )
      .toArray();
  }
  private hasPending() {
    return (
      this.sql
        .exec("SELECT id FROM game_outbox WHERE delivered_at IS NULL LIMIT 1")
        .toArray().length > 0
    );
  }
  schedule(now: number, resumeParked: boolean) {
    if (!this.hasPending()) return;
    this.sql.exec(
      "UPDATE projection_delivery SET next_at=?, attempts=0 WHERE id=1 AND next_at IS NULL AND (attempts=0 OR ?)",
      now + 1000,
      resumeParked ? 1 : 0,
    );
  }
  due() {
    return this.sql
      .exec<{ next_at: number | null }>(
        "SELECT next_at FROM projection_delivery WHERE id=1",
      )
      .toArray()[0].next_at;
  }
  claim(now: number) {
    const due = this.due();
    if (due === null || due > now) return [];
    // A crash during D1 delivery leaves a persisted retry deadline.
    this.sql.exec(
      "UPDATE projection_delivery SET next_at=? WHERE id=1",
      now + 30_000,
    );
    return this.pending();
  }
  acknowledge(rows: PendingEvent[], now: number) {
    for (const row of rows)
      this.sql.exec(
        "UPDATE game_outbox SET delivered_at=? WHERE id=? AND payload=? AND delivered_at IS NULL",
        now,
        row.id,
        row.payload,
      );
    this.sql.exec(
      "UPDATE projection_delivery SET attempts=0,next_at=? WHERE id=1",
      this.hasPending() ? now + 1000 : null,
    );
  }
  failed(now: number) {
    const attempts =
      this.sql
        .exec<{ attempts: number }>(
          "SELECT attempts FROM projection_delivery WHERE id=1",
        )
        .toArray()[0].attempts + 1;
    this.sql.exec(
      "UPDATE projection_delivery SET attempts=?,next_at=? WHERE id=1",
      attempts,
      attempts >= MAX_ATTEMPTS
        ? null
        : now + Math.min(300_000, 5000 * 2 ** (attempts - 1)),
    );
  }
}

export async function deliverPlayerEvents(
  db: D1Database,
  rows: PendingEvent[],
) {
  if (!rows.length) return;
  const statements = rows.map((row) => {
    const event = JSON.parse(row.payload) as {
      identity: string;
      generation: string;
      revision: number;
      event: { id: string };
      rep: number;
    };
    if (row.topic !== "player-event" || event.event.id !== row.id)
      throw new Error("Invalid authoritative outbox event");
    return db
      .prepare(
        `INSERT INTO player_events(identity,generation,event_id,revision,rep,payload)
      VALUES(?,?,?,?,?,?) ON CONFLICT(identity,generation,event_id) DO UPDATE SET payload=NULL
      WHERE player_events.payload<>excluded.payload`,
      )
      .bind(
        event.identity,
        event.generation,
        row.id,
        event.revision,
        event.rep,
        row.payload,
      );
  });
  // A D1 batch is atomic within D1. Acknowledgement in the Player DO is separate.
  const results = await db.batch(statements);
  if (results.some((result) => !result.success))
    throw new Error("Projection delivery failed");
}
