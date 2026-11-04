import {
  distance,
  WORKSHOP,
  workPoints,
  type CarSize,
  type WorkPoint,
  type WorkshopState,
} from "./index";

export const PERFORMANCE = {
  price: 600,
  requiredRep: 6,
  wallX: 64 / 3,
  maxX: 32 - 0.58,
  door: { x: 20.15, z: 6.8 },
  passageMinZ: 6.14,
  passageMaxZ: 7.46,
  car: { x: 80 / 3, z: 5.2 },
  bench: { x: 30.65, z: 6.5 },
  approach: { x: 29.35, z: 6.5 },
  payout: { x: 23.7, z: 8.6 },
  reward: 160,
  rep: 1,
  seconds: { diagnose: 6, bench: 9, install: 8 },
} as const;
export type EngineStage = "diagnose" | "bench" | "install";
export type PerformanceState = {
  unlocked: boolean;
  number: number;
  status: "arriving" | "service" | "complete";
  progress: Record<EngineStage, number>;
  carried: boolean;
  reward: boolean;
  completed: number;
};
export const newPerformance = (): PerformanceState => ({
  unlocked: false,
  number: 1,
  status: "arriving",
  progress: { diagnose: 0, bench: 0, install: 0 },
  carried: false,
  reward: false,
  completed: 0,
});
export const canOpenPerformance = (s: WorkshopState) =>
  s.team.unlocked &&
  s.mechanic.hired &&
  s.racing.rep >= PERFORMANCE.requiredRep;
export function unlockPerformance(s: WorkshopState) {
  if (
    s.performance.unlocked ||
    !canOpenPerformance(s) ||
    s.credits < PERFORMANCE.price ||
    distance(s.position, PERFORMANCE.door) > WORKSHOP.shopRadius
  )
    return false;
  s.credits -= PERFORMANCE.price;
  s.performance.unlocked = true;
  return true;
}
export function engineStage(s: PerformanceState): EngineStage | null {
  return (
    (["diagnose", "bench", "install"] as const).find(
      (k) => s.progress[k] < 1,
    ) ?? null
  );
}
export function performancePoint(
  s: WorkshopState,
  size: CarSize,
): WorkPoint | undefined {
  const p = s.performance;
  if (!p.unlocked || p.status !== "service" || s.carried) return;
  const stage = engineStage(p);
  if (!stage) return;
  if (stage === "install" && !p.carried) return;
  const engine = workPoints("repair", size)[0];
  const position =
    stage === "bench"
      ? PERFORMANCE.approach
      : { x: engine.x + PERFORMANCE.car.x - WORKSHOP.car.x, z: engine.z };
  return {
    ...position,
    id: stage,
    kind: stage,
    owner: "performance",
    label:
      stage === "diagnose"
        ? "Diagnose the engine"
        : stage === "bench"
          ? "Rebuild the alternator"
          : "Install the alternator",
  };
}
/** Shared with the main tick; only the current physical step may advance. */
export function tickPerformance(
  s: WorkshopState,
  dt: number,
  size: CarSize,
  moving: boolean,
) {
  const p = s.performance;
  if (!p.unlocked) return null;
  if (
    p.reward &&
    distance(s.position, PERFORMANCE.payout) < WORKSHOP.pickupRadius
  ) {
    p.reward = false;
    s.credits += PERFORMANCE.reward;
    s.racing.rep += PERFORMANCE.rep;
    return "performance-paid" as const;
  }
  const point = performancePoint(s, size);
  if (moving || !point || distance(s.position, point) >= WORKSHOP.workRadius)
    return null;
  const k = point.id as EngineStage;
  p.progress[k] = Math.min(
    1,
    p.progress[k] +
      (Math.max(0, Math.min(0.05, Number.isFinite(dt) ? dt : 0)) *
        (s.tools ? WORKSHOP.upgradedRate : 1)) /
        PERFORMANCE.seconds[k],
  );
  if (p.progress[k] < 1) return null;
  if (k === "bench") p.carried = true;
  if (k === "install") {
    p.carried = false;
    p.status = "complete";
    p.reward = true;
    p.completed++;
    s.serviced++;
    return "performance-done" as const;
  }
  return "performance-step" as const;
}
export function nextPerformance(s: WorkshopState) {
  const p = s.performance;
  if (p.status !== "complete" || p.reward) return false;
  s.performance = {
    ...newPerformance(),
    unlocked: true,
    number: p.number + 1,
    completed: p.completed,
  };
  return true;
}
export function restorePerformance(
  raw: unknown,
  s: WorkshopState,
): PerformanceState {
  const p = newPerformance();
  if (!raw || typeof raw !== "object" || !s.team.unlocked) return p;
  const r = raw as Partial<PerformanceState>;
  if (r.unlocked !== true) return p;
  p.unlocked = true;
  for (const k of ["number", "completed"] as const)
    if (Number.isSafeInteger(r[k]) && r[k]! >= (k === "number" ? 1 : 0))
      p[k] = r[k]!;
  if (["arriving", "service", "complete"].includes(r.status!))
    p.status = r.status!;
  for (const k of ["diagnose", "bench", "install"] as const) {
    const v = r.progress?.[k];
    if (Number.isFinite(v)) p.progress[k] = Math.max(0, Math.min(1, v!));
  }
  if (p.progress.diagnose < 1) p.progress.bench = p.progress.install = 0;
  if (p.progress.bench < 1) p.progress.install = 0;
  if (p.status === "complete" && p.progress.install < 1) p.status = "service";
  p.reward = p.status === "complete" && r.reward === true;
  p.carried =
    p.status === "service" && p.progress.bench >= 1 && p.progress.install < 1;
  return p;
}
