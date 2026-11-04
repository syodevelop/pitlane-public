import * as T from "three";
import { CarMesh } from "./car-mesh";
import { createWheelRack } from "./workshop-wheel";
import {
  WORKSHOP,
  workPoints,
  type WorkshopState,
  type CarSize,
  type WorkPoint,
} from "../../packages/workshop-core";

/** Scene-only feedback. The rules decide progress and rewards; meshes display it. */
export class WorkshopProps {
  readonly root = new T.Group();
  private cart = new CarMesh();
  private markers: { id: string; root: T.Group; arc: T.Mesh; base: T.Mesh }[] =
    [];
  private money = new T.Group();
  private kit = new T.Group();
  private shop = new T.Group();
  private order = 0;
  private rack = createWheelRack();
  private supply = this.ring(0.52, 0xffdb88);
  private jack = new T.Group();
  private staffJack = new T.Group();
  constructor() {
    const b = this.cart;
    const red = b.material("#c71e25", 0.45, 0.2),
      steel = b.material("#bcc4c3", 0.3, 0.7),
      dark = b.material("#202830", 0.7),
      cream = b.material("#eee4ca");
    b.box([0, 0.55, 0], [1, 0.8, 0.56], red, 0.045);
    b.box([0, 1, 0], [1.12, 0.09, 0.67], dark, 0.035);
    for (let i = 0; i < 4; i++) {
      b.box([0.01, 0.32 + i * 0.17, 0.287], [0.88, 0.13, 0.018], red, 0.008);
      b.box([0.01, 0.37 + i * 0.17, 0.305], [0.76, 0.025, 0.025], steel, 0.006);
    }
    for (const x of [-0.4, 0.4])
      for (const z of [-0.22, 0.22])
        b.cylinder([x, 0.12, z], 0.11, 0.065, dark, "x", undefined, 14);
    b.line(
      [
        [-0.57, 0.7, 0],
        [-0.67, 0.7, 0],
        [-0.67, 0.9, 0],
        [-0.57, 0.9, 0],
      ],
      0.025,
      steel,
    );
    for (let i = 0; i < 3; i++)
      b.box(
        [-0.25 + i * 0.2, 1.065, 0.05],
        [0.04, 0.035, 0.25],
        steel,
        0.008,
        [0, -0.25, 0],
      );
    b.box([0.27, 1.07, -0.12], [0.22, 0.035, 0.18], cream, 0.01);
    // A fitted back panel and hanging spanners make this a small tool station,
    // tucked against the perimeter wall rather than a box in the walking lane.
    b.box([0, 1.38, -0.29], [1.06, 0.66, 0.055], dark, 0.02);
    for (let x = -0.42; x < 0.48; x += 0.14)
      for (let y = 1.16; y < 1.68; y += 0.13)
        b.cylinder([x, y, -0.256], 0.012, 0.007, steel, "z", undefined, 6);
    for (let i = 0; i < 3; i++) {
      const x = -0.32 + i * 0.21;
      b.box([x, 1.42, -0.21], [0.035, 0.24 - i * 0.025, 0.025], steel, 0.008);
      b.cylinder([x, 1.55, -0.21], 0.048, 0.023, steel, "z", undefined, 6);
      b.cylinder([x, 1.55, -0.192], 0.023, 0.005, dark, "z", undefined, 6);
    }
    b.cylinder([0.39, 1.18, 0.08], 0.055, 0.22, cream, "y", undefined, 12);
    b.box([0.39, 1.32, 0.08], [0.09, 0.05, 0.09], red, 0.01);
    b.root.add(this.kit);
    b.box(
      [0, 1.16, -0.04],
      [0.65, 0.25, 0.4],
      dark,
      0.035,
      undefined,
      this.kit,
    );
    b.box([0, 1.3, -0.04], [0.62, 0.035, 0.38], red, 0.01, undefined, this.kit);
    b.box(
      [0, 1.34, -0.04],
      [0.24, 0.045, 0.06],
      steel,
      0.01,
      undefined,
      this.kit,
    );
    b.box([0, 0.05, 0], [0.25, 0.1, 0.48], red, 0.02, undefined, this.jack);
    for (const x of [-0.08, 0.08]) {
      b.line(
        [
          [x, 0.1, -0.17],
          [x, 0.34, 0.17],
        ],
        0.025,
        steel,
        this.jack,
        false,
      );
      b.line(
        [
          [x, 0.1, 0.17],
          [x, 0.34, -0.17],
        ],
        0.025,
        steel,
        this.jack,
        false,
      );
    }
    b.box([0, 0.36, 0], [0.24, 0.06, 0.3], dark, 0.01, undefined, this.jack);
    b.finish();
    this.staffJack = this.jack.clone();
    this.root.add(this.staffJack);
    this.root.add(this.jack);
    this.jack.visible = false;
    this.rack.root.position.set(WORKSHOP.rack.x, 0, WORKSHOP.rack.z);
    this.root.add(this.rack.root);
    this.supply.root.position.set(WORKSHOP.supply.x, 0.035, WORKSHOP.supply.z);
    this.root.add(this.supply.root);
    b.root.position.set(WORKSHOP.cart.x, 0, WORKSHOP.cart.z);
    this.root.add(b.root);
    const shopRing = this.ring(0.48, 0xf3ce75);
    shopRing.arc.visible = false;
    this.shop = shopRing.root;
    this.shop.position.set(WORKSHOP.shop.x, 0.04, WORKSHOP.shop.z);
    this.root.add(this.shop);
    const paper = new T.MeshStandardMaterial({
      color: "#b5c69b",
      roughness: 0.8,
    });
    const band = new T.MeshStandardMaterial({
      color: "#f5dd9b",
      roughness: 0.7,
    });
    for (let i = 0; i < 3; i++) {
      const stack = new T.Group();
      stack.position.set((i - 1) * 0.18, 0.07 + i * 0.07, (i % 2) * 0.12);
      stack.rotation.y = i * 0.5;
      stack.add(new T.Mesh(new T.BoxGeometry(0.4, 0.06, 0.22), paper));
      stack.add(new T.Mesh(new T.BoxGeometry(0.09, 0.066, 0.226), band));
      this.money.add(stack);
    }
    this.money.position.set(WORKSHOP.payout.x, 0, WORKSHOP.payout.z);
    this.root.add(this.money);
  }
  private ring(radius: number, color: number) {
    const root = new T.Group();
    const base = new T.Mesh(
      new T.RingGeometry(radius - 0.045, radius, 64),
      new T.MeshBasicMaterial({
        color: color === 0xffdb88 || color === 0xf3ce75 ? 0xb77d2d : color,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
        side: T.DoubleSide,
      }),
    );
    base.rotation.x = -Math.PI / 2;
    root.add(base);
    const arc = new T.Mesh(
      new T.RingGeometry(radius + 0.025, radius + 0.09, 64),
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
    return { root, base, arc };
  }
  update(
    state: WorkshopState,
    size: CarSize,
    time: number,
    reduced: boolean,
    active?: WorkPoint,
    staffWork?: WorkPoint,
  ) {
    if (this.order !== state.order.number) {
      this.markers.forEach((m) => this.release(m.root));
      this.markers = [];
      this.order = state.order.number;
      for (const p of workPoints(state.order.kind, size)) {
        const marker = this.ring(0.57, 0xffdb88);
        marker.root.position.set(p.x, 0.035, p.z);
        this.root.add(marker.root);
        this.markers.push({ id: p.id, ...marker });
      }
    }
    for (const marker of this.markers) {
      const progress = state.order.progress[marker.id] || 0;
      marker.root.visible = state.order.status === "service";
      marker.arc.geometry.setDrawRange(0, Math.floor(progress * 64) * 6);
      (marker.base.material as T.MeshBasicMaterial).opacity =
        progress >= 1
          ? 0.16
          : state.order.kind === "tires" && !state.carried
            ? 0.22
            : reduced
              ? 0.7
              : 0.65 + Math.sin(time * 3) * 0.12;
    }
    this.supply.root.visible =
      state.order.kind === "tires" &&
      state.order.status === "service" &&
      !state.carried;
    this.supply.arc.geometry.setDrawRange(
      0,
      Math.floor(state.collectProgress * 64) * 6,
    );
    this.rack.supplyWheel.visible = !state.carried && !state.mechanic.carried;
    this.staffJack.visible = staffWork?.kind === "wheel";
    if (staffWork?.kind === "wheel") this.staffJack.position.set(WORKSHOP.car.x + Math.sign(staffWork.x-WORKSHOP.car.x)*(size.halfWidth-.23), 0, staffWork.z+.65);
    this.jack.visible = active?.kind === "wheel";
    if (active?.kind === "wheel")
      this.jack.position.set(
        WORKSHOP.car.x +
          Math.sign(active.x - WORKSHOP.car.x) * (size.halfWidth - 0.23),
        0,
        active.z + 0.65,
      );
    this.kit.visible = state.tools > 0;
    this.shop.visible = !state.tools;
    this.money.visible = !!state.reward;
    this.money.position.y = reduced ? 0.08 : 0.08 + Math.sin(time * 3) * 0.045;
  }
  private release(root: T.Object3D) {
    const materials = new Set<T.Material>();
    root.traverse((o) => {
      if (o instanceof T.Mesh) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          materials.add(m);
      }
    });
    materials.forEach((m) => m.dispose());
    root.removeFromParent();
  }
  dispose() {
    this.rack.dispose();
    this.jack.removeFromParent();
    this.staffJack.removeFromParent();
    this.cart.dispose();
    this.root.remove(this.cart.root);
    this.release(this.root);
  }
}
