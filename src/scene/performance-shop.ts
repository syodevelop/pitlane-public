import * as T from "three";
import {
  PERFORMANCE,
  engineStage,
  performancePoint,
  nextPerformance,
} from "../../packages/workshop-core/performance";
import {
  WORKSHOP,
  type WorkshopState,
  type WorkPoint,
} from "../../packages/workshop-core";
import { ServiceTraffic } from "./service-traffic";
import type { VehiclePose } from "./service-route";
import { CarMesh } from "./car-mesh";
import { createEnginePart } from "./engine-part";
import type { FleetId } from "./fleet-catalogue";

const clients: FleetId[] = [
  "rallye:upgraded",
  "city-sprint:upgraded",
  "rustback:upgraded",
];
export class PerformanceShop {
  readonly root = new T.Group();
  readonly traffic = new ServiceTraffic(
    PERFORMANCE.car.x - WORKSHOP.car.x,
    false,
  );
  readonly benchBody = {
    ...PERFORMANCE.bench,
    yaw: 0,
    turning: false,
    halfWidth: 0.61,
    halfLength: 1.18,
  };
  private bench = new CarMesh();
  private part = createEnginePart();
  private money = new CarMesh();
  private marker = new T.Group();
  private ring = new T.Mesh(
    new T.RingGeometry(0.52, 0.57, 64),
    new T.MeshBasicMaterial({
      color: 0xb77d2d,
      transparent: true,
      opacity: 0.75,
      side: T.DoubleSide,
      depthWrite: false,
    }),
  );
  private arc = new T.Mesh(
    new T.RingGeometry(0.6, 0.67, 64),
    new T.MeshBasicMaterial({
      color: 0x367a52,
      side: T.DoubleSide,
      depthWrite: false,
    }),
  );
  private order = 0;
  constructor() {
    this.root.name = "Performance_Shop";
    this.root.add(this.traffic.root);
    const b = this.bench,
      steel = b.material("#6d818b", 0.5, 0.6),
      dark = b.material("#25363e"),
      wood = b.material("#8e6c4b", 0.9),
      red = b.material("#a9282a"),
      cream = b.material("#e6dbc0"),
      rubber = b.material("#323435");
    b.box([0, 1.22, 0], [1.22, 0.14, 2.36], wood, 0.035);
    b.box([-0.62, 1.2, 0], [0.045, 0.2, 2.38], steel, 0.015);
    for (const x of [-0.48, 0.48])
      for (const z of [-1.02, 1.02])
        b.box([x, 0.59, z], [0.09, 1.18, 0.09], steel, 0.015);
    b.box([0, 0.27, 0], [1.05, 0.07, 2.1], dark, 0.015);
    b.box([0.07, 0.66, 0.65], [0.9, 0.69, 0.65], red, 0.025);
    for (const y of [0.42, 0.64, 0.86]) {
      b.box([-0.4, y, 0.65], [0.03, 0.015, 0.6], dark);
      b.box([-0.45, y + 0.04, 0.65], [0.04, 0.04, 0.34], steel, 0.01);
    }
    b.box([0, 1.31, 0.1], [0.8, 0.035, 1.1], rubber, 0.02);
    // Bench vice and handle, trays, sockets and a wall tool board.
    b.box([-0.25, 1.38, -0.83], [0.48, 0.13, 0.35], red, 0.02);
    b.box([-0.25, 1.53, -0.83], [0.32, 0.2, 0.3], steel, 0.02);
    b.box([-0.25, 1.64, -0.83], [0.32, 0.03, 0.04], dark);
    b.cylinder([-0.54, 1.47, -0.83], 0.025, 0.35, steel, "x");
    b.cylinder([-0.7, 1.47, -0.83], 0.018, 0.32, steel, "y");
    b.box([0.28, 1.36, 0.87], [0.3, 0.08, 0.28], cream, 0.025);
    for (let i = 0; i < 5; i++)
      b.cylinder(
        [-0.2 + i * 0.11, 1.35, 0.83],
        0.035,
        0.1,
        steel,
        "y",
        undefined,
        8,
      );
    b.box([0.54, 2.0, 0], [0.07, 1.2, 2.3], dark, 0.02);
    for (let z = -1; z < 1.1; z += 0.18)
      for (let y = 1.55; y < 2.55; y += 0.18)
        b.cylinder([0.49, y, z], 0.014, 0.018, steel, "x", undefined, 6);
    for (const z of [-0.72, -0.35, 0.15, 0.55]) {
      b.box([0.43, 2.06, z], [0.04, 0.42, 0.055], steel, 0.01);
      b.cylinder([0.42, 2.3, z], 0.065, 0.04, steel, "x", undefined, 10);
    }
    b.box([0.38, 2.61, 0], [0.34, 0.09, 2.1], dark, 0.02);
    b.box([0.36, 2.56, 0], [0.24, 0.02, 1.9], cream);
    b.finish();
    b.root.position.set(PERFORMANCE.bench.x, 0, PERFORMANCE.bench.z);
    this.root.add(b.root);
    this.part.root.position.set(
      PERFORMANCE.bench.x - 0.12,
      1.57,
      PERFORMANCE.bench.z,
    );
    this.root.add(this.part.root);
    const paper = this.money.material("#c4bc8f"),
      band = this.money.material("#518467");
    for (let i = 0; i < 3; i++) {
      this.money.box(
        [i * 0.14, 0.09 + i * 0.035, 0],
        [0.43, 0.08, 0.25],
        paper,
        0.015,
      );
      this.money.box(
        [i * 0.14, 0.135 + i * 0.035, 0],
        [0.08, 0.01, 0.26],
        band,
      );
    }
    this.money.finish();
    this.money.root.position.set(
      PERFORMANCE.payout.x,
      0.04,
      PERFORMANCE.payout.z,
    );
    this.root.add(this.money.root);
    this.ring.rotation.x = this.arc.rotation.x = -Math.PI / 2;
    this.arc.rotation.z = Math.PI / 2;
    this.arc.position.y = 0.008;
    this.marker.add(this.ring, this.arc);
    this.root.add(this.marker);
  }
  contact(point: WorkPoint) {
    return point.kind === "bench"
      ? new T.Vector3(PERFORMANCE.bench.x - 0.12, 1.65, PERFORMANCE.bench.z)
      : this.traffic.client.serviceContact("engine");
  }
  update(s: WorkshopState, dt: number, obstacles: VehiclePose[] = []) {
    const p = s.performance;
    this.root.visible = p.unlocked;
    if (!p.unlocked) return;
    if (this.order !== p.number) {
      this.order = p.number;
      this.traffic.beginService(
        clients[(p.number - 1) % clients.length],
        p.status,
      );
    }
    this.traffic.obstacles = obstacles;
    if (p.status === "complete") this.traffic.releaseClient();
    this.traffic.update(dt, s.position);
    if (this.traffic.phase === "stopped" && p.status === "arriving")
      p.status = "service";
    this.traffic.client.setServiceHood(p.status === "service", dt);
    const point = performancePoint(s, this.traffic.client.footprint),
      stage = engineStage(p);
    this.marker.visible = !!point;
    if (point && stage) {
      this.marker.position.set(point.x, 0.04, point.z);
      this.arc.geometry.setDrawRange(0, Math.floor(p.progress[stage] * 64) * 6);
    }
    this.part.root.visible =
      p.status === "service" &&
      p.progress.diagnose >= 1 &&
      !p.carried &&
      p.progress.bench < 1;
    this.money.root.visible = p.reward;
    if (this.traffic.finished && nextPerformance(s)) return true;
    return false;
  }
  dispose() {
    this.traffic.dispose();
    this.bench.dispose();
    this.part.dispose();
    this.money.dispose();
    for (const mesh of [this.ring, this.arc]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.root.removeFromParent();
  }
}
