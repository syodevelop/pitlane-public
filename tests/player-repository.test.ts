import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { PlayerRepository } from "../server/player-repository";
import { initialState } from "../shared/game";
import { BALANCE_VERSION, execute, settle } from "../packages/game-core";
import { PlayerDelivery } from "../server/player-delivery";
import { PlayerActivity, ACTIVE_GRACE_MS } from "../server/player-activity";

// Real SQLite transactions and disk reopen. This does not emulate DO scheduling,
// alarms, eviction or D1; those require separate Worker integration checks.
const owner = "0x1111111111111111111111111111111111111111";
const context = { now: 100_000, seed: 55, balanceVersion: BALANCE_VERSION };
let db: DatabaseSync, path: string, repository: PlayerRepository;
let rejectOutbox = false;
function attach() {
  db = new DatabaseSync(path);
  db.exec(
    "CREATE TABLE IF NOT EXISTS player (id INTEGER PRIMARY KEY, data TEXT)",
  );
  repository = new PlayerRepository(dbAdapter());
}
function dbAdapter(): SqlStorage {
  const adapter = {
    exec(query: string, ...values: SQLInputValue[]) {
      if (rejectOutbox && query.startsWith("INSERT INTO game_outbox"))
        throw new Error("Injected outbox write failure");
      const statement = db.prepare(query);
      const rows = statement.columns().length
        ? statement.all(...values)
        : (statement.run(...values), []);
      return { toArray: () => rows };
    },
  };
  return adapter as unknown as SqlStorage;
}
function transaction<T>(action: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = action();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
function count(table: "game_journal" | "game_outbox") {
  return db.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n;
}
beforeEach(() => {
  path = join(tmpdir(), `pitlane-sql-${crypto.randomUUID()}.db`);
  rejectOutbox = false;
  attach();
});
afterEach(() => {
  db.close();
  unlinkSync(path);
});

it("persists bounded projection retries and resumes parked delivery without changing gameplay", () => {
  const current = transaction(() => repository.load(owner, context.now));
  const selected = execute(
    current,
    {
      id: "select-for-delivery",
      command: { type: "select", character: "Gus" },
    },
    { ...context, seed: current.progress.seed },
  ).state;
  transaction(() => repository.save(selected));
  let delivery = new PlayerDelivery(dbAdapter());
  delivery.schedule(context.now, false);
  expect(delivery.claim(context.now)).toEqual([]);
  for (let attempt = 0; attempt < 8; attempt++) {
    const now = delivery.due()!;
    expect(delivery.claim(now).length).toBeGreaterThan(0);
    delivery.failed(now);
    db.close();
    attach();
    delivery = new PlayerDelivery(dbAdapter());
  }
  expect(delivery.due()).toBeNull();
  expect(delivery.pending().length).toBeGreaterThan(0);
  delivery.schedule(10_000_000, false);
  expect(delivery.due()).toBeNull();
  delivery.schedule(10_000_000, true);
  const pending = delivery.claim(delivery.due()!);
  transaction(() => delivery.acknowledge(pending, 10_000_001));
  expect(delivery.pending()).toEqual([]);
  expect(delivery.due()).toBeNull();
  expect(repository.load(owner, context.now)).toEqual(selected);
});

it("expires activity across database reopen, caps it at session expiry, and revokes only its session", () => {
  const initial = transaction(() => repository.load(owner, context.now));
  const initialEvents = count("game_outbox");
  let activity = new PlayerActivity(dbAdapter());
  expect(
    activity.touch("session-a", context.now, context.now + 1_000_000),
  ).toBe(context.now + ACTIVE_GRACE_MS);
  db.close();
  attach();
  activity = new PlayerActivity(dbAdapter());
  expect(activity.active(context.now + ACTIVE_GRACE_MS - 1)).toBe(true);
  expect(activity.active(context.now + ACTIVE_GRACE_MS)).toBe(false);
  expect(activity.touch("session-b", context.now, context.now + 500)).toBe(
    context.now + 500,
  );
  activity.revoke("session-a");
  expect(activity.active(context.now + 499)).toBe(true);
  activity.revoke("session-b");
  expect(activity.active(context.now)).toBe(false);
  expect(repository.load(owner, context.now)).toEqual(initial);
  expect(count("game_outbox")).toBe(initialEvents);
});

it("reopens unfinished work with its deadline and settles it once with durable outbox entries", () => {
  const legacy = {
    ...initialState(),
    character: "Juno",
    credits: 321,
    rep: 123,
    work: { id: "work-20", kind: "engine", startsAt: 90_000, endsAt: 200_000 },
  };
  db.prepare("INSERT INTO player VALUES(1,?)").run(JSON.stringify(legacy));
  const migrated = transaction(() => repository.load(owner, context.now));
  expect(Object.values(migrated.progress.tasks)[0].endsAt).toBe(200_000);
  db.close();
  attach();
  const restored = transaction(() => repository.load(owner, 199_999));
  expect(restored.profile.character).toBe("Juno");
  expect(restored.progress.credits).toBe(321);
  const finish = () =>
    transaction(() => {
      const current = repository.load(owner, 999_999);
      const result = settle(current, {
        ...context,
        seed: current.progress.seed,
        now: 999_999,
      }).state;
      repository.save(result);
      return result;
    });
  const completed = finish();
  expect(completed.progress.credits).toBe(481);
  expect(completed.progress.rep).toBe(143);
  const events = count("game_journal"),
    messages = count("game_outbox");
  expect(messages).toBe(events);
  expect(messages).toBeGreaterThan(0);
  db.close();
  attach();
  expect(finish().progress).toEqual(completed.progress);
  expect(count("game_journal")).toBe(events);
  expect(count("game_outbox")).toBe(messages);
  expect(db.prepare("SELECT data FROM legacy_backups").get()!.data).toBe(
    JSON.stringify(legacy),
  );
});

it("rolls profile, progress and journal back when outbox insertion fails, then accepts the same command", () => {
  const initial = transaction(() => repository.load(owner, context.now));
  const priorEvents = count("game_journal");
  const select = () =>
    transaction(() => {
      const current = repository.load(owner, context.now);
      const next = execute(
        current,
        {
          id: "selection-request",
          command: { type: "select", character: "Dash" },
        },
        { ...context, seed: current.progress.seed },
      ).state;
      repository.save(next);
      repository.rememberCommand(
        next.progress.generation,
        "selection-request",
        "select-Dash",
      );
      return next;
    });
  rejectOutbox = true;
  expect(select).toThrow("outbox write failure");
  expect(repository.load(owner, context.now)).toEqual(initial);
  expect(
    repository.priorCommand(initial.progress.generation, "selection-request"),
  ).toBeUndefined();
  expect(count("game_journal")).toBe(priorEvents);
  expect(count("game_outbox")).toBe(priorEvents);
  rejectOutbox = false;
  const selected = select();
  db.close();
  attach();
  expect(repository.load(owner, context.now).profile.character).toBe("Dash");
  expect(
    repository.priorCommand(selected.progress.generation, "selection-request"),
  ).toBe("select-Dash");
  expect(() => repository.load("another-wallet", context.now)).toThrow(
    "another wallet",
  );
  expect(() =>
    transaction(() =>
      repository.save({
        ...selected,
        profile: { ...selected.profile, character: "Gus" },
      }),
    ),
  ).toThrow("cannot change");
  expect(repository.load(owner, context.now).profile.character).toBe("Dash");
});
