import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Original compact club coupe. Local forward is -Z; metres, grounded tyres. */
export class ServiceCar {
  readonly root = new T.Group();
  readonly frontPivots: T.Group[] = [];
  readonly wheels: T.Group[] = [];
  private materials: T.Material[] = [];
  private geometries: T.BufferGeometry[] = [];
  private textures: T.Texture[] = [];
  private brake: T.MeshStandardMaterial;
  private indicator: T.MeshStandardMaterial;
  constructor(color = "#efe8d8", racing = true) {
    this.root.name = racing ? "Pitlane_Club23_Coupe" : "Coastal_Traffic_Coupe";
    const batches = new Map<T.Group, Map<T.Material, T.BufferGeometry[]>>();
    const mat = (c: string, roughness = .5, metalness = .25) => {
      const m = new T.MeshStandardMaterial({ color: c, roughness, metalness });
      this.materials.push(m); return m;
    };
    const paint = mat(color, .32, .32), trim = mat("#20262a", .6, .15);
    const red = mat("#b91f25", .4, .3), rubber = mat("#23272a", .94, 0), amber = mat("#cf7d25", .3, .15);
    const rim = mat("#c2bfb2", .29, .75), disc = mat("#5c6568", .42, .7);
    const glass = mat("#254755", .16, .5), reflection = mat("#7b9b9e", .24, .4);
    const lamp = mat("#f5e9bb", .22, .15); lamp.emissive.set("#ffe3a0"); lamp.emissiveIntensity = .25;
    this.brake = mat("#ad191c", .25, .1); this.brake.emissive.set("#f61911");
    this.indicator = mat("#cf7d25", .3, .15); this.indicator.emissive.set("#ff9e14");
    const add = (g: T.BufferGeometry, m: T.Material, x = 0, y = 0, z = 0, rot = new T.Euler(), target = this.root) => {
      g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(rot), new T.Vector3(1, 1, 1)));
      const batch = batches.get(target) || new Map<T.Material, T.BufferGeometry[]>();
      const parts = batch.get(m) || []; parts.push(g); batch.set(m, parts); batches.set(target, batch);
    };
    const box = (x: number, y: number, z: number, w: number, h: number, d: number, m: T.Material, r = .025, rot = new T.Euler(), target = this.root) =>
      add(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 3, h / 3, d / 3)), m, x, y, z, rot, target);
    const line = (p: number[][], radius: number, m: T.Material, target = this.root) =>
      add(new T.TubeGeometry(new T.CatmullRomCurve3(p.map(v => new T.Vector3(...v))), p.length * 4, radius, 5, false), m, 0, 0, 0, undefined, target);
    const panel = (points: number[][], m: T.Material) => {
      const positions = points.flat(), indices: number[] = [];
      const a = new T.Vector3(...points[0]), b = new T.Vector3(...points[1]), c = new T.Vector3(...points[2]);
      const normal = b.clone().sub(a).cross(c.clone().sub(a));
      const center = points.reduce((v, p) => v.add(new T.Vector3(...p)), new T.Vector3()).multiplyScalar(1 / points.length);
      const flip = normal.dot(new T.Vector3(center.x, center.y - .7, center.z * .08)) < 0;
      for (let i = 1; i < points.length - 1; i++) indices.push(0, flip ? i + 1 : i, flip ? i : i + 1);
      const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals();
      m.side = T.DoubleSide; add(g, m);
    };
    // Sculpted sections: tapered nose, raised shoulders and curved rear deck.
    // This surface is the body itself, rather than a row of primitive boxes.
    const sections = [
      [-2.23, .78, .58], [-2.12, .88, .73], [-1.84, .95, .83], [-1.42, .98, .88],
      [-.94, .94, .88], [-.55, .91, .87], [.2, .92, .88], [.85, .96, .91],
      [1.35, .99, .91], [1.83, .96, .86], [2.13, .87, .77], [2.23, .78, .64],
    ];
    const cross = [-1, -.97, -.86, -.64, 0, .64, .86, .97, 1];
    const vertices: number[] = [], indices: number[] = [];
    for (const [z, width, h] of sections) for (const fraction of cross) {
      const a = Math.abs(fraction), raisedShoulder = Math.exp(-Math.pow((a - .84) * 7, 2)) * .055;
      vertices.push(fraction * width, h + raisedShoulder - Math.max(0, a - .86) * 1.1, z);
    }
    for (let s = 0; s < sections.length - 1; s++) for (let c = 0; c < cross.length - 1; c++) {
      const a = s * cross.length + c, b = a + cross.length;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const body = new T.BufferGeometry(); body.setAttribute("position", new T.Float32BufferAttribute(vertices, 3)); body.setIndex(indices); body.computeVertexNormals(); add(body, paint);
    // Wheel arches are actual openings in the lower body, with rolled lips.
    for (const side of [-1, 1]) {
      const shape = new T.Shape(); shape.moveTo(-2.18, .3); shape.lineTo(-1.90, .3);
      for (const wheelZ of [-1.35, 1.35]) {
        shape.lineTo(wheelZ - .49, .3);
        shape.absarc(wheelZ, .37, .50, Math.PI + .14, -.14, true);
      }
      shape.lineTo(2.18, .3); shape.lineTo(2.18, .63); shape.lineTo(1.90, .81);
      shape.lineTo(1.3, .84); shape.lineTo(-1.3, .82); shape.lineTo(-1.92, .74); shape.lineTo(-2.18, .55); shape.closePath();
      const g = new T.ExtrudeGeometry(shape, { depth: .08, bevelEnabled: true, bevelSize: .022, bevelThickness: .018, bevelSegments: 2, steps: 1, curveSegments: 24 });
      // Shape X is longitudinal Z, extrusion points outwards in world X.
      g.rotateY(-side * Math.PI / 2); add(g, paint, side * .91, 0, 0);
      for (const wz of [-1.35, 1.35]) {
        const points = Array.from({ length: 27 }, (_, i) => {
          const angle = .03 + i / 26 * (Math.PI - .06);
          return [side * .978, .37 + Math.sin(angle) * .50, wz + Math.cos(angle) * .50];
        });
        line(points, .028, paint);
        line(points.map(p => [p[0] + side * .009, p[1] - .028, p[2]]), .016, trim);
      }
      box(side * .94, .29, 0, .10, .12, 1.7, racing ? red : trim, .035);
      // Door shut-line, sill, flush handle and quarter-panel vents.
      line([[side * .936, .80, -.70], [side * .958, .64, -.72], [side * .956, .39, -.63], [side * .952, .37, .74], [side * .96, .68, .84], [side * .954, .83, .82]], .009, trim);
      box(side * .967, .80, .55, .028, .045, .21, trim, .014);
      box(side * .987, .805, .55, .018, .018, .16, rim, .008);
      for (let n = 0; n < 3; n++) box(side * .98, .71 + n * .045, 1.94, .012, .018, .22, trim, .006);
    }
    // Low cabin: curved roof, raked glass, separate A/B/C pillars.
    const cabin = [
      [-.92, .84, .89], [-.36, .72, 1.43], [-.14, .69, 1.49], [.55, .70, 1.48], [1.20, .84, .91],
    ];
    for (let i = 0; i < cabin.length - 1; i++) {
      const [z1, w1, y1] = cabin[i], [z2, w2, y2] = cabin[i + 1];
      panel([[-w1, y1, z1], [w1, y1, z1], [w2, y2, z2], [-w2, y2, z2]], i === 0 || i === 3 ? glass : paint);
    }
    for (const side of [-1, 1]) {
      panel([[side * .812, .93, -.77], [side * .702, 1.404, -.32], [side * .701, 1.421, .17], [side * .844, .94, .23]], glass);
      panel([[side * .848, .94, .30], [side * .703, 1.42, .25], [side * .711, 1.409, .53], [side * .814, .94, 1.06]], glass);
      const outline = [[side * .84, .9, -.93], [side * .72, 1.43, -.36], [side * .69, 1.49, -.14], [side * .70, 1.48, .55], [side * .84, .91, 1.2], [side * .84, .9, -.93]];
      line(outline, .035, paint);
      line([[side * .705, 1.44, .21], [side * .855, .90, .26]], .026, trim);
      // Clean geometric reflection, not transparent glass sorting layers.
      panel([[side * .707, 1.37, -.30], [side * .717, 1.32, -.35], [side * .806, .98, .05], [side * .792, 1.04, .07]], reflection);
      box(side * 1.0, .98, -.65, .25, .12, .26, paint, .055);
      box(side * .96, .94, -.62, .14, .045, .09, trim, .015);
      box(side * 1.01, .98, -.51, .17, .075, .012, glass, .015);
    }
    line([[-.82, .91, -.94], [0, .93, -.94], [.82, .91, -.94]], .025, trim);
    line([[-.50, .95, -.88], [-.12, .96, -.86]], .012, trim);
    line([[.12, .96, -.86], [.54, .95, -.88]], .012, trim);
    // Hood/deck seams and a restrained two-stripe livery.
    line([[-.65, .83, -1.95], [-.68, .88, -1.45], [-.68, .90, -1.03]], .008, trim);
    line([[.65, .83, -1.95], [.68, .88, -1.45], [.68, .90, -1.03]], .008, trim);
    const bodyHeight = (x: number, z: number) => {
      let i = 0; while (i < sections.length - 2 && sections[i + 1][0] < z) i++;
      const a = sections[i], b = sections[i + 1], t = (z - a[0]) / (b[0] - a[0]);
      const width = a[1] + (b[1] - a[1]) * t, h = a[2] + (b[2] - a[2]) * t;
      const fraction = Math.abs(x / width);
      return h + Math.exp(-Math.pow((fraction - .84) * 7, 2)) * .055 - Math.max(0, fraction - .86) * 1.1 + .014;
    };
    const bodyStripe = (x: number, from: number, to: number) => {
      const zs = [from, ...sections.map(s => s[0]).filter(z => z > from && z < to), to];
      for (let i = 0; i < zs.length - 1; i++) {
        const z = zs[i], end = zs[i + 1], left = x - .085, right = x + .085;
        panel([[left, bodyHeight(left,z), z], [right, bodyHeight(right,z), z], [right, bodyHeight(right,end), end], [left, bodyHeight(left,end), end]], red);
      }
    };
    if (racing) for (const x of [-.20, .20]) {
      bodyStripe(x, -1.99, -1.0);
      panel([[x - .085, 1.50, -.14], [x + .085, 1.50, -.14], [x + .085, 1.49, .53], [x - .085, 1.49, .53]], red);
      bodyStripe(x, 1.26, 1.88);
    }
    box(0, .39, -2.16, 1.69, .20, .19, paint, .07);
    box(0, .24, -2.22, 1.80, .085, .17, trim, .035);
    box(0, .44, -2.266, .72, .12, .018, trim, .02);
    for (let x = -.31; x < .34; x += .07) box(x, .44, -2.28, .018, .09, .012, disc, .004);
    for (const side of [-1, 1]) {
      box(side * .60, .63, -2.15, .49, .18, .11, trim, .04);
      box(side * .59, .64, -2.213, .41, .12, .022, lamp, .028);
      for (let n = 0; n < 5; n++) box(side * .59 + (n - 2) * .06, .64, -2.23, .008, .10, .012, rim, .003);
      box(side * .80, .43, -2.20, .14, .085, .035, side > 0 ? this.indicator : amber, .015);
      box(side * .60, .66, 2.16, .46, .15, .07, trim, .035);
      box(side * .62, .67, 2.207, .36, .09, .025, this.brake, .02);
      for (let n = 0; n < 3; n++) box(side * .62 + (n - 1) * .09, .67, 2.224, .012, .07, .008, trim, .003);
      box(side * .81, .67, 2.213, .09, .09, .03, side > 0 ? this.indicator : amber, .015);
    }
    box(0, .37, 2.14, 1.67, .19, .19, paint, .055);
    box(0, .24, 2.18, 1.73, .075, .17, trim, .025);
    box(0, .62, 2.226, .36, .12, .014, rim, .01);
    box(0, .62, 2.238, .29, .06, .008, trim, .005);
    for (const x of [-.58, -.41]) {
      add(new T.CylinderGeometry(.065, .065, .23, 14), rim, x, .25, 2.20, new T.Euler(Math.PI / 2, 0, 0));
      add(new T.CircleGeometry(.049, 14), trim, x, .25, 2.32);
    }
    // Ducktail and attached brackets are deliberately small at player scale.
    box(0, .93, 1.98, 1.67, .075, .18, racing ? red : paint, .03);
    for (const x of [-.60, .60]) box(x, .86, 1.96, .05, .14, .07, trim);
    // Four independent wheels, steer pivots on the front axle. Rotation is distance-based.
    for (const side of [-1, 1]) for (const z of [-1.35, 1.35]) {
      const pivot = new T.Group(); pivot.position.set(side * .94, .38, z); this.root.add(pivot);
      if (z < 0) this.frontPivots.push(pivot);
      const wheel = new T.Group(); pivot.add(wheel); this.wheels.push(wheel);
      add(new T.CylinderGeometry(.375, .375, .25, 40, 1), rubber, 0, 0, 0, new T.Euler(0, 0, Math.PI / 2), wheel);
      for (const face of [-1, 1]) {
        add(new T.TorusGeometry(.278, .025, 8, 32), rim, face * .13, 0, 0, new T.Euler(0, Math.PI / 2, 0), wheel);
        add(new T.CylinderGeometry(.254, .254, .015, 32), disc, face * .118, 0, 0, new T.Euler(0, 0, Math.PI / 2), wheel);
        add(new T.CylinderGeometry(.070, .070, .035, 12), rim, face * .145, 0, 0, new T.Euler(0, 0, Math.PI / 2), wheel);
        for (let i = 0; i < 5; i++) {
          const a = i * Math.PI * 2 / 5;
          box(face * .15, Math.sin(a) * .14, Math.cos(a) * .14, .035, .055, .23, rim, .012, new T.Euler(-a, 0, 0), wheel);
        }
      }
      for (let i = 0; i < 36; i++) {
        const a = i / 36 * Math.PI * 2;
        box(0, Math.sin(a) * .376, Math.cos(a) * .376, .21, .014, .018, trim, .004, new T.Euler(-a, 0, 0), wheel);
      }
    }
    if (racing) {
      const c = document.createElement("canvas"); c.width = c.height = 256;
      const ctx = c.getContext("2d")!; ctx.fillStyle = "#f0e8d5"; ctx.beginPath(); ctx.arc(128, 128, 120, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#20262a"; ctx.font = "italic 900 145px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("23", 123, 134);
      const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; this.textures.push(t);
      const decal = new T.MeshStandardMaterial({ map: t, transparent: true, roughness: .55, depthWrite: false }); this.materials.push(decal);
      for (const side of [-1, 1]) add(new T.PlaneGeometry(.58, .44), decal, side * .986, .61, -.04, new T.Euler(0, side * Math.PI / 2, 0));
    }
    for (const [group, batch] of batches) for (const [material, parts] of batch) {
      const expanded = parts.map(g => { const n = g.index ? g.toNonIndexed() : g; if (!n.getAttribute("uv")) n.setAttribute("uv", new T.Float32BufferAttribute(new Float32Array(n.getAttribute("position").count * 2), 2)); return n; });
      const g = mergeGeometries(expanded)!; this.geometries.push(g);
      for (const p of new Set([...parts, ...expanded])) p.dispose();
      const mesh = new T.Mesh(g, material); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    }
    this.root.userData = { originalModel: true, forward: "-Z", length: 4.6, width: 2.25, wheels: 4 };
  }
  animate(distance: number, steer: number, braking: boolean, indicating: boolean, time: number) {
    this.wheels.forEach(w => { w.rotation.x -= distance / .375; });
    this.frontPivots.forEach(w => { w.rotation.y = steer; });
    this.brake.emissiveIntensity = braking ? 1.5 : .12;
    this.indicator.emissiveIntensity = indicating && time % .8 < .4 ? 2 : 0;
  }
  dispose() {
    this.root.removeFromParent(); this.geometries.forEach(g => g.dispose());
    this.materials.forEach(m => m.dispose()); this.textures.forEach(t => t.dispose());
  }
}
