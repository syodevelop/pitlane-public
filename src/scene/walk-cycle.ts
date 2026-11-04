// Visual gait only. Motion still comes from the authoritative travel schedule.
export type WalkCycle = { phase: number; axisX: number; axisY: number };
const CYCLE_DISTANCE = 50;
const LEG_LENGTH = 56 * 0.61;
export function advanceWalkCycle(cycle: WalkCycle, dx: number, dy: number): WalkCycle {
  const distance = Math.hypot(dx, dy);
  if (distance < 0.01) return cycle;
  return {
    phase: (cycle.phase + (distance / CYCLE_DISTANCE) * Math.PI * 2) % (Math.PI * 2),
    axisX: dx / distance,
    axisY: dy / distance,
  };
}
export function walkLegPose(cycle: WalkCycle, leg: number, legLength = LEG_LENGTH) {
  // A planted foot sweeps back as the body travels forward. Opposite legs share
  // one cycle; limiting stretch keeps the original boot shapes readable.
  const reach = Math.sin(cycle.phase) * (leg === 0 ? 1 : -1) * CYCLE_DISTANCE / 4;
  return {
    angle: -Math.asin(reach * cycle.axisX / legLength) * 180 / Math.PI,
    stretch: Math.max(0.78, Math.min(1.22, 1 + reach * cycle.axisY / legLength)),
  };
}
