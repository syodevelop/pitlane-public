import {
  BALANCE_VERSION,
  CARS,
  CHARACTERS,
  FIXTURES,
  GARAGE_UPGRADES,
  SERVICES,
  durationAtRate,
  type Mode,
  type Rate,
  type ServiceKind,
} from "./catalog.ts";
import {
  STATIONS,
  workPoints,
  garageBounds,
  GARAGE_LAYOUT_VERSION,
  clearPath,
  distance,
  routeTo,
  routeLength,
  type Point,
  type Station,
} from "./map.ts";
import type {
  Actor,
  Car,
  Command,
  Context,
  Garage,
  Intent,
  RaceInputs,
  RaceResult,
  Task,
  Transition,
} from "./model.ts";
export * from "./catalog.ts";
export * from "./map.ts";
export type * from "./model.ts";
import { INTERIOR, interiorAt, interiorContains, migrateInterior } from "./interior.ts";
export * from "./interior.ts";
export class RuleError extends Error {}
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RuleError(message);
}
const safe = (n: number) => Number.isSafeInteger(n) && n >= 0;
function context(input: Garage | null, c: Context) {
  check(
    safe(c.now) &&
      c.now <= Number.MAX_SAFE_INTEGER - 86_400_000 &&
      safe(c.seed) &&
      c.seed <= 0xffffffff,
    "Invalid server time or seed.",
  );
  check(c.balanceVersion === BALANCE_VERSION, "Unsupported balance version.");
  if (input) {
    check(
      input.progress.balanceVersion === c.balanceVersion &&
        input.progress.seed === c.seed,
      "A migration is required before changing this generation's rules or seed.",
    );
    check(c.now >= input.progress.lastNow, "Server time moved backwards.");
  }
}
function next(g: Garage, prefix: string) {
  return `${g.progress.generation}:${prefix}:${++g.progress.sequence}`;
}
function emit(
  g: Garage,
  kind: string,
  entityId: string,
  at: number,
  processedAt: number,
  credits = 0,
  rep = 0,
) {
  const p = g.progress;
  check(
    safe(p.credits + credits) && safe(p.rep + rep),
    "Resource range exceeded.",
  );
  p.credits += credits;
  p.rep += rep;
  p.events.push({
    id: next(g, "event"),
    kind,
    entityId,
    at,
    processedAt,
    credits,
    rep,
    balanceVersion: p.balanceVersion,
  });
}
function milestone(g: Garage, name: string, at: number, now: number) {
  if (g.progress.milestones.includes(name)) return;
  g.progress.milestones.push(name);
  // Recognition only. The underlying work/race has already received its reward.
  emit(g, "milestone", name, at, now);
}
function random(seed: number) {
  let x = seed >>> 0 || 0x9e3779b9;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
function arrivals(g: Garage, now: number) {
  if (Object.values(g.progress.jobs).some((j) => j.status === "offered"))
    return;
  const kinds: ServiceKind[] = [
    "tires",
    "quick",
    "engine",
    "tires",
    "quick",
    "engine",
  ];
  const rand = random(g.progress.seed ^ ++g.progress.pack);
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  for (const kind of kinds) {
    const id = next(g, "customer");
    const offer = SERVICES[kind];
    g.progress.jobs[id] = {
      id,
      kind,
      status: "offered",
      step: 0,
      credits: offer.credits,
      rep: offer.rep,
      balanceVersion: g.progress.balanceVersion,
      arrivedAt: now,
      acceptedAt: null,
      completedAt: null,
    };
    emit(g, "customer-arrived", id, now, now);
  }
}
export function createGarage(
  identity: string,
  generation: string,
  mode: Mode,
  c: Context,
): Garage {
  context(null, c);
  check(
    identity.length > 0 && /^[a-zA-Z0-9_-]{1,80}$/.test(generation),
    "Invalid profile or generation identity.",
  );
  check(mode === "demo" || mode === "main", "Unknown game mode.");
  const carId = `${generation}:starter`;
  const state: Garage = {
    profile: { identity, character: null },
    progress: {
      generation,
      mode,
      balanceVersion: c.balanceVersion,
      seed: c.seed,
      revision: 0,
      lastNow: c.now,
      sequence: 0,
      credits: 0,
      rep: 0,
      actors: {
        player: {
          id: "player",
          role: "Player",
          level: 1,
          position: { ...STATIONS.reception },
          travel: null,
          carrying: 0,
          taskId: null,
        },
      },
      stock: {
        stock: 0,
        tires: 0,
        quick: 0,
        engine: 0,
        starter: 0,
        race: 0,
        reception: 0,
      },
      partsIssued: 0,
      partsConsumed: 0,
      jobs: {},
      tasks: {},
      cars: {
        [carId]: {
          id: carId,
          tier: 1,
          source: "starter",
          purchaseEvent: null,
          restored: false,
          engine: 1,
          reliability: 1,
          prepared: null,
        },
      },
      activeSlots: Array.from({ length: FIXTURES.slots[mode] }, (_, i) =>
        i === 0 ? carId : null,
      ),
      races: {},
      upgrades: { quickTools: 0, engineTools: 0, capacity: 0, team: 0 },
      completed: { tires: 0, quick: 0, engine: 0 },
      milestones: [],
      tutorial: {
        collected: false,
        delivered: false,
        service: false,
        training: false,
      },
      qualified: false,
      pack: 0,
      events: [],
      receipts: {},
    },
  };
  arrivals(state, c.now);
  return state;
}
export function positionAt(actor: Actor, now: number): Point {
  if (!actor.travel) return { ...actor.position };
  const t = actor.travel;
  const alpha = Math.min(
    1,
    Math.max(0, (now - t.startsAt) / (t.endsAt - t.startsAt)),
  );
  const points = [t.from, ...(t.via || []), t.to];
  let remaining = routeLength(points) * alpha;
  for (let i = 1; i < points.length; i++) {
    const length = distance(points[i - 1], points[i]);
    if (length > 0 && remaining <= length) {
      const fraction = remaining / length;
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * fraction,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * fraction,
      };
    }
    remaining -= length;
  }
  return { ...t.to };
}
function actor(g: Garage, id: string): Actor {
  check(Object.hasOwn(g.progress.actors, id), "Unknown worker.");
  return g.progress.actors[id];
}
function car(g: Garage, id: string): Car {
  check(Object.hasOwn(g.progress.cars, id), "This car is not owned.");
  return g.progress.cars[id];
}
export function nearestWorkPosition(
  g: Garage,
  a: Actor,
  station: Station,
): 0 | 1 {
  const points = workPoints(station, g.progress.upgrades.capacity > 0);
  return points.length > 1 &&
    distance(a.position, points[1]) < distance(a.position, points[0])
    ? 1
    : 0;
}
function near(g: Garage, a: Actor, station: Station): 0 | 1 {
  check(Object.hasOwn(STATIONS, station), "Unknown station.");
  const position = nearestWorkPosition(g, a, station);
  check(
    !a.travel &&
      distance(
        a.position,
        workPoints(station, g.progress.upgrades.capacity > 0)[position],
      ) <= FIXTURES.interactionRadius,
    "Walk to the station first.",
  );
  return position;
}
function idle(a: Actor) {
  check(!a.taskId, "Finish the current task first.");
}
export function carryCapacity(a: Actor) {
  return a.role === "Runner" ? 2 + a.level - 1 : FIXTURES.playerCarry;
}
export function stationCapacity(g: Garage) {
  return 4 + 2 * g.progress.upgrades.capacity;
}
export function stationStock(g: Garage, station: Station, position: 0 | 1 = 0) {
  return position === 0
    ? g.progress.stock[station]
    : (g.progress.secondaryStock?.[station] ?? 0);
}
function setStationStock(
  g: Garage,
  station: Station,
  position: 0 | 1,
  amount: number,
) {
  if (position === 0) g.progress.stock[station] = amount;
  else (g.progress.secondaryStock ??= {})[station] = amount;
}
function workRate(g: Garage, a: Actor, rate: Rate, tools = 0) {
  check(g.profile.character, "Choose a character first.");
  const ownRate =
    a.role === "Player" ? CHARACTERS[g.profile.character][rate] : 1000;
  // Tools/staff training are separate investments. Character traits never affect staff.
  return Math.floor(
    (ownRate *
      (1000 + tools * 100 + (a.role === "Player" ? 0 : (a.level - 1) * 100))) /
      1000,
  );
}
function spend(g: Garage, amount: number, now: number, entity: string) {
  check(safe(amount) && g.progress.credits >= amount, "Not enough Credits.");
  emit(g, "credits-spent", entity, now, now, -amount, 0);
}
function consume(g: Garage, a: Actor, station: Station, amount: number) {
  const position = near(g, a, station);
  check(
    stationStock(g, station, position) >= amount,
    "Deliver the required parts to this station.",
  );
  setStationStock(
    g,
    station,
    position,
    stationStock(g, station, position) - amount,
  );
  g.progress.partsConsumed += amount;
}
function busyCar(g: Garage, id: string) {
  return (
    Object.values(g.progress.races).some(
      (r) => r.carId === id && r.status === "started",
    ) ||
    Object.values(g.progress.tasks).some(
      (t) => t.carId === id && t.status === "started",
    )
  );
}
export function basicTutorialDone(g: Garage) {
  const t = g.progress.tutorial;
  return t.collected && t.delivered && t.service;
}
export function readyToQualify(g: Garage) {
  const p = g.progress;
  const starter = Object.values(p.cars).find((c) => c.source === "starter")!;
  return (
    basicTutorialDone(g) &&
    p.tutorial.training &&
    starter.restored &&
    starter.engine >= 2 &&
    starter.reliability >= 2 &&
    p.completed.tires >= 6 &&
    p.completed.quick >= 6 &&
    Object.values(p.completed).reduce((a, b) => a + b, 0) >= 18
  );
}
export function eligibleCar(g: Garage, owned: Car) {
  if (!basicTutorialDone(g)) return false;
  if (owned.source === "verified-purchase" && owned.purchaseEvent) return true;
  return (
    owned.source === "starter" && g.progress.qualified && readyToQualify(g)
  );
}
export function raceResult(inputs: RaceInputs): RaceResult {
  check(inputs.balanceVersion === BALANCE_VERSION, "Unknown race rules.");
  const performance =
    inputs.setup === "sprint"
      ? inputs.pace * 5 + inputs.reliability * 2 + inputs.preparation * 3
      : inputs.pace * 2 + inputs.reliability * 5 + inputs.preparation * 3;
  return {
    performance,
    position:
      1 + inputs.opponents.filter((score) => score >= performance).length,
    fieldSize: inputs.opponents.length + 1,
  };
}
export function completionEpoch(
  endsAt: number,
  origin: number,
  durationMs: number,
) {
  check(
    safe(endsAt) &&
      safe(origin) &&
      endsAt >= origin &&
      safe(durationMs) &&
      durationMs > 0,
    "Invalid epoch schedule.",
  );
  const index = Math.floor((endsAt - origin) / durationMs);
  return {
    index,
    startAt: origin + index * durationMs,
    endAt: origin + (index + 1) * durationMs,
  };
}
function settleMutable(g: Garage, c: Context) {
  const p = g.progress;
  if(p.interior) p.interior = migrateInterior(p.interior,c.now);
  // Sort by canonical completion time, never delivery order. Reconnection does not start anything.
  const due = [
    ...Object.values(p.actors)
      .filter((a) => a.travel && a.travel.endsAt <= c.now)
      .map((a) => ({
        type: "travel" as const,
        id: a.id,
        at: a.travel!.endsAt,
      })),
    ...Object.values(p.tasks)
      .filter((t) => t.status === "started" && t.endsAt <= c.now)
      .map((t) => ({ type: "task" as const, id: t.id, at: t.endsAt })),
    ...Object.values(p.races)
      .filter((r) => r.status === "started" && r.endsAt <= c.now)
      .map((r) => ({ type: "race" as const, id: r.id, at: r.endsAt })),
  ].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  for (const item of due) {
    if (item.type === "travel") {
      const a = p.actors[item.id];
      a.position = a.travel!.to;
      a.travel = null;
      emit(g, "arrived", a.id, item.at, c.now);
    } else if (item.type === "task") {
      const t = p.tasks[item.id];
      t.status = "completed";
      t.processedAt = c.now;
      const a = p.actors[t.actorId];
      a.taskId = null;
      if (t.kind === "stock") {
        a.carrying += t.outputParts;
        p.partsIssued += t.outputParts;
        if (a.role === "Player") p.tutorial.collected = true;
      } else if (t.kind === "restore") {
        p.cars[t.carId!].restored = true;
        milestone(g, "starter-restored", t.endsAt, c.now);
      } else if (t.kind === "prepare") {
        p.cars[t.carId!].prepared = t.preparation;
      } else {
        const j = p.jobs[t.jobId!];
        j.step++;
        if (j.step === SERVICES[j.kind].steps.length) {
          j.status = "completed";
          j.completedAt = t.endsAt;
          p.completed[j.kind]++;
          p.tutorial.service = true;
          emit(g, "service-completed", j.id, t.endsAt, c.now, j.credits, j.rep);
          milestone(g, "first-service", t.endsAt, c.now);
        } else j.status = "accepted";
      }
      emit(g, "work-completed", t.id, t.endsAt, c.now);
    } else {
      const r = p.races[item.id];
      r.status = "completed";
      r.processedAt = c.now;
      // v0.1 had a finite reward schedule but no simulated finishing position.
      r.result = r.legacyRuleset ? null : raceResult(r.inputs);
      if (r.kind === "tutorial") {
        p.tutorial.training = true;
        milestone(g, "first-training", r.endsAt, c.now);
      }
      if (r.kind === "qualification") {
        p.qualified = true;
        milestone(g, "qualified", r.endsAt, c.now);
      }
      emit(g, "race-completed", r.id, r.endsAt, c.now, r.credits, r.rep);
    }
  }
  if (due.length) p.revision++;
  p.lastNow = c.now;
}
export function settle(input: Garage, c: Context): Transition {
  context(input, c);
  const state = structuredClone(input);
  const offset = state.progress.events.length;
  settleMutable(state, c);
  assertInvariants(state);
  return {
    state,
    events: state.progress.events.slice(offset),
    duplicate: false,
  };
}
function startTask(
  g: Garage,
  a: Actor,
  c: Context,
  spec: Omit<
    Task,
    | "id"
    | "actorId"
    | "startsAt"
    | "endsAt"
    | "status"
    | "processedAt"
    | "balanceVersion"
  > & { duration: number },
) {
  idle(a);
  const workPosition = near(g, a, spec.station);
  // Each physical station has one work position; capacity investment opens another.
  const active = Object.values(g.progress.tasks).filter(
    (t) => t.status === "started" && t.station === spec.station,
  ).length;
  check(
    active < (g.progress.upgrades.capacity > 0 ? 2 : 1),
    "This work station is occupied.",
  );
  check(
    !Object.values(g.progress.tasks).some(
      (t) =>
        t.status === "started" &&
        t.station === spec.station &&
        (t.workPosition ?? 0) === workPosition,
    ),
    "This work position is occupied. Use the other position if it is available.",
  );
  const { duration, ...fields } = spec;
  const id = next(g, "work");
  const task: Task = {
    ...fields,
    workPosition,
    layoutVersion: GARAGE_LAYOUT_VERSION,
    id,
    actorId: a.id,
    startsAt: c.now,
    endsAt: c.now + durationAtRate(duration, spec.rate),
    status: "started",
    processedAt: null,
    balanceVersion: c.balanceVersion,
  };
  g.progress.tasks[id] = task;
  a.taskId = id;
  emit(g, "work-started", id, c.now, c.now);
}
function apply(g: Garage, command: Command, c: Context) {
  const p = g.progress;
  if (command.type === "select") {
    check(!g.profile.character, "Your character choice is permanent.");
    check(Object.hasOwn(CHARACTERS, command.character), "Unknown character.");
    g.profile.character = command.character;
    emit(g, "character-selected", g.profile.identity, c.now, c.now);
    return;
  }
  check(g.profile.character, "Choose your character first.");
  switch (command.type) {
    case "interiorMove": {
      check(
        command.target && interiorContains(command.target),
        "Stay inside the garage walls.",
      );
      const from = interiorAt(p.interior, c.now);
      const length = distance(from, command.target);
      check(length >= 0.5, "Choose another floor position.");
      p.interior = {
        layout: INTERIOR.layout,
        position: from,
        travel: {
          from,
          to: { ...command.target },
          startsAt: c.now,
          endsAt: c.now + Math.ceil((length * 1000) / INTERIOR.speed),
        },
      };
      break;
    }
    case "interiorStop": {
      p.interior = { layout: INTERIOR.layout, position: interiorAt(p.interior, c.now), travel: null };
      break;
    }
    case "move":
    case "navigate": {
      const a = actor(g, command.actorId);
      idle(a);
      const from = positionAt(a, c.now);
      const bounds = garageBounds(p.upgrades.capacity > 0);
      check(
        command.target &&
          command.target.x >= bounds.minX &&
          command.target.x <= bounds.maxX &&
          command.target.y >= bounds.minY &&
          command.target.y <= bounds.maxY,
        "This area is outside your garage. Customer capacity opens the annex.",
      );
      const path =
        command.target &&
        (command.type === "navigate"
          ? routeTo(from, command.target)
          : clearPath(from, command.target)
            ? [{ ...command.target }]
            : null);
      check(
        path && distance(from, command.target) >= 1,
        "Choose a reachable waypoint around the workbench.",
      );
      const baseSpeed =
        a.role === "Player" ? FIXTURES.playerSpeed : FIXTURES.helperSpeed;
      const rate = a.carrying ? workRate(g, a, "delivery") : 1000;
      a.position = from;
      a.travel = {
        from,
        to: { ...command.target },
        ...(path.length > 1 ? { via: path.slice(0, -1) } : {}),
        startsAt: c.now,
        endsAt:
          c.now +
          durationAtRate(
            Math.ceil((routeLength([from, ...path]) * 1000) / baseSpeed),
            rate,
          ),
      };
      emit(g, "travel-started", a.id, c.now, c.now);
      break;
    }
    case "interact": {
      near(g, p.actors.player, command.station);
      if (command.station === "reception") arrivals(g, c.now);
      emit(g, "station-interacted", command.station, c.now, c.now);
      break;
    }
    case "acceptService": {
      near(g, p.actors.player, "reception");
      const j = p.jobs[command.jobId];
      check(
        j && j.status === "offered",
        "This customer is not waiting for acceptance.",
      );
      check(
        Object.values(p.jobs).filter(
          (j) => j.status === "accepted" || j.status === "working",
        ).length <
          2 + p.upgrades.capacity,
        "Your customer queue is full.",
      );
      j.status = "accepted";
      j.acceptedAt = c.now;
      emit(g, "service-accepted", j.id, c.now, c.now);
      break;
    }
    case "declineService": {
      near(g, p.actors.player, "reception");
      const j = p.jobs[command.jobId];
      check(
        j &&
          (j.status === "offered" || j.status === "accepted") &&
          j.step === 0 &&
          !Object.values(p.tasks).some((t) => t.jobId === j.id),
        "Only unstarted work may be declined.",
      );
      // Rotate the same advertised offer, rather than rerolling a more profitable pack.
      j.status = "offered";
      j.acceptedAt = null;
      emit(g, "service-declined", j.id, c.now, c.now);
      break;
    }
    case "pickUp": {
      const a = actor(g, command.actorId);
      idle(a);
      const workPosition = near(g, a, command.station);
      check(
        safe(command.amount) &&
          command.amount > 0 &&
          a.carrying + command.amount <= carryCapacity(a),
        "Carrying capacity exceeded.",
      );
      if (command.station === "stock") {
        const rate = workRate(g, a, "delivery");
        startTask(g, a, c, {
          kind: "stock",
          station: "stock",
          jobId: null,
          carId: null,
          preparation: null,
          step: null,
          parts: 0,
          outputParts: command.amount,
          rate,
          duration: FIXTURES.stockMs,
        });
      } else {
        check(
          stationStock(g, command.station, workPosition) >= command.amount,
          "There are not enough delivered parts here.",
        );
        setStationStock(
          g,
          command.station,
          workPosition,
          stationStock(g, command.station, workPosition) - command.amount,
        );
        a.carrying += command.amount;
        emit(g, "parts-picked-up", a.id, c.now, c.now);
      }
      break;
    }
    case "putDown": {
      const a = actor(g, command.actorId);
      idle(a);
      const workPosition = near(g, a, command.station);
      check(
        command.station !== "stock",
        "Keep or deliver issued parts; the free stock is not a refund point.",
      );
      check(
        safe(command.amount) &&
          command.amount > 0 &&
          a.carrying >= command.amount,
        "You are not carrying these parts.",
      );
      check(
        stationStock(g, command.station, workPosition) + command.amount <=
          stationCapacity(g),
        "Station storage is full.",
      );
      a.carrying -= command.amount;
      setStationStock(
        g,
        command.station,
        workPosition,
        stationStock(g, command.station, workPosition) + command.amount,
      );
      if (a.role === "Player") p.tutorial.delivered = true;
      emit(g, "parts-delivered", a.id, c.now, c.now);
      break;
    }
    case "startWork": {
      const a = actor(g, command.actorId);
      idle(a);
      if (command.kind === "service") {
        check(
          a.role === "Player" || a.role === "Mechanic",
          "This worker cannot service customers.",
        );
        const j = p.jobs[command.jobId];
        check(
          j && j.status === "accepted",
          "Accept this service contract first.",
        );
        const step = SERVICES[j.kind].steps[j.step];
        check(step, "This contract is already complete.");
        const tools =
          j.kind === "engine" ? p.upgrades.engineTools : p.upgrades.quickTools;
        const rate = workRate(g, a, "service", tools);
        startTask(g, a, c, {
          kind: "service",
          station: step.station,
          jobId: j.id,
          carId: null,
          preparation: null,
          step: j.step,
          parts: step.parts,
          outputParts: 0,
          rate,
          duration: step.duration,
        });
        consume(g, a, step.station, step.parts);
        j.status = "working";
      } else {
        check(
          command.kind === "restore" || command.kind === "prepare",
          "Unknown own-car work.",
        );
        check(
          a.role === "Player" || a.role === "Team Manager",
          "This worker cannot prepare the racing team.",
        );
        const owned = car(g, command.carId);
        check(!busyCar(g, owned.id), "This car is already in use.");
        if (command.kind === "restore")
          check(
            !owned.restored && owned.source === "starter",
            "Only the broken starter needs restoration.",
          );
        else {
          check(owned.restored, "Restore this car first.");
          check(
            command.preparation === "sprint" ||
              command.preparation === "endurance",
            "Unknown preparation.",
          );
        }
        const parts = command.kind === "restore" ? 2 : 1;
        const rate = workRate(g, a, "preparation", p.upgrades.team);
        startTask(g, a, c, {
          kind: command.kind,
          station: "starter",
          jobId: null,
          carId: owned.id,
          preparation: command.kind === "prepare" ? command.preparation : null,
          step: null,
          parts,
          outputParts: 0,
          rate,
          duration:
            command.kind === "restore"
              ? FIXTURES.restorationMs
              : FIXTURES.preparationMs,
        });
        consume(g, a, "starter", parts);
      }
      break;
    }
    case "completeWork": {
      const t = p.tasks[command.taskId];
      check(
        t && t.status === "completed",
        "This work has not reached its scheduled finish.",
      );
      // settleMutable already emitted its one completion; this command grants nothing.
      break;
    }
    case "hire": {
      near(g, p.actors.player, "reception");
      check(Object.hasOwn(FIXTURES.hire, command.role), "Unknown staff role.");
      const staff = Object.values(p.actors).filter((a) => a.role !== "Player");
      check(
        staff.length < (p.mode === "demo" ? 1 : 3),
        "All staff positions are filled.",
      );
      check(
        p.mode === "main" || command.role !== "Team Manager",
        "The demo has one Runner or Mechanic.",
      );
      check(
        !staff.some((a) => a.role === command.role),
        "This staff role is already filled.",
      );
      spend(g, FIXTURES.hire[command.role], c.now, command.role);
      const id = next(g, "staff");
      p.actors[id] = {
        id,
        role: command.role,
        level: 1,
        position: { ...STATIONS.reception },
        travel: null,
        carrying: 0,
        taskId: null,
      };
      emit(g, "staff-hired", id, c.now, c.now);
      break;
    }
    case "upgrade": {
      check(
        Object.hasOwn(p.upgrades, command.target),
        "Unknown garage upgrade.",
      );
      near(g, p.actors.player, "reception");
      const level = p.upgrades[command.target];
      check(level < 3, "This prototype upgrade is at its maximum.");
      spend(
        g,
        GARAGE_UPGRADES[command.target].cost * (level + 1),
        c.now,
        command.target,
      );
      p.upgrades[command.target]++;
      emit(g, "garage-upgraded", command.target, c.now, c.now);
      break;
    }
    case "upgradeStaff": {
      near(g, p.actors.player, "reception");
      const a = actor(g, command.actorId);
      check(
        a.role !== "Player" && a.level < 3,
        "This staff member cannot be upgraded further.",
      );
      spend(g, a.level * 400, c.now, a.id);
      a.level++;
      emit(g, "staff-upgraded", a.id, c.now, c.now);
      break;
    }
    case "upgradeCar": {
      near(g, p.actors.player, "starter");
      const owned = car(g, command.carId);
      check(
        command.stat === "engine" || command.stat === "reliability",
        "Unknown car upgrade.",
      );
      check(
        owned.restored && !busyCar(g, owned.id),
        "Bring a ready, idle car to preparation.",
      );
      check(
        owned[command.stat] < 3,
        "This prototype car upgrade is at its maximum.",
      );
      spend(g, owned[command.stat] === 1 ? 600 : 1000, c.now, owned.id);
      owned[command.stat]++;
      emit(g, "car-upgraded", owned.id, c.now, c.now);
      break;
    }
    case "buyDemoCar": {
      near(g, p.actors.player, "reception");
      check(
        p.mode === "demo" && command.tier === 2,
        "This Credits catalog is only for demo Club Coupe purchases.",
      );
      spend(g, FIXTURES.demoCoupeCredits, c.now, "demo-catalog");
      const id = next(g, "car");
      p.cars[id] = {
        id,
        tier: 2,
        source: "demo",
        purchaseEvent: null,
        restored: true,
        engine: 1,
        reliability: 1,
        prepared: null,
      };
      emit(g, "demo-car-purchased", id, c.now, c.now);
      break;
    }
    case "assignCar": {
      near(g, p.actors.player, "race");
      check(
        safe(command.slot) && command.slot < p.activeSlots.length,
        "Unknown active race slot.",
      );
      const previous = p.activeSlots[command.slot];
      check(
        !previous || !busyCar(g, previous),
        "Finish this slot's race or preparation first.",
      );
      if (command.carId !== null) {
        const owned = car(g, command.carId);
        check(
          !busyCar(g, owned.id) && owned.restored,
          "This car is not ready for assignment.",
        );
        check(
          !p.activeSlots.includes(owned.id),
          "This car is already assigned.",
        );
      }
      p.activeSlots[command.slot] = command.carId;
      emit(g, "race-slot-assigned", String(command.slot), c.now, c.now);
      break;
    }
    case "dispatchRace": {
      near(g, p.actors.player, "race");
      const owned = car(g, command.carId);
      check(
        owned.restored &&
          owned.prepared &&
          p.activeSlots.includes(owned.id) &&
          !busyCar(g, owned.id),
        "Prepare an assigned, idle car before dispatch.",
      );
      check(
        ["tutorial", "training", "qualification", "eligible"].includes(
          command.kind,
        ),
        "Unknown race kind.",
      );
      if (command.kind === "tutorial")
        check(
          !p.tutorial.training &&
            !Object.values(p.races).some((r) => r.kind === "tutorial"),
          "The short tutorial race is one-time.",
        );
      if (command.kind === "qualification")
        check(
          !p.qualified &&
            readyToQualify(g) &&
            !Object.values(p.races).some(
              (r) => r.kind === "qualification" && r.status === "started",
            ),
          "Complete the free qualification checklist first.",
        );
      if (command.kind === "eligible")
        check(
          eligibleCar(g, owned),
          "This car has not completed its eligibility path.",
        );
      const tier = CARS[owned.tier];
      const id = next(g, "race");
      const inputs: RaceInputs = {
        pace: tier.pace + (owned.engine - 1) * 8,
        reliability: tier.reliability + (owned.reliability - 1) * 8,
        preparation: tier.preparation + p.upgrades.team * 3,
        setup: owned.prepared,
        opponents: [430, 470, 510, 550, 590],
        balanceVersion: c.balanceVersion,
      };
      const contributionWeight =
        p.mode === "main" &&
        command.kind === "eligible" &&
        eligibleCar(g, owned)
          ? Math.floor((tier.weight * (1000 + p.upgrades.team * 25)) / 1000)
          : 0;
      p.races[id] = {
        id,
        carId: owned.id,
        kind: command.kind,
        startsAt: c.now,
        endsAt:
          c.now +
          (command.kind === "tutorial"
            ? FIXTURES.tutorialRaceMs
            : FIXTURES.regularRaceMs),
        processedAt: null,
        status: "started",
        inputs,
        result: null,
        credits: 100,
        rep: 20,
        contributionWeight,
        balanceVersion: c.balanceVersion,
      };
      owned.prepared = null;
      emit(g, "race-started", id, c.now, c.now);
      break;
    }
    case "resolveRace": {
      check(
        p.races[command.raceId]?.status === "completed",
        "This race has not reached its scheduled finish.",
      );
      break;
    }
    default:
      throw new RuleError("Unknown command.");
  }
}
function fingerprint(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(fingerprint).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => `${JSON.stringify(key)}:${fingerprint(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function execute(input: Garage, intent: Intent, c: Context): Transition {
  context(input, c);
  check(/^[a-zA-Z0-9_-]{1,100}$/.test(intent.id), "Invalid idempotency key.");
  const payload = fingerprint(intent.command);
  const previous = input.progress.receipts[intent.id];
  if (previous) {
    check(
      previous.fingerprint === payload,
      "This command ID was used for different work.",
    );
    return { state: structuredClone(input), events: [], duplicate: true };
  }
  const state = structuredClone(input);
  const offset = state.progress.events.length;
  settleMutable(state, c);
  apply(state, intent.command, c);
  emit(state, "command-accepted", intent.id, c.now, c.now);
  const events = state.progress.events.slice(offset);
  state.progress.receipts[intent.id] = {
    fingerprint: payload,
    eventIds: events.map((e) => e.id),
  };
  state.progress.revision++;
  assertInvariants(state);
  return { state, events, duplicate: false };
}
export function assertInvariants(g: Garage) {
  const p = g.progress;
  if (p.interior) {
    check(interiorContains(p.interior.position), "Invalid interior position.");
    const t = p.interior.travel;
    if (t)
      check(
        interiorContains(t.from) &&
          interiorContains(t.to) &&
          safe(t.startsAt) &&
          safe(t.endsAt) &&
          t.endsAt > t.startsAt,
        "Invalid interior travel.",
      );
  }
  check(
    [p.credits, p.rep, p.partsIssued, p.partsConsumed].every(safe),
    "Invalid resource balance.",
  );
  const carried = Object.values(p.actors).reduce((sum, a) => {
    check(
      safe(a.carrying) && a.carrying <= carryCapacity(a),
      "Invalid carrying inventory.",
    );
    check(
      !a.taskId || p.tasks[a.taskId]?.status === "started",
      "Worker task reference is inconsistent.",
    );
    return sum + a.carrying;
  }, 0);
  const stored = [
    ...Object.values(p.stock),
    ...Object.values(p.secondaryStock ?? {}),
  ].reduce((sum, n) => {
    check(safe(n) && n <= stationCapacity(g), "Invalid station inventory.");
    return sum + n;
  }, 0);
  check(
    p.partsIssued === carried + stored + p.partsConsumed,
    "Physical parts were created or lost.",
  );
  const assigned = p.activeSlots.filter((id) => id !== null);
  check(
    assigned.length === new Set(assigned).size &&
      assigned.every((id) => Object.hasOwn(p.cars, id)),
    "Invalid active collection assignment.",
  );
  check(
    p.activeSlots.length === FIXTURES.slots[p.mode],
    "Invalid race slot count.",
  );
  check(
    p.events.length === new Set(p.events.map((e) => e.id)).size,
    "Duplicate event identity.",
  );
}
