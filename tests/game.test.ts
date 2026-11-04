import { describe, expect, it } from "vitest";
import {
  applyCommand,
  CHARACTERS,
  initialState,
  JOBS,
  positionAt,
  settle,
  STATIONS,
  type Character,
  type State,
} from "../shared/game";
const player = (character: Character = "Gus") =>
  applyCommand(initialState(), { type: "select", character }, 0);
const at = (station: keyof typeof STATIONS): State => ({
  ...player(),
  position: STATIONS[station],
});
describe("server authority and finite work", () => {
  it("requires selection once, with equal resources and locked names", () => {
    expect(() =>
      applyCommand(initialState(), { type: "start", kind: "stock" }, 0),
    ).toThrow("Choose");
    for (const name of Object.keys(CHARACTERS) as Character[]) {
      const s = player(name);
      expect([s.credits, s.rep, s.parts]).toEqual([0, 0, 0]);
      expect(() =>
        applyCommand(s, { type: "select", character: "Dash" }, 0),
      ).toThrow("already");
    }
    expect(() =>
      applyCommand(
        initialState(),
        { type: "select", character: "__proto__" as Character },
        0,
      ),
    ).toThrow();
  });
  it("checks travel time and rejects blocked, nonfinite and out-of-bounds waypoints", () => {
    const s = applyCommand(
      player(),
      { type: "move", target: STATIONS.stock },
      1000,
    );
    expect(s.travel!.endsAt).toBeGreaterThan(3000);
    expect(positionAt(s, 1500).y).toBeGreaterThan(100);
    expect(() =>
      applyCommand(s, { type: "start", kind: "stock" }, 1500),
    ).toThrow("arrive");
    const arrived = settle(s, 10000);
    expect(arrived.position).toEqual(STATIONS.stock);
    expect(() =>
      applyCommand(
        { ...player(), position: { x: 300, y: 220 } },
        { type: "move", target: { x: 500, y: 220 } },
        0,
      ),
    ).toThrow("blocks");
    for (const x of [NaN, Infinity, 1e9, -1])
      expect(() =>
        applyCommand(player(), { type: "move", target: { x, y: 100 } }, 0),
      ).toThrow();
  });
  it("server movement replans from elapsed position instead of teleporting", () => {
    const s = applyCommand(
      player(),
      { type: "move", target: STATIONS.stock },
      1000,
    );
    const again = applyCommand(
      s,
      { type: "move", target: STATIONS.tires },
      1100,
    );
    expect(again.travel!.from.y).toBeCloseTo(339, 0);
    expect(again.travel!.endsAt).toBeGreaterThan(1100);
  });
  it("issues finite free stock with capacity and no REP", () => {
    const started = applyCommand(
      at("stock"),
      { type: "start", kind: "stock" },
      1000,
    );
    expect(settle(started, 2000).parts).toBe(0);
    const finished = settle(started, 100_000);
    expect([finished.parts, finished.rep]).toEqual([2, 0]);
    expect(settle(finished, 1e9)).toEqual(finished);
    expect(() =>
      applyCommand(finished, { type: "start", kind: "stock" }, 1e9),
    ).toThrow("Capacity");
  });
  it("requires station, stock, duration and one work slot; offline work settles once", () => {
    expect(() =>
      applyCommand(player(), { type: "start", kind: "tires" }, 0),
    ).toThrow("Move");
    expect(() =>
      applyCommand(at("tires"), { type: "start", kind: "tires" }, 0),
    ).toThrow("parts");
    const started = applyCommand(
      { ...at("tires"), parts: 2 },
      { type: "start", kind: "tires" },
      0,
    );
    expect(() =>
      applyCommand(started, { type: "start", kind: "tires" }, 1),
    ).toThrow("One active");
    expect(() =>
      applyCommand(started, { type: "move", target: STATIONS.stock }, 1),
    ).toThrow("Finish");
    expect(settle(started, 59_999).rep).toBe(0);
    const done = settle(started, 1e9);
    expect([done.credits, done.rep, done.parts, done.completed.tires]).toEqual([
      80, 10, 1, 1,
    ]);
    expect(done.work).toBeNull();
    expect(settle(done, 2e9)).toEqual(done);
  });
  it("modifiers change own work duration only, never reward size", () => {
    for (const character of Object.keys(CHARACTERS) as Character[]) {
      const started = applyCommand(
        { ...player(character), parts: 1, position: STATIONS.engine },
        { type: "start", kind: "engine" },
        0,
      );
      expect(started.work!.endsAt).toBe(
        Math.ceil(JOBS.engine.duration / CHARACTERS[character].engine),
      );
      const s = settle(started, 1e9);
      expect([s.rep, s.credits]).toEqual([20, 160]);
    }
  });
  it("restores once, spends Credits on upgrades without REP, and gates qualification", () => {
    const base = {
      ...at("starter"),
      parts: 2,
      completed: { tires: 6, quick: 6, engine: 6 },
      credits: 2000,
      rep: 270,
    };
    const restored = settle(
      applyCommand(base, { type: "start", kind: "restore" }, 0),
      1e9,
    );
    expect(restored.restored).toBe(true);
    expect(restored.rep).toBe(270);
    expect(() =>
      applyCommand(restored, { type: "start", kind: "restore" }, 1e9),
    ).toThrow("already");
    let s = applyCommand(restored, { type: "upgrade", stat: "engine" }, 1e9);
    s = applyCommand(s, { type: "upgrade", stat: "reliability" }, 1e9);
    expect([s.credits, s.rep]).toEqual([800, 270]);
    expect(() =>
      applyCommand(s, { type: "upgrade", stat: "engine" }, 1e9),
    ).toThrow("maximum");
    s.position = STATIONS.race;
    const r = applyCommand(s, { type: "race", preparation: "sprint" }, 1e9);
    expect(r.race!.tokenWeight).toBe(0);
    expect(r.race!.endsAt).toBe(1e9 + 120_000);
    const done = settle(r, 2e9);
    expect(done.qualified).toBe(true);
    expect(done.rep).toBe(290);
    expect(settle(done, 3e9)).toEqual(done);
    expect(done.race).toBeNull();
    expect(
      applyCommand(done, { type: "race", preparation: "endurance" }, 3e9).race!
        .kind,
    ).toBe("training");
  });
  it("does not allow missing category counts or insufficient Credits", () => {
    const s = { ...at("starter"), restored: true, credits: 599 };
    expect(() =>
      applyCommand(s, { type: "upgrade", stat: "engine" }, 0),
    ).toThrow("600");
    expect(() =>
      applyCommand(
        {
          ...at("race"),
          restored: true,
          engine: 2,
          reliability: 2,
          completed: { tires: 18, quick: 0, engine: 0 },
        },
        { type: "race", preparation: "sprint" },
        0,
      ),
    ).toThrow("checklist");
  });
  it("repeated legitimate work has no daily cap, and no poll-only reward", () => {
    let s = at("tires");
    for (let i = 0; i < 500; i++) {
      s.parts = 1;
      s = settle(
        applyCommand(s, { type: "start", kind: "tires" }, i * 100_000),
        i * 100_000 + 60_000,
      );
    }
    expect(s.rep).toBe(5000);
    expect(s.completed.tires).toBe(500);
    expect(s.sequence).toBe(500);
    expect(settle(s, 1e12)).toEqual(s);
  });
});
