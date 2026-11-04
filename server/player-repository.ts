import {
  BALANCE_VERSION,
  createGarage,
  RuleError,
  type Garage,
  type Mode,
  type Profile,
  type Progress,
} from "../packages/game-core";
import { migrateLegacy } from "../packages/game-core/migrate";
import type { State as LegacyState } from "../shared/game";

// Every load/save pair is called inside the owning DO's SQLite transaction.
// Separate profile and progress storage prepares a generation reset without erasing identity.
export class PlayerRepository {
  constructor(private sql: SqlStorage) {
    sql.exec(
      "CREATE TABLE IF NOT EXISTS game_profile (id INTEGER PRIMARY KEY CHECK(id=1), identity TEXT NOT NULL, character TEXT)",
    );
    sql.exec(
      "CREATE TABLE IF NOT EXISTS gameplay (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)",
    );
    sql.exec(
      "CREATE TABLE IF NOT EXISTS legacy_backups (version TEXT PRIMARY KEY, data TEXT NOT NULL, migrated_at INTEGER NOT NULL)",
    );
    sql.exec(
      "CREATE TABLE IF NOT EXISTS game_commands (generation TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(generation,id))",
    );
    sql.exec(
      "CREATE TABLE IF NOT EXISTS game_journal (id TEXT PRIMARY KEY, data TEXT NOT NULL)",
    );
    sql.exec(
      "CREATE TABLE IF NOT EXISTS game_outbox (id TEXT PRIMARY KEY, topic TEXT NOT NULL, payload TEXT NOT NULL, delivered_at INTEGER)",
    );
  }
  hasCurrent() {
    return (
      this.sql.exec("SELECT id FROM gameplay WHERE id=1").toArray().length > 0
    );
  }
  identity() {
    return this.sql
      .exec<{ identity: string }>(
        "SELECT identity FROM game_profile WHERE id=1",
      )
      .toArray()[0]?.identity;
  }
  load(identity: string, now: number, mode: Mode = "demo"): Garage {
    const row = this.sql
      .exec<{ data: string }>("SELECT data FROM gameplay WHERE id=1")
      .toArray()[0];
    if (row) {
      const profile = this.sql
        .exec<{ identity: string; character: string | null }>(
          "SELECT identity, character FROM game_profile WHERE id=1",
        )
        .toArray()[0];
      if (!profile || profile.identity !== identity)
        throw new RuleError("This saved profile belongs to another wallet.");
      return {
        profile: profile as Profile,
        progress: JSON.parse(row.data) as Progress,
      };
    }
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const c = { now, seed, balanceVersion: BALANCE_VERSION };
    const generation = `${mode}-v2-${identity.slice(2)}`;
    const legacy = this.sql
      .exec<{ data: string }>("SELECT data FROM player WHERE id=1")
      .toArray()[0];
    let g: Garage;
    if (legacy) {
      // Original blob is never overwritten by a failed or partial migration.
      this.sql.exec(
        "INSERT OR IGNORE INTO legacy_backups VALUES(?,?,?)",
        "garage-v0.1",
        legacy.data,
        now,
      );
      g = migrateLegacy(
        JSON.parse(legacy.data) as LegacyState,
        identity,
        generation,
        mode,
        c,
      );
    } else g = createGarage(identity, generation, mode, c);
    this.save(g);
    return g;
  }
  save(g: Garage) {
    const prior = this.sql
      .exec<{ identity: string; character: string | null }>(
        "SELECT identity,character FROM game_profile WHERE id=1",
      )
      .toArray()[0];
    if (
      prior &&
      (prior.identity !== g.profile.identity ||
        (prior.character !== null && prior.character !== g.profile.character))
    )
      throw new RuleError(
        "Profile identity and selected character cannot change.",
      );
    this.sql.exec(
      "INSERT INTO game_profile VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET character=excluded.character",
      g.profile.identity,
      g.profile.character,
    );
    for (const event of g.progress.events) {
      const inserted = this.sql
        .exec(
          "INSERT OR IGNORE INTO game_journal VALUES(?,?) RETURNING id",
          event.id,
          JSON.stringify(event),
        )
        .toArray();
      if (inserted.length)
        this.sql.exec(
          "INSERT INTO game_outbox VALUES(?,?,?,NULL)",
          event.id,
          "player-event",
          JSON.stringify({
            identity: g.profile.identity,
            generation: g.progress.generation,
            revision: g.progress.revision,
            event,
            rep: g.progress.rep,
          }),
        );
    }
    // Full immutable event/command history stays in SQLite, not every polling response.
    g.progress.events = g.progress.events.slice(-40);
    g.progress.receipts = {};
    for (const collection of [
      g.progress.jobs,
      g.progress.tasks,
      g.progress.races,
    ]) {
      const completed = Object.values(collection)
        .filter((v) => v.status === "completed")
        .map((v) => v.id);
      for (const id of completed.slice(0, -20))
        delete (collection as Record<string, unknown>)[id];
    }
    this.sql.exec(
      "INSERT INTO gameplay VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      JSON.stringify(g.progress),
    );
  }
  priorCommand(generation: string, id: string) {
    return this.sql
      .exec<{ payload: string }>(
        "SELECT payload FROM game_commands WHERE generation=? AND id=?",
        generation,
        id,
      )
      .toArray()[0]?.payload;
  }
  rememberCommand(generation: string, id: string, payload: string) {
    this.sql.exec(
      "INSERT INTO game_commands VALUES(?,?,?)",
      generation,
      id,
      payload,
    );
  }
}
