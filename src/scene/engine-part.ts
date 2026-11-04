import { CarMesh } from "./car-mesh";

/** Rebuilt alternator: cast housing, cooling ribs, pulley and insulated terminal. */
export function createEnginePart() {
  const b = new CarMesh(),
    alloy = b.material("#9ca7a6", 0.44, 0.65),
    dark = b.material("#293239", 0.6, 0.3),
    copper = b.material("#a76637", 0.5, 0.55),
    red = b.material("#a42628");
  b.cylinder([0, 0, 0], 0.22, 0.48, alloy, "x", undefined, 20);
  for (let x = -0.2; x <= 0.2; x += 0.075)
    b.cylinder([x, 0, 0], 0.238, 0.022, dark, "x", undefined, 20);
  for (const side of [-1, 1]) {
    b.cylinder([side * 0.255, 0, 0], 0.235, 0.07, alloy, "x", undefined, 20);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      b.cylinder(
        [side * 0.296, Math.cos(a) * 0.16, Math.sin(a) * 0.16],
        0.022,
        0.025,
        copper,
        "x",
        undefined,
        8,
      );
    }
  }
  b.cylinder([-0.33, 0, 0], 0.11, 0.08, dark, "x", undefined, 20);
  b.cylinder([-0.38, 0, 0], 0.05, 0.025, alloy, "x", undefined, 8);
  b.box([0.15, 0.22, 0], [0.14, 0.1, 0.16], red, 0.025);
  for (const z of [-0.19, 0.19])
    b.box([0, -0.2, z], [0.3, 0.09, 0.12], alloy, 0.02);
  b.line(
    [
      [0.16, 0.25, 0.03],
      [0.32, 0.29, 0.07],
      [0.35, 0.12, 0.16],
    ],
    0.025,
    dark,
  );
  b.finish();
  return b;
}
