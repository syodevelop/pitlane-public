// Calibration fixtures, not approved competition or production rules.
export const RULESET = "garage-v0.1";
export const CHARACTERS = {
  Gus: {
    role: "Mechanic",
    detail: "+10% engine work rate · −10% delivery rate",
    engine: 1.1,
    delivery: 0.9,
    quick: 1,
  },
  Dash: {
    role: "Courier",
    detail: "+10% delivery rate · −10% quick service rate",
    engine: 1,
    delivery: 1.1,
    quick: 0.9,
  },
  Juno: {
    role: "Tuner",
    detail: "+10% quick service rate · −10% engine work rate",
    engine: 0.9,
    delivery: 1,
    quick: 1.1,
  },
} as const;
export type Character = keyof typeof CHARACTERS;
export type Point = { x: number; y: number };
export const STATIONS = {
  stock: { x: 95, y: 100, label: "Free stock" },
  tires: { x: 280, y: 100, label: "Tires" },
  quick: { x: 470, y: 100, label: "Quick service" },
  engine: { x: 660, y: 100, label: "Engine work" },
  starter: { x: 280, y: 350, label: "Rustback" },
  race: { x: 660, y: 350, label: "Circuit desk" },
} as const;
export type Station = keyof typeof STATIONS;
export const OBSTACLES = [{ x: 355, y: 200, w: 90, h: 55 }];
export const JOBS = {
  tires: {
    label: "Tires",
    duration: 60_000,
    credits: 80,
    rep: 10,
    rate: "quick",
  },
  quick: {
    label: "Quick Service",
    duration: 90_000,
    credits: 120,
    rep: 15,
    rate: "quick",
  },
  engine: {
    label: "Engine Work",
    duration: 120_000,
    credits: 160,
    rep: 20,
    rate: "engine",
  },
} as const;
export type JobKind = keyof typeof JOBS;
export type Work = {
  id: string;
  kind: JobKind | "stock" | "restore";
  startsAt: number;
  endsAt: number;
};
export type Race = {
  id: string;
  kind: "qualification" | "training";
  preparation: "sprint" | "endurance";
  startsAt: number;
  endsAt: number;
  tokenWeight: 0;
  ruleset: string;
};
export type State = {
  version: number;
  ruleset: string;
  character: Character | null;
  credits: number;
  rep: number;
  parts: number;
  position: Point;
  travel: { from: Point; to: Point; startsAt: number; endsAt: number } | null;
  work: Work | null;
  race: Race | null;
  completed: Record<JobKind, number>;
  restored: boolean;
  engine: number;
  reliability: number;
  qualified: boolean;
  sequence: number;
  events: { id: string; at: number; text: string }[];
};
export type Command =
  | { type: "select"; character: Character }
  | { type: "move"; target: Point }
  | { type: "start"; kind: Work["kind"] }
  | { type: "upgrade"; stat: "engine" | "reliability" }
  | { type: "race"; preparation: Race["preparation"] };
export class GameError extends Error {}
function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new GameError(message);
}
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export function initialState(): State {
  return {
    version: 0,
    ruleset: RULESET,
    character: null,
    credits: 0,
    rep: 0,
    parts: 0,
    position: { x: 95, y: 350 },
    travel: null,
    work: null,
    race: null,
    completed: { tires: 0, quick: 0, engine: 0 },
    restored: false,
    engine: 1,
    reliability: 1,
    qualified: false,
    sequence: 0,
    events: [],
  };
}
export function positionAt(s: State, now: number): Point {
  if (!s.travel) return s.position;
  const t = Math.min(
    1,
    Math.max(
      0,
      (now - s.travel.startsAt) / (s.travel.endsAt - s.travel.startsAt),
    ),
  );
  return {
    x: s.travel.from.x + (s.travel.to.x - s.travel.from.x) * t,
    y: s.travel.from.y + (s.travel.to.y - s.travel.from.y) * t,
  };
}
export function clearPath(a: Point, b: Point): boolean {
  // Sample at <= 2 units, with a 12-unit character radius; no corner cutting.
  const steps = Math.max(1, Math.ceil(distance(a, b) / 2));
  for (let i = 0; i <= steps; i++) {
    const p = {
      x: a.x + ((b.x - a.x) * i) / steps,
      y: a.y + ((b.y - a.y) * i) / steps,
    };
    if (p.x < 25 || p.x > 735 || p.y < 35 || p.y > 425) return false;
    if (
      OBSTACLES.some(
        (o) =>
          p.x >= o.x - 12 &&
          p.x <= o.x + o.w + 12 &&
          p.y >= o.y - 12 &&
          p.y <= o.y + o.h + 12,
      )
    )
      return false;
  }
  return true;
}
function event(s: State, id: string, at: number, text: string) {
  s.events = [{ id, at, text }, ...s.events].slice(0, 20);
}
export function settle(input: State, now: number): State {
  const s = structuredClone(input);
  if (s.travel && now >= s.travel.endsAt) {
    s.position = s.travel.to;
    s.travel = null;
    s.version++;
  }
  if (s.work && now >= s.work.endsAt) {
    const w = s.work;
    if (w.kind === "stock") {
      s.parts += 2;
      event(s, w.id, w.endsAt, "Two free parts delivered.");
    } else if (w.kind === "restore") {
      s.restored = true;
      event(s, w.id, w.endsAt, "Rustback restored. Your team starts here.");
    } else {
      const j = JOBS[w.kind];
      s.credits += j.credits;
      s.rep += j.rep;
      s.completed[w.kind]++;
      event(
        s,
        w.id,
        w.endsAt,
        `${j.label} complete: +${j.credits} Credits / +${j.rep} REP.`,
      );
    }
    s.work = null;
    s.version++;
  }
  if (s.race && now >= s.race.endsAt) {
    const r = s.race;
    s.credits += 100;
    s.rep += 20;
    if (r.kind === "qualification") s.qualified = true;
    event(
      s,
      r.id,
      r.endsAt,
      `${r.kind === "qualification" ? "Qualification" : "Training"} finished: +100 Credits / +20 REP.`,
    );
    s.race = null;
    s.version++;
  }
  return s;
}
export const orderCount = (s: State) =>
  Object.values(s.completed).reduce((a, b) => a + b, 0);
export const readyToQualify = (s: State) =>
  s.restored &&
  orderCount(s) >= 18 &&
  s.completed.tires >= 6 &&
  s.completed.quick >= 6 &&
  s.engine >= 2 &&
  s.reliability >= 2;
export function applyCommand(
  input: State,
  command: Command,
  now: number,
): State {
  const s = settle(input, now);
  requireRule(command && typeof command.type === "string", "Invalid command.");
  if (command.type === "select") {
    requireRule(!s.character, "Your character is already selected.");
    requireRule(
      Object.hasOwn(CHARACTERS, command.character),
      "Choose Gus, Dash or Juno.",
    );
    s.character = command.character;
    s.version++;
    return s;
  }
  requireRule(s.character, "Choose your character first.");
  const rates = CHARACTERS[s.character];
  function near(station: Station) {
    requireRule(!s.travel, "Wait until you arrive.");
    requireRule(
      distance(s.position, STATIONS[station]) <= 48,
      `Move to ${STATIONS[station].label}.`,
    );
  }
  if (command.type === "move") {
    requireRule(!s.work, "Finish your current work before moving.");
    const target = command.target;
    requireRule(
      target && Number.isFinite(target.x) && Number.isFinite(target.y),
      "Invalid destination.",
    );
    requireRule(
      target.x >= 25 && target.x <= 735 && target.y >= 35 && target.y <= 425,
      "Stay inside the garage.",
    );
    const from = positionAt(s, now);
    requireRule(
      clearPath(from, target),
      "The workbench blocks that path. Walk around it.",
    );
    requireRule(distance(from, target) >= 1, "Choose a different destination.");
    s.position = from;
    s.travel = {
      from,
      to: target,
      startsAt: now,
      endsAt: now + Math.ceil((distance(from, target) / 110) * 1000),
    };
  } else if (command.type === "start") {
    requireRule(!s.work, "One active work order at a time.");
    requireRule(
      command.kind === "stock" ||
        command.kind === "restore" ||
        Object.hasOwn(JOBS, command.kind),
      "Unknown work order.",
    );
    near(command.kind === "restore" ? "starter" : command.kind);
    let duration: number;
    if (command.kind === "stock") {
      requireRule(s.parts === 0, "Use your parts first. Capacity: two.");
      duration = 10_000 / rates.delivery;
    } else if (command.kind === "restore") {
      requireRule(!s.restored, "Rustback is already restored.");
      requireRule(orderCount(s) >= 1, "Complete your first customer order.");
      requireRule(s.parts >= 2, "Bring two parts from free stock.");
      s.parts -= 2;
      duration = 90_000 / rates.engine;
    } else {
      requireRule(s.parts >= 1, "Collect parts at free stock first.");
      s.parts--;
      duration = JOBS[command.kind].duration / rates[JOBS[command.kind].rate];
    }
    s.work = {
      id: `work-${++s.sequence}`,
      kind: command.kind,
      startsAt: now,
      endsAt: now + Math.ceil(duration),
    };
  } else if (command.type === "upgrade") {
    near("starter");
    requireRule(!s.work && !s.race, "Finish current work and racing first.");
    requireRule(s.restored, "Restore Rustback first.");
    requireRule(
      command.stat === "engine" || command.stat === "reliability",
      "Unknown upgrade.",
    );
    requireRule(
      s[command.stat] === 1,
      "Level two is the current prototype maximum.",
    );
    requireRule(s.credits >= 600, "You need 600 Credits.");
    s.credits -= 600;
    s[command.stat] = 2;
  } else if (command.type === "race") {
    near("race");
    requireRule(!s.race && !s.work, "Finish current work or race first.");
    requireRule(
      readyToQualify(s),
      "Complete the free qualification checklist first.",
    );
    requireRule(
      command.preparation === "sprint" || command.preparation === "endurance",
      "Choose a preparation.",
    );
    s.race = {
      id: `race-${++s.sequence}`,
      kind: s.qualified ? "training" : "qualification",
      preparation: command.preparation,
      startsAt: now,
      endsAt: now + 120_000,
      tokenWeight: 0,
      ruleset: RULESET,
    };
  } else throw new GameError("Unknown command.");
  s.version++;
  return s;
}
