// Deterministic command-driving harness. Not a live player, clock gate, or production endpoint.
import {
  BALANCE_VERSION,
  STATIONS,
  distance,
  createGarage,
  execute,
  settle,
  type Character,
  type Command,
  type Garage,
  type Mode,
  type ServiceKind,
  type Station,
} from "./index.ts";
export class Scenario {
  state: Garage;
  now = 1_000_000;
  serial = 0;
  readonly seed: number;
  constructor(character: Character = "Gus", mode: Mode = "demo", seed = 4242) {
    this.seed = seed;
    this.state = createGarage(
      "scenario-owner",
      "scenario-1",
      mode,
      this.context(),
    );
    this.command({ type: "select", character });
  }
  context() {
    return { now: this.now, seed: this.seed, balanceVersion: BALANCE_VERSION };
  }
  command(command: Command, id = `scenario-${++this.serial}`) {
    const result = execute(this.state, { id, command }, this.context());
    this.state = result.state;
    return result;
  }
  advance(now: number) {
    this.now = now;
    const result = settle(this.state, this.context());
    this.state = result.state;
    return result;
  }
  move(station: Station, actorId = "player") {
    const a = this.state.progress.actors[actorId];
    if (a.travel) this.advance(a.travel.endsAt);
    const start = this.state.progress.actors[actorId].position;
    const target = STATIONS[station];
    if (distance(start, target) < 1) return;
    this.command({ type: "navigate", actorId, target });
    this.advance(this.state.progress.actors[actorId].travel!.endsAt);
  }
  finish(actorId = "player") {
    const id = this.state.progress.actors[actorId].taskId;
    if (!id) throw new Error("No started task in scenario.");
    this.advance(this.state.progress.tasks[id].endsAt);
    return id;
  }
  deliver(station: Station, needed: number, actorId = "player") {
    while (this.state.progress.stock[station] < needed) {
      const amount = Math.min(2, needed - this.state.progress.stock[station]);
      this.move("stock", actorId);
      this.command({ type: "pickUp", actorId, station: "stock", amount });
      this.finish(actorId);
      this.move(station, actorId);
      this.command({ type: "putDown", actorId, station, amount });
    }
    this.move(station, actorId);
  }
  restore() {
    const carId = this.starter();
    this.deliver("starter", 2);
    this.command({
      type: "startWork",
      actorId: "player",
      kind: "restore",
      carId,
    });
    this.finish();
  }
  prepare(setup: "sprint" | "endurance" = "sprint", carId = this.starter()) {
    this.deliver("starter", 1);
    this.command({
      type: "startWork",
      actorId: "player",
      kind: "prepare",
      carId,
      preparation: setup,
    });
    this.finish();
  }
  starter() {
    return Object.values(this.state.progress.cars).find(
      (c) => c.source === "starter",
    )!.id;
  }
  order(kind?: ServiceKind) {
    this.move("reception");
    this.command({ type: "interact", station: "reception" });
    const job = Object.values(this.state.progress.jobs).find(
      (j) => j.status === "offered" && (!kind || j.kind === kind),
    );
    if (!job) throw new Error(`No offered ${kind} in balanced pack.`);
    this.command({ type: "acceptService", jobId: job.id });
    return job.id;
  }
  service(kind?: ServiceKind) {
    const id = this.order(kind);
    while (this.state.progress.jobs[id].status !== "completed") {
      const j = this.state.progress.jobs[id];
      const station =
        j.kind === "engine" && j.step === 0
          ? "engine"
          : j.kind === "tires"
            ? "tires"
            : "quick";
      const parts = j.kind === "quick" && j.step === 1 ? 0 : 1;
      this.deliver(station, parts);
      this.command({
        type: "startWork",
        actorId: "player",
        kind: "service",
        jobId: id,
      });
      this.finish();
    }
    return id;
  }
  tutorial() {
    this.restore();
    this.prepare();
    this.move("race");
    this.command({
      type: "dispatchRace",
      carId: this.starter(),
      kind: "tutorial",
    });
  }
  freeQualification() {
    this.tutorial();
    for (let i = 0; i < 18; i++) this.service();
    this.move("starter");
    for (const stat of ["engine", "reliability"] as const)
      this.command({ type: "upgradeCar", carId: this.starter(), stat });
    this.prepare();
    this.move("race");
    this.command({
      type: "dispatchRace",
      carId: this.starter(),
      kind: "qualification",
    });
    const race = Object.values(this.state.progress.races).find(
      (r) => r.status === "started",
    )!;
    this.advance(race.endsAt);
  }
}
