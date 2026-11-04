import { describe, it, expect } from "vitest";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync } from "node:fs";
import { WorkshopAccounts, checkedWorkshop } from "../server/workshop-account";
import { handleWorkshopPlayers } from "../server/workshop-admin";
import { fixture } from "./whitelist-fixture";
import { newWorkshop } from "../packages/workshop-core";
const wallet = "0x" + "a".repeat(40);
function setup() {
  const db = new DatabaseSync(":memory:");
  const sql = {
    exec(query: string, ...values: SQLInputValue[]) {
      const stmt = db.prepare(query);
      const rows = stmt.columns().length
        ? stmt.all(...values)
        : (stmt.run(...values), []);
      return { toArray: () => rows };
    },
  } as unknown as SqlStorage;
  return { db, repo: new WorkshopAccounts(sql) };
}
describe("wallet workshop profiles", () => {
  it("starts fresh without importing local Credits and permanently chooses one character", () => {
    const { db, repo } = setup();
    try {
      expect(repo.login(wallet, 1000).character).toBeNull();
      const first = repo.choose("juno", 1100);
      expect(first.state?.credits).toBe(0);
      expect(repo.choose("juno", 1200).revision).toBe(first.revision);
      expect(() => repo.choose("dash", 1300)).toThrow(/permanent/);
      repo.login(wallet, 1400);
      expect(repo.read()?.character).toBe("juno");
      expect(repo.read()?.logins).toBe(2);
      expect(() => repo.ensure("0x" + "b".repeat(40), 1500)).toThrow(
        /mismatch/,
      );
    } finally {
      db.close();
    }
  });
  it("preserves an earlier permanent character but starts the new workshop at zero", () => {
    const { db, repo } = setup();
    try {
      const row = repo.ensure(wallet, 1000, "Dash");
      expect(row.character).toBe("dash");
      expect(row.state?.credits).toBe(0);
      expect(() => repo.choose("gus", 1200)).toThrow(/permanent/);
    } finally {
      db.close();
    }
  });
  it("isolates writers, rejects stale saves, retries idempotently, and bounds active time", () => {
    const { db, repo } = setup();
    try {
      repo.login(wallet, 1000);
      repo.choose("dash", 1100);
      const opened = repo.open("writer-a", 2000);
      const state = newWorkshop("dash");
      state.credits = 50;
      state.serviced = 1;
      const request = {
        writer: "writer-a",
        revision: opened.revision,
        id: crypto.randomUUID(),
        state,
        activeSeconds: 500,
      };
      const saved = repo.save(request, 7000);
      expect(saved.state?.credits).toBe(50);
      expect(saved.playSeconds).toBe(5);
      expect(repo.save(request, 8000).revision).toBe(saved.revision);
      expect(repo.read()?.playSeconds).toBe(5);
      expect(() =>
        repo.save({ ...request, state: { ...state, credits: 100 } }, 8000),
      ).toThrow(/reused/);
      expect(() =>
        repo.save({ ...request, id: crypto.randomUUID() }, 8000),
      ).toThrow(/newer/);
      const second = repo.open("writer-b", 9000);
      expect(() =>
        repo.save(
          { ...request, revision: second.revision, id: crypto.randomUUID() },
          10000,
        ),
      ).toThrow(/another tab/);
      const next = {
        ...request,
        writer: "writer-b",
        revision: second.revision,
        id: crypto.randomUUID(),
        activeSeconds: 0,
      };
      expect(repo.save(next, 60000).playSeconds).toBe(5);
    } finally {
      db.close();
    }
  });
  it("rejects character substitution and malformed snapshots", () => {
    expect(() => checkedWorkshop(newWorkshop("gus"), "juno")).toThrow(
      /permanent/,
    );
    expect(() =>
      checkedWorkshop({ ...newWorkshop("juno"), credits: -1 }, "juno"),
    ).toThrow();
    expect(() =>
      checkedWorkshop({ ...newWorkshop("juno"), credits: 1e12 }, "juno"),
    ).toThrow();
    expect(() => checkedWorkshop({ character: "juno" }, "juno")).toThrow();
  });
  it("projects profiles for a protected searchable paginated admin list", async () => {
    const { db, repo } = setup(),
      f = fixture();
    f.sql.exec(readFileSync("migrations/0004_workshop_players.sql", "utf8"));
    try {
      repo.login(wallet, 1000);
      repo.choose("juno", 1100);
      const opened = repo.open("writer", 2000),
        state = newWorkshop("juno");
      state.credits = 65;
      repo.save(
        {
          writer: "writer",
          revision: opened.revision,
          id: crypto.randomUUID(),
          state,
          activeSeconds: 4,
        },
        6000,
      );
      await repo.project(f.env.PROJECTIONS);
      const request = new Request(
        f.env.APP_ORIGIN + "/api/admin/whitelist/players?wallet=aaaa",
      );
      expect(
        (await handleWorkshopPlayers(request, {
          ...f.env,
          ENVIRONMENT: "production",
        }))!.status,
      ).toBe(401);
      const result = await handleWorkshopPlayers(request, f.env);
      expect(result!.status).toBe(200);
      const body = (await result!.json()) as {
        total: number;
        players: { character: string; credits: number; play_seconds: number }[];
      };
      expect(body.total).toBe(1);
      expect(body.players[0]).toMatchObject({
        character: "juno",
        credits: 65,
        play_seconds: 4,
      });
      const other = await handleWorkshopPlayers(
        new Request(
          f.env.APP_ORIGIN + "/api/admin/whitelist/players?wallet=bbbb",
        ),
        f.env,
      );
      expect(((await other!.json()) as { total: number }).total).toBe(0);
    } finally {
      db.close();
      f.sql.close();
    }
  });
});
