import type { Point } from "./map.ts";
import type { Travel } from "./model.ts";

// Separate, reward-free interior layout. Legacy work positions and saves stay intact.
export const INTERIOR = {
  layout: "north-starter-v2",
  width: 1000,
  height: 330,
  accessibleWidth: 1000 / 3,
  // West lounge added without shifting existing bay or saved coordinates.
  minX: -115,
  speed: 90,
  spawn: { x: 90, y: 180 },
};
export type InteriorPosition = {
  layout?: string;
  position: Point;
  travel: Travel | null;
};
export function migrateInterior(
  state: InteriorPosition | undefined,
  now: number,
): InteriorPosition | undefined {
  if (!state || state.layout === INTERIOR.layout) return state;
  const old = interiorAt({ ...state, layout: INTERIOR.layout }, now);
  return {
    layout: INTERIOR.layout,
    position: {
      x: Math.max(18, Math.min(INTERIOR.accessibleWidth - 18, old.x / 3)),
      y: Math.max(18, Math.min(INTERIOR.height - 18, (old.y * 330) / 650)),
    },
    travel: null,
  };
}
export function interiorAt(
  state: InteriorPosition | undefined,
  now: number,
): Point {
  if (!state) return { ...INTERIOR.spawn };
  if (state.layout !== INTERIOR.layout)
    return migrateInterior(state, now)!.position;
  if (!state.travel) return { ...state.position };
  const t = state.travel;
  const fraction = Math.max(
    0,
    Math.min(1, (now - t.startsAt) / Math.max(1, t.endsAt - t.startsAt)),
  );
  return {
    x: t.from.x + (t.to.x - t.from.x) * fraction,
    y: t.from.y + (t.to.y - t.from.y) * fraction,
  };
}
export function interiorContains(p: Point): boolean {
  return (
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    p.x >= INTERIOR.minX &&
    p.x <= INTERIOR.accessibleWidth - 18 &&
    p.y >= 18 &&
    p.y <= INTERIOR.height - 18
  );
}
