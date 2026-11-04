import { describe, expect, it } from "vitest";
import * as T from "three";
import { FLEET_IDS, FLEET_KINDS, FLEET_MODELS, MODELS, parseFleetId } from "../src/scene/fleet-catalogue";
import { FleetCar } from "../src/scene/fleet-car";
import { GAME_VEHICLE_SCALE } from "../src/scene/vehicle-scale";
import { ServiceTraffic, SERVICE_FLEET } from "../src/scene/service-traffic";
import { insideCar, clipWalkAtCar, SERVICE_ROADS, SERVICE_ROUTE_LENGTH, SERVICE_STOP_DISTANCE } from "../src/scene/service-route";

describe("volumetric fleet", () => {
  it("closes the beltline between the door shoulder and glazing on both sides of every chassis", () => {
    const ray = new T.Raycaster();
    for (const id of FLEET_IDS) {
      const car = new FleetCar(id), s = car.spec;
      const baseWidth = s.kind === "prototype" ? .50 : s.kind === "enduro" ? .67 : s.width / 2 * .87;
      car.root.updateMatrixWorld(true);
      for (const side of [-1, 1]) for (const t of [.2, .5, .8]) for (const dy of [-.012, .015, .045]) {
        const z = T.MathUtils.lerp(s.roofFront, s.roofRear, t);
        ray.set(new T.Vector3(side * 3, s.belt + dy, z), new T.Vector3(-side, 0, 0));
        const hit = ray.intersectObject(car.root, true)[0];
        expect(hit, `${id}: open beltline at ${side}, ${z}, ${dy}`).toBeDefined();
        expect(hit.point.x * side, `${id}: ray entered cabin through a body gap`).toBeGreaterThan(baseWidth * .86);
      }
      car.dispose();
    }
  // Raycast all 30 detailed chassis; allow for slower shared CI runners.
  }, 30_000);
  it("scales the collision envelope and rolling distance with the in-game model", () => {
    const authored = new FleetCar(), game = new FleetCar("rustback:standard", GAME_VEHICLE_SCALE);
    expect(game.footprint.halfLength / authored.footprint.halfLength).toBeCloseTo(GAME_VEHICLE_SCALE);
    expect(game.footprint.halfWidth / authored.footprint.halfWidth).toBeCloseTo(GAME_VEHICLE_SCALE);
    const p = { x: 0, z: authored.footprint.halfLength + .4 };
    expect(insideCar(p, {x: 0, z: 0, yaw: 0, turning: false, ...authored.footprint})).toBe(false);
    expect(insideCar(p, {x: 0, z: 0, yaw: 0, turning: false, ...game.footprint})).toBe(true);
    game.animate(game.spec.wheelRadius * GAME_VEHICLE_SCALE * Math.PI * 2, 0, false, false, 0);
    expect(game.wheels[0].rotation.x).toBeCloseTo(-Math.PI * 2);
    authored.dispose(); game.dispose();
  });
  it("keeps enlarged vehicles inside both road lanes with passing clearance", () => {
    let widest = 0;
    for (const id of FLEET_IDS) {
      const car = new FleetCar(id, GAME_VEHICLE_SCALE);
      widest = Math.max(widest, car.footprint.halfWidth);
      for (const lane of Object.values(SERVICE_ROADS)) for (const z of [lane.clientZ, lane.ambientZ]) {
        expect(z - car.footprint.halfWidth).toBeGreaterThan(lane.minZ + .15);
        expect(z + car.footprint.halfWidth).toBeLessThan(lane.maxZ - .15);
      }
      car.dispose();
    }
    for (const lane of Object.values(SERVICE_ROADS)) expect(Math.abs(lane.clientZ - lane.ambientZ)).toBeGreaterThan(widest * 2 + .2);
  });
  it("has three different chassis in each class and two configurations of every chassis", () => {
    expect(FLEET_MODELS).toHaveLength(15); expect(new Set(FLEET_IDS).size).toBe(30);
    for (const kind of FLEET_KINDS) {
      const models = FLEET_MODELS.filter(k => MODELS[k].kind === kind);
      expect(models).toHaveLength(3);
      expect(new Set(models.map(k => [MODELS[k].length, MODELS[k].cabinFront, MODELS[k].roofRear, MODELS[k].cabinRear].join()))).toHaveLength(3);
    }
    expect(parseFleetId("unknown:standard")).toBeUndefined(); expect(new Set(SERVICE_FLEET)).toEqual(new Set(FLEET_IDS));
  });
  it("builds finite grounded geometry, independently steerable wheels and materially different upgrades", () => {
    const counts = new Map<string, number>();
    for (const id of FLEET_IDS) {
      const car = new FleetCar(id), bounds = new T.Box3().setFromObject(car.root); let triangles = 0;
      car.root.traverse(o => { if (o instanceof T.Mesh) { expect(o.geometry.boundingSphere?.radius ?? 1).toBeGreaterThan(0); triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3; } });
      expect(car.wheels).toHaveLength(4); expect(car.frontPivots).toHaveLength(2);
      expect(bounds.min.y).toBeGreaterThan(-.015); expect(bounds.max.y).toBeLessThan(1.7);
      expect(car.footprint.halfLength).toBeGreaterThan(car.spec.length / 2);
      expect(triangles).toBeLessThan(70000); counts.set(id, triangles);
      car.animate(1, -.3, true, true, .1); expect(car.wheels[0].rotation.x).toBeCloseTo(-1 / car.spec.wheelRadius); expect(car.frontPivots[0].rotation.y).toBe(-.3);
      car.dispose(); expect(car.root.parent).toBeNull();
    }
    for (const model of FLEET_MODELS) expect(counts.get(`${model}:standard`)).not.toBe(counts.get(`${model}:upgraded`));
  });
  it("cycles all configurations offscreen, while an explicit local selection persists", () => {
    const traffic = new ServiceTraffic(), visited = new Set([traffic.client.id]);
    for (let i = 0; i < 30; i++) {
      traffic.phase = "departing"; traffic.distance = SERVICE_ROUTE_LENGTH - .001; traffic.update(1 / 60);
      visited.add(traffic.client.id); expect(traffic.root.children).toHaveLength(4);
      expect(traffic.pose.halfLength).toBe(traffic.client.footprint.halfLength);
    }
    expect(visited).toEqual(new Set(FLEET_IDS));
    traffic.setPreview("longtail:upgraded"); const selected = traffic.client;
    traffic.setPreview("longtail:upgraded"); expect(traffic.client).toBe(selected);
    traffic.phase = "departing"; traffic.distance = SERVICE_ROUTE_LENGTH - .001; traffic.update(1 / 60); expect(traffic.client.id).toBe("longtail:upgraded");
    traffic.setPreview(""); expect(traffic.client.id).toBe("rustback:standard"); traffic.dispose();
  });
  it("uses the visible chassis dimensions for walk clipping and safe stopping", () => {
    const small = { x: 0, z: 0, yaw: 0, turning: false, halfWidth: .9, halfLength: 1.8 };
    const large = { ...small, halfWidth: 1.2, halfLength: 2.65 };
    expect(insideCar({ x: 0, z: 2.4 }, small)).toBe(false); expect(insideCar({ x: 0, z: 2.4 }, large)).toBe(true);
    const a = clipWalkAtCar({ x: 0, z: -5 }, { x: 0, z: 5 }, small), b = clipWalkAtCar({ x: 0, z: -5 }, { x: 0, z: 5 }, large);
    expect(b.z).toBeLessThan(a.z - .7);
    const traffic = new ServiceTraffic(); traffic.setPreview("longtail:upgraded");
    for (let i = 0; i < 1500; i++) traffic.update(1 / 60, { x: 5.333333, z: 7.5 });
    expect(traffic.yielding).toBe(true); expect(traffic.speed).toBe(0); expect(traffic.distance).toBeLessThan(SERVICE_STOP_DISTANCE);
    for (let i = 0; i < 900; i++) traffic.update(1 / 60, { x: 1, z: 5 });
    expect(traffic.distance).toBeGreaterThan(SERVICE_STOP_DISTANCE - .02); traffic.dispose();
  });
});
