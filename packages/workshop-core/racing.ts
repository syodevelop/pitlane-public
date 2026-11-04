import type { Position, WorkshopState } from "./index";

export const RACE_DESK = { x: 19.65, z: 8.25 };
export const RACE_DESK_APPROACH = { x: 18.45, z: 8.25 };
export const RACE_STATS = ["engine", "grip", "reliability"] as const;
export type RaceStat = (typeof RACE_STATS)[number];
export type CarStats = Record<RaceStat, number>;
export const SPRINT = {
  name: "Coastal Sprint",
  seconds: 45,
  departureSeconds: 13,
  returnSeconds: 17,
  maxLevel: 3,
  prices: [100, 160, 240],
  preparationSeconds: 6,
  base: { engine: 40, grip: 35, reliability: 45 },
  gain: { engine: 10, grip: 8, reliability: 8 },
  weights: { engine: 0.6, grip: 0.25, reliability: 0.15 },
  medals: [
    { name: "Gold", target: 60, credits: 140, rep: 6 },
    { name: "Silver", target: 50, credits: 100, rep: 4 },
    { name: "Bronze", target: 40, credits: 70, rep: 2 },
  ],
} as const;
export type SprintResult = {
  id: number;
  stats: CarStats;
  score: number;
  medal: "Gold" | "Silver" | "Bronze";
  credits: number;
  rep: number;
};
export type RacingState = {
  upgrades: CarStats;
  preparation: number;
  phase: "idle" | "leaving" | "racing" | "returning" | "result";
  elapsed: number;
  starts: number;
  completed: number;
  rep: number;
  bestScore: number;
  run: SprintResult | null;
  lastResult: SprintResult | null;
};
export const newRacing = (): RacingState => ({
  upgrades: { engine: 0, grip: 0, reliability: 0 },
  preparation: 0,
  phase: "idle",
  elapsed: 0,
  starts: 0,
  completed: 0,
  rep: 0,
  bestScore: 0,
  run: null,
  lastResult: null,
});
export const carStats = (s: RacingState): CarStats =>
  Object.fromEntries(
    RACE_STATS.map((k) => [k, SPRINT.base[k] + s.upgrades[k] * SPRINT.gain[k]]),
  ) as CarStats;
export function sprintResult(stats: CarStats, id = 0): SprintResult {
  const score = Math.round(
    RACE_STATS.reduce((v, k) => v + stats[k] * SPRINT.weights[k], 0),
  );
  const medal =
    SPRINT.medals.find((m) => score >= m.target) || SPRINT.medals[2];
  return {
    id,
    stats: { ...stats },
    score,
    medal: medal.name,
    credits: medal.credits,
    rep: medal.rep,
  };
}
export const nearRaceDesk = (p: Position) =>
  Math.hypot(p.x - RACE_DESK_APPROACH.x, p.z - RACE_DESK_APPROACH.z) < 1.1;
export const carAtHome = (r: RacingState) =>
  r.phase === "idle" || r.phase === "result";
const restored = (s: WorkshopState) =>
  s.team.unlocked &&
  ["team-front-left", "team-front-right", "team-engine"].every(
    (id) => s.team.progress[id] >= 1,
  );
export function buyCarUpgrade(
  s: WorkshopState,
  stat: RaceStat,
  expectedLevel: number,
) {
  const r = s.racing;
  if (
    !RACE_STATS.includes(stat) ||
    !restored(s) ||
    !nearRaceDesk(s.position) ||
    r.phase !== "idle" ||
    r.upgrades[stat] !== expectedLevel ||
    expectedLevel >= SPRINT.maxLevel
  )
    return false;
  const price = SPRINT.prices[expectedLevel];
  if (s.credits < price) return false;
  s.credits -= price;
  r.upgrades[stat]++;
  // A changed setup needs a fresh inspection before it can leave the workshop.
  r.preparation = 0;
  return true;
}
export function startSprint(s: WorkshopState) {
  const r = s.racing;
  if (
    !restored(s) ||
    !nearRaceDesk(s.position) ||
    r.phase !== "idle" ||
    r.preparation < 1 ||
    s.carried
  )
    return false;
  r.starts++;
  r.run = sprintResult(carStats(r), r.starts);
  r.preparation = 0;
  r.elapsed = 0;
  r.phase = "leaving";
  return true;
}
/** Only active play time advances a race. Route obstruction freezes travel, not the race itself. */
export function tickSprint(
  s: WorkshopState,
  seconds: number,
  travelClear = true,
) {
  const r = s.racing;
  if (!r.run || r.phase === "idle" || r.phase === "result") return false;
  if (r.phase !== "racing" && !travelClear) return false;
  r.elapsed += Math.max(
    0,
    Math.min(0.05, Number.isFinite(seconds) ? seconds : 0),
  );
  const limit =
    r.phase === "leaving"
      ? SPRINT.departureSeconds
      : r.phase === "returning"
        ? SPRINT.returnSeconds
        : SPRINT.seconds;
  if (r.elapsed < limit) return false;
  if (r.phase === "racing" && !travelClear) {
    r.elapsed = limit;
    return false;
  }
  r.phase =
    r.phase === "leaving"
      ? "racing"
      : r.phase === "racing"
        ? "returning"
        : "result";
  r.elapsed = 0;
  return true;
}
export function claimSprint(s: WorkshopState) {
  const r = s.racing;
  if (r.phase !== "result" || !r.run) return false;
  s.credits += r.run.credits;
  r.rep += r.run.rep;
  r.completed++;
  r.bestScore = Math.max(r.bestScore, r.run.score);
  r.lastResult = r.run;
  r.run = null;
  r.phase = "idle";
  r.elapsed = 0;
  return true;
}
export function restoreRacing(value: unknown, ready: boolean): RacingState {
  const r = newRacing();
  if (!ready || !value || typeof value !== "object") return r;
  const s = value as Partial<RacingState>;
  for (const k of RACE_STATS) {
    const n = s.upgrades?.[k];
    if (Number.isSafeInteger(n) && n! >= 0 && n! <= SPRINT.maxLevel)
      r.upgrades[k] = n!;
  }
  for (const k of ["starts", "completed", "rep", "bestScore"] as const) {
    const n = s[k];
    if (Number.isSafeInteger(n) && n! >= 0) r[k] = n!;
  }
  r.preparation = Number.isFinite(s.preparation)
    ? Math.max(0, Math.min(1, s.preparation!))
    : 0;
  function result(raw: SprintResult | null | undefined) {
    if (
      !raw ||
      !Number.isSafeInteger(raw.id) ||
      raw.id < 1 ||
      !raw.stats ||
      !RACE_STATS.every(
        (k) =>
          Number.isFinite(raw.stats[k]) &&
          raw.stats[k] >= SPRINT.base[k] &&
          raw.stats[k] <= SPRINT.base[k] + SPRINT.maxLevel * SPRINT.gain[k],
      )
    )
      return null;
    return sprintResult(raw.stats, raw.id);
  }
  r.lastResult = result(s.lastResult);
  const run = result(s.run);
  if (
    run &&
    ["leaving", "racing", "returning", "result"].includes(s.phase || "") &&
    (!r.lastResult || run.id > r.lastResult.id)
  ) {
    r.run = run;
    r.starts = Math.max(r.starts, run.id);
    r.phase = s.phase!;
    const limit =
      r.phase === "leaving"
        ? SPRINT.departureSeconds
        : r.phase === "returning"
          ? SPRINT.returnSeconds
          : r.phase === "racing"
            ? SPRINT.seconds
            : 0;
    r.elapsed = Number.isFinite(s.elapsed)
      ? Math.max(0, Math.min(limit, s.elapsed!))
      : 0;
    r.preparation = 0;
  }
  return r;
}
