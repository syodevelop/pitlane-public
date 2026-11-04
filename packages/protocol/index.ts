import {
  BALANCE_VERSION,
  CHARACTERS,
  STATIONS,
  assertInvariants,
  type Command,
  type Garage,
} from "../game-core/index";
export const SCHEMA_VERSION = 2 as const;
export type ErrorCode =
  | "INVALID_REQUEST"
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "STATE_CONFLICT"
  | "RATE_LIMITED"
  | "UNAVAILABLE";
export class ProtocolError extends Error {
  readonly code = "INVALID_REQUEST";
}
export type CommandEnvelope = {
  schemaVersion: typeof SCHEMA_VERSION;
  ruleset: string;
  generation: string;
  id: string;
  version: number;
  command: Command;
};
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ProtocolError("Expected an object.");
  return value as Record<string, unknown>;
}
function check(
  condition: unknown,
  message = "Invalid protocol field.",
): asserts condition {
  if (!condition) throw new ProtocolError(message);
}
function keys(value: Record<string, unknown>, expected: string[]) {
  check(
    Object.keys(value).length === expected.length &&
      expected.every((key) => Object.hasOwn(value, key)),
    "Unexpected or missing fields.",
  );
}
const integer = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
const entity = (v: unknown) =>
  typeof v === "string" &&
  /^[a-zA-Z0-9:_-]{1,180}$/.test(v) &&
  !["__proto__", "constructor", "prototype"].includes(v);
function choice(value: unknown, values: readonly string[]) {
  check(typeof value === "string" && values.includes(value), "Unknown choice.");
}
function point(value: unknown) {
  const p = record(value);
  keys(p, ["x", "y"]);
  check(
    typeof p.x === "number" &&
      typeof p.y === "number" &&
      Number.isFinite(p.x) &&
      Number.isFinite(p.y) &&
      Math.abs(p.x) <= 10000 &&
      Math.abs(p.y) <= 10000,
    "Invalid waypoint.",
  );
}
export function parseCommandEnvelope(value: unknown): CommandEnvelope {
  const b = record(value);
  keys(b, [
    "schemaVersion",
    "ruleset",
    "generation",
    "id",
    "version",
    "command",
  ]);
  check(
    b.schemaVersion === SCHEMA_VERSION && b.ruleset === BALANCE_VERSION,
    "This game version has changed. Reload before continuing.",
  );
  check(
    typeof b.id === "string" &&
      /^[a-zA-Z0-9-]{16,64}$/.test(b.id) &&
      entity(b.generation) &&
      integer(b.version),
    "Invalid command identity or revision.",
  );
  const c = record(b.command);
  switch (c.type) {
    case "interiorMove":
      keys(c, ["type", "target"]);
      point(c.target);
      break;
    case "interiorStop":
      keys(c, ["type"]);
      break;
    case "select":
      keys(c, ["type", "character"]);
      choice(c.character, Object.keys(CHARACTERS));
      break;
    case "move":
    case "navigate":
      keys(c, ["type", "actorId", "target"]);
      check(entity(c.actorId));
      point(c.target);
      break;
    case "interact":
      keys(c, ["type", "station"]);
      choice(c.station, Object.keys(STATIONS));
      break;
    case "acceptService":
    case "declineService":
      keys(c, ["type", "jobId"]);
      check(entity(c.jobId));
      break;
    case "pickUp":
    case "putDown":
      keys(c, ["type", "actorId", "station", "amount"]);
      check(entity(c.actorId));
      choice(c.station, Object.keys(STATIONS));
      check(
        integer(c.amount) &&
          (c.amount as number) > 0 &&
          (c.amount as number) <= 10,
      );
      break;
    case "startWork":
      choice(c.kind, ["restore", "service", "prepare"]);
      keys(c, [
        "type",
        "actorId",
        "kind",
        c.kind === "service" ? "jobId" : "carId",
        ...(c.kind === "prepare" ? ["preparation"] : []),
      ]);
      check(
        entity(c.actorId) && entity(c.kind === "service" ? c.jobId : c.carId),
      );
      if (c.kind === "prepare") choice(c.preparation, ["sprint", "endurance"]);
      break;
    case "completeWork":
      keys(c, ["type", "taskId"]);
      check(entity(c.taskId));
      break;
    case "hire":
      keys(c, ["type", "role"]);
      choice(c.role, ["Runner", "Mechanic", "Team Manager"]);
      break;
    case "upgrade":
      keys(c, ["type", "target"]);
      choice(c.target, ["quickTools", "engineTools", "capacity", "team"]);
      break;
    case "upgradeStaff":
      keys(c, ["type", "actorId"]);
      check(entity(c.actorId));
      break;
    case "upgradeCar":
      keys(c, ["type", "carId", "stat"]);
      check(entity(c.carId));
      choice(c.stat, ["engine", "reliability"]);
      break;
    case "buyDemoCar":
      keys(c, ["type", "tier"]);
      check(c.tier === 2);
      break;
    case "assignCar":
      keys(c, ["type", "carId", "slot"]);
      check(c.carId === null || entity(c.carId));
      check(integer(c.slot) && (c.slot as number) < 3);
      break;
    case "dispatchRace":
      keys(c, ["type", "carId", "kind"]);
      check(entity(c.carId));
      choice(c.kind, ["tutorial", "training", "qualification", "eligible"]);
      break;
    case "resolveRace":
      keys(c, ["type", "raceId"]);
      check(entity(c.raceId));
      break;
    default:
      throw new ProtocolError("Unknown command.");
  }
  return b as CommandEnvelope;
}
export function parseBaseUnits(value: unknown): bigint {
  check(
    typeof value === "string" && /^(0|[1-9][0-9]{0,77})$/.test(value),
    "Token amounts must be unsigned integer base-unit strings.",
  );
  const amount = BigInt(value);
  check(amount < 2n ** 256n, "Token amount exceeds uint256.");
  return amount;
}
export function errorCode(status: number): ErrorCode {
  return (
    (
      {
        400: "INVALID_REQUEST",
        401: "AUTH_REQUIRED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "STATE_CONFLICT",
        429: "RATE_LIMITED",
        500: "UNAVAILABLE",
      } as Record<number, ErrorCode>
    )[status] || "UNAVAILABLE"
  );
}
export function commandFingerprint(value: unknown): string {
  if (Array.isArray(value))
    return "[" + value.map(commandFingerprint).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + commandFingerprint(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function validateResponse(
  value: unknown,
  path: string,
  ok: boolean,
): void {
  const r = record(value);
  check(
    r.schemaVersion === SCHEMA_VERSION,
    "The server version changed. Reload before continuing.",
  );
  if (!ok) {
    check(typeof r.error === "string");
    choice(r.code, [
      "INVALID_REQUEST",
      "AUTH_REQUIRED",
      "FORBIDDEN",
      "NOT_FOUND",
      "STATE_CONFLICT",
      "RATE_LIMITED",
      "UNAVAILABLE",
    ]);
    return;
  }
  if (path === "state" || path === "command") {
    check(
      typeof r.address === "string" &&
        /^0x[0-9a-fA-F]{40}$/.test(r.address) &&
        integer(r.now),
      "Invalid snapshot identity.",
    );
    const g = record(r.state),
      profile = record(g.profile),
      p = record(g.progress);
    check(
      profile.identity === r.address &&
        (profile.character === null ||
          Object.hasOwn(CHARACTERS, String(profile.character))),
      "Invalid profile snapshot.",
    );
    check(
      p.balanceVersion === BALANCE_VERSION &&
        entity(p.generation) &&
        integer(p.revision) &&
        integer(p.lastNow) &&
        integer(p.seed) &&
        integer(p.sequence),
    );
    choice(p.mode, ["demo", "main"]);
    for (const field of [
      "actors",
      "stock",
      "cars",
      "jobs",
      "tasks",
      "races",
      "upgrades",
      "completed",
      "tutorial",
      "receipts",
    ])
      record(p[field]);
    check(
      Array.isArray(p.events) &&
        Array.isArray(p.milestones) &&
        Array.isArray(p.activeSlots) &&
        typeof p.qualified === "boolean",
    );
    const actors = record(p.actors);
    check(Object.hasOwn(actors, "player"));
    for (const [id, value] of Object.entries(actors)) {
      const a = record(value);
      check(
        a.id === id && entity(id) && integer(a.level) && integer(a.carrying),
      );
      point(a.position);
      choice(a.role, ["Player", "Runner", "Mechanic", "Team Manager"]);
      check(a.taskId === null || entity(a.taskId));
      if (a.travel !== null) {
        const t = record(a.travel);
        point(t.from);
        point(t.to);
        if (t.via !== undefined) {
          check(Array.isArray(t.via) && t.via.length <= 16);
          for (const waypoint of t.via as unknown[]) point(waypoint);
        }
        check(
          integer(t.startsAt) &&
            integer(t.endsAt) &&
            (t.endsAt as number) > (t.startsAt as number),
        );
      }
    }
    for (const value of Object.values(record(p.cars))) {
      const c = record(value);
      check(
        entity(c.id) &&
          integer(c.tier) &&
          (c.tier as number) >= 1 &&
          (c.tier as number) <= 5 &&
          integer(c.engine) &&
          integer(c.reliability) &&
          typeof c.restored === "boolean",
      );
      choice(c.source, ["starter", "demo", "verified-purchase"]);
      if (c.prepared !== null) choice(c.prepared, ["sprint", "endurance"]);
    }
    for (const value of Object.values(record(p.jobs))) {
      const j = record(value);
      check(
        entity(j.id) && integer(j.step) && integer(j.credits) && integer(j.rep),
      );
      choice(j.kind, ["tires", "quick", "engine"]);
      choice(j.status, ["offered", "accepted", "working", "completed"]);
    }
    for (const field of ["tasks", "races"])
      for (const value of Object.values(record(p[field]))) {
        const t = record(value);
        check(
          entity(t.id) &&
            integer(t.startsAt) &&
            integer(t.endsAt) &&
            (t.endsAt as number) > (t.startsAt as number),
        );
        choice(t.status, ["started", "completed"]);
        if (field === "tasks") {
          check(entity(t.actorId));
          choice(t.kind, ["stock", "restore", "service", "prepare"]);
          choice(t.station, Object.keys(STATIONS));
        } else {
          check(entity(t.carId));
          choice(t.kind, ["tutorial", "training", "qualification", "eligible"]);
          record(t.inputs);
        }
      }
    for (const e of p.events as unknown[]) {
      const event = record(e);
      check(
        entity(event.id) &&
          typeof event.kind === "string" &&
          integer(event.at) &&
          integer(event.processedAt) &&
          Number.isSafeInteger(event.credits) &&
          integer(event.rep),
      );
    }
    try {
      assertInvariants(g as Garage);
    } catch {
      throw new ProtocolError(
        "Incomplete game snapshot. Your saved progress is safe.",
      );
    }
  } else if (path === "auth/challenge")
    check(
      typeof r.message === "string" &&
        r.message.length > 0 &&
        integer(r.chainId) &&
        r.chainId !== 0 &&
        integer(r.expires) &&
        r.expires !== 0,
      "Invalid login challenge.",
    );
  else if (path === "auth/verify")
    check(
      r.authenticated === true && /^0x[0-9a-fA-F]{40}$/.test(String(r.address)),
      "Invalid sign-in response.",
    );
  else if (path === "auth/logout")
    check(r.authenticated === false, "Invalid sign-out response.");
}
