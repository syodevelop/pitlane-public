import type { Point } from "../../packages/game-core";
// North-facing v2 floor: closed starter section x=245..570, y=370..674.
export const INTERIOR_ART_SCALE = 2.1;
export function projectInterior(p: Point): Point {
  return {
    x: (245 + p.x * 0.975) * INTERIOR_ART_SCALE,
    y: (370 + p.y * 0.922) * INTERIOR_ART_SCALE,
  };
}
export function unprojectInterior(p: Point): Point {
  return {
    x: (p.x / INTERIOR_ART_SCALE - 245) / 0.975,
    y: (p.y / INTERIOR_ART_SCALE - 370) / 0.922,
  };
}
