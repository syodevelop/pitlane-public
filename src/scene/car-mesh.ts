import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export type V3 = [number, number, number];
/** Material batching preserves separate wheel/steering transforms. No bitmap body impostors. */
export class CarMesh {
  readonly root = new T.Group();
  private batches = new Map<T.Group, Map<T.Material, T.BufferGeometry[]>>();
  private materials = new Set<T.Material>();
  private geometries: T.BufferGeometry[] = [];
  material(color: string, roughness = .4, metalness = .2, paint = false) {
    const m = new T.MeshPhysicalMaterial({ color, roughness, metalness, clearcoat: paint ? .48 : .10, clearcoatRoughness: .32, side: T.DoubleSide });
    this.materials.add(m); return m;
  }
  add(g: T.BufferGeometry, m: T.Material, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], target = this.root) {
    g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...pos), new T.Quaternion().setFromEuler(new T.Euler(...rot)), new T.Vector3(1, 1, 1)));
    // Consistent non-indexed attributes let all shapes share a draw call.
    const buffer = g.index ? g.toNonIndexed() : g;
    for (const key of Object.keys(buffer.attributes)) if (key !== "position" && key !== "normal") buffer.deleteAttribute(key);
    if (buffer !== g) g.dispose();
    const batch = this.batches.get(target) || new Map<T.Material, T.BufferGeometry[]>();
    const parts = batch.get(m) || []; parts.push(buffer); batch.set(m, parts); this.batches.set(target, batch); this.materials.add(m);
  }
  box(pos: V3, size: V3, m: T.Material, radius = 0, rot: V3 = [0, 0, 0], target = this.root) {
    this.add(radius ? new RoundedBoxGeometry(...size, 1, Math.min(radius, ...size.map(v => v / 3))) : new T.BoxGeometry(...size), m, pos, rot, target);
  }
  surface(fn: (u: number, v: number) => V3, m: T.Material, nu = 20, nv = 10, target = this.root, reverse = false, visible?: (u: number, v: number) => boolean) {
    const p: number[] = [], index: number[] = [];
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) p.push(...fn(i / nu, j / nv));
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      if (visible && !visible((i + .5) / nu, (j + .5) / nv)) continue;
      const a = i * (nv + 1) + j, b = a + nv + 1;
      index.push(...(reverse ? [a, a + 1, b, a + 1, b + 1, b] : [a, b, a + 1, a + 1, b, b + 1]));
    }
    const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(p, 3)); g.setIndex(index); g.computeVertexNormals(); this.add(g, m, undefined, undefined, target);
  }
  panel(points: V3[], m: T.Material, target = this.root) {
    const g = new T.BufferGeometry(), index: number[] = [];
    for (let i = 1; i < points.length - 1; i++) index.push(0, i, i + 1);
    g.setAttribute("position", new T.Float32BufferAttribute(points.flat(), 3)); g.setIndex(index); g.computeVertexNormals(); this.add(g, m, undefined, undefined, target);
  }
  line(points: V3[], radius: number, m: T.Material, target = this.root, smooth = true) {
    const curve = smooth ? new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)), false, "centripetal") : new T.CurvePath<T.Vector3>();
    if (curve instanceof T.CurvePath) for (let i = 1; i < points.length; i++) curve.add(new T.LineCurve3(new T.Vector3(...points[i - 1]), new T.Vector3(...points[i])));
    this.add(new T.TubeGeometry(curve, Math.max(8, points.length * 3), radius, 5, false), m, undefined, undefined, target);
  }
  cylinder(pos: V3, radius: number, depth: number, m: T.Material, axis: "x" | "y" | "z" = "x", target = this.root, segments = 32) {
    this.add(new T.CylinderGeometry(radius, radius, depth, segments), m, pos, axis === "x" ? [0, 0, Math.PI / 2] : axis === "z" ? [Math.PI / 2, 0, 0] : [0, 0, 0], target);
  }
  finish() {
    for (const [target, batch] of this.batches) for (const [material, parts] of batch) {
      const g = mergeGeometries(parts); parts.forEach(p => p.dispose());
      if (!g) throw new Error("Car geometry batch failed");
      this.geometries.push(g); const mesh = new T.Mesh(g, material); mesh.castShadow = !material.transparent; mesh.receiveShadow = true;
      mesh.name = material.name || "Coachwork"; target.add(mesh);
    }
    this.batches.clear();
  }
  dispose() { this.root.removeFromParent(); this.geometries.forEach(g => g.dispose()); this.materials.forEach(m => m.dispose()); }
}
