import {
  newWorkshop,
  restoreWorkshop,
  type WorkshopState,
} from "../packages/workshop-core";
import type {
  CrewId,
  WorkshopAccount,
  WorkshopPlayerRow,
} from "../shared/workshop-account";

export class WorkshopConflict extends Error {}
export const isCrew = (value: unknown): value is CrewId =>
  value === "gus" || value === "dash" || value === "juno";
type RecordData = WorkshopAccount & {
  writer: string | null;
  lastRequest: string | null;
  lastPayload: string | null;
  lastSave: number;
  created: number;
  lastLogin: number;
  seen: number;
  updated: number;
  logins: number;
};

// Cloud saves for non-monetary gameplay. These snapshots are not an authority
// for token rewards, purchases or withdrawals. Identity and writes are server-owned.
export function checkedWorkshop(
  value: unknown,
  character: CrewId,
): WorkshopState {
  if (!value || typeof value !== "object")
    throw new WorkshopConflict("Invalid workshop save.");
  const raw = value as WorkshopState;
  if (raw.character !== character)
    throw new WorkshopConflict("Your character is permanent for this wallet.");
  const serialized = JSON.stringify(value);
  if (serialized.length > 6500)
    throw new WorkshopConflict("Workshop save is too large.");
  const state = restoreWorkshop(serialized);
  if (
    state.character !== character ||
    raw.credits !== state.credits ||
    raw.serviced !== state.serviced ||
    raw.order?.number !== state.order.number ||
    raw.order?.kind !== state.order.kind ||
    raw.tools !== state.tools ||
    raw.version !== 1 ||
    !Number.isSafeInteger(raw.credits) ||
    raw.credits > 1e9 ||
    !Number.isSafeInteger(raw.serviced) ||
    raw.serviced > 1e7 ||
    !raw.racing ||
    !raw.mechanic ||
    !raw.performance ||
    !raw.team ||
    !Number.isFinite(raw.position?.x) ||
    !Number.isFinite(raw.position?.z)
  )
    throw new WorkshopConflict(
      "Invalid workshop save. Reload your saved garage.",
    );
  return state;
}

export class WorkshopAccounts {
  constructor(private sql: SqlStorage) {
    sql.exec(
      "CREATE TABLE IF NOT EXISTS workshop_account (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)",
    );
  }
  read(): RecordData | null {
    const row = this.sql
      .exec<{ data: string }>("SELECT data FROM workshop_account WHERE id=1")
      .toArray()[0];
    return row ? (JSON.parse(row.data) as RecordData) : null;
  }
  private write(row: RecordData, now: number) {
    row.updated = Math.max(now, row.updated + 1);
    this.sql.exec(
      "INSERT INTO workshop_account VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      JSON.stringify(row),
    );
    return row;
  }
  ensure(address: string, now: number, legacyCharacter?: string | null) {
    const prior = this.read();
    if (prior) {
      if (prior.address !== address)
        throw new WorkshopConflict("Wallet mismatch.");
      return prior;
    }
    const chosen = legacyCharacter?.toLowerCase();
    const character = isCrew(chosen) ? chosen : null;
    return this.write(
      {
        address,
        character,
        state: character ? newWorkshop(character) : null,
        revision: 0,
        playSeconds: 0,
        writer: null,
        lastRequest: null,
        lastPayload: null,
        lastSave: now,
        created: now,
        lastLogin: now,
        seen: now,
        updated: now,
        logins: 0,
      },
      now,
    );
  }
  login(address: string, now: number, legacyCharacter?: string | null) {
    const row = this.ensure(address, now, legacyCharacter);
    row.logins++;
    row.lastLogin = now;
    row.seen = now;
    return this.write(row, now);
  }
  choose(character: unknown, now: number) {
    const row = this.read();
    if (!row || !isCrew(character))
      throw new WorkshopConflict("Choose a valid character.");
    if (row.character && row.character !== character)
      throw new WorkshopConflict(
        "Your character is permanent for this wallet.",
      );
    if (!row.character) {
      row.character = character;
      row.state = newWorkshop(character);
      row.revision++;
      this.write(row, now);
    }
    return row;
  }
  open(writer: string, now: number) {
    const row = this.read();
    if (!row?.state) throw new WorkshopConflict("Choose your character first.");
    row.writer = writer;
    row.lastSave = now;
    row.lastRequest = row.lastPayload = null;
    row.seen = now;
    return this.write(row, now);
  }
  save(input: Record<string, unknown>, now: number) {
    const row = this.read();
    if (
      !row?.character ||
      !row.state ||
      !row.writer ||
      input.writer !== row.writer
    )
      throw new WorkshopConflict(
        "This garage is open in another tab or device. Reload to continue here.",
      );
    if (typeof input.id !== "string" || !/^[a-f0-9-]{36}$/.test(input.id))
      throw new WorkshopConflict("Invalid save request.");
    const payload = JSON.stringify([
      input.revision,
      input.state,
      input.activeSeconds,
    ]);
    if (input.id === row.lastRequest) {
      if (payload !== row.lastPayload)
        throw new WorkshopConflict("Save request was reused.");
      return row;
    }
    if (input.revision !== row.revision)
      throw new WorkshopConflict("A newer save exists. Reload your garage.");
    const state = checkedWorkshop(input.state, row.character);
    if (
      typeof input.activeSeconds !== "number" ||
      !Number.isFinite(input.activeSeconds) ||
      input.activeSeconds < 0
    )
      throw new WorkshopConflict("Invalid play time.");
    // No offline accumulation or overlapping tabs: elapsed server time bounds
    // the active simulation seconds since this writer's last accepted save.
    row.playSeconds += Math.min(
      input.activeSeconds,
      Math.max(0, (now - row.lastSave) / 1000),
      30,
    );
    row.state = state;
    row.revision++;
    row.lastSave = row.seen = now;
    row.lastRequest = input.id;
    row.lastPayload = payload;
    return this.write(row, now);
  }
  snapshot(row: RecordData): WorkshopAccount {
    const { address, character, state, revision, playSeconds } = row;
    return { address, character, state, revision, playSeconds };
  }
  async project(db?: D1Database) {
    const row = this.read();
    if (!row || !db) return;
    const s = row.state;
    const values: WorkshopPlayerRow & { updated_at: number } = {
      wallet: row.address,
      character: row.character,
      credits: s?.credits ?? 0,
      rep: s?.racing.rep ?? 0,
      serviced: s?.serviced ?? 0,
      engine_jobs: s?.performance.completed ?? 0,
      races: s?.racing.completed ?? 0,
      best_score: s?.racing.bestScore ?? 0,
      bays: s?.performance.unlocked ? 3 : s?.team.unlocked ? 2 : 1,
      tools: s?.tools ?? 0,
      mechanic: s?.mechanic.hired ? 1 : 0,
      play_seconds: row.playSeconds,
      logins: row.logins,
      first_seen: row.created,
      last_login: row.lastLogin,
      last_seen: row.seen,
      updated_at: row.updated,
    };
    const columns = Object.keys(values);
    await db
      .prepare(
        `INSERT INTO workshop_players (${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})
      ON CONFLICT(wallet) DO UPDATE SET ${columns
        .slice(1)
        .map((c) => `${c}=excluded.${c}`)
        .join(",")}
      WHERE excluded.updated_at >= workshop_players.updated_at`,
      )
      .bind(...Object.values(values))
      .run();
  }
}
