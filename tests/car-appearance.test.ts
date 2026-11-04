import { expect, it } from "vitest";
import { carAppearance } from "../src/scene/car-appearance";
import type { Tier } from "../packages/game-core";

it("keeps restoration distinct from upgrades and never mutates levels", () => {
  const car = { tier: 1 as const, restored: false, engine: 2, reliability: 2 };
  expect(carAppearance(car)).toMatchObject({ texture: "rustback", frame: 0 });
  car.restored = true;
  car.engine = 1;
  car.reliability = 1;
  expect(carAppearance(car)).toMatchObject({ texture: "rustback", frame: 1 });
  car.reliability = 2;
  expect(carAppearance(car)).toMatchObject({
    texture: "rustback-upgrade",
    frame: 1,
  });
  expect(car).toEqual({ tier: 1, restored: true, engine: 1, reliability: 2 });
});

it("uses distinct tier art and the same package for either first upgrade", () => {
  const textures = new Set<string>();
  for (const tier of [2, 3, 4, 5] as Tier[]) {
    const car = { tier, restored: true, engine: 1, reliability: 1 };
    const base = carAppearance(car);
    textures.add(base.texture);
    expect(base.frame).toBe(0);
    expect(carAppearance({ ...car, engine: 2 }).frame).toBe(1);
    expect(carAppearance({ ...car, reliability: 2 }).frame).toBe(1);
    expect(carAppearance({ ...car, engine: 3, reliability: 3 }).texture).toBe(
      base.texture,
    );
  }
  expect(textures.size).toBe(4);
});
