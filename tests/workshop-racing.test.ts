import { describe, expect, it } from "vitest";
import {
  newWorkshop,
  racePreparationPoint,
  restoreWorkshop,
  tickWorkshop,
  WORKSHOP,
  workPoints,
} from "../packages/workshop-core";
import {
  buyCarUpgrade,
  carStats,
  claimSprint,
  RACE_DESK_APPROACH,
  SPRINT,
  sprintResult,
  startSprint,
  tickSprint,
} from "../packages/workshop-core/racing";
import { teamRoutePose } from "../src/scene/team-route";
import { TeamGarage } from "../src/scene/team-garage";
import { ServiceTraffic } from "../src/scene/service-traffic";
import { carsOverlap } from "../src/scene/service-route";

const size = { halfWidth: 1.5, halfLength: 2.8 };
function ready() {
  const s = newWorkshop("juno");
  s.team = {
    unlocked: true,
    progress: { "team-front-left": 1, "team-front-right": 1, "team-engine": 1 },
  };
  s.position = { ...RACE_DESK_APPROACH };
  s.credits = 500;
  s.tools = 1;
  return s;
}
function prepare(s: ReturnType<typeof ready>) {
  s.position = racePreparationPoint(size);
  for (let i = 0; i < 121; i++) tickWorkshop(s, 0.05, size, false);
  s.position = { ...RACE_DESK_APPROACH };
}
describe("owned Rustback racing", () => {
  it("requires restoration, stationary inspection, free hands and the team desk", () => {
    const s = ready();
    expect(startSprint(s)).toBe(false);
    s.position = racePreparationPoint(size);
    tickWorkshop(s, 9000, size, false);
    expect(s.racing.preparation).toBeLessThan(0.01);
    const p = s.racing.preparation;
    tickWorkshop(s, 0.05, size, true);
    expect(s.racing.preparation).toBe(p);
    prepare(s);
    expect(s.credits).toBe(500);
    s.carried = "wheel";
    expect(startSprint(s)).toBe(false);
    s.carried = null;
    s.position = WORKSHOP.spawn;
    expect(startSprint(s)).toBe(false);
    s.position = { ...RACE_DESK_APPROACH };
    s.team.progress["team-engine"] = 0.5;
    expect(startSprint(s)).toBe(false);
    s.team.progress["team-engine"] = 1;
    expect(startSprint(s)).toBe(true);
    expect(startSprint(s)).toBe(false);
    expect(s.racing.preparation).toBe(0);
    expect(s.racing.run?.score).toBe(40);
  });
  it("charges upgrades once per expected level, requires reinspection and improves the published result", () => {
    const s = ready();
    prepare(s);
    expect(buyCarUpgrade(s, "engine", 0)).toBe(true);
    expect(s.credits).toBe(400);
    expect(s.racing.preparation).toBe(0);
    expect(buyCarUpgrade(s, "engine", 0)).toBe(false);
    expect(buyCarUpgrade(s, "engine", 1)).toBe(true);
    expect(s.credits).toBe(240);
    expect(sprintResult(carStats(s.racing))).toMatchObject({
      score: 52,
      medal: "Silver",
      credits: 100,
      rep: 4,
    });
    expect(buyCarUpgrade(s, "engine", 2)).toBe(true);
    expect(buyCarUpgrade(s, "engine", 3)).toBe(false);
    expect(buyCarUpgrade(s, "grip", 0)).toBe(false);
    s.credits = 100;
    s.position = WORKSHOP.spawn;
    expect(buyCarUpgrade(s, "grip", 0)).toBe(false);
    prepare(s);
    expect(startSprint(s)).toBe(true);
    expect(buyCarUpgrade(s, "grip", 0)).toBe(false);
    expect(s.racing.run?.stats.engine).toBe(70);
  });
  it("continues customer work during a race and awards the saved report exactly once", () => {
    let s = ready();
    prepare(s);
    startSprint(s);
    for (let i = 0; i < 265; i++) tickSprint(s, 0.05);
    expect(s.racing.phase).toBe("racing");
    s.order.status = "service";
    s.order.kind = "repair";
    s.position = workPoints("repair", size)[0];
    for (let i = 0; i < 160; i++) {
      tickWorkshop(s, 0.05, size, false);
      tickSprint(s, 0.05);
    }
    expect(s.serviced).toBe(1);
    expect(s.reward?.amount).toBe(65);
    expect(s.racing.elapsed).toBeGreaterThan(8);
    s = restoreWorkshop(JSON.stringify(s));
    expect(s.racing.phase).toBe("racing");
    expect(s.racing.run?.medal).toBe("Bronze");
    for (let i = 0; i < 1400; i++) tickSprint(s, 0.05);
    expect(s.racing.phase).toBe("result");
    expect(s.credits).toBe(500);
    s = restoreWorkshop(JSON.stringify(s));
    expect(claimSprint(s)).toBe(true);
    expect(claimSprint(s)).toBe(false);
    expect(s.credits).toBe(570);
    expect(s.racing.rep).toBe(2);
    expect(s.racing.completed).toBe(1);
    const saved = restoreWorkshop(JSON.stringify(s));
    expect(claimSprint(saved)).toBe(false);
    expect(saved.credits).toBe(570);
    expect(saved.racing.lastResult?.score).toBe(40);
    expect(saved.reward?.amount).toBe(65);
  });
  it("bounds time jumps, pauses obstructed travel and migrates pre-race saves", () => {
    const s = ready();
    prepare(s);
    startSprint(s);
    tickSprint(s, 99999, false);
    expect(s.racing.elapsed).toBe(0);
    tickSprint(s, 99999);
    expect(s.racing.elapsed).toBe(0.05);
    tickSprint(s, NaN);
    expect(s.racing.elapsed).toBe(0.05);
    const old = { ...s, racing: undefined };
    expect(restoreWorkshop(JSON.stringify(old))).toMatchObject({
      character: "juno",
      credits: 500,
      team: s.team,
      racing: { phase: "idle", completed: 0 },
    });
    const broken = {
      ...s,
      racing: { ...s.racing, run: { id: 1, stats: { engine: 90000 } } },
    };
    expect(restoreWorkshop(JSON.stringify(broken)).racing.phase).toBe("idle");
  });
  it("uses separate lanes and returns to the same parking position without snapping across the garage", () => {
    const r = ready().racing;
    const parked = teamRoutePose(r);
    r.phase = "leaving";
    expect(teamRoutePose(r)).toEqual(parked);
    r.elapsed = SPRINT.departureSeconds;
    const exit = teamRoutePose(r);
    expect(exit.z).toBeLessThan(0);
    expect(exit.x).toBeGreaterThan(30);
    r.phase = "returning";
    r.elapsed = 0;
    expect(teamRoutePose(r).z).toBeGreaterThan(12);
    r.elapsed = SPRINT.returnSeconds;
    expect(teamRoutePose(r).x).toBeCloseTo(parked.x);
    expect(teamRoutePose(r).z).toBeCloseTo(parked.z);
    const a = { x: 20, z: -4.3, yaw: -Math.PI / 2, turning: false };
    expect(carsOverlap(a, { ...a, x: 22 })).toBe(true);
    expect(carsOverlap(a, { ...a, z: -8.1, yaw: Math.PI / 2 })).toBe(false);
  });
  it("yields to the player and completes departure/return alongside a departing customer", () => {
    const team = new TeamGarage(),
      traffic = new ServiceTraffic();
    try {
      const s = ready();
      prepare(s);
      startSprint(s);
      team.update(s, 0);
      traffic.beginService("rustback:standard", "complete");
      s.position = { x: 16, z: 2.1 };
      expect(team.canTravel(s, 0.05, traffic.pose)).toBe(false);
      s.position = { ...RACE_DESK_APPROACH };
      for (let i = 0; i < 1900; i++) {
        tickSprint(s, 0.05, team.canTravel(s, 0.05, traffic.pose));
        team.update(s, 0.05);
        traffic.obstacles =
          team.carVisible && !team.yielding ? [team.body] : [];
        traffic.update(0.05, s.position);
        if (team.carVisible && !traffic.finished)
          expect(carsOverlap(team.body, traffic.pose, 0)).toBe(false);
      }
      expect(s.racing.phase).toBe("result");
      expect(traffic.finished).toBe(true);
      expect(team.body.x).toBeCloseTo(16);
      expect(team.body.z).toBeCloseTo(4.9);
      expect(team.northGate).toBeLessThan(0.01);
      expect(team.southGate).toBeLessThan(0.01);
    } finally {
      team.dispose();
      traffic.dispose();
    }
  });
  it("keeps both vehicles apart when customer departures coincide with the team route", () => {
    const team = new TeamGarage(),
      traffic = new ServiceTraffic();
    try {
      for (const releaseAt of [0, 2, 5, 9, 48, 55, 60, 65]) {
        const s = ready();
        s.racing.preparation = 1;
        startSprint(s);
        team.update(s, 0);
        traffic.beginService("rustback:standard", "service");
        for (let i = 0; i < 2200; i++) {
          if (i >= releaseAt * 20) traffic.releaseClient();
          tickSprint(s, 0.05, team.canTravel(s, 0.05, traffic.pose));
          team.update(s, 0.05);
          traffic.obstacles =
            team.carVisible && !team.yielding ? [team.body] : [];
          traffic.update(0.05, s.position);
          if (team.carVisible && !traffic.finished)
            expect(
              carsOverlap(team.body, traffic.pose, 0),
              `release ${releaseAt}, frame ${i}`,
            ).toBe(false);
        }
        expect(s.racing.phase, `release ${releaseAt}`).toBe("result");
        expect(traffic.finished).toBe(true);
      }
    } finally {
      team.dispose();
      traffic.dispose();
    }
  });
});
