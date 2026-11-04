import * as T from "three";
import { FleetCar } from "./fleet-car";
import { GAME_VEHICLE_SCALE } from "./vehicle-scale";
import { FLEET_KINDS, FLEET_MODELS, MODELS, parseFleetId, type FleetId } from "./fleet-catalogue";
import { insideCar, carsOverlap, sampleServiceRoute, SERVICE_ROADS, SERVICE_ROUTE_LENGTH, SERVICE_STOP_DISTANCE, type VehiclePose } from "./service-route";

export type TrafficPhase = "arriving" | "stopped" | "departing";
const chassis = [0, 1, 2].flatMap(design => FLEET_KINDS.map(kind => FLEET_MODELS.find(m => MODELS[m].kind === kind && MODELS[m].design === design)!));
export const SERVICE_FLEET: FleetId[] = ["standard", "upgraded"].flatMap(variant => chassis.map(model => `${model}:${variant}` as FleetId));
/** Visual route study: no orders, economy events or server rewards are emitted. */
export class ServiceTraffic {
  readonly root = new T.Group();
  client = new FleetCar(SERVICE_FLEET[0], GAME_VEHICLE_SCALE);
  private ambient: FleetCar[];
  private preview = "";
  distance = 26;
  speed = 0;
  phase: TrafficPhase = "arriving";
  yielding = false;
  obstacles: VehiclePose[] = [];
  pedestrians: {x: number; z: number}[] = [];
  private dwell = 0;
  private time = 0;
  private cycles = 0;
  private controlled = false;
  finished = false;
  private entryPending = false;
  get present() { return this.client.root.visible && !this.finished; }
  pose: VehiclePose = sampleServiceRoute(this.distance);
  constructor(readonly shiftX = 0, ambient = true) {
    this.ambient = ambient ? [new FleetCar("nightline:standard", GAME_VEHICLE_SCALE), new FleetCar("city-sprint:standard", GAME_VEHICLE_SCALE), new FleetCar("bayside:standard", GAME_VEHICLE_SCALE)] : [];
    this.root.name = "Service_Traffic_Study";
    this.root.add(this.client.root, ...this.ambient.map(c => c.root));
    this.placeClient(); this.updateAmbient(0);
  }
  reset() {
    this.distance = 26; this.speed = 0; this.phase = "arriving";
    this.dwell = 0; this.time = 0; this.cycles = 0; this.yielding = false;
    this.placeClient(); this.updateAmbient(0);
  }
  /** The workshop owns service completion; the renderer owns only the route. */
  beginService(id: FleetId, status: "arriving" | "service" | "complete") {
    this.controlled = true; this.finished = false;
    this.replaceClient(id); this.entryPending = status === "arriving";
    this.client.root.visible=!this.entryPending; this.speed = 0; this.dwell = 0;
    this.phase = status === "service" ? "stopped" : status === "complete" ? "departing" : "arriving";
    this.distance = status === "arriving" ? 26 : SERVICE_STOP_DISTANCE;
    this.placeClient();
  }
  releaseClient() { if (this.phase === "stopped") this.phase = "departing"; }
  /** Local appearance selector. It restarts an arrival; it never changes ownership. */
  setPreview(id = "") {
    const next = parseFleetId(id) ? id : "";
    if (next === this.preview) return;
    this.preview = next;
    this.replaceClient(next as FleetId || SERVICE_FLEET[0]); this.reset();
  }
  private replaceClient(id: FleetId) {
    if (this.client.id === id) return;
    this.client.dispose(); this.client = new FleetCar(id, GAME_VEHICLE_SCALE); this.root.add(this.client.root);
  }
  private sample(distance: number): VehiclePose { const p=sampleServiceRoute(distance); return { ...p, x:p.x+this.shiftX, ...this.client.footprint }; }
  private placeClient() {
    this.pose = this.sample(this.distance);
    this.client.root.position.set(this.pose.x, 0, this.pose.z); this.client.root.rotation.y = this.pose.yaw;
  }
  private updateAmbient(dt: number) {
    this.ambient.forEach((car, i) => {
      const west = i < 2, speed = west ? 5.4 : 4.4;
      const from = west ? -55 : -14, length = west ? 100 : 58;
      const travel = ((this.time * speed + i * 43 + 12) % length);
      car.root.position.set(west ? 45 - travel : from + travel, -.04, west ? SERVICE_ROADS.upper.ambientZ : SERVICE_ROADS.lower.ambientZ);
      car.root.rotation.y = west ? Math.PI / 2 : -Math.PI / 2;
      car.animate(dt * speed, 0, false, false, this.time);
    });
  }
  update(delta: number, player?: { x: number; z: number }) {
    // Substeps also make review captures and irregular rendering frame rates agree.
    let remaining = Math.min(.1, Math.max(0, delta));
    while (remaining > 0) {
      const dt = Math.min(remaining, 1 / 60); remaining -= dt; this.time += dt;
      this.yielding = false;
      if (this.entryPending) {
        // A newly requested customer waits offstage instead of materializing
        // inside a returning team car. Hidden entries are not road obstacles.
        if (this.obstacles.some(car => carsOverlap(this.pose, car, 1))) {
          this.yielding = true; this.updateAmbient(dt); continue;
        }
        this.entryPending = false; this.client.root.visible = true;
      }
      if (this.phase === "stopped") {
        this.speed = 0; this.dwell += dt;
        if (!this.controlled && this.dwell >= 9) { this.phase = "departing"; this.dwell = 0; }
      } else if (!this.finished) {
        const end = this.phase === "arriving" ? SERVICE_STOP_DISTANCE : SERVICE_ROUTE_LENGTH-this.shiftX;
        const left = end - this.distance;
        const next = this.sample(Math.min(end, this.distance + .8 + this.speed * .65));
        const people = player ? [player, ...this.pedestrians] : this.pedestrians;
        if (people.some(p => insideCar(p, next, .50) || insideCar(p, this.pose, .40))) this.yielding = true;
        if (this.obstacles.some(car => carsOverlap(next, car, .55))) this.yielding = true;
        const inCourt = this.pose.z < 11.2 && this.pose.z > -1;
        const desired = this.yielding ? 0 : Math.min(inCourt || this.pose.turning ? 2.1 : 4.3, this.phase === "arriving" ? Math.sqrt(2 * 1.8 * Math.max(0, left)) : 4.3);
        const oldSpeed = this.speed;
        const acceleration = desired < this.speed ? 3.0 : 1.35;
        this.speed += Math.sign(desired - this.speed) * Math.min(Math.abs(desired - this.speed), acceleration * dt);
        let movement = (oldSpeed + this.speed) / 2 * dt;
        // Last safety envelope prevents a sudden player turn from being run through.
        if (people.some(p => insideCar(p, this.sample(this.distance + movement), .32))) { movement = 0; this.speed = 0; this.yielding = true; }
        if (this.obstacles.some(car => carsOverlap(this.sample(this.distance + movement), car, .15))) { movement = 0; this.speed = 0; this.yielding = true; }
        this.distance = Math.min(end, this.distance + movement);
        if (left < .012 && !this.yielding) {
          this.distance = end; this.speed = 0;
          if (this.phase === "arriving") this.phase = "stopped";
          else if (this.controlled) { this.finished = true; this.client.root.visible=false; }
          else { this.distance = 0; this.phase = "arriving"; this.cycles++; this.replaceClient(this.preview as FleetId || SERVICE_FLEET[this.cycles % SERVICE_FLEET.length]); }
        }
        this.placeClient();
        this.client.animate(movement, this.pose.turning ? -.32 : 0, this.speed < oldSpeed || this.yielding, this.pose.turning, this.time);
      }
      if (this.phase === "stopped") this.client.animate(0, 0, true, false, this.time);
      this.updateAmbient(dt);
    }
    this.root.userData = { phase: this.phase, yielding: this.yielding, distance: this.distance, speed: this.speed, cycles: this.cycles, dwell: this.dwell, x: this.pose.x, z: this.pose.z, yaw: this.pose.yaw, fleetId: this.client.id, rewardFree: true };
  }
  dispose() { this.client.dispose(); this.ambient.forEach(c => c.dispose()); this.root.removeFromParent(); }
}
