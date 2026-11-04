import type {
  Character,
  Mode,
  Preparation,
  ServiceKind,
  StaffRole,
  Tier,
} from "./catalog.ts";
import type { Point, Station } from "./map.ts";
export type Context = { now: number; seed: number; balanceVersion: string };
export type Profile = { identity: string; character: Character | null };
export type Travel = {
  from: Point;
  to: Point;
  via?: Point[];
  startsAt: number;
  endsAt: number;
};
export type Actor = {
  id: string;
  role: "Player" | StaffRole;
  level: number;
  position: Point;
  travel: Travel | null;
  carrying: number;
  taskId: string | null;
};
export type Car = {
  id: string;
  tier: Tier;
  source: "starter" | "demo" | "verified-purchase";
  purchaseEvent: string | null;
  restored: boolean;
  engine: number;
  reliability: number;
  prepared: Preparation | null;
};
export type Service = {
  id: string;
  kind: ServiceKind;
  status: "offered" | "accepted" | "working" | "completed";
  step: number;
  credits: number;
  rep: number;
  balanceVersion: string;
  arrivedAt: number;
  acceptedAt: number | null;
  completedAt: number | null;
};
export type Task = {
  // Missing on legacy tasks: they keep their original primary station and timing.
  workPosition?: 0 | 1;
  layoutVersion?: string;
  id: string;
  actorId: string;
  kind: "stock" | "restore" | "service" | "prepare";
  station: Station;
  jobId: string | null;
  carId: string | null;
  preparation: Preparation | null;
  step: number | null;
  startsAt: number;
  endsAt: number;
  processedAt: number | null;
  status: "started" | "completed";
  parts: number;
  outputParts: number;
  rate: number;
  balanceVersion: string;
};
export type RaceInputs = {
  pace: number;
  reliability: number;
  preparation: number;
  setup: Preparation;
  opponents: number[];
  balanceVersion: string;
};
export type RaceResult = {
  performance: number;
  position: number;
  fieldSize: number;
};
export type Race = {
  legacyRuleset?: "garage-v0.1";
  id: string;
  carId: string;
  kind: "tutorial" | "training" | "qualification" | "eligible";
  startsAt: number;
  endsAt: number;
  processedAt: number | null;
  status: "started" | "completed";
  inputs: RaceInputs;
  result: RaceResult | null;
  credits: number;
  rep: number;
  contributionWeight: number;
  balanceVersion: string;
};
export type Event = {
  id: string;
  kind: string;
  entityId: string;
  at: number;
  processedAt: number;
  credits: number;
  rep: number;
  balanceVersion: string;
};
export type Upgrade = "quickTools" | "engineTools" | "capacity" | "team";
export type Progress = {
  interior?: import("./interior.ts").InteriorPosition;
  generation: string;
  mode: Mode;
  balanceVersion: string;
  seed: number;
  revision: number;
  lastNow: number;
  sequence: number;
  credits: number;
  rep: number;
  actors: Record<string, Actor>;
  stock: Record<Station, number>;
  secondaryStock?: Partial<Record<Station, number>>;
  partsIssued: number;
  partsConsumed: number;
  jobs: Record<string, Service>;
  tasks: Record<string, Task>;
  cars: Record<string, Car>;
  activeSlots: (string | null)[];
  races: Record<string, Race>;
  upgrades: Record<Upgrade, number>;
  completed: Record<ServiceKind, number>;
  milestones: string[];
  tutorial: {
    collected: boolean;
    delivered: boolean;
    service: boolean;
    training: boolean;
  };
  qualified: boolean;
  pack: number;
  events: Event[];
  receipts: Record<string, { fingerprint: string; eventIds: string[] }>;
};
export type Garage = { profile: Profile; progress: Progress };
export type Command =
  | { type: "interiorMove"; target: Point }
  | { type: "interiorStop" }
  | { type: "select"; character: Character }
  | { type: "move"; actorId: string; target: Point }
  | { type: "navigate"; actorId: string; target: Point }
  | { type: "interact"; station: Station }
  | { type: "acceptService"; jobId: string }
  | { type: "declineService"; jobId: string }
  | { type: "pickUp"; actorId: string; station: Station; amount: number }
  | { type: "putDown"; actorId: string; station: Station; amount: number }
  | { type: "startWork"; actorId: string; kind: "restore"; carId: string }
  | { type: "startWork"; actorId: string; kind: "service"; jobId: string }
  | {
      type: "startWork";
      actorId: string;
      kind: "prepare";
      carId: string;
      preparation: Preparation;
    }
  | { type: "completeWork"; taskId: string }
  | { type: "hire"; role: StaffRole }
  | { type: "upgrade"; target: Upgrade }
  | { type: "upgradeStaff"; actorId: string }
  | { type: "upgradeCar"; carId: string; stat: "engine" | "reliability" }
  | { type: "buyDemoCar"; tier: 2 }
  | { type: "assignCar"; carId: string | null; slot: number }
  | { type: "dispatchRace"; carId: string; kind: Race["kind"] }
  | { type: "resolveRace"; raceId: string };
export type Intent = { id: string; command: Command };
export type Transition = { state: Garage; events: Event[]; duplicate: boolean };
