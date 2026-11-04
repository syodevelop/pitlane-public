import {
  WORKSHOP,
  type Position,
  type CarSize,
} from "../../packages/workshop-core";
import type { VehiclePose } from "./service-route";

type Rect = { x: number; z: number; w: number; h: number };
const within = (p: Position) =>
  p.x >= -3.68 && p.x <= 10.09 && p.z >= 0.576 && p.z <= 9.984;
const inside = (p: Position, r: Rect) =>
  Math.abs(p.x - r.x) < r.w && Math.abs(p.z - r.z) < r.h;
function crosses(a: Position, b: Position, r: Rect) {
  let low = 0,
    high = 1;
  for (const [key, half] of [
    ["x", r.w],
    ["z", r.h],
  ] as const) {
    const d = b[key] - a[key];
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(a[key] - r[key]) >= half) return false;
    } else {
      const t1 = (r[key] - half - a[key]) / d,
        t2 = (r[key] + half - a[key]) / d;
      low = Math.max(low, Math.min(t1, t2));
      high = Math.min(high, Math.max(t1, t2));
      if (high <= low) return false;
    }
  }
  return high > 0 && low < 1;
}
export function mechanicObstacles(
  size: CarSize,
  car?: VehiclePose,
  player?: Position,
): Rect[] {
  const obstacles: Rect[] = [
    { ...WORKSHOP.car, w: size.halfWidth + 0.34, h: size.halfLength + 0.34 },
    { ...WORKSHOP.cart, w: 0.85, h: 0.68 },
    { ...WORKSHOP.rack, w: 1.45, h: 0.7 },
  ];
  if (car && (Math.abs(car.z - WORKSHOP.car.z) > 0.05 || car.turning)) {
    const c = Math.abs(Math.cos(car.yaw)),
      s = Math.abs(Math.sin(car.yaw));
    obstacles.push({
      ...car,
      w:
        c * (car.halfWidth || size.halfWidth) +
        s * (car.halfLength || size.halfLength) +
        0.36,
      h:
        s * (car.halfWidth || size.halfWidth) +
        c * (car.halfLength || size.halfLength) +
        0.36,
    });
  }
  if (player) obstacles.push({ ...player, w: 0.4, h: 0.4 });
  return obstacles;
}
/** A small visibility graph goes around corners; it never sends staff through
 * the parked car, the rack, trolley or either garage wall. */
export function mechanicRoute(
  from: Position,
  to: Position,
  obstacles: Rect[],
): Position[] {
  const blocked = (a: Position, b: Position) =>
    obstacles.some((r) => !inside(a, r) && crosses(a, b, r));
  if (!within(to) || obstacles.some((r) => inside(to, r))) return [];
  if (!blocked(from, to)) return [to];
  const nodes = [from, to];
  for (const r of obstacles)
    for (const dx of [-1, 1])
      for (const dz of [-1, 1]) {
        const p = { x: r.x + dx * (r.w + 0.025), z: r.z + dz * (r.h + 0.025) };
        if (within(p) && !obstacles.some((o) => inside(p, o))) nodes.push(p);
      }
  const scores = nodes.map(() => Infinity),
    prev = nodes.map(() => -1),
    visited = new Set<number>();
  scores[0] = 0;
  for (let i = 0; i < nodes.length; i++) {
    let best = -1;
    for (let j = 0; j < nodes.length; j++)
      if (
        !visited.has(j) &&
        Number.isFinite(scores[j]) &&
        (best === -1 || scores[j] < scores[best])
      )
        best = j;
    if (best < 0) return [];
    if (best === 1) {
      const path: Position[] = [];
      let at = 1;
      while (at !== 0) {
        path.unshift(nodes[at]);
        at = prev[at];
      }
      return path;
    }
    visited.add(best);
    for (let j = 0; j < nodes.length; j++)
      if (!visited.has(j) && !blocked(nodes[best], nodes[j])) {
        const score =
          scores[best] +
          Math.hypot(nodes[j].x - nodes[best].x, nodes[j].z - nodes[best].z);
        if (score < scores[j]) {
          scores[j] = score;
          prev[j] = best;
        }
      }
  }
  return [];
}
