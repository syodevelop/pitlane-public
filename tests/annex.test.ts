import { expect, it } from "vitest";
import {
  ANNEX,
  STATIONS,
  execute,
  settle,
  stationStock,
  assertInvariants,
  routeTo,
  clearPath,
  type Point,
} from "../packages/game-core";
import { annexScenario, ownedAnnexScenario } from "./fixtures/annex";
import { stationView } from "../src/scene/station-state";

it("requires earned expansion, physical travel and separate stock at the second work position", () => {
  const { h, helper, jobs, locked, emptyAnnex } = annexScenario();
  expect(() =>
    execute(
      locked,
      {
        id: "locked",
        command: { type: "navigate", actorId: "player", target: ANNEX.tires },
      },
      h.context(),
    ),
  ).toThrow("outside your garage");
  expect(() =>
    execute(
      emptyAnnex,
      {
        id: "remote-stock",
        command: {
          type: "startWork",
          actorId: helper,
          kind: "service",
          jobId: jobs[1],
        },
      },
      h.context(),
    ),
  ).toThrow("Deliver the required parts");
  expect(emptyAnnex.progress.stock.tires).toBe(2);
  expect(stationStock(h.state, "tires", 1)).toBe(1);
  const credits = h.state.progress.credits,
    rep = h.state.progress.rep;
  h.command({
    type: "startWork",
    actorId: "player",
    kind: "service",
    jobId: jobs[0],
  });
  h.command({
    type: "startWork",
    actorId: helper,
    kind: "service",
    jobId: jobs[1],
  });
  const tasks = [
    h.state.progress.tasks[h.state.progress.actors.player.taskId!],
    h.state.progress.tasks[h.state.progress.actors[helper].taskId!],
  ];
  expect(tasks.map((t) => t.workPosition)).toEqual([0, 1]);
  expect(h.state.progress.actors.player.position).toEqual(STATIONS.tires);
  expect(h.state.progress.actors[helper].position).toEqual(ANNEX.tires);
  expect(tasks[1].endsAt - tasks[1].startsAt).toBe(60000);
  expect(stationStock(h.state, "tires", 0)).toBe(1);
  expect(stationStock(h.state, "tires", 1)).toBe(0);
  expect(stationView(h.state, "tires").customerId).toBe(jobs[0]);
  expect(stationView(h.state, "tires", undefined, 1).customerId).toBe(jobs[1]);
  const saved = JSON.parse(JSON.stringify(h.state));
  const done = settle(saved, {
    ...h.context(),
    now: Math.max(...tasks.map((t) => t.endsAt)),
  }).state;
  expect(done.progress.credits).toBe(credits + 160);
  expect(done.progress.rep).toBe(rep + 20);
  expect(
    settle(done, { ...h.context(), now: done.progress.lastNow + 100000 })
      .events,
  ).toEqual([]);
  assertInvariants(done);
});

it("does not reuse an occupied physical bay or start work while walking", () => {
  const { h, helper, jobs } = annexScenario();
  h.command({
    type: "startWork",
    actorId: "player",
    kind: "service",
    jobId: jobs[0],
  });
  h.command({ type: "navigate", actorId: helper, target: STATIONS.tires });
  expect(() =>
    h.command({
      type: "startWork",
      actorId: helper,
      kind: "service",
      jobId: jobs[1],
    }),
  ).toThrow("Walk to the station");
  h.advance(h.state.progress.actors[helper].travel!.endsAt);
  expect(() =>
    h.command({
      type: "startWork",
      actorId: helper,
      kind: "service",
      jobId: jobs[1],
    }),
  ).toThrow("position is occupied");
  assertInvariants(h.state);
});

it("preserves legacy started tasks and routes every original/annex pair without obstacles", () => {
  const { h, jobs } = annexScenario();
  h.command({
    type: "startWork",
    actorId: "player",
    kind: "service",
    jobId: jobs[0],
  });
  const task = h.state.progress.tasks[h.state.progress.actors.player.taskId!];
  delete task.workPosition;
  const before = structuredClone(task);
  h.advance(task.endsAt - 1);
  expect(h.state.progress.tasks[task.id]).toEqual(before);
  h.advance(task.endsAt);
  expect(h.state.progress.tasks[task.id].endsAt).toBe(before.endsAt);
  const points = [...Object.values(STATIONS), ...Object.values(ANNEX)];
  for (const from of points)
    for (const to of points) {
      const path = routeTo(from, to)!;
      expect(path).not.toBeNull();
      let last: Point = from;
      for (const p of path) {
        expect(clearPath(last, p)).toBe(true);
        last = p;
      }
    }
});

it("prepares two fixture-owned main cars at separate bays without duplicating a car or rewards", () => {
  const { h, helper, cars } = ownedAnnexScenario();
  const before = {
    credits: h.state.progress.credits,
    rep: h.state.progress.rep,
  };
  h.command({
    type: "startWork",
    actorId: "player",
    kind: "prepare",
    carId: cars[0],
    preparation: "sprint",
  });
  expect(() =>
    h.command({
      type: "startWork",
      actorId: helper,
      kind: "prepare",
      carId: cars[0],
      preparation: "endurance",
    }),
  ).toThrow("already in use");
  h.command({
    type: "startWork",
    actorId: helper,
    kind: "prepare",
    carId: cars[1],
    preparation: "endurance",
  });
  const tasks = Object.values(h.state.progress.tasks).filter(
    (t) => t.status === "started",
  );
  expect(tasks.map((t) => t.workPosition)).toEqual([0, 1]);
  h.advance(Math.max(...tasks.map((t) => t.endsAt)));
  expect(h.state.progress.cars[cars[0]].prepared).toBe("sprint");
  expect(h.state.progress.cars[cars[1]].prepared).toBe("endurance");
  expect(h.state.progress).toMatchObject(before);
  assertInvariants(h.state);
});
