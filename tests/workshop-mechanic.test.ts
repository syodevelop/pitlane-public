import { describe, expect, it } from "vitest";
import {
  activePoint,
  collectCustomerReward,
  dockClient,
  JOBS,
  newWorkshop,
  nextClient,
  restoreWorkshop,
  tickWorkshop,
  WORKSHOP,
  workPoints,
  type WorkshopState,
} from "../packages/workshop-core";
import {
  assignMechanic,
  hireMechanic,
  MECHANIC,
  mechanicTask,
  tickMechanic,
} from "../packages/workshop-core/mechanic";
import {
  RACE_DESK_APPROACH,
  startSprint,
  tickSprint,
} from "../packages/workshop-core/racing";
import { mechanicObstacles, mechanicRoute } from "../src/scene/mechanic-route";
import { ServiceTraffic } from "../src/scene/service-traffic";
import { insideCar } from "../src/scene/service-route";

function ready() {
  const s = newWorkshop("dash");
  s.credits = 700;
  s.serviced = 10;
  s.tools = 1;
  s.milestoneSeen = true;
  s.team = {
    unlocked: true,
    progress: { "team-front-left": 1, "team-front-right": 1, "team-engine": 1 },
  };
  s.position = { ...RACE_DESK_APPROACH };
  s.racing.completed = 1;
  s.racing.rep = 2;
  return s;
}
function frame(
  s: WorkshopState,
  traffic: ServiceTraffic,
  playerMoving = false,
) {
  if (traffic.phase === "stopped") dockClient(s);
  const size = traffic.client.footprint,
    point = activePoint(s, size, playerMoving);
  tickWorkshop(s, 0.05, size, playerMoving);
  const task = mechanicTask(s, size, point),
    m = s.mechanic;
  const path = mechanicRoute(
    m.position,
    task,
    mechanicObstacles(size, traffic.pose, s.position),
  );
  let left = MECHANIC.speed * 0.05;
  for (const p of path) {
    const d = Math.hypot(p.x - m.position.x, p.z - m.position.z);
    if (d <= left) {
      m.position = { x: p.x, z: p.z };
      left -= d;
    } else {
      m.position.x += ((p.x - m.position.x) * left) / d;
      m.position.z += ((p.z - m.position.z) * left) / d;
      break;
    }
  }
  tickMechanic(
    s,
    0.05,
    size,
    task,
    Math.hypot(m.position.x - task.x, m.position.z - task.z) < 0.06,
    point,
  );
  if (s.order.status === "complete") traffic.releaseClient();
  traffic.pedestrians = [m.position];
  traffic.update(0.05, s.position);
  expect(insideCar(m.position, traffic.pose, 0.1)).toBe(false);
  if (traffic.finished && nextClient(s))
    traffic.beginService("rustback:standard", s.order.status);
}
describe("first workshop mechanic", () => {
  it("requires one completed race, proximity and funds; charges once and preserves identity", () => {
    const s = ready();
    s.racing.completed = 0;
    expect(hireMechanic(s)).toBe(false);
    s.racing.completed = 1;
    s.position = WORKSHOP.spawn;
    expect(hireMechanic(s)).toBe(false);
    s.position = { ...RACE_DESK_APPROACH };
    s.credits = 299;
    expect(hireMechanic(s)).toBe(false);
    s.credits = 700;
    expect(hireMechanic(s)).toBe(true);
    expect(hireMechanic(s)).toBe(false);
    expect(s.credits).toBe(400);
    expect(s.character).toBe("dash");
    expect(s.mechanic.enabled).toBe(true);
  });
  it("autonomously performs all five job types, collects once and accepts the next customer", () => {
    const traffic = new ServiceTraffic();
    try {
      for (const kind of Object.keys(JOBS) as (keyof typeof JOBS)[]) {
        const s = ready();
        hireMechanic(s);
        s.order = { number: 1, kind, status: "service", progress: {} };
        traffic.beginService("rustback:standard", "service");
        let frames = 0;
        while (s.order.number === 1 && frames++ < 5000) frame(s, traffic);
        expect(s.order.number, `${kind}: ${JSON.stringify(s.mechanic)}`).toBe(
          2,
        );
        expect(s.serviced).toBe(11);
        expect(s.credits).toBe(400 + JOBS[kind].reward);
        expect(s.mechanic.finished).toBe(1);
        expect(s.mechanic.earnings).toBe(JOBS[kind].reward);
        expect(s.reward).toBeNull();
      }
    } finally {
      traffic.dispose();
    }
  });
  it("continues after a reload with a carried wheel, and a break preserves partial work", () => {
    const traffic = new ServiceTraffic();
    try {
      let s = ready();
      hireMechanic(s);
      s.order.kind = "tires";
      s.order.status = "service";
      traffic.beginService("rustback:standard", "service");
      for (let i = 0; i < 1800 && !s.mechanic.carried; i++) frame(s, traffic);
      expect(s.mechanic.carried).toBe("wheel");
      s = restoreWorkshop(JSON.stringify(s));
      expect(s.mechanic.carried).toBe("wheel");
      for (
        let i = 0;
        i < 1800 && !Object.values(s.order.progress).some((v) => v > 0.1);
        i++
      )
        frame(s, traffic);
      const work = { ...s.order.progress };
      assignMechanic(s, false);
      for (let i = 0; i < 600; i++) frame(s, traffic);
      expect(s.order.progress).toEqual(work);
      expect(s.mechanic.carried).toBeNull();
      expect(s.mechanic.phase).toBe("break");
      s = restoreWorkshop(JSON.stringify(s));
      expect(s.mechanic.enabled).toBe(false);
      assignMechanic(s, true);
      for (let i = 0; i < 4000 && s.order.number === 1; i++) frame(s, traffic);
      expect(s.credits).toBe(490);
      expect(s.serviced).toBe(11);
      expect(s.mechanic.finished).toBe(1);
    } finally {
      traffic.dispose();
    }
  });
  it("leaves the player's current task and final carried-wheel fitting available", () => {
    const s = ready();
    hireMechanic(s);
    s.order.kind = "tires";
    s.order.status = "service";
    const size = { halfWidth: 1.5, halfLength: 2.8 },
      points = workPoints("tires", size);
    s.order.progress[points[0].id] = 1;
    s.carried = "wheel";
    expect(mechanicTask(s, size).id).toBe("rest");
    s.mechanic.carried = "wheel";
    expect(mechanicTask(s, size).id).toBe("return-wheel");
    s.order.kind = "front";
    s.order.progress = {};
    s.carried = null;
    s.mechanic.carried = null;
    const p = workPoints("front", size)[0];
    s.position = p;
    expect(mechanicTask(s, size, p).id).not.toBe(p.id);
    const before = s.credits;
    for (let i = 0; i < 100; i++) tickWorkshop(s, 0.05, size, false);
    expect(s.credits).toBe(before);
    expect(s.order.progress[p.id]).toBe(1);
  });
  it("rejects distant or stale work and clamps time jumps", () => {
    const s = ready();
    hireMechanic(s);
    s.order.status = "service";
    const size = { halfWidth: 1.5, halfLength: 2.8 };
    const task = mechanicTask(s, size);
    tickMechanic(s, 10000, size, task, true);
    expect(s.order.progress).toEqual({});
    s.mechanic.position = { x: task.x, z: task.z };
    tickMechanic(s, 10000, size, task, true);
    expect(s.order.progress[task.id]).toBeLessThan(0.02);
    const progress = s.order.progress[task.id];
    assignMechanic(s, false);
    tickMechanic(s, 0.05, size, task, true);
    expect(s.order.progress[task.id]).toBe(progress);
  });
  it("shares wheel work with the player and awards one payment when both finish together", () => {
    const s = ready();
    hireMechanic(s);
    s.order.kind = "tires";
    s.order.status = "service";
    const size = { halfWidth: 1.5, halfLength: 2.8 },
      [left, right] = workPoints("tires", size);
    s.position = left;
    s.carried = "wheel";
    s.mechanic.position = right;
    s.mechanic.carried = "wheel";
    s.order.progress = { [left.id]: 0.999, [right.id]: 0.999 };
    const task = mechanicTask(s, size, left);
    expect(task.id).toBe(right.id);
    tickWorkshop(s, 0.05, size, false);
    tickMechanic(s, 0.05, size, task, true, left);
    expect(s.carried).toBeNull();
    expect(s.mechanic.carried).toBeNull();
    expect(s.order.status).toBe("complete");
    expect(s.serviced).toBe(11);
    expect(collectCustomerReward(s, WORKSHOP.payout)).toBe(90);
    expect(collectCustomerReward(s, WORKSHOP.payout)).toBe(0);
    expect(s.credits).toBe(490);
    tickMechanic(s, 0.05, size, task, true, left);
    expect(s.serviced).toBe(11);
  });
  it("restores an in-progress wheel pickup without awarding an early wheel", () => {
    const s = ready();
    hireMechanic(s);
    s.order.kind = "tires";
    s.order.status = "service";
    s.mechanic.position = { ...WORKSHOP.supply };
    s.mechanic.target = "collect-wheel";
    s.mechanic.collectProgress = 0.4;
    const loaded = restoreWorkshop(JSON.stringify(s)),
      size = { halfWidth: 1.5, halfLength: 2.8 };
    expect(loaded.mechanic.collectProgress).toBe(0.4);
    expect(loaded.mechanic.carried).toBeNull();
    tickMechanic(loaded, 0.05, size, mechanicTask(loaded, size), true);
    expect(loaded.mechanic.collectProgress).toBeGreaterThan(0.4);
    expect(loaded.mechanic.carried).toBeNull();
  });
  it("keeps staff and customer rewards independent from a concurrent race", () => {
    const traffic = new ServiceTraffic();
    try {
      const s = ready();
      hireMechanic(s);
      s.racing.preparation = 1;
      startSprint(s);
      s.order.kind = "repair";
      s.order.status = "service";
      traffic.beginService("rustback:standard", "service");
      for (let i = 0; i < 1800; i++) {
        frame(s, traffic);
        tickSprint(s, 0.05);
      }
      expect(s.racing.phase).toBe("result");
      expect(s.racing.completed).toBe(1);
      expect(s.racing.rep).toBe(2);
      expect(s.mechanic.finished).toBeGreaterThanOrEqual(1);
      expect(s.credits).toBe(400 + s.mechanic.earnings);
    } finally {
      traffic.dispose();
    }
  });
  it("migrates older saves without hiring anyone or losing the existing shift", () => {
    const s = ready();
    const old = { ...s, mechanic: undefined };
    const loaded = restoreWorkshop(JSON.stringify(old));
    expect(loaded.credits).toBe(700);
    expect(loaded.racing.completed).toBe(1);
    expect(loaded.mechanic.hired).toBe(false);
    const invalid = restoreWorkshop(
      JSON.stringify({
        ...s,
        mechanic: {
          hired: true,
          enabled: true,
          position: { x: NaN, z: Infinity },
          earnings: -9,
          finished: "bad",
        },
      }),
    );
    expect(invalid.mechanic.position).toEqual(MECHANIC.rest);
    expect(invalid.mechanic.earnings).toBe(0);
  });
});
