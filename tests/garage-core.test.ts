import { describe, expect, it } from "vitest";
import {
  BALANCE_VERSION,
  CHARACTERS,
  CARS,
  FIXTURES,
  SERVICES,
  assertApprovedCatalog,
  assertInvariants,
  basicTutorialDone,
  completionEpoch,
  createGarage,
  durationAtRate,
  eligibleCar,
  execute,
  raceResult,
  readyToQualify,
  settle,
} from "../packages/game-core/index.ts";
import { Scenario } from "../packages/game-core/scenario.ts";

describe("v2 deterministic garage", () => {
  it("keeps five catalog tiers, one free starter and closed production fixtures", () => {
    expect(Object.keys(CARS)).toHaveLength(5);
    for (const character of Object.keys(
      CHARACTERS,
    ) as (keyof typeof CHARACTERS)[]) {
      const h = new Scenario(character);
      expect(h.state.progress.credits).toBe(0);
      expect(h.state.progress.rep).toBe(0);
      expect(Object.values(h.state.progress.cars)).toHaveLength(1);
      expect(h.state.progress.activeSlots).toHaveLength(2);
      expect(() => h.command({ type: "select", character: "Dash" })).toThrow(
        "permanent",
      );
    }
    expect(() => assertApprovedCatalog("production")).toThrow(
      "UNAPPROVED_PROTOTYPE",
    );
    expect(() =>
      new Scenario("Gus", "main").command({ type: "buyDemoCar", tier: 2 }),
    ).toThrow("only for demo");
  });
  it("uses exact integer work rates without a reward multiplier", () => {
    expect(durationAtRate(60_000, 1100)).toBe(54_546);
    const completionDurations: number[] = [];
    for (const character of ["Gus", "Dash", "Juno"] as const) {
      const h = new Scenario(character);
      const id = h.order("tires");
      h.deliver("tires", 1);
      h.command({
        type: "startWork",
        actorId: "player",
        kind: "service",
        jobId: id,
      });
      const task =
        h.state.progress.tasks[h.state.progress.actors.player.taskId!];
      completionDurations.push(task.endsAt - task.startsAt);
      h.finish();
      expect(h.state.progress.rep).toBe(10);
      expect(h.state.progress.credits).toBe(80);
    }
    expect(completionDurations).toEqual([54_546, 60_000, 66_667]);
  });
  it("rejects impossible task order, teleporting and free inventory creation", () => {
    const h = new Scenario();
    const before = structuredClone(h.state);
    expect(() =>
      h.command({
        type: "pickUp",
        actorId: "player",
        station: "stock",
        amount: 2,
      }),
    ).toThrow("Walk");
    expect(h.state).toEqual(before);
    h.move("quick");
    expect(() =>
      h.command({
        type: "move",
        actorId: "player",
        target: { x: 400, y: 225 },
      }),
    ).toThrow("reachable");
    expect(() =>
      h.command({
        type: "pickUp",
        actorId: "player",
        station: "quick",
        amount: 1,
      }),
    ).toThrow("delivered parts");
    const offered = Object.values(h.state.progress.jobs)[0];
    expect(() =>
      h.command({
        type: "startWork",
        actorId: "player",
        kind: "service",
        jobId: offered.id,
      }),
    ).toThrow("Accept");
    h.move("stock");
    expect(() =>
      h.command({
        type: "pickUp",
        actorId: "player",
        station: "stock",
        amount: 3,
      }),
    ).toThrow("capacity");
    h.command({
      type: "pickUp",
      actorId: "player",
      station: "stock",
      amount: 2,
    });
    const id = h.state.progress.actors.player.taskId!;
    expect(() => h.command({ type: "completeWork", taskId: id })).toThrow(
      "scheduled finish",
    );
    expect(() =>
      h.command({ type: "move", actorId: "player", target: { x: 95, y: 350 } }),
    ).toThrow("Finish");
    h.finish();
    h.move("starter");
    h.command({
      type: "putDown",
      actorId: "player",
      station: "starter",
      amount: 2,
    });
    h.command({
      type: "startWork",
      actorId: "player",
      kind: "restore",
      carId: h.starter(),
    });
    h.finish();
    expect(h.state.progress.partsIssued).toBe(2);
    expect(h.state.progress.partsConsumed).toBe(2);
    assertInvariants(h.state);
  });
  it("retries the same command and completion without another reward", () => {
    const h = new Scenario();
    const id = h.order("tires");
    h.deliver("tires", 1);
    const intent = {
      type: "startWork",
      actorId: "player",
      kind: "service",
      jobId: id,
    } as const;
    const first = h.command(intent, "repeatable-command");
    const taskId = h.state.progress.actors.player.taskId!;
    expect(h.command({ ...intent }, "repeatable-command").duplicate).toBe(true);
    expect(h.state).toEqual(first.state);
    expect(() =>
      h.command({ type: "interact", station: "tires" }, "repeatable-command"),
    ).toThrow("different work");
    h.finish();
    for (let i = 0; i < 8; i++) h.command({ type: "completeWork", taskId });
    expect(h.state.progress.rep).toBe(10);
    expect(
      h.state.progress.events.filter((e) => e.kind === "service-completed"),
    ).toHaveLength(1);
    expect(
      h.state.progress.events
        .filter((e) => e.kind === "milestone")
        .every((e) => e.rep === 0),
    ).toBe(true);
  });
  it("requires explicit version/seed and rejects clock rollback", () => {
    const h = new Scenario();
    h.advance(h.now + 100);
    expect(() => settle(h.state, { ...h.context(), now: h.now - 1 })).toThrow(
      "backwards",
    );
    expect(() => settle(h.state, { ...h.context(), seed: 1 })).toThrow(
      "migration",
    );
    expect(() =>
      settle(h.state, { ...h.context(), balanceVersion: "unknown" }),
    ).toThrow("Unsupported");
  });
  it("finishes only started work offline, never the waiting queue or new arrivals", () => {
    const h = new Scenario();
    const first = h.order("quick");
    const waiting = h.order("tires");
    h.deliver("quick", 1);
    h.command({
      type: "startWork",
      actorId: "player",
      kind: "service",
      jobId: first,
    });
    const task = h.state.progress.tasks[h.state.progress.actors.player.taskId!];
    const count = Object.keys(h.state.progress.jobs).length;
    const result = h.advance(h.now + 7 * 86_400_000);
    expect(h.state.progress.tasks[task.id].processedAt).toBe(h.now);
    expect(result.events.find((e) => e.kind === "work-completed")!.at).toBe(
      task.endsAt,
    );
    expect(h.state.progress.jobs[first].status).toBe("accepted");
    expect(h.state.progress.jobs[first].step).toBe(1);
    expect(h.state.progress.jobs[waiting].step).toBe(0);
    expect(Object.keys(h.state.progress.jobs)).toHaveLength(count);
    expect(h.state.progress.rep).toBe(0);
    expect(h.advance(h.now).events).toEqual([]);
  });
  it("balances each seeded work pack and does not reroll a declined offer", () => {
    const context = { now: 0, seed: 88, balanceVersion: BALANCE_VERSION };
    const a = createGarage("owner", "test", "demo", context);
    const b = createGarage("owner", "test", "demo", context);
    expect(a).toEqual(b);
    for (const seed of [0, 1, 999, 0xffffffff]) {
      const g = createGarage("owner", "test", "demo", { ...context, seed });
      const offers = Object.values(g.progress.jobs);
      expect(offers.reduce((sum, j) => sum + j.rep, 0)).toBe(98);
      for (const kind of ["tires", "quick", "engine"] as const)
        expect(offers.filter((j) => j.kind === kind)).toHaveLength(2);
    }
    const h = new Scenario();
    const id = h.order("engine");
    h.command({ type: "declineService", jobId: id });
    expect(h.state.progress.jobs[id].status).toBe("offered");
    expect(Object.keys(h.state.progress.jobs)).toHaveLength(6);
    expect(h.state.progress.rep).toBe(0);
  });
  it("keeps new legitimate contracts repeatable and every milestone one-time", () => {
    const h = new Scenario();
    for (let i = 0; i < 120; i++) h.service();
    expect(h.state.progress.rep).toBe(20 * 98);
    expect(h.state.progress.completed).toEqual({
      tires: 40,
      quick: 40,
      engine: 40,
    });
    expect(
      h.state.progress.events.filter(
        (e) => e.kind === "milestone" && e.entityId === "first-service",
      ),
    ).toHaveLength(1);
    assertInvariants(h.state);
  }, 30_000);
  it("completes the free path through actual work commands without an elapsed-time gate", () => {
    const h = new Scenario("Dash", "main");
    h.freeQualification();
    expect(basicTutorialDone(h.state)).toBe(true);
    expect(readyToQualify(h.state)).toBe(true);
    expect(h.state.progress.qualified).toBe(true);
    expect(eligibleCar(h.state, h.state.progress.cars[h.starter()])).toBe(true);
    expect(h.state.progress.completed).toEqual({
      tires: 6,
      quick: 6,
      engine: 6,
    });
    expect(h.state.progress.rep).toBe(3 * 98 + 40);
    expect(
      Object.values(h.state.progress.races).every(
        (r) => r.contributionWeight === 0,
      ),
    ).toBe(true);
  });
  it("freezes race inputs, equal durations and completion epoch despite delayed processing", () => {
    const h = new Scenario("Juno", "main");
    h.freeQualification();
    h.prepare("endurance");
    h.move("race");
    h.command({ type: "dispatchRace", carId: h.starter(), kind: "eligible" });
    const race = structuredClone(
      Object.values(h.state.progress.races).find(
        (r) => r.status === "started",
      )!,
    );
    expect(race.endsAt - race.startsAt).toBe(600_000);
    expect(race.contributionWeight).toBe(1000);
    h.move("reception");
    h.command({ type: "upgrade", target: "team" });
    expect(h.state.progress.races[race.id].inputs).toEqual(race.inputs);
    expect(h.state.progress.races[race.id].contributionWeight).toBe(1000);
    const future = race.endsAt + 86_400_000;
    const result = h.advance(future);
    expect(h.state.progress.races[race.id].result).toEqual(
      raceResult(race.inputs),
    );
    expect(result.events.find((e) => e.kind === "race-completed")!.at).toBe(
      race.endsAt,
    );
    expect(
      completionEpoch(race.endsAt, race.endsAt - 900_000, 900_000),
    ).toEqual({ index: 1, startAt: race.endsAt, endAt: race.endsAt + 900_000 });
    const rep = h.state.progress.rep;
    h.command({ type: "resolveRace", raceId: race.id });
    h.advance(future + 86_400_000);
    expect(h.state.progress.rep).toBe(rep);
    expect(
      Object.values(h.state.progress.races).filter(
        (r) => r.status === "started",
      ),
    ).toHaveLength(0);
    h.prepare("sprint");
    h.move("race");
    h.command({ type: "dispatchRace", carId: h.starter(), kind: "eligible" });
    const sprint = Object.values(h.state.progress.races).find(
      (r) => r.status === "started",
    )!;
    expect(sprint.endsAt - sprint.startsAt).toBe(race.endsAt - race.startsAt);
    expect(sprint.inputs.setup).toBe("sprint");
    expect(sprint.contributionWeight).toBe(1025);
  });
  it("keeps paid-ready eligibility separate from demo purchases and raw car tier", () => {
    const h = new Scenario("Gus", "main");
    h.service("tires");
    const base = h.state.progress.cars[h.starter()];
    expect(eligibleCar(h.state, { ...base, tier: 5 })).toBe(false);
    expect(eligibleCar(h.state, { ...base, source: "demo" })).toBe(false);
    expect(
      eligibleCar(h.state, {
        ...base,
        source: "verified-purchase",
        purchaseEvent: null,
      }),
    ).toBe(false);
    expect(
      eligibleCar(h.state, {
        ...base,
        source: "verified-purchase",
        purchaseEvent: "fixture-finalized-event",
      }),
    ).toBe(true);
    // This is a domain fixture only; no public command can mark a purchase verified.
  });
  it("preserves helper task duration through tool upgrades and never inherits character bonuses", () => {
    for (const character of ["Gus", "Juno"] as const) {
      const h = new Scenario(character);
      for (let i = 0; i < 12; i++) h.service();
      h.move("reception");
      h.command({ type: "hire", role: "Mechanic" });
      const helper = Object.values(h.state.progress.actors).find(
        (a) => a.role === "Mechanic",
      )!;
      const id = h.order("tires");
      h.deliver("tires", 1);
      h.move("tires", helper.id);
      h.command({
        type: "startWork",
        actorId: helper.id,
        kind: "service",
        jobId: id,
      });
      const task = structuredClone(
        h.state.progress.tasks[h.state.progress.actors[helper.id].taskId!],
      );
      h.move("reception");
      h.command({ type: "upgrade", target: "quickTools" });
      expect(task.endsAt - task.startsAt).toBe(
        SERVICES.tires.steps[0].duration,
      );
      expect(h.state.progress.tasks[task.id].endsAt).toBe(task.endsAt);
      h.advance(task.endsAt);
      expect(h.state.progress.jobs[id].status).toBe("completed");
      expect(() => h.command({ type: "hire", role: "Runner" })).toThrow(
        "positions",
      );
      expect(h.state.progress.upgrades.quickTools).toBe(1);
    }
  });
  it("retains purchased collection independently of two assigned demo slots and gives no REP for spending", () => {
    const h = new Scenario();
    for (let i = 0; i < 54; i++) h.service();
    const rep = h.state.progress.rep;
    h.move("reception");
    h.command({ type: "buyDemoCar", tier: 2 });
    h.command({ type: "buyDemoCar", tier: 2 });
    expect(Object.values(h.state.progress.cars)).toHaveLength(3);
    const coupes = Object.values(h.state.progress.cars).filter(
      (c) => c.tier === 2,
    );
    h.move("race");
    h.command({ type: "assignCar", carId: coupes[0].id, slot: 1 });
    expect(() =>
      h.command({ type: "assignCar", carId: coupes[1].id, slot: 2 }),
    ).toThrow("slot");
    expect(() =>
      execute(
        h.state,
        { id: "sell-invented", command: { type: "sellCar" } as never },
        h.context(),
      ),
    ).toThrow("Unknown command");
    expect(h.state.progress.rep).toBe(rep);
    expect(h.state.progress.activeSlots).toHaveLength(FIXTURES.slots.demo);
  }, 20_000);
});
