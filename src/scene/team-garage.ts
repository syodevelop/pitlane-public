import * as T from "three";
import {
  TEAM_GARAGE,
  teamReady,
  teamWorkPoints,
  racePreparationPoint,
  type WorkshopState,
} from "../../packages/workshop-core";
import { FleetCar } from "./fleet-car";
import { GAME_VEHICLE_SCALE } from "./vehicle-scale";
import { carAtHome, RACE_DESK, SPRINT } from "../../packages/workshop-core/racing";
import { CarMesh } from "./car-mesh";
import { teamRoutePose, teamRouteDistance } from "./team-route";
import { insideCar, carsOverlap, type VehiclePose } from "./service-route";

/** The player's own car is separate from the customer queue. */
export class TeamGarage {
  readonly root = new T.Group();
  readonly car = new FleetCar("rustback:standard", GAME_VEHICLE_SCALE);
  readonly body = {
    ...TEAM_GARAGE.car,
    yaw: 0,
    turning: false,
    ...this.car.footprint,
  };
  private markers: { id: string; root: T.Group; ring: T.Mesh; arc: T.Mesh }[] =
    [];
  private appearance = "";
  private desk = new CarMesh();
  readonly deskBody = {
    ...RACE_DESK,
    yaw: 0,
    turning: false,
    halfWidth: 0.55,
    halfLength: 0.82,
  };
  northGate = 0;
  southGate = 0;
  yielding = false;
  carVisible = true;
  private lastDistance: number | null = null;
  private lastPhase = "";
  constructor() {
    this.root.name = "Player_Team_Garage";
    this.car.root.position.set(TEAM_GARAGE.car.x, 0, TEAM_GARAGE.car.z);
    this.root.add(this.car.root);
    for (const p of [
      ...teamWorkPoints(this.car.footprint),
      racePreparationPoint(this.car.footprint),
    ]) {
      const root = new T.Group();
      root.position.set(p.x, 0.035, p.z);
      const ring = new T.Mesh(
        new T.RingGeometry(0.525, 0.57, 64),
        new T.MeshBasicMaterial({
          color: 0xb77d2d,
          transparent: true,
          opacity: 0.75,
          depthWrite: false,
          side: T.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      root.add(ring);
      const arc = new T.Mesh(
        new T.RingGeometry(0.595, 0.66, 64),
        new T.MeshBasicMaterial({
          color: 0x367a52,
          depthWrite: false,
          side: T.DoubleSide,
        }),
      );
      arc.rotation.x = -Math.PI / 2;
      arc.rotation.z = Math.PI / 2;
      arc.position.y = 0.006;
      root.add(arc);
      this.markers.push({ id: p.id, root, ring, arc });
      this.root.add(root);
    }
    const b = this.desk,
      dark = b.material("#23313b"),
      red = b.material("#b5272b"),
      steel = b.material("#a8b4b4", 0.3, 0.6),
      cream = b.material("#e4dcc6"),
      screen = b.material("#528c8a", 0.35);
    b.box([0, 0.97, 0], [1.1, 0.12, 1.65], dark, 0.035);
    for (const x of [-0.43, 0.43])
      for (const z of [-0.68, 0.68])
        b.box([x, 0.48, z], [0.07, 0.9, 0.07], steel, 0.015);
    b.box([0.15, 0.44, 0.42], [0.6, 0.6, 0.55], red, 0.03);
    for (const y of [0.27, 0.47, 0.67])
      b.box([-0.16, y, 0.42], [0.03, 0.025, 0.42], steel, 0.005);
    b.box([-0.1, 1.06, -0.2], [0.54, 0.045, 0.66], steel, 0.012);
    b.box([0.15, 1.29, -0.2], [0.04, 0.44, 0.66], dark, 0.025, [0, 0, -0.15]);
    b.box(
      [0.12, 1.29, -0.2],
      [0.012, 0.34, 0.54],
      screen,
      0.006,
      [0, 0, -0.15],
    );
    for (let i = 0; i < 4; i++)
      b.box([-0.11 + i * 0.06, 1.09, -0.2], [0.027, 0.008, 0.47], dark, 0.002);
    b.box([-0.1, 1.05, 0.46], [0.5, 0.025, 0.38], cream, 0.006, [0, -0.15, 0]);
    b.cylinder([0.25, 1.14, -0.65], 0.065, 0.2, red, "y", undefined, 14);
    b.finish();
    b.root.position.set(RACE_DESK.x, 0, RACE_DESK.z);
    this.root.add(b.root);
  }
  canTravel(state: WorkshopState, dt: number, client: VehiclePose | VehiclePose[]) {
    const r = state.racing;
    const clients=Array.isArray(client)?client:[client];
    if (r.phase === "racing" && r.elapsed + Math.max(0, dt) >= SPRINT.seconds) {
      const entry = {...teamRoutePose({...r,phase:"returning",elapsed:0}),...this.car.footprint};
      this.yielding = clients.some(c=>carsOverlap(entry,c,1));
      return !this.yielding;
    }
    if (r.phase !== "leaving" && r.phase !== "returning") {
      this.yielding = false;
      return true;
    }
    const current = { ...teamRoutePose(r), ...this.car.footprint };
    const next = {
      ...teamRoutePose(r, Math.max(0.3, dt)),
      ...this.car.footprint,
    };
    this.yielding = insideCar(state.position,next,.55) || insideCar(state.position,current,.32) || clients.some(c=>{
      const ahead=-Math.sin(current.yaw)*(c.x-current.x)-Math.cos(current.yaw)*(c.z-current.z)>0;
      return ahead && carsOverlap(next,c,1);
    });
    return !this.yielding;
  }
  update(state: WorkshopState, dt: number) {
    this.root.visible = state.team.unlocked;
    if (!state.team.unlocked) return;
    const ready = teamReady(state);
    const r = state.racing,
      home = carAtHome(r);
    const pose = { ...teamRoutePose(r), ...this.car.footprint };
    Object.assign(this.body, pose);
    this.carVisible = r.phase !== "racing";
    this.car.root.visible = this.carVisible;
    this.car.root.position.set(pose.x, 0, pose.z);
    this.car.root.rotation.y = pose.yaw;
    const distance = teamRouteDistance(r);
    const movement =
      this.lastPhase === r.phase && this.lastDistance !== null
        ? Math.max(0, distance - this.lastDistance)
        : 0;
    this.car.animate(
      movement,
      pose.turning ? -0.32 : 0,
      this.yielding,
      pose.turning,
      r.elapsed,
    );
    this.lastDistance = distance;
    this.lastPhase = r.phase;
    const gateEase = 1 - Math.exp(-dt * 7);
    this.northGate +=
      ((r.phase === "leaving" ? 1 : 0) - this.northGate) * gateEase;
    this.southGate +=
      ((r.phase === "returning" ? 1 : 0) - this.southGate) * gateEase;
    if (dt === 0) {
      this.northGate = r.phase === "leaving" ? 1 : 0;
      this.southGate = r.phase === "returning" ? 1 : 0;
    }
    const clean =
      ((state.team.progress["team-front-left"] || 0) +
        (state.team.progress["team-front-right"] || 0)) /
      2;
    const key = `${clean.toFixed(2)}:${ready}`;
    if (key !== this.appearance) {
      this.car.setRestoration(clean, ready);
      this.appearance = key;
    }
    this.car.setServiceHood(
      home &&
        ((state.team.progress["team-engine"] || 0) < 1 ||
          (ready && r.phase === "idle" && r.preparation < 1)),
      dt,
    );
    for (const m of this.markers) {
      const prep = m.id === "team-prepare";
      const progress = prep ? r.preparation : state.team.progress[m.id] || 0;
      m.root.visible = prep
        ? ready && r.phase === "idle" && r.preparation < 1
        : !ready;
      (m.ring.material as T.MeshBasicMaterial).opacity =
        progress >= 1 ? 0.16 : 0.75;
      m.arc.geometry.setDrawRange(0, Math.floor(progress * 64) * 6);
    }
  }
  dispose() {
    this.car.dispose();
    this.desk.dispose();
    for (const m of this.markers)
      for (const mesh of [m.ring, m.arc]) {
        mesh.geometry.dispose();
        (mesh.material as T.Material).dispose();
      }
    this.root.removeFromParent();
  }
}
