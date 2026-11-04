import { describe, expect, it } from "vitest";
import {
  newWorkshop,
  restoreWorkshop,
  tickWorkshop,
  workshopMove,
  WORKSHOP,
  type WorkshopState,
} from "../packages/workshop-core";
import {
  PERFORMANCE,
  unlockPerformance,
  performancePoint,
  nextPerformance,
  tickPerformance,
} from "../packages/workshop-core/performance";
import { ServiceTraffic } from "../src/scene/service-traffic";
import { carsOverlap, insideCar } from "../src/scene/service-route";
import { TeamGarage } from "../src/scene/team-garage";
import {
  startSprint,
  tickSprint,
  RACE_DESK_APPROACH,
  SPRINT,
} from "../packages/workshop-core/racing";
const size = { halfWidth: 1.6, halfLength: 2.9 };
function ready() {
  const s = newWorkshop("juno");
  s.team.unlocked = true;
  s.mechanic.hired = true;
  s.racing.rep = 6;
  s.credits = 900;
  s.position = { ...PERFORMANCE.door };
  return s;
}
function finish(s: WorkshopState) {
  const p = performancePoint(s, size)!;
  s.position = { x: p.x, z: p.z };
  let frames = 0;
  while (performancePoint(s, size)?.id === p.id && frames++ < 400)
    tickWorkshop(s, 0.05, size, false, size, size);
}
describe("Performance Shop", () => {
  it("queues either arriving car offstage when the shared road entry is occupied", () => {
    for (const first of ["team", "customer"] as const) {
      const s = ready(),
        team = new TeamGarage(),
        customer = new ServiceTraffic(
          PERFORMANCE.car.x - WORKSHOP.car.x,
          false,
        );
      try {
        s.team.progress = {
          "team-front-left": 1,
          "team-front-right": 1,
          "team-engine": 1,
        };
        s.racing.preparation = 1;
        s.position = { ...RACE_DESK_APPROACH };
        startSprint(s);
        s.racing.phase = first === "team" ? "returning" : "racing";
        s.racing.elapsed = first === "team" ? 0 : SPRINT.seconds - 0.01;
        s.position = { ...PERFORMANCE.approach };
        team.update(s, 0);
        customer.beginService("city-sprint:upgraded", "arriving");
        if (first === "customer") customer.update(0.01);
        else {
          customer.obstacles = [team.body];
          customer.update(0.01);
          expect(customer.present).toBe(false);
        }
        for (let i = 0; i < 2400; i++) {
          tickSprint(
            s,
            0.05,
            team.canTravel(s, 0.05, customer.present ? [customer.pose] : []),
          );
          team.update(s, 0.05);
          customer.obstacles = team.carVisible ? [team.body] : [];
          customer.update(0.05, s.position);
          if (customer.present && team.carVisible)
            expect(
              carsOverlap(customer.pose, team.body, 0),
              `${first}: ${i}`,
            ).toBe(false);
        }
        expect(s.racing.phase).toBe("result");
        expect(customer.phase).toBe("stopped");
      } finally {
        team.dispose();
        customer.dispose();
      }
    }
  });
  it("requires a mechanic, reputation, funds and the doorway; charges only once", () => {
    const s = ready();
    s.mechanic.hired = false;
    expect(unlockPerformance(s)).toBe(false);
    s.mechanic.hired = true;
    s.racing.rep = 5;
    expect(unlockPerformance(s)).toBe(false);
    s.racing.rep = 6;
    s.credits = 599;
    expect(unlockPerformance(s)).toBe(false);
    s.credits = 900;
    s.position = WORKSHOP.spawn;
    expect(unlockPerformance(s)).toBe(false);
    s.position = { ...PERFORMANCE.door };
    expect(unlockPerformance(s)).toBe(true);
    expect(unlockPerformance(s)).toBe(false);
    expect(s.credits).toBe(300);
  });
  it("opens only the real passage and keeps both dividing walls solid", () => {
    expect(
      workshopMove({ x: 20, z: 6.8 }, { x: 23, z: 6.8 }, true, false).x,
    ).toBeLessThan(PERFORMANCE.wallX);
    expect(
      workshopMove({ x: 20, z: 6.8 }, { x: 23, z: 6.8 }, true, true).x,
    ).toBe(23);
    expect(
      workshopMove({ x: 20, z: 3 }, { x: 23, z: 3 }, true, true).x,
    ).toBeLessThan(PERFORMANCE.wallX);
    expect(
      workshopMove({ x: 23, z: 3 }, { x: 20, z: 3 }, true, true).x,
    ).toBeGreaterThan(PERFORMANCE.wallX);
    expect(
      workshopMove({ x: 9, z: 2 }, { x: 12, z: 2 }, true, true).x,
    ).toBeLessThan(11);
  });
  it("requires the physical diagnosis, bench and installation in order; pays once", () => {
    const s = ready();
    unlockPerformance(s);
    s.performance.status = "service";
    const original = structuredClone(s.order);
    s.position = { ...PERFORMANCE.approach };
    for (let i = 0; i < 250; i++) tickWorkshop(s, 0.05, size, false);
    expect(s.performance.progress.bench).toBe(0);
    finish(s);
    expect(performancePoint(s, size)?.id).toBe("bench");
    finish(s);
    expect(s.performance.carried).toBe(true);
    s.position = WORKSHOP.supply;
    s.order.kind = "tires";
    s.order.status = "service";
    for (let i = 0; i < 100; i++) tickWorkshop(s, 0.05, size, false);
    expect(s.carried).toBeNull();
    s.order = original;
    finish(s);
    expect(s.performance.status).toBe("complete");
    expect(s.performance.carried).toBe(false);
    expect(s.credits).toBe(300);
    expect(s.serviced).toBe(1);
    expect(nextPerformance(s)).toBe(false);
    s.position = { ...PERFORMANCE.payout };
    for (let i = 0; i < 10; i++) tickWorkshop(s, 0.05, size, false);
    expect(s.credits).toBe(460);
    expect(s.racing.rep).toBe(7);
    expect(s.order).toEqual(original);
    expect(nextPerformance(s)).toBe(true);
    expect(s.performance.number).toBe(2);
  });
  it("preserves partial work, carried parts and uncollected rewards after reload", () => {
    let s = ready();
    unlockPerformance(s);
    s.performance.status = "service";
    s.position = performancePoint(s, size)!;
    tickWorkshop(s, 0.05, size, false);
    const part = s.performance.progress.diagnose;
    s = restoreWorkshop(JSON.stringify(s));
    expect(s.performance.progress.diagnose).toBe(part);
    finish(s);
    finish(s);
    s = restoreWorkshop(JSON.stringify(s));
    expect(s.performance.carried).toBe(true);
    finish(s);
    s = restoreWorkshop(JSON.stringify(s));
    expect(s.performance.reward).toBe(true);
    expect(s.performance.completed).toBe(1);
    expect(s.character).toBe("juno");
  });
  it("does not advance while walking, far away or with a customer wheel; clamps elapsed time", () => {
    const s = ready();
    unlockPerformance(s);
    s.performance.status = "service";
    s.position = performancePoint(s, size)!;
    tickPerformance(s, 0.05, size, true);
    expect(s.performance.progress.diagnose).toBe(0);
    s.carried = "wheel";
    tickPerformance(s, 0.05, size, false);
    expect(s.performance.progress.diagnose).toBe(0);
    s.carried = null;
    tickPerformance(s, 999, size, false);
    expect(s.performance.progress.diagnose).toBeLessThan(0.01);
    s.position = WORKSHOP.spawn;
    tickPerformance(s, 999, size, false);
    expect(s.performance.progress.diagnose).toBeLessThan(0.01);
  });
  it("migrates old saves and normalizes malformed expansion fields without resetting the shift", () => {
    const s = ready();
    const old = restoreWorkshop(
      JSON.stringify({ ...s, performance: undefined }),
    );
    expect(old.performance.unlocked).toBe(false);
    expect(old.credits).toBe(900);
    const bad = restoreWorkshop(
      JSON.stringify({
        ...s,
        performance: {
          unlocked: true,
          number: -1,
          status: "complete",
          progress: { diagnose: 0, bench: 1, install: 1 },
          carried: true,
          reward: true,
          completed: -2,
        },
      }),
    );
    expect(bad.performance.status).toBe("service");
    expect(bad.performance.progress.bench).toBe(0);
    expect(bad.performance.carried).toBe(false);
    expect(bad.performance.reward).toBe(false);
    expect(bad.credits).toBe(900);
  });
  it("runs two customer routes without overlap, yields to the player and clears the expanded doors", () => {
    const a = new ServiceTraffic(),
      b = new ServiceTraffic(PERFORMANCE.car.x - WORKSHOP.car.x, false);
    try {
      a.beginService("rustback:standard", "arriving");
      b.beginService("rallye:upgraded", "arriving");
      let stopped = 0;
      for (let i = 0; i < 5000; i++) {
        a.obstacles = b.finished ? [] : [b.pose];
        b.obstacles = a.finished ? [] : [a.pose];
        a.update(0.05);
        b.update(0.05);
        if (!a.finished && !b.finished)
          expect(carsOverlap(a.pose, b.pose, 0.05)).toBe(false);
        if (a.phase === "stopped" && b.phase === "stopped") {
          stopped++;
          if (stopped > 5) {
            a.releaseClient();
            b.releaseClient();
          }
        }
        if (a.finished && b.finished) break;
      }
      expect(stopped).toBeGreaterThan(0);
      expect(a.finished && b.finished).toBe(true);
      b.beginService("rallye:upgraded", "arriving");
      b.obstacles = [];
      let yielded = false;
      const pedestrian = { x: PERFORMANCE.car.x, z: 9 };
      for (let i = 0; i < 900; i++) {
        b.update(0.05, pedestrian);
        expect(insideCar(pedestrian, b.pose, 0)).toBe(false);
        yielded ||= b.yielding;
      }
      expect(yielded).toBe(true);
      expect(b.phase).toBe("arriving");
      for (let i = 0; i < 900; i++) b.update(0.05, { x: 23, z: 6 });
      expect(b.phase).toBe("stopped");
    } finally {
      a.dispose();
      b.dispose();
    }
  });
  it("keeps both customer streams clear of the racing Rustback at different departure times", () => {
    const a = new ServiceTraffic(),
      b = new ServiceTraffic(PERFORMANCE.car.x - WORKSHOP.car.x, false),
      team = new TeamGarage();
    try {
      for (const offset of [0, 5, 10, 52, 60]) {
        const s = ready();
        s.team.progress = {
          "team-front-left": 1,
          "team-front-right": 1,
          "team-engine": 1,
        };
        s.position = { ...RACE_DESK_APPROACH };
        s.racing.preparation = 1;
        startSprint(s);
        s.position = { ...PERFORMANCE.approach };
        a.beginService("rustback:standard", "service");
        b.beginService("rallye:upgraded", "service");
        team.update(s, 0);
        for (let i = 0; i < 3600; i++) {
          if (i >= offset * 20) b.releaseClient();
          if (i >= (offset + 3) * 20) a.releaseClient();
          const clients = [
            ...(a.finished ? [] : [a.pose]),
            ...(b.finished ? [] : [b.pose]),
          ];
          tickSprint(s, 0.05, team.canTravel(s, 0.05, clients));
          team.update(s, 0.05);
          b.obstacles = [
            ...(a.finished ? [] : [a.pose]),
            ...(team.carVisible ? [team.body] : []),
          ];
          b.update(0.05, s.position);
          a.obstacles = [
            ...(b.finished ? [] : [b.pose]),
            ...(team.carVisible && !team.yielding ? [team.body] : []),
          ];
          a.update(0.05, s.position);
          const poses = [
            ...(a.finished ? [] : [a.pose]),
            ...(b.finished ? [] : [b.pose]),
            ...(team.carVisible ? [team.body] : []),
          ];
          for (let j = 0; j < poses.length; j++)
            for (let k = j + 1; k < poses.length; k++)
              expect(
                carsOverlap(poses[j], poses[k], 0),
                `offset ${offset} frame ${i}`,
              ).toBe(false);
        }
        expect(s.racing.phase, `offset ${offset}`).toBe("result");
        expect(a.finished && b.finished).toBe(true);
      }
    } finally {
      a.dispose();
      b.dispose();
      team.dispose();
    }
  });
});
