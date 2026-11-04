import {
  advanceCustomerWork,
  collectCustomerReward,
  distance,
  WORKSHOP,
  workPoints,
  type CarSize,
  type Position,
  type WorkPoint,
  type WorkshopState,
} from "./index";
import { nearRaceDesk } from "./racing";

export const MECHANIC = {
  price: 300,
  rate: 0.75,
  speed: 2.35,
  rest: { x: -0.9, z: 8.5 },
};
export type MechanicState = {
  hired: boolean;
  enabled: boolean;
  position: Position;
  carried: "wheel" | null;
  collectProgress: number;
  phase:
    | "idle"
    | "walking"
    | "working"
    | "collecting"
    | "payout"
    | "break"
    | "waiting";
  target: string | null;
  finished: number;
  earnings: number;
};
export type MechanicTask = Position & { id: string; work?: WorkPoint };
export const newMechanic = (): MechanicState => ({
  hired: false,
  enabled: false,
  position: { ...MECHANIC.rest },
  carried: null,
  collectProgress: 0,
  phase: "idle",
  target: null,
  finished: 0,
  earnings: 0,
});
export function hireMechanic(s: WorkshopState) {
  if (
    s.mechanic.hired ||
    !s.team.unlocked ||
    s.racing.completed < 1 ||
    !nearRaceDesk(s.position) ||
    s.credits < MECHANIC.price
  )
    return false;
  s.credits -= MECHANIC.price;
  s.mechanic = { ...newMechanic(), hired: true, enabled: true };
  return true;
}
export function assignMechanic(s: WorkshopState, enabled: boolean) {
  if (!s.mechanic.hired || s.mechanic.enabled === enabled) return false;
  s.mechanic.enabled = enabled;
  s.mechanic.collectProgress = 0;
  s.mechanic.target = null;
  return true;
}
/** The player has priority at a shared work point. One carried wheel reserves
 * the final fitting for that actor, so the other cannot consume its task. */
export function mechanicTask(
  s: WorkshopState,
  size: CarSize,
  playerPoint?: WorkPoint,
): MechanicTask {
  const m = s.mechanic,
    rest = { ...MECHANIC.rest, id: "rest" };
  if (!m.enabled)
    return m.carried ? { ...WORKSHOP.supply, id: "return-wheel" } : rest;
  if (s.reward) return { ...WORKSHOP.payout, id: "payout" };
  if (s.order.status !== "service") return rest;
  let remaining = workPoints(s.order.kind, size).filter(
    (p) => (s.order.progress[p.id] || 0) < 1,
  );
  if (
    s.order.kind === "tires" &&
    (s.carried || s.collectProgress > 0) &&
    remaining.length <= 1
  )
    return m.carried ? { ...WORKSHOP.supply, id: "return-wheel" } : rest;
  remaining = remaining.filter(
    (p) => p.id !== playerPoint?.id && distance(s.position, p) > 0.78,
  );
  if (!remaining.length) return rest;
  if (s.order.kind === "tires" && !m.carried) {
    if (distance(s.position, WORKSHOP.supply) < 0.85) return rest;
    return {
      ...WORKSHOP.supply,
      id: "collect-wheel",
      work: {
        ...WORKSHOP.supply,
        id: "collect-wheel",
        label: "Picking up a wheel",
        kind: "collect",
      },
    };
  }
  // Retain the current destination while it is available, avoiding indecisive turns.
  const work =
    remaining.find((p) => p.id === m.target) ||
    remaining.sort(
      (a, b) => distance(m.position, a) - distance(m.position, b),
    )[0];
  return { ...work, work };
}
/** Movement is supplied by the collision-aware route controller. Work only
 * advances after the mechanic physically reaches this tick's valid task. */
export function tickMechanic(
  s: WorkshopState,
  seconds: number,
  size: CarSize,
  task: MechanicTask,
  reached: boolean,
  playerPoint?: WorkPoint,
) {
  const m = s.mechanic;
  if (!m.hired) return null;
  const dt = Math.max(
    0,
    Math.min(0.05, Number.isFinite(seconds) ? seconds : 0),
  );
  const valid = mechanicTask(s, size, playerPoint);
  if (task.id !== valid.id) {
    m.target = null;
    m.collectProgress = 0;
    return null;
  }
  if (m.target !== task.id) m.collectProgress = 0;
  m.target = task.id;
  if (!reached || distance(m.position, task) > 0.12) {
    m.phase = "walking";
    m.collectProgress = 0;
    return null;
  }
  if (task.id === "return-wheel") {
    m.carried = null;
    m.collectProgress = 0;
    return "returned";
  }
  if (task.id === "rest") {
    m.phase = m.enabled ? "waiting" : "break";
    return null;
  }
  if (!m.enabled) return null;
  if (task.id === "payout") {
    m.phase = "payout";
    const amount = collectCustomerReward(s, m.position);
    if (amount) {
      m.earnings += amount;
      return "paid";
    }
    return null;
  }
  if (task.work?.kind === "collect") {
    m.phase = "collecting";
    m.collectProgress = Math.min(
      1,
      m.collectProgress + dt / WORKSHOP.collectSeconds,
    );
    if (m.collectProgress >= 1) {
      m.carried = "wheel";
      m.collectProgress = 0;
      return "collected";
    }
    return null;
  }
  if (!task.work) return null;
  m.phase = "working";
  const event = advanceCustomerWork(s, task.work, dt, MECHANIC.rate, size, m);
  if (event === "job") m.finished++;
  return event;
}
export function restoreMechanic(raw: unknown, s: WorkshopState): MechanicState {
  const m = newMechanic();
  if (!raw || typeof raw !== "object") return m;
  const r = raw as Partial<MechanicState>;
  if (r.hired !== true || !s.team.unlocked) return m;
  m.hired = true;
  m.enabled = r.enabled === true;
  if (
    r.position &&
    Number.isFinite(r.position.x) &&
    Number.isFinite(r.position.z)
  )
    m.position = {
      x: Math.max(-3.68, Math.min(9.8, r.position.x)),
      z: Math.max(0.576, Math.min(9.984, r.position.z)),
    };
  if (
    r.carried === "wheel" &&
    s.order.status === "service" &&
    s.order.kind === "tires"
  )
    m.carried = "wheel";
  for (const k of ["finished", "earnings"] as const)
    if (Number.isSafeInteger(r[k]) && r[k]! >= 0) m[k] = r[k]!;
  if (
    !m.carried &&
    m.enabled &&
    s.order.status === "service" &&
    s.order.kind === "tires" &&
    r.target === "collect-wheel" &&
    Number.isFinite(r.collectProgress)
  ) {
    m.collectProgress = Math.max(0, Math.min(0.99, r.collectProgress!));
    m.target = "collect-wheel";
  }
  // Re-plan against the current car; never restore a stale work claim.
  return m;
}
