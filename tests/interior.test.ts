import { expect, it } from "vitest";
import { Scenario } from "../packages/game-core/scenario";
import { interiorAt, INTERIOR } from "../packages/game-core";
import { migrateInterior } from "../packages/game-core/interior";
import {
  projectInterior,
  unprojectInterior,
} from "../src/scene/interior-projection";

it("interior travel uses server speed, stops, persists, and grants no resources", () => {
  const h = new Scenario();
  const before = structuredClone(h.state.progress);
  h.command({
    type: "interiorMove",
    target: { x: INTERIOR.spawn.x + 90, y: 180 },
  });
  expect(h.state.progress.interior!.travel!.endsAt - h.now).toBe(1000);
  h.now += 500;
  expect(interiorAt(h.state.progress.interior, h.now).x).toBeCloseTo(
    INTERIOR.spawn.x + 45,
  );
  h.command({ type: "interiorStop" });
  expect(interiorAt(h.state.progress.interior, h.now + 100000).x).toBeCloseTo(
    INTERIOR.spawn.x + 45,
  );
  expect(h.state.progress.credits).toBe(before.credits);
  expect(h.state.progress.rep).toBe(before.rep);
  expect(h.state.progress.actors).toEqual(before.actors);
  expect(
    h.state.progress.events
      .slice(before.events.length)
      .every((e) => e.credits === 0 && e.rep === 0),
  ).toBe(true);
});
it("walls and nonfinite destinations cannot be crossed; repeated commands do not teleport", () => {
  const h = new Scenario();
  for (const target of [
    { x: INTERIOR.minX - 1, y: 180 },
    { x: 1001, y: 180 },
    { x: 500, y: 651 },
    { x: NaN, y: 180 },
    { x: 334, y: 180 },
  ])
    expect(() => h.command({ type: "interiorMove", target })).toThrow();
  for (let i = 0; i < 20; i++)
    h.command({ type: "interiorMove", target: { x: 300, y: 180 } });
  expect(interiorAt(h.state.progress.interior, h.now)).toEqual(INTERIOR.spawn);
  expect(interiorAt(h.state.progress.interior, h.now + 100000)).toEqual({
    x: 300,
    y: 180,
  });
});
it("allows the new west lounge without opening other bays or either road", () => {
  const h = new Scenario();
  h.command({ type: "interiorMove", target: { x: -100, y: 180 } });
  h.now += 10000;
  expect(interiorAt(h.state.progress.interior, h.now)).toEqual({ x: -100, y: 180 });
  for (const target of [{ x: -116, y: 180 }, { x: 340, y: 180 }, { x: 90, y: -40 }, { x: 90, y: 380 }])
    expect(() => h.command({ type: "interiorMove", target })).toThrow();
});
it("legacy room positions migrate once into the accessible third", () => {
  const old = { position: { x: 900, y: 600 }, travel: null };
  const migrated = migrateInterior(old, 0)!;
  expect(migrated.position.x).toBe(300);
  expect(migrated.position.y).toBeCloseTo((600 * 330) / 650);
  expect(migrated.travel).toBeNull();
  expect(migrateInterior(migrated, 1000)).toBe(migrated);
});
it("screen directions invert the same authored projection at corners and center", () => {
  for (const p of [
    { x: 18, y: 18 },
    { x: 982, y: 632 },
    { x: 500, y: 325 },
    { x: 200, y: 600 },
  ]) {
    const q = unprojectInterior(projectInterior(p));
    expect(q.x).toBeCloseTo(p.x, 6);
    expect(q.y).toBeCloseTo(p.y, 6);
  }
});
