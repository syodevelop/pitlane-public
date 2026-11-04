/** The playable workshop rules. No renderer, browser, wallet or wall-clock dependencies.
 * Credits are local demo points. This state must never be imported as a token balance.
 * A future server can run the same commands/ticks against its own saved state. */
import { newRacing, restoreRacing, SPRINT, type RacingState } from "./racing";
import { newMechanic, restoreMechanic, type MechanicState } from "./mechanic";
import {
  PERFORMANCE,
  newPerformance,
  restorePerformance,
  performancePoint,
  tickPerformance,
  type PerformanceState,
} from "./performance";
export type Position = { x: number; z: number };
export type WorkKind = "front" | "rear" | "all" | "repair" | "tires";
export type WorkPoint = Position & {
  id: string;
  label: string;
  kind:
    "wipe" | "repair" | "collect" | "wheel" | "diagnose" | "bench" | "install";
  owner?: "team" | "performance";
};
export const TEAM_GARAGE = {
  price: 300,
  requiredCars: 5,
  wallX: 32 / 3,
  doorZ: 7.8,
  door: { x: 9.5, z: 7.8 },
  car: { x: 16, z: 4.9 },
  maxX: 64 / 3 - 0.58,
  passageMinZ: 7.14,
  passageMaxZ: 8.46,
};
export type CarSize = {
  halfWidth: number;
  halfLength: number;
  frontAxle?: number;
};
export const WORKSHOP = {
  version: 1 as const,
  spawn: { x: 2.1, z: 7.8 },
  car: { x: 16 / 3, z: 5.2 },
  cart: { x: -0.4, z: 0.72 },
  shop: { x: -0.4, z: 1.95 },
  rack: { x: -2.5, z: 5 },
  supply: { x: -2.99, z: 6.2 },
  collectSeconds: 1.1,
  payout: { x: 2.35, z: 7.4 },
  workRadius: 0.72,
  pickupRadius: 0.85,
  shopRadius: 1.05,
  upgradePrice: 150,
  upgradedRate: 1.4,
  targetCars: 5,
};
const jobs: WorkKind[] = [
  "front",
  "repair",
  "tires",
  "rear",
  "all",
  "tires",
  "repair",
];
export const JOBS = {
  front: { label: "Clean the front headlights", reward: 50, seconds: 4 },
  rear: { label: "Clean the rear lights", reward: 50, seconds: 4 },
  all: { label: "Clean all four lights", reward: 80, seconds: 4 },
  repair: { label: "Quick engine service", reward: 65, seconds: 7 },
  tires: { label: "Replace the front wheels", reward: 90, seconds: 5.5 },
} as const;
export type WorkshopState = {
  version: 1;
  character: "gus" | "dash" | "juno";
  position: Position;
  credits: number;
  serviced: number;
  tools: 0 | 1;
  carried: "wheel" | null;
  collectProgress: number;
  order: {
    number: number;
    kind: WorkKind;
    status: "arriving" | "service" | "complete";
    progress: Record<string, number>;
  };
  reward: { order: number; amount: number } | null;
  milestoneSeen: boolean;
  team: { unlocked: boolean; progress: Record<string, number> };
  racing: RacingState;
  mechanic: MechanicState;
  performance: PerformanceState;
};
export type WorkshopEvent =
  | "step"
  | "job"
  | "pickup"
  | "upgrade"
  | "collected"
  | "team-step"
  | "team-ready"
  | "prepared"
  | "performance-step"
  | "performance-done"
  | "performance-paid"
  | null;
export function newWorkshop(
  character: WorkshopState["character"] = "gus",
): WorkshopState {
  return {
    version: 1,
    character,
    position: { ...WORKSHOP.spawn },
    credits: 0,
    serviced: 0,
    tools: 0,
    carried: null,
    collectProgress: 0,
    order: { number: 1, kind: "front", status: "arriving", progress: {} },
    reward: null,
    milestoneSeen: false,
    team: { unlocked: false, progress: {} },
    racing: newRacing(),
    mechanic: newMechanic(),
    performance: newPerformance(),
  };
}
export function teamWorkPoints(size: CarSize): WorkPoint[] {
  return [...workPoints("front", size), ...workPoints("repair", size)].map(
    (p) => ({
      ...p,
      id: `team-${p.id}`,
      owner: "team",
      label: p.kind === "repair" ? "Restore the engine" : p.label,
      x: p.x + TEAM_GARAGE.car.x - WORKSHOP.car.x,
      z: p.z + TEAM_GARAGE.car.z - WORKSHOP.car.z,
    }),
  );
}
export const teamReady = (s: WorkshopState) =>
  s.team.unlocked &&
  ["team-front-left", "team-front-right", "team-engine"].every(
    (id) => s.team.progress[id] >= 1,
  );
export function racePreparationPoint(size: CarSize): WorkPoint {
  const p = teamWorkPoints(size).find((p) => p.kind === "repair")!;
  return { ...p, id: "team-prepare", label: "Pre-race inspection" };
}
export function unlockTeamGarage(s: WorkshopState) {
  if (
    s.team.unlocked ||
    !s.tools ||
    s.serviced < TEAM_GARAGE.requiredCars ||
    s.credits < TEAM_GARAGE.price ||
    distance(s.position, TEAM_GARAGE.door) > WORKSHOP.shopRadius
  )
    return false;
  s.credits -= TEAM_GARAGE.price;
  s.team.unlocked = true;
  return true;
}
/** Keep the separating wall solid except for its real doorway. */
export function workshopMove(
  from: Position,
  to: Position,
  unlocked: boolean,
  performance = false,
): Position {
  const next = {
    x: Math.max(
      -3.68,
      Math.min(
        performance ? PERFORMANCE.maxX : unlocked ? TEAM_GARAGE.maxX : 10.09,
        to.x,
      ),
    ),
    z: Math.max(0.576, Math.min(9.984, to.z)),
  };
  if (!unlocked) return next;
  for (const wall of performance ? [TEAM_GARAGE, PERFORMANCE] : [TEAM_GARAGE]) {
    const left = wall.wallX - 0.5,
      right = wall.wallX + 0.5;
    const intersects =
      Math.max(from.x, next.x) > left && Math.min(from.x, next.x) < right;
    if (!intersects) continue;
    if (from.x > left && from.x < right) {
      next.z = Math.max(wall.passageMinZ, Math.min(wall.passageMaxZ, next.z));
    } else if (
      Math.min(from.z, next.z) < wall.passageMinZ ||
      Math.max(from.z, next.z) > wall.passageMaxZ
    ) {
      next.x =
        from.x <= left ? Math.min(next.x, left) : Math.max(next.x, right);
    }
  }
  return next;
}
export function workPoints(kind: WorkKind, size: CarSize): WorkPoint[] {
  const { x, z } = WORKSHOP.car;
  if (kind === "tires")
    return [-1, 1].map((side) => ({
      id: `wheel-${side < 0 ? "left" : "right"}`,
      label: `Front ${side < 0 ? "left" : "right"} wheel`,
      kind: "wheel",
      x: x + side * (size.halfWidth + 0.57),
      z: z + (size.frontAxle ?? -size.halfLength * 0.57),
    }));
  // Work from outside the swept vehicle collision envelope, including mirrors.
  if (kind === "repair")
    return [
      {
        id: "engine",
        label: "Engine service",
        kind: "repair",
        x: x - size.halfWidth - 0.52,
        z: z - size.halfLength + 1.1,
      },
    ];
  const result: WorkPoint[] = [];
  for (const end of [-1, 1]) {
    if ((kind === "front" && end === 1) || (kind === "rear" && end === -1))
      continue;
    for (const side of [-1, 1])
      result.push({
        id: `${end < 0 ? "front" : "rear"}-${side < 0 ? "left" : "right"}`,
        label: `${end < 0 ? "Front" : "Rear"} ${side < 0 ? "left" : "right"} light`,
        kind: "wipe",
        x: x + side * size.halfWidth * 0.58,
        z: z + end * (size.halfLength + 0.58),
      });
  }
  return result;
}
export const distance = (a: Position, b: Position) =>
  Math.hypot(a.x - b.x, a.z - b.z);
export function activePoint(
  state: WorkshopState,
  size: CarSize,
  moving: boolean,
  teamSize: CarSize = size,
  performanceSize: CarSize = size,
): WorkPoint | undefined {
  if (!moving) {
    const p = performancePoint(state, performanceSize);
    if (p && distance(state.position, p) < WORKSHOP.workRadius) return p;
  }
  if (state.performance.carried) return;
  if (!moving && state.team.unlocked && !state.carried) {
    if (
      teamReady(state) &&
      state.racing.phase === "idle" &&
      state.racing.preparation < 1
    ) {
      const point = racePreparationPoint(teamSize);
      if (distance(state.position, point) < WORKSHOP.workRadius) return point;
    }
    const point = teamWorkPoints(teamSize).find(
      (p) =>
        (state.team.progress[p.id] || 0) < 1 &&
        distance(state.position, p) < WORKSHOP.workRadius,
    );
    if (point) return point;
  }
  if (state.order.status !== "service" || moving) return;
  if (state.order.kind === "tires" && !state.carried) {
    if (distance(state.position, WORKSHOP.supply) < WORKSHOP.workRadius)
      return {
        ...WORKSHOP.supply,
        id: "collect-wheel",
        label: "Picking up a wheel",
        kind: "collect",
      };
    return;
  }
  return workPoints(state.order.kind, size).find(
    (p) =>
      (state.order.progress[p.id] || 0) < 1 &&
      distance(state.position, p) < WORKSHOP.workRadius,
  );
}
/** Call with elapsed ACTIVE simulation time only; hidden tabs never accumulate work. */
export function tickWorkshop(
  state: WorkshopState,
  seconds: number,
  size: CarSize,
  moving: boolean,
  teamSize: CarSize = size,
  performanceSize: CarSize = size,
): WorkshopEvent {
  const performanceEvent = tickPerformance(
    state,
    seconds,
    performanceSize,
    moving,
  );
  if (performanceEvent) return performanceEvent;
  if (state.performance.carried || state.position.x > PERFORMANCE.wallX)
    return null;
  const point = activePoint(state, size, moving, teamSize);
  let event: WorkshopEvent = null;
  const dt = Math.max(
    0,
    Math.min(0.05, Number.isFinite(seconds) ? seconds : 0),
  );
  if (point?.owner === "team") {
    state.collectProgress = 0;
    if (point.id === "team-prepare") {
      state.racing.preparation = Math.min(
        1,
        state.racing.preparation +
          dt /
            (SPRINT.preparationSeconds -
              state.racing.upgrades.reliability * 0.5),
      );
      return state.racing.preparation >= 1 ? "prepared" : null;
    }
    const progress =
      (state.team.progress[point.id] || 0) +
      (dt * (state.tools ? WORKSHOP.upgradedRate : 1)) /
        (point.kind === "repair" ? 12 : 5);
    state.team.progress[point.id] = Math.min(1, progress);
    if (progress >= 1) return teamReady(state) ? "team-ready" : "team-step";
    return null;
  }
  if (point?.kind === "collect") {
    state.collectProgress = Math.min(
      1,
      state.collectProgress + dt / WORKSHOP.collectSeconds,
    );
    if (state.collectProgress >= 1) {
      state.carried = "wheel";
      state.collectProgress = 0;
      return "collected";
    }
    return null;
  }
  state.collectProgress = 0;
  if (point)
    event = advanceCustomerWork(
      state,
      point,
      dt,
      state.tools ? WORKSHOP.upgradedRate : 1,
      size,
      state,
    );
  if (collectCustomerReward(state, state.position)) event = "pickup";
  return event;
}
/** Shared settlement for player and staff; a completed job can settle only once. */
export function advanceCustomerWork(
  state: WorkshopState,
  point: WorkPoint,
  dt: number,
  rate: number,
  size: CarSize,
  worker: { carried: "wheel" | null },
): WorkshopEvent {
  if (
    state.order.status !== "service" ||
    (state.order.progress[point.id] || 0) >= 1 ||
    !workPoints(state.order.kind, size).some((p) => p.id === point.id) ||
    (point.kind === "wheel" && !worker.carried)
  )
    return null;
  const progress = Math.min(
    1,
    (state.order.progress[point.id] || 0) +
      (dt * rate) / JOBS[state.order.kind].seconds,
  );
  state.order.progress[point.id] = progress;
  if (progress < 1) return null;
  if (point.kind === "wheel") worker.carried = null;
  if (
    workPoints(state.order.kind, size).every(
      (p) => state.order.progress[p.id] >= 1,
    )
  ) {
    state.order.status = "complete";
    state.serviced++;
    state.reward = {
      order: state.order.number,
      amount: JOBS[state.order.kind].reward,
    };
    return "job";
  }
  return "step";
}
export function collectCustomerReward(
  state: WorkshopState,
  position: Position,
) {
  if (
    !state.reward ||
    distance(position, WORKSHOP.payout) >= WORKSHOP.pickupRadius
  )
    return 0;
  const amount = state.reward.amount;
  state.credits += amount;
  state.reward = null;
  return amount;
}
export function dockClient(state: WorkshopState) {
  if (state.order.status === "arriving") state.order.status = "service";
}
export function nextClient(state: WorkshopState) {
  if (state.order.status !== "complete" || state.reward) return false;
  state.carried = null;
  state.collectProgress = 0;
  const number = state.order.number + 1;
  state.order = {
    number,
    kind: jobs[(number - 1) % jobs.length],
    status: "arriving",
    progress: {},
  };
  return true;
}
export function buyTools(state: WorkshopState) {
  if (
    state.tools ||
    state.credits < WORKSHOP.upgradePrice ||
    distance(state.position, WORKSHOP.shop) > WORKSHOP.shopRadius
  )
    return false;
  state.credits -= WORKSHOP.upgradePrice;
  state.tools = 1;
  return true;
}
export const milestoneReady = (s: WorkshopState) =>
  s.serviced >= WORKSHOP.targetCars && s.tools === 1 && !s.reward;
/** Validate at the storage boundary. Malformed/future saves never break scene startup. */
export function restoreWorkshop(raw: string | null): WorkshopState {
  try {
    const s = JSON.parse(raw || "null") as WorkshopState;
    if (
      !s ||
      s.version !== 1 ||
      !s.order ||
      !Object.hasOwn(JOBS, s.order.kind) ||
      !["arriving", "service", "complete"].includes(s.order.status) ||
      !Number.isSafeInteger(s.order.number) ||
      s.order.number < 1 ||
      !Number.isSafeInteger(s.credits) ||
      s.credits < 0 ||
      !Number.isSafeInteger(s.serviced) ||
      s.serviced < 0 ||
      ![0, 1].includes(s.tools) ||
      !["gus", "dash", "juno"].includes(s.character) ||
      !s.position ||
      !Number.isFinite(s.position.x) ||
      !Number.isFinite(s.position.z) ||
      !s.order.progress ||
      typeof s.order.progress !== "object" ||
      Object.values(s.order.progress).some(
        (v) => typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1,
      ) ||
      (s.reward &&
        (s.reward.order !== s.order.number ||
          s.order.status !== "complete" ||
          s.reward.amount !== JOBS[s.order.kind].reward))
    )
      return newWorkshop();
    const progress = s.team?.progress;
    s.team = { unlocked: s.team?.unlocked === true, progress: {} };
    if (s.team.unlocked && progress && typeof progress === "object") {
      for (const id of ["team-front-left", "team-front-right", "team-engine"]) {
        const value = progress[id];
        if (Number.isFinite(value))
          s.team.progress[id] = Math.max(0, Math.min(1, value));
      }
    }
    s.racing = restoreRacing(s.racing, teamReady(s));
    s.mechanic = restoreMechanic(s.mechanic, s);
    s.performance = restorePerformance(s.performance, s);
    s.position.x = Math.max(
      -3.68,
      Math.min(
        s.performance.unlocked
          ? PERFORMANCE.maxX
          : s.team.unlocked
            ? TEAM_GARAGE.maxX
            : 10.09,
        s.position.x,
      ),
    );
    s.position.z = Math.max(0.576, Math.min(9.984, s.position.z));
    if (
      s.position.x > TEAM_GARAGE.wallX - 0.5 &&
      s.position.x < TEAM_GARAGE.wallX + 0.5 &&
      (s.position.z < TEAM_GARAGE.passageMinZ ||
        s.position.z > TEAM_GARAGE.passageMaxZ)
    )
      s.position.x = TEAM_GARAGE.wallX - 0.5;
    if (
      s.performance.unlocked &&
      Math.abs(s.position.x - PERFORMANCE.wallX) < 0.5 &&
      (s.position.z < PERFORMANCE.passageMinZ ||
        s.position.z > PERFORMANCE.passageMaxZ)
    )
      s.position.x = PERFORMANCE.wallX - 0.5;
    // Compatible with saves from before inventory existed. Never reset an
    // existing shift just because a new feature added fields.
    s.carried =
      s.order.kind === "tires" &&
      s.order.status === "service" &&
      !s.performance.carried &&
      s.carried === "wheel"
        ? "wheel"
        : null;
    s.collectProgress =
      !s.carried &&
      s.order.kind === "tires" &&
      Number.isFinite(s.collectProgress)
        ? Math.max(0, Math.min(0.99, s.collectProgress))
        : 0;
    s.milestoneSeen = s.milestoneSeen === true;
    return s;
  } catch {
    return newWorkshop();
  }
}
