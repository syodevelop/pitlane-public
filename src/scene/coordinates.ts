import type { Point } from "../../shared/game";
// The same affine projection is used for drawing, waypoints and pointer hit testing.
// Gameplay collision stays in ground-plane coordinates on the server.
export const SCENE = { width: 1100, height: 650 };
export function project(p: Point): Point {
  return { x: 360 + p.x * 0.86 - p.y * 0.58, y: 60 + p.x * 0.32 + p.y * 0.56 };
}
export function unproject(p: Point): Point {
  const x = p.x - 360,
    y = p.y - 60;
  const determinant = 0.86 * 0.56 + 0.58 * 0.32;
  return {
    x: (0.56 * x + 0.58 * y) / determinant,
    y: (-0.32 * x + 0.86 * y) / determinant,
  };
}
