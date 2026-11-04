import type { Car } from "../../packages/game-core/model";
import { CARS } from "../../packages/game-core";

export const CAR_TEXTURES = [
  "rustback",
  "rustback-upgrade",
  "club-coupe",
  "track-gt",
  "enduro",
  "prototype",
] as const;
export const REAR_CAR_TEXTURES = [
  "rustback-rear",
  "club-coupe-rear",
  "track-gt-rear",
  "enduro-rear",
  "prototype-rear",
] as const;
const TIERS = {
  1: "rustback",
  2: "club-coupe",
  3: "track-gt",
  4: "enduro",
  5: "prototype",
} as const;

// Cosmetic representation of verified levels, never another upgrade or stat source.
// A shared package appears after the first engine/reliability upgrade. Later levels
// retain that package; exact levels remain visible as ordinary UI text.
export function carAppearance(
  car: Pick<Car, "tier" | "restored" | "engine" | "reliability">,
) {
  const upgraded = car.restored && (car.engine > 1 || car.reliability > 1);
  const texture =
    car.tier === 1 && upgraded ? "rustback-upgrade" : TIERS[car.tier];
  const frame = car.tier === 1 ? Number(car.restored) : Number(upgraded);
  return {
    texture,
    frame,
    label: `${CARS[car.tier].name}, ${!car.restored ? "awaiting restoration" : upgraded ? "upgraded" : "standard"}`,
  };
}

export function movingCarAppearance(
  car: Pick<Car, "tier" | "restored" | "engine" | "reliability">,
  direction: "sw" | "se" | "nw" | "ne",
) {
  const rear = direction === "nw" || direction === "ne";
  return {
    ...carAppearance(car),
    ...(rear
      ? {
          texture: REAR_CAR_TEXTURES[car.tier - 1],
          frame: Number(
            car.restored && (car.engine > 1 || car.reliability > 1),
          ),
        }
      : {}),
    flipX: direction === "se" || direction === "nw",
  };
}
