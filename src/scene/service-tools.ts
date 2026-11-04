import * as T from "three";
import { CarMesh } from "./car-mesh";

/** Small, solid props with a readable silhouette at the gameplay camera. */
export function createServiceTools() {
  const cloth = new CarMesh(),
    ratchet = new CarMesh(), scanner=new CarMesh();
  const fabric = cloth.material("#65a7ad", 0.98, 0),
    hem = cloth.material("#30777e", 0.94, 0);
  // A folded microfiber rag: uneven edges, shallow folds and a stitched hem.
  const surface = (u: number, v: number): [number, number, number] => [
    (u - 0.5) * 0.24 + Math.sin(v * Math.PI * 2) * 0.012,
    -0.13 + (v - 0.5) * 0.23,
    0.055 +
      Math.sin(u * Math.PI * 3 + v * 2) * 0.012 +
      Math.abs(v - 0.5) * 0.018,
  ];
  cloth.surface(surface, fabric, 14, 14);
  for (const edge of [0, 1]) {
    cloth.line(
      Array.from({ length: 15 }, (_, i) => surface(edge, i / 14)),
      0.005,
      hem,
    );
    cloth.line(
      Array.from({ length: 15 }, (_, i) => surface(i / 14, edge)),
      0.005,
      hem,
    );
  }
  const steel = ratchet.material("#bdc9ca", 0.27, 0.75),
    grip = ratchet.material("#bc2630", 0.65, 0.1),
    dark = ratchet.material("#243139", 0.45, 0.5);
  ratchet.box([0, -0.12, 0.09], [0.046, 0.036, 0.28], steel, 0.014);
  ratchet.box([0, -0.12, -0.025], [0.065, 0.052, 0.14], grip, 0.018);
  ratchet.cylinder([0, -0.12, 0.25], 0.06, 0.045, steel, "y", undefined, 18);
  ratchet.cylinder([0, -0.17, 0.25], 0.032, 0.06, dark, "y", undefined, 12);
  ratchet.cylinder([0, -0.205, 0.25], 0.043, 0.035, steel, "y", undefined, 6);
  ratchet.cylinder([0, -0.092, 0.25], 0.025, 0.01, dark, "y", undefined, 12);
  const shell=scanner.material("#273d48"), screen=scanner.material("#75c4af"), frame=scanner.material("#d3c9af");
  scanner.box([0,-.13,.12],[.18,.08,.28],shell,.025);scanner.box([0,-.083,.13],[.14,.015,.18],screen,.01);
  for(const x of [-.045,0,.045])scanner.box([x,-.081,.02],[.02,.014,.02],frame,.004);
  scanner.finish();
  cloth.finish();
  ratchet.finish();
  const root = new T.Group();
  root.add(cloth.root, ratchet.root,scanner.root);
  return {
    root,
    cloth: cloth.root,
    ratchet: ratchet.root,
    scanner: scanner.root,
    dispose() {
      scanner.dispose();
      cloth.dispose();
      ratchet.dispose();
    },
  };
}
