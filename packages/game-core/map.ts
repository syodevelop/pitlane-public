export type Point = { x: number; y: number };
export const GARAGE_LAYOUT_VERSION = "garage-layout-v1-annex";
export const STATIONS = {
  stock: { x: 95, y: 100 },
  tires: { x: 280, y: 100 },
  quick: { x: 470, y: 100 },
  engine: { x: 660, y: 100 },
  starter: { x: 280, y: 350 },
  race: { x: 660, y: 350 },
  reception: { x: 95, y: 350 },
} as const;
export type Station = keyof typeof STATIONS;
// Authored expansion positions; existing primary coordinates never move.
export const ANNEX = {
  stock: { x: 95, y: 520 },
  tires: { x: 950, y: 100 },
  quick: { x: 950, y: 270 },
  engine: { x: 950, y: 440 },
  starter: { x: 550, y: 520 },
} as const;
export const garageBounds = (expanded: boolean) => ({
  minX: 25,
  minY: 35,
  maxX: expanded ? 1085 : 735,
  maxY: expanded ? 575 : 425,
});
export function workPoints(
  station: Station,
  expanded: boolean,
): readonly Point[] {
  return expanded && station in ANNEX
    ? [STATIONS[station], ANNEX[station as keyof typeof ANNEX]]
    : [STATIONS[station]];
}
export const OBSTACLES = [{ x: 355, y: 200, w: 90, h: 55 }];
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export function clearPath(a: Point, b: Point): boolean {
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return false;
  if ([a, b].some((p) => p.x < 25 || p.x > 1085 || p.y < 35 || p.y > 575))
    return false;
  // Exact segment/AABB intersection, including contact with the actor's clearance.
  // Sampling alone could miss a tiny corner crossing between two sample points.
  return !OBSTACLES.some((o) => {
    let enter = 0,
      leave = 1;
    for (const [start, delta, min, max] of [
      [a.x, b.x - a.x, o.x - 12, o.x + o.w + 12],
      [a.y, b.y - a.y, o.y - 12, o.y + o.h + 12],
    ]) {
      if (delta === 0) {
        if (start < min || start > max) return false;
      } else {
        const first = (min - start) / delta,
          last = (max - start) / delta;
        enter = Math.max(enter, Math.min(first, last));
        leave = Math.min(leave, Math.max(first, last));
        if (enter > leave) return false;
      }
    }
    return true;
  });
}

export function routeLength(points: readonly Point[]): number {
  return points
    .slice(1)
    .reduce((total, p, i) => total + distance(points[i], p), 0);
}

// A bounded visibility graph over the authored map. The server chooses the route;
// clients submit only a destination, never a trusted path, speed or finish time.
export function routeTo(from: Point, to: Point): Point[] | null {
  if (!clearPath(from, from) || !clearPath(to, to)) return null;
  if (clearPath(from, to)) return [{ ...to }];
  const nodes: Point[] = [
    from,
    to,
    ...OBSTACLES.flatMap((o) => [
      { x: o.x - 13, y: o.y - 13 },
      { x: o.x + o.w + 13, y: o.y - 13 },
      { x: o.x - 13, y: o.y + o.h + 13 },
      { x: o.x + o.w + 13, y: o.y + o.h + 13 },
    ]).filter((p) => clearPath(p, p)),
  ];
  const costs = nodes.map(() => Infinity),
    previous = nodes.map(() => -1);
  const visited = new Set<number>();
  costs[0] = 0;
  for (let step = 0; step < nodes.length; step++) {
    const current = nodes.reduce(
      (best, _, i) =>
        !visited.has(i) && (best < 0 || costs[i] < costs[best]) ? i : best,
      -1,
    );
    if (current < 0 || !Number.isFinite(costs[current])) break;
    if (current === 1) break;
    visited.add(current);
    for (let i = 0; i < nodes.length; i++) {
      if (visited.has(i) || !clearPath(nodes[current], nodes[i])) continue;
      const candidate = costs[current] + distance(nodes[current], nodes[i]);
      if (candidate < costs[i]) {
        costs[i] = candidate;
        previous[i] = current;
      }
    }
  }
  if (!Number.isFinite(costs[1])) return null;
  const path: Point[] = [];
  for (let i = 1; i > 0; i = previous[i]) path.unshift({ ...nodes[i] });
  return path;
}
