import { describe, expect, it } from "vitest";
import {
  JOBS,
  WORKSHOP,
  TEAM_GARAGE,
  buyTools,
  dockClient,
  milestoneReady,
  newWorkshop,
  nextClient,
  restoreWorkshop,
  tickWorkshop,
  workPoints,
  teamWorkPoints,
  teamReady,
  unlockTeamGarage,
  workshopMove,
} from "../packages/workshop-core";
import { FleetCar } from "../src/scene/fleet-car";
import { ServiceTraffic } from "../src/scene/service-traffic";
import { insideCar, slideWalkAtCar } from "../src/scene/service-route";
import { GAME_VEHICLE_SCALE } from "../src/scene/vehicle-scale";
const size = { halfWidth: 1.5, halfLength: 2.8 };
function complete(s: ReturnType<typeof newWorkshop>) {
  dockClient(s);
  for (const p of workPoints(s.order.kind, size)) {
    if (s.order.kind === "tires") {
      s.position = WORKSHOP.supply;
      for (let i = 0; i < 24; i++) tickWorkshop(s, 0.05, size, false);
    }
    s.position = { x: p.x, z: p.z };
    for (let i = 0; i < 170; i++) tickWorkshop(s, 0.05, size, false);
  }
}
describe("playable workshop", () => {
  it("opens the team bay once, only at its door with the required progress and balance", () => {
    const s = newWorkshop("juno");
    s.credits = 495;
    s.serviced = 10;
    s.tools = 1;
    expect(unlockTeamGarage(s)).toBe(false);
    s.position = { ...TEAM_GARAGE.door };
    s.tools = 0;
    expect(unlockTeamGarage(s)).toBe(false);
    s.tools = 1;
    s.serviced = 4;
    expect(unlockTeamGarage(s)).toBe(false);
    s.serviced = 10;
    s.credits = 299;
    expect(unlockTeamGarage(s)).toBe(false);
    s.credits = 495;
    expect(unlockTeamGarage(s)).toBe(true);
    expect(s.credits).toBe(195);
    expect(unlockTeamGarage(s)).toBe(false);
    expect(s.credits).toBe(195);
    const restored = restoreWorkshop(JSON.stringify(s));
    expect(restored.team.unlocked).toBe(true);
    expect(restored.character).toBe("juno");
    expect(newWorkshop(restored.character).character).toBe("juno");
  });
  it("restores the owned car independently of customer progress, rewards and hidden time", () => {
    const s = newWorkshop();
    s.team.unlocked = true;
    const customer = structuredClone(s.order);
    const [first, ...remaining] = teamWorkPoints(size);
    s.position = first;
    tickWorkshop(s, 9999, size, false);
    expect(s.team.progress[first.id]).toBeLessThan(0.02);
    const partial = s.team.progress[first.id];
    tickWorkshop(s, 0.05, size, true);
    expect(s.team.progress[first.id]).toBe(partial);
    for (let i = 0; i < 120; i++) tickWorkshop(s, 0.05, size, false);
    let loaded = restoreWorkshop(JSON.stringify(s));
    expect(loaded.team.progress[first.id]).toBe(1);
    let readyEvents = 0;
    for (const p of remaining) {
      loaded.position = p;
      for (let i = 0; i < 260; i++)
        if (tickWorkshop(loaded, 0.05, size, false) === "team-ready")
          readyEvents++;
      loaded = restoreWorkshop(JSON.stringify(loaded));
    }
    expect(teamReady(loaded)).toBe(true);
    expect(readyEvents).toBe(1);
    expect(loaded.order).toEqual(customer);
    expect(loaded.credits).toBe(0);
    expect(loaded.serviced).toBe(0);
    expect(loaded.reward).toBeNull();
  });
  it("keeps the bay wall solid and permits travel in both directions only through the unlocked doorway", () => {
    const left = { x: 9.8, z: 7.8 },
      right = { x: 11.6, z: 7.8 };
    expect(workshopMove(left, right, false).x).toBeLessThan(TEAM_GARAGE.wallX);
    expect(workshopMove(left, right, true)).toEqual(right);
    expect(workshopMove(right, left, true)).toEqual(left);
    expect(
      workshopMove({ ...left, z: 3 }, { ...right, z: 3 }, true).x,
    ).toBeLessThan(TEAM_GARAGE.wallX);
    expect(
      workshopMove({ ...right, z: 3 }, { ...left, z: 3 }, true).x,
    ).toBeGreaterThan(TEAM_GARAGE.wallX);
    expect(
      workshopMove(
        { x: TEAM_GARAGE.wallX, z: 7.8 },
        { x: TEAM_GARAGE.wallX, z: 6 },
        true,
      ).z,
    ).toBe(TEAM_GARAGE.passageMinZ);
    expect(workshopMove(right, { x: 100, z: -20 }, true)).toEqual({
      x: TEAM_GARAGE.maxX,
      z: 0.576,
    });
  });
  it("migrates old saves without unlocking the team bay or losing customer progress", () => {
    const s = newWorkshop();
    s.credits = 495;
    s.serviced = 10;
    s.tools = 1;
    const old: Partial<typeof s> = { ...s };
    delete old.team;
    const loaded = restoreWorkshop(JSON.stringify(old));
    expect(loaded.team).toEqual({ unlocked: false, progress: {} });
    expect(loaded.credits).toBe(495);
    expect(loaded.serviced).toBe(10);
    expect(loaded.order).toEqual(s.order);
    expect(
      restoreWorkshop(
        JSON.stringify({
          ...s,
          team: {
            unlocked: true,
            progress: { "team-engine": "bad", arbitrary: 1 },
          },
        }),
      ).team.progress,
    ).toEqual({});
  });
  it("requires a stationary pickup, carries only one wheel, and consumes it once per fitting", () => {
    const s = newWorkshop();
    s.order.kind = "tires";
    dockClient(s);
    const [left, right] = workPoints("tires", size);
    s.position = left;
    for (let i = 0; i < 130; i++) tickWorkshop(s, 0.05, size, false);
    expect(s.order.progress).toEqual({});
    s.position = WORKSHOP.supply;
    for (let i = 0; i < 30; i++) tickWorkshop(s, 0.05, size, true);
    expect(s.carried).toBeNull();
    for (let i = 0; i < 24; i++) tickWorkshop(s, 0.05, size, false);
    expect(s.carried).toBe("wheel");
    for (let i = 0; i < 30; i++)
      expect(tickWorkshop(s, 0.05, size, false)).toBeNull();
    s.position = left;
    for (let i = 0; i < 120; i++) tickWorkshop(s, 0.05, size, false);
    expect(s.carried).toBeNull();
    expect(s.order.progress[left.id]).toBe(1);
    expect(s.reward).toBeNull();
    s.position = right;
    for (let i = 0; i < 120; i++) tickWorkshop(s, 0.05, size, false);
    expect(s.order.progress[right.id]).toBeUndefined();
    s.position = WORKSHOP.supply;
    for (let i = 0; i < 24; i++) tickWorkshop(s, 0.05, size, false);
    s.position = right;
    for (let i = 0; i < 120; i++) tickWorkshop(s, 0.05, size, false);
    expect(s.serviced).toBe(1);
    expect(s.carried).toBeNull();
    expect(s.reward?.amount).toBe(90);
    s.position = WORKSHOP.supply;
    for (let i = 0; i < 30; i++) tickWorkshop(s, 0.05, size, false);
    expect(s.carried).toBeNull();
    expect(s.serviced).toBe(1);
  });
  it("keeps a carried wheel and partial fitting over reload without granting another wheel", () => {
    const s = newWorkshop();
    s.order.kind = "tires";
    dockClient(s);
    s.position = WORKSHOP.supply;
    for (let i = 0; i < 24; i++) tickWorkshop(s, 0.05, size, false);
    const p = workPoints("tires", size)[0];
    s.position = p;
    for (let i = 0; i < 40; i++) tickWorkshop(s, 0.05, size, false);
    const loaded = restoreWorkshop(JSON.stringify(s));
    expect(loaded.carried).toBe("wheel");
    expect(loaded.order.progress[p.id]).toBeCloseTo(2 / 5.5);
    loaded.position = WORKSHOP.spawn;
    tickWorkshop(loaded, 0.05, size, false);
    expect(loaded.order.progress[p.id]).toBe(s.order.progress[p.id]);
    loaded.position = p;
    for (let i = 0; i < 90; i++) tickWorkshop(loaded, 0.05, size, false);
    expect(loaded.carried).toBeNull();
    expect(loaded.order.progress[p.id]).toBe(1);
    expect(restoreWorkshop(JSON.stringify(loaded)).carried).toBeNull();
  });
  it("does not accumulate pickup time while walking away or through a background-time jump", () => {
    const s = newWorkshop();
    s.order.kind = "tires";
    dockClient(s);
    s.position = WORKSHOP.supply;
    tickWorkshop(s, 3600, size, false);
    expect(s.collectProgress).toBeLessThan(0.05);
    tickWorkshop(s, 0.05, size, true);
    expect(s.collectProgress).toBe(0);
    expect(s.carried).toBeNull();
  });
  it("adds empty inventory to earlier saves without resetting the shift", () => {
    const old = { ...newWorkshop(), credits: 115, serviced: 2 };
    const legacy: Partial<typeof old> = { ...old };
    delete legacy.carried;
    delete legacy.collectProgress;
    const restored = restoreWorkshop(JSON.stringify(legacy));
    expect(restored.credits).toBe(115);
    expect(restored.serviced).toBe(2);
    expect(restored.carried).toBeNull();
    expect(restored.collectProgress).toBe(0);
    expect(
      restoreWorkshop(
        JSON.stringify({ ...old, carried: "wheel", collectProgress: 99 }),
      ).carried,
    ).toBeNull();
  });
  it("requires a docked car, correct work position and stopped player; pauses without losing work", () => {
    const s = newWorkshop(),
      p = workPoints("front", size)[0];
    s.position = p;
    tickWorkshop(s, 0.05, size, false);
    expect(s.order.progress).toEqual({});
    dockClient(s);
    tickWorkshop(s, 0.05, size, true);
    expect(s.order.progress).toEqual({});
    tickWorkshop(s, 0.05, size, false);
    const progress = s.order.progress[p.id];
    expect(progress).toBeGreaterThan(0);
    s.position = WORKSHOP.spawn;
    tickWorkshop(s, 0.05, size, false);
    expect(s.order.progress[p.id]).toBe(progress);
    s.position = p;
    tickWorkshop(s, 3600, size, false);
    expect(s.order.progress[p.id]).toBeCloseTo(progress * 2);
  });
  it("settles once, persists pending pickup, then credits it once even after reload", () => {
    const s = newWorkshop();
    complete(s);
    expect(s.serviced).toBe(1);
    expect(s.credits).toBe(0);
    expect(s.reward?.amount).toBe(50);
    expect(nextClient(s)).toBe(false);
    const loaded = restoreWorkshop(JSON.stringify(s));
    complete(loaded);
    expect(loaded.serviced).toBe(1);
    loaded.position = WORKSHOP.payout;
    tickWorkshop(loaded, 0.05, size, false);
    tickWorkshop(loaded, 0.05, size, false);
    expect(loaded.credits).toBe(50);
    expect(loaded.reward).toBeNull();
    const again = restoreWorkshop(JSON.stringify(loaded));
    tickWorkshop(again, 0.05, size, false);
    expect(again.credits).toBe(50);
    expect(nextClient(again)).toBe(true);
    expect(again.order.kind).toBe("repair");
  });
  it("completes five orders and purchases a useful upgrade using only earned points", () => {
    const s = newWorkshop();
    for (let i = 0; i < 5; i++) {
      complete(s);
      if (i === 4) expect(milestoneReady(s)).toBe(false); // collect the last payout before celebrating
      s.position = WORKSHOP.payout;
      tickWorkshop(s, 0.05, size, false);
      if (i === 2) {
        expect(buyTools(s)).toBe(false); // proximity is required
        s.position = WORKSHOP.shop;
        expect(buyTools(s)).toBe(true);
        expect(s.credits).toBe(55);
        expect(buyTools(s)).toBe(false);
      }
      if (i < 4) expect(nextClient(s)).toBe(true);
    }
    expect(s.serviced).toBe(5);
    expect(s.credits).toBe(185);
    expect(milestoneReady(s)).toBe(true);
  });
  it("upgrade increases real work speed; movement or hidden time cannot complete a job", () => {
    const a = newWorkshop(),
      b = newWorkshop();
    b.tools = 1;
    dockClient(a);
    dockClient(b);
    a.position = b.position = workPoints("front", size)[0];
    for (let i = 0; i < 40; i++) {
      tickWorkshop(a, 0.05, size, false);
      tickWorkshop(b, 0.05, size, false);
    }
    expect(b.order.progress["front-left"]).toBeCloseTo(
      a.order.progress["front-left"] * WORKSHOP.upgradedRate,
    );
    tickWorkshop(a, NaN, size, false);
    expect(a.order.progress["front-left"]).toBeCloseTo(0.5);
  });
  it("rejects broken saves and keeps every job type", () => {
    for (const raw of [
      null,
      "broken",
      "{}",
      JSON.stringify({ ...newWorkshop(), version: 90 }),
      JSON.stringify({ ...newWorkshop(), credits: -1 }),
    ])
      expect(restoreWorkshop(raw)).toEqual(newWorkshop());
    expect(Object.keys(JOBS)).toEqual([
      "front",
      "rear",
      "all",
      "repair",
      "tires",
    ]);
  });
  it("places every interaction outside the actual model collision envelope and within the walkable court", () => {
    for (const id of [
      "rustback:standard",
      "city-sprint:standard",
      "rallye:standard",
    ] as const) {
      const car = new FleetCar(id, GAME_VEHICLE_SCALE);
      for (const kind of ["front", "rear", "all", "repair", "tires"] as const)
        for (const p of workPoints(kind, car.footprint)) {
          expect(
            insideCar(p, {
              ...WORKSHOP.car,
              ...car.footprint,
              yaw: 0,
              turning: false,
            }),
          ).toBe(false);
          expect(p.z).toBeGreaterThan(0.576);
          expect(p.z).toBeLessThan(9.984);
          expect(p.x).toBeGreaterThan(-3.68);
          expect(p.x).toBeLessThan(10.09);
        }
      car.dispose();
    }
  });
  it("holds the customer indefinitely until service is released", () => {
    const traffic = new ServiceTraffic();
    traffic.beginService("rustback:standard", "service");
    for (let i = 0; i < 400; i++) traffic.update(0.1);
    expect(traffic.phase).toBe("stopped");
    expect(traffic.finished).toBe(false);
    traffic.releaseClient();
    for (let i = 0; i < 500; i++) traffic.update(0.1);
    expect(traffic.finished).toBe(true);
    expect(traffic.phase).toBe("departing");
    traffic.dispose();
  });
  it("slides along the car without passing through its collision envelope", () => {
    const car = {
      x: 0,
      z: 0,
      yaw: 0,
      turning: false,
      halfWidth: 1,
      halfLength: 2,
    };
    const p = slideWalkAtCar({ x: -1.3, z: 0 }, { x: -1.2, z: -0.2 }, car);
    expect(insideCar(p, car)).toBe(false);
    expect(p.z).toBeCloseTo(-0.2);
  });
  it("resumes a partially serviced customer without reissuing completed steps", () => {
    const s = newWorkshop();
    dockClient(s);
    s.order.progress["front-left"] = 1;
    s.order.progress["front-right"] = 0.45;
    const loaded = restoreWorkshop(JSON.stringify(s));
    expect(loaded.order.progress).toEqual(s.order.progress);
    loaded.position = workPoints("front", size)[1];
    for (let i = 0; i < 50; i++) tickWorkshop(loaded, 0.05, size, false);
    expect(loaded.serviced).toBe(1);
    expect(loaded.reward?.amount).toBe(50);
  });
});
