import * as T from "three";
import { CarMesh } from "./car-mesh";

/** One shared wheel design for the rack, carried item and fitted replacement.
 * Axis +Z, radius .43 metres. No billboard or texture-dependent silhouette. */
export function createWorkshopWheel() {
  const b = new CarMesh();
  b.root.name = "Pitlane_Replacement_Wheel";
  const rubber = b.material("#292d30", 0.9, 0),
    tread = b.material("#141b21", 0.95, 0);
  const alloy = b.material("#b9c3c1", 0.32, 0.7),
    hub = b.material("#455158", 0.55, 0.4);
  const tire = new T.TorusGeometry(0.325, 0.105, 10, 40);
  tire.scale(1, 1, 1.3);
  b.add(tire, rubber);
  b.cylinder([0, 0, 0], 0.258, 0.18, hub, "z", undefined, 32);
  for (const side of [-1, 1]) {
    b.add(new T.TorusGeometry(0.255, 0.018, 6, 36), alloy, [0, 0, side * 0.11]);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.box(
        [Math.sin(a) * 0.15, Math.cos(a) * 0.15, side * 0.107],
        [0.055, 0.24, 0.025],
        alloy,
        0.012,
        [0, 0, -a],
      );
      b.cylinder(
        [Math.sin(a) * 0.062, Math.cos(a) * 0.062, side * 0.135],
        0.012,
        0.016,
        alloy,
        "z",
        undefined,
        6,
      );
    }
    b.cylinder([0, 0, side * 0.116], 0.044, 0.025, tread, "z", undefined, 16);
  }
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    b.box(
      [Math.sin(a) * 0.428, Math.cos(a) * 0.428, 0],
      [0.014, 0.009, 0.19],
      tread,
      0.003,
      [0, 0.22 * (i % 2 ? 1 : -1), -a],
    );
  }
  b.finish();
  return b;
}

export function createWheelRack() {
  const b = new CarMesh();
  const red = b.material("#bc242d", 0.5, 0.25),
    steel = b.material("#283840", 0.7, 0.4),
    silver = b.material("#a2acac", 0.4, 0.6);
  for (const x of [-1.03, 1.03])
    for (const z of [-0.28, 0.28]) {
      b.box([x, 1.12, z], [0.065, 2.24, 0.065], red, 0.008);
      b.box([x, 0.04, z], [0.2, 0.08, 0.2], steel, 0.015);
      for (const y of [0.42, 1.38, 2.15])
        b.cylinder([x, y, z + 0.04], 0.016, 0.012, silver, "z", undefined, 6);
    }
  for (const y of [0.22, 1.16]) {
    b.box([0, y, 0], [2.16, 0.06, 0.62], steel, 0.012);
    b.box([0, y + 0.05, 0.32], [2.16, 0.1, 0.04], red, 0.008);
  }
  b.box([0, 2.19, 0], [2.16, 0.14, 0.63], red, 0.012);
  // Cross-brace visible behind the wheels.
  b.line(
    [
      [-1, 0.25, -0.29],
      [1, 2.14, -0.29],
    ],
    0.022,
    silver,
    undefined,
    false,
  );
  b.finish();
  const wheels = [-0.49, 0.49].flatMap((x) =>
    [0.66, 1.6].map((y) => {
      const wheel = createWorkshopWheel();
      wheel.root.position.set(x, y, 0.04);
      b.root.add(wheel.root);
      return wheel;
    }),
  );
  return {
    root: b.root,
    supplyWheel: wheels[1].root,
    dispose() {
      wheels.forEach((w) => w.dispose());
      b.dispose();
    },
  };
}
