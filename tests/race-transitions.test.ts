import { expect, it } from "vitest";
import { Scenario } from "../packages/game-core/scenario";
import {
  RaceTransitionCursor,
  carBay,
  raceRoute,
} from "../src/scene/race-transitions";
import { movingCarAppearance } from "../src/scene/car-appearance";
import { ANNEX, STATIONS, type Tier } from "../packages/game-core";

function fixture() {
  const h = new Scenario();
  h.restore();
  h.prepare();
  h.move("race");
  const ready = structuredClone(h.state);
  h.command({ type: "dispatchRace", carId: h.starter(), kind: "tutorial" });
  const started = structuredClone(h.state);
  const race = Object.values(h.state.progress.races)[0];
  h.advance(race.endsAt - 1);
  const pending = structuredClone(h.state);
  h.advance(race.endsAt);
  return { ready, started, pending, completed: h.state };
}

it("animates only newly observed server transitions; timers and repeated/stale state do not return a car", () => {
  const f = fixture(),
    cursor = new RaceTransitionCursor();
  expect(cursor.read(f.ready, true).transitions).toEqual([]);
  expect(
    cursor.read(f.started, true).transitions.map((t) => t.direction),
  ).toEqual(["depart"]);
  expect(cursor.read(f.started, true).transitions).toEqual([]);
  expect(cursor.read(f.ready, true).transitions).toEqual([]);
  expect(cursor.read(f.pending, true).transitions).toEqual([]);
  expect(
    cursor.read(f.completed, true).transitions.map((t) => t.direction),
  ).toEqual(["return"]);
  expect(cursor.read(f.completed, true).transitions).toEqual([]);
});

it("does not replay loaded or hidden history; resets at a progress wipe", () => {
  const f = fixture(),
    cursor = new RaceTransitionCursor();
  expect(cursor.read(f.started, true).transitions).toEqual([]);
  expect(cursor.read(f.completed, false).transitions).toEqual([]);
  expect(cursor.read(f.completed, true).transitions).toEqual([]);
  const wiped = structuredClone(f.ready);
  wiped.progress.generation = "after-wipe";
  expect(cursor.read(wiped, true)).toEqual({ reset: true, transitions: [] });
  const loadingComplete = new RaceTransitionCursor();
  expect(loadingComplete.read(f.completed, true).transitions).toEqual([]);
});

it("returns to the last verified work bay without changing collection, slots or resources", () => {
  const { completed: g } = fixture(),
    car = Object.values(g.progress.cars)[0];
  const task = Object.values(g.progress.tasks)
    .filter((t) => t.carId === car.id)
    .at(-1)!;
  task.workPosition = 1;
  expect(carBay(g, car.id)).toBe(0);
  g.progress.upgrades.capacity = 1;
  const before = structuredClone(g);
  expect(carBay(g, car.id)).toBe(1);
  expect(raceRoute(1)[0]).toEqual(ANNEX.starter);
  expect(raceRoute(0)[0]).toEqual(STATIONS.starter);
  expect(g).toEqual(before);
  delete task.workPosition;
  expect(carBay(g, car.id)).toBe(0);
});

it("keeps all five standard/upgraded cars consistent across the four movement directions", () => {
  for (const tier of [1, 2, 3, 4, 5] as Tier[])
    for (const engine of [1, 2]) {
      const car = { tier, restored: true, engine, reliability: 1 };
      const ne = movingCarAppearance(car, "ne"),
        nw = movingCarAppearance(car, "nw");
      expect(ne.texture).toMatch(/-rear$/);
      expect(ne.frame).toBe(engine - 1);
      expect(nw).toEqual({ ...ne, flipX: true });
      expect(movingCarAppearance(car, "se")).toEqual({
        ...movingCarAppearance(car, "sw"),
        flipX: true,
      });
    }
});
