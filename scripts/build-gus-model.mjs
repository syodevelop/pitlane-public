// Original Gus geometry and animation, authored for Pitlane. No raster-to-mesh,
// downloaded human base, AI direction sheets or external model service.
import * as T from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { refineGus } from "./gus-style-v2.mjs";
import { sculptGus } from "./gus-volume-v5.mjs";
import { sculptCrew } from "./crew-volume-v1.mjs";

const character = process.argv[2] || "gus";
if (!["gus", "dash", "juno"].includes(character)) throw new Error("Unknown character");
const revision = character === "gus" ? "v5" : "v1";
const modelId = `${character}-${revision}`;

globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = b;
      this.onloadend?.();
    });
  }
};
const root = new T.Group();
root.name = character[0].toUpperCase() + character.slice(1);
const materials = {};
for (const [name, color] of Object.entries({
  skin: "#e8a075",
  skinShadow: "#bd7352",
  shirt: "#44668d",
  shirtLight: "#52779f",
  shirtDark: "#29435e",
  pants: "#303333",
  boot: "#63432a",
  sole: "#29221e",
  hair: "#322216",
  hairLight: "#473020",
  orange: "#f06926",
  orangeDark: "#ad3513",
  ink: "#191b21",
  eye: "#fff2d9",
  metal: "#a3a5a3",
})) {
  materials[name] = new T.MeshStandardMaterial({
    color,
    roughness: 1,
    metalness: 0,
  });
  materials[name].name = name;
}
function mesh(parent, name, g, mat, pos = [0, 0, 0]) {
  const m = new T.Mesh(g, materials[mat]);
  m.name = name;
  m.position.set(...pos);
  parent.add(m);
  return m;
}
function ellipsoid(parent, name, pos, scale, mat, segments = 16) {
  const g = new T.SphereGeometry(1, segments, 12);
  g.scale(...scale);
  return mesh(parent, name, g, mat, pos);
}
function box(parent, name, pos, size, mat) {
  return mesh(parent, name, new T.BoxGeometry(...size), mat, pos);
}
// Cross-section loft: broad, slightly squared anatomy rather than spheres/capsules.
function loft(rows, n = 16, power = 0.78) {
  const v = [],
    indices = [];
  for (const [y, rx, rz, z = 0, x = 0] of rows)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      v.push(
        x + Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** power * rx,
        y,
        z + Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** power * rz,
      );
    }
  for (let r = 0; r < rows.length - 1; r++)
    for (let i = 0; i < n; i++) {
      const a = r * n + i,
        b = r * n + ((i + 1) % n),
        c = a + n,
        d = b + n;
      indices.push(a, c, b, b, c, d);
    }
  for (let i = 1; i < n - 1; i++) {
    indices.push(0, i, i + 1);
    const a = (rows.length - 1) * n;
    indices.push(a, a + i + 1, a + i);
  }
  if (rows[1][0] < rows[0][0])
    for (let i = 0; i < indices.length; i += 3)
      [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(v, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
function patch(parent, name, points, z, depth, mat) {
  const s = new T.Shape();
  points.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return mesh(
    parent,
    name,
    new T.ExtrudeGeometry(s, { depth, bevelEnabled: false, steps: 1 }),
    mat,
    [0, 0, z],
  );
}
function seam(parent, name, points, r, mat) {
  return mesh(
    parent,
    name,
    new T.TubeGeometry(
      new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p))),
      16,
      r,
      5,
      false,
    ),
    mat,
  );
}
function bone(parent, name, pos) {
  const b = new T.Bone();
  b.name = name;
  b.position.set(...pos);
  parent.add(b);
  return b;
}
const hips = bone(root, "Hips", [0, 1.46, 0]);
const spine = bone(hips, "Spine", [0, 0.08, 0]);
const chest = bone(spine, "Chest", [0, 0.26, 0]);
const head = bone(chest, "Head", [0, 0.73, 0]);

mesh(
  hips,
  "TrouserSeat",
  loft([
    [-0.14, 0.25, 0.14],
    [0, 0.27, 0.17],
    [0.13, 0.25, 0.15],
  ]),
  "pants",
);
mesh(
  spine,
  "BlueWorkShirt",
  loft([
    [-0.04, 0.255, 0.17],
    [0.1, 0.27, 0.17],
    [0.3, 0.34, 0.195],
    [0.49, 0.39, 0.18],
    [0.59, 0.31, 0.14],
    [0.62, 0.13, 0.105],
  ]),
  "shirt",
);
mesh(
  hips,
  "LeatherBelt",
  loft([
    [0.075, 0.26, 0.158],
    [0.13, 0.26, 0.158],
  ]),
  "sole",
);
box(hips, "BeltBuckle", [0, 0.103, 0.168], [0.095, 0.063, 0.025], "metal");
box(spine, "ShirtPlacket", [0, 0.29, 0.193], [0.027, 0.53, 0.015], "shirtDark");
for (let i = 0; i < 4; i++)
  ellipsoid(
    spine,
    "ShirtButton" + i,
    [0.002, 0.08 + i * 0.11, 0.207],
    [0.012, 0.012, 0.007],
    "metal",
    8,
  );
for (const s of [-1, 1]) {
  patch(
    spine,
    "Pocket" + s,
    [
      [s * 0.08, 0.4],
      [s * 0.27, 0.4],
      [s * 0.27, 0.23],
      [s * 0.18, 0.205],
      [s * 0.08, 0.23],
    ],
    0.192,
    0.013,
    "shirtDark",
  );
  patch(
    spine,
    "PocketFace" + s,
    [
      [s * 0.09, 0.39],
      [s * 0.26, 0.39],
      [s * 0.26, 0.24],
      [s * 0.18, 0.22],
      [s * 0.09, 0.24],
    ],
    0.208,
    0.008,
    "shirtLight",
  );
  seam(
    spine,
    "PocketFlap" + s,
    [
      [s * 0.09, 0.355, 0.222],
      [s * 0.18, 0.343, 0.225],
      [s * 0.26, 0.355, 0.219],
    ],
    0.007,
    "shirtDark",
  );
  patch(
    spine,
    "Collar" + s,
    [
      [s * 0.04, 0.61],
      [s * 0.17, 0.61],
      [s * 0.27, 0.47],
      [s * 0.11, 0.5],
    ],
    0.15,
    0.037,
    "shirtDark",
  );
  patch(
    spine,
    "CollarFace" + s,
    [
      [s * 0.06, 0.6],
      [s * 0.16, 0.6],
      [s * 0.24, 0.49],
      [s * 0.12, 0.52],
    ],
    0.188,
    0.012,
    "shirtLight",
  );
}
mesh(
  chest,
  "Neck",
  loft([
    [0.31, 0.1, 0.1],
    [0.57, 0.115, 0.1],
  ]),
  "skin",
);
mesh(
  chest,
  "ScarfBand",
  loft([
    [0.34, 0.123, 0.12],
    [0.4, 0.125, 0.12],
    [0.43, 0.11, 0.11],
  ]),
  "orange",
);
ellipsoid(
  chest,
  "ScarfKnot",
  [0.015, 0.315, 0.174],
  [0.062, 0.065, 0.045],
  "orange",
);
patch(
  chest,
  "ScarfTailA",
  [
    [-0.018, 0.3],
    [-0.09, 0.18],
    [-0.04, 0.055],
    [0.027, 0.27],
  ],
  0.2,
  0.021,
  "orange",
);
patch(
  chest,
  "ScarfTailB",
  [
    [0.025, 0.3],
    [0.1, 0.22],
    [0.07, 0.09],
    [0.005, 0.26],
  ],
  0.18,
  0.02,
  "orangeDark",
);

mesh(
  head,
  "Face",
  loft(
    [
      [-0.25, 0.14, 0.13, 0.015],
      [-0.2, 0.205, 0.18, 0.015],
      [-0.08, 0.24, 0.21],
      [0.1, 0.26, 0.215],
      [0.22, 0.24, 0.2],
      [0.28, 0.16, 0.14],
    ],
    20,
    0.58,
  ),
  "skin",
);
for (const s of [-1, 1]) {
  ellipsoid(
    head,
    "Ear" + s,
    [s * 0.266, -0.035, 0],
    [0.058, 0.092, 0.06],
    "skin",
  );
  ellipsoid(
    head,
    "EarInset" + s,
    [s * 0.288, -0.035, 0.047],
    [0.023, 0.045, 0.014],
    "skinShadow",
    12,
  );
  // Angled, half-lidded eyes and heavy brows from the approved Gus identity.
  patch(
    head,
    "EyeOutline" + s,
    [
      [s * 0.045, 0.075],
      [s * 0.203, 0.064],
      [s * 0.195, -0.006],
      [s * 0.06, -0.014],
    ],
    0.215,
    0.015,
    "ink",
  );
  patch(
    head,
    "EyeWhite" + s,
    [
      [s * 0.057, 0.058],
      [s * 0.192, 0.051],
      [s * 0.181, 0.004],
      [s * 0.066, 0.002],
    ],
    0.232,
    0.005,
    "eye",
  );
  ellipsoid(
    head,
    "Pupil" + s,
    [s * 0.115, 0.027, 0.241],
    [0.03, 0.035, 0.009],
    "ink",
    12,
  );
  patch(
    head,
    "UpperLid" + s,
    [
      [s * 0.043, 0.088],
      [s * 0.207, 0.078],
      [s * 0.201, 0.047],
      [s * 0.046, 0.058],
    ],
    0.243,
    0.008,
    "skin",
  );
  patch(
    head,
    "Brow" + s,
    [
      [s * 0.037, 0.14],
      [s * 0.194, 0.16],
      [s * 0.218, 0.115],
      [s * 0.047, 0.105],
    ],
    0.23,
    0.027,
    "hair",
  );
  patch(
    head,
    "Moustache" + s,
    [
      [0, -0.088],
      [s * 0.07, -0.075],
      [s * 0.15, -0.11],
      [s * 0.214, -0.09],
      [s * 0.19, -0.155],
      [s * 0.08, -0.15],
      [0, -0.135],
    ],
    0.25,
    0.047,
    "hair",
  );
  // Sideburns continue the hair silhouette on a full turn.
  box(
    head,
    "Sideburn" + s,
    [s * 0.247, 0.055, 0.042],
    [0.035, 0.22, 0.1],
    "hair",
  );
}
ellipsoid(head, "NoseBridge", [0, 0.013, 0.245], [0.043, 0.09, 0.046], "skin");
ellipsoid(head, "NoseTip", [0, -0.055, 0.289], [0.067, 0.044, 0.064], "skin");
seam(
  head,
  "Smile",
  [
    [-0.095, -0.174, 0.207],
    [0, -0.185, 0.225],
    [0.095, -0.17, 0.208],
  ],
  0.008,
  "skinShadow",
);
mesh(
  head,
  "HairCap",
  loft(
    [
      [0.11, 0.25, 0.19, -0.025],
      [0.22, 0.27, 0.225, -0.005],
      [0.31, 0.245, 0.205, -0.015],
      [0.37, 0.12, 0.12, -0.015],
    ],
    18,
    0.7,
  ),
  "hair",
);
// Sculpted wedges, each an asymmetrical solid with a front, side and rear face.
function tuft(name, vertices) {
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(vertices.flat(), 3));
  g.setIndex([0, 2, 1, 0, 3, 2, 0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4]);
  g.computeVertexNormals();
  mesh(head, name, g, "hairLight");
}
tuft("SweptFringe", [
  [-0.25, 0.23, 0.18],
  [-0.04, 0.24, 0.25],
  [0.13, 0.3, 0.2],
  [-0.16, 0.35, 0.06],
  [0.04, 0.43, 0.16],
]);
tuft("CrownQuiff", [
  [-0.12, 0.3, 0.04],
  [0.15, 0.28, 0.12],
  [0.26, 0.29, -0.1],
  [0.02, 0.35, -0.15],
  [0.22, 0.46, 0.02],
]);
tuft("RightHairPoint", [
  [0.08, 0.23, 0.22],
  [0.24, 0.13, 0.18],
  [0.29, 0.2, -0.03],
  [0.15, 0.32, -0.03],
  [0.36, 0.29, 0.14],
]);
tuft("BackHairPoint", [
  [-0.16, 0.24, -0.16],
  [0.08, 0.26, -0.21],
  [0.17, 0.29, -0.07],
  [-0.03, 0.37, -0.04],
  [-0.12, 0.43, -0.22],
]);
patch(
  head,
  "Forelock",
  [
    [0.02, 0.3],
    [0.18, 0.27],
    [0.16, 0.08],
    [0.095, 0.15],
  ],
  0.215,
  0.045,
  "hair",
);

const limbs = {};
function skinned(parent, name, rows, mat, bones, joint) {
  const g = loft(rows, 12, 0.85),
    idx = [],
    weights = [];
  for (let i = 0; i < g.attributes.position.count; i++) {
    const y = g.attributes.position.getY(i);
    const w = T.MathUtils.smoothstep(-y, joint - 0.06, joint + 0.06);
    idx.push(0, 1, 0, 0);
    weights.push(1 - w, w, 0, 0);
  }
  g.setAttribute("skinIndex", new T.Uint16BufferAttribute(idx, 4));
  g.setAttribute("skinWeight", new T.Float32BufferAttribute(weights, 4));
  const m = new T.SkinnedMesh(g, materials[mat]);
  m.name = name;
  parent.add(m);
  parent.updateMatrixWorld(true);
  m.bind(new T.Skeleton(bones));
  return m;
}
for (const [s, side] of [
  [-1, "L"],
  [1, "R"],
]) {
  const shoulder = bone(chest, "Arm" + side, [s * 0.365, 0.32, 0]);
  const elbow = bone(shoulder, "Forearm" + side, [0, -0.43, 0]);
  const hand = bone(elbow, "Hand" + side, [0, -0.41, 0]);
  skinned(
    shoulder,
    "Sleeve" + side,
    [
      [0, 0.1, 0.12],
      [-0.07, 0.128, 0.128],
      [-0.2, 0.125, 0.12],
      [-0.235, 0.12, 0.115],
    ],
    "shirt",
    [shoulder, elbow],
    0.36,
  );
  skinned(
    shoulder,
    "ArmSkin" + side,
    [
      [-0.2, 0.112, 0.105],
      [-0.29, 0.108, 0.1],
      [-0.34, 0.09, 0.09],
      [-0.38, 0.093, 0.09],
      [-0.48, 0.105, 0.095],
      [-0.6, 0.078, 0.072],
      [-0.7, 0.064, 0.06],
    ].map(([y, x, z]) => [y * 1.2, x, z]),
    "skin",
    [shoulder, elbow],
    0.43,
  );
  // Rolled sleeve edge travels with the upper arm.
  mesh(
    shoulder,
    "SleeveCuff" + side,
    loft([
      [-0.2, 0.128, 0.123],
      [-0.24, 0.128, 0.123],
    ]),
    "shirtDark",
  );
  mesh(
    hand,
    "Palm" + side,
    loft([
      [0.015, 0.065, 0.053],
      [-0.08, 0.078, 0.055],
      [-0.14, 0.06, 0.043],
    ]),
    "skin",
  );
  for (let f = 0; f < 4; f++)
    ellipsoid(
      hand,
      "Finger" + side + f,
      [(f - 1.5) * 0.032, -0.155 + Math.abs(f - 1.5) * 0.008, 0.008],
      [0.021, 0.061, 0.036],
      "skin",
      10,
    );
  const thumb = ellipsoid(
    hand,
    "Thumb" + side,
    [-s * 0.074, -0.065, 0.045],
    [0.029, 0.061, 0.034],
    "skin",
    10,
  );
  thumb.rotation.z = s * 0.35;
  const thigh = bone(hips, "Thigh" + side, [s * 0.155, -0.02, 0]);
  const shin = bone(thigh, "Shin" + side, [0, -0.65, 0]);
  const foot = bone(shin, "Foot" + side, [0, -0.65, 0]);
  skinned(
    thigh,
    "TrouserLeg" + side,
    [
      [0.03, 0.135, 0.15],
      [-0.14, 0.137, 0.14],
      [-0.32, 0.118, 0.12],
      [-0.47, 0.099, 0.108],
      [-0.53, 0.1, 0.1],
      [-0.68, 0.096, 0.095],
      [-0.85, 0.098, 0.09],
      [-0.93, 0.105, 0.092],
    ].map(([y, x, z]) => [y < 0 ? y * 1.3 : y, x, z]),
    "pants",
    [thigh, shin],
    0.65,
  );
  // Work boots have broad toes, low soles, heel, ankle and visible lacing.
  ellipsoid(
    foot,
    "BootUpper" + side,
    [0, -0.035, 0.064],
    [0.118, 0.115, 0.205],
    "boot",
  );
  mesh(
    foot,
    "BootAnkle" + side,
    loft([
      [-0.015, 0.1, 0.102],
      [0.17, 0.094, 0.095],
    ]),
    "boot",
  );
  mesh(
    foot,
    "BootSole" + side,
    loft(
      [
        [-0.136, 0.117, 0.18, 0.066],
        [-0.093, 0.117, 0.18, 0.066],
      ],
      16,
      0.48,
    ),
    "sole",
  );
  for (let i = 0; i < 3; i++)
    seam(
      foot,
      "Lace" + side + i,
      [
        [-0.055, 0.042 - i * 0.025, 0.156 + i * 0.016],
        [0, 0.056 - i * 0.025, 0.161 + i * 0.016],
        [0.055, 0.042 - i * 0.025, 0.156 + i * 0.016],
      ],
      0.007,
      "sole",
    );
  shoulder.rotation.z = s * 0.09;
  limbs[side] = { shoulder, elbow, thigh, shin, foot };
}
root.updateMatrixWorld(true);

function rotationTrack(node, duration, fn, n = 32) {
  const times = [],
    values = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    times.push(t * duration);
    values.push(
      ...new T.Quaternion().setFromEuler(new T.Euler(...fn(t * Math.PI * 2))),
    );
  }
  return new T.QuaternionKeyframeTrack(node + ".quaternion", times, values);
}
const walk = [];
function legPose(p) {
  const t = ((p % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const stance = t < Math.PI;
  const u = stance ? t / Math.PI : (t - Math.PI) / Math.PI;
  const z = stance ? 0.33 * (1 - 2 * u) : -0.33 + 0.66 * (u * u * (3 - 2 * u));
  const y = 1.24 - (stance ? 0 : Math.sin(Math.PI * u) * 0.17);
  const knee = Math.acos(
    T.MathUtils.clamp((y * y + z * z - 0.845) / 0.845, -1, 1),
  );
  const hip = Math.atan2(-z, y) - knee / 2;
  return { hip, knee, ankle: -hip - knee };
}
for (const [s, side] of [
  [-1, "L"],
  [1, "R"],
]) {
  const sign = s;
  const offset = s < 0 ? 0 : Math.PI;
  walk.push(
    rotationTrack("Thigh" + side, 1, (p) => [legPose(p + offset).hip, 0, 0]),
  );
  walk.push(
    rotationTrack("Shin" + side, 1, (p) => [legPose(p + offset).knee, 0, 0]),
  );
  walk.push(
    rotationTrack("Foot" + side, 1, (p) => [legPose(p + offset).ankle, 0, 0]),
  );
  walk.push(
    rotationTrack("Arm" + side, 1, (p) => [
      -Math.cos(p) * 0.3 * sign,
      0,
      s * 0.09,
    ]),
  );
  walk.push(
    rotationTrack("Forearm" + side, 1, (p) => [
      -0.1 - Math.max(0, Math.cos(p) * sign) * 0.2,
      0,
      0,
    ]),
  );
}
walk.push(
  rotationTrack("Spine", 1, (p) => [
    0.025,
    Math.sin(p) * 0.035,
    Math.sin(p) * 0.015,
  ]),
);
walk.push(rotationTrack("Head", 1, (p) => [-0.025, -Math.sin(p) * 0.025, 0]));
const idle = [
  rotationTrack("Spine", 4, (p) => [
    Math.sin(p) * 0.012,
    0,
    Math.sin(p) * 0.008,
  ]),
  rotationTrack("Head", 4, (p) => [Math.sin(p) * 0.01, Math.sin(p) * 0.035, 0]),
];
walk.push(
  new T.VectorKeyframeTrack("Hips.position", [0, 1], [0, 1.4, 0, 0, 1.4, 0]),
);
idle.push(
  new T.VectorKeyframeTrack("Hips.position", [0, 4], [0, 1.46, 0, 0, 1.46, 0]),
);
for (const [s, side] of [
  [-1, "L"],
  [1, "R"],
]) {
  idle.push(
    rotationTrack("Arm" + side, 4, (p) => [
      Math.sin(p) * 0.012,
      0,
      s * (0.09 + Math.sin(p) * 0.008),
    ]),
  );
  idle.push(rotationTrack("Forearm" + side, 4, () => [-0.08, 0, 0]));
  for (const node of ["Thigh", "Shin", "Foot"])
    idle.push(rotationTrack(node + side, 4, () => [0, 0, 0]));
}
refineGus({
  root,
  head,
  spine,
  chest,
  hips,
  mesh,
  loft,
  patch,
  seam,
  ellipsoid,
  materials,
});
const context = { root, head, spine, chest, materials, mesh, loft, seam, skinned };
const surfaces = sculptGus(context);
if (character !== "gus") sculptCrew(character, context, surfaces);
const animations = [
  new T.AnimationClip("Idle", 4, idle),
  new T.AnimationClip("Walk", 1, walk),
];
root.userData = {
  author: "Pitlane",
  version: `${character}-rig-${revision}`,
  source: "scripts/build-gus-model.mjs",
  frontAxis: "+Z",
  upAxis: "+Y",
  note: "Volumetric character with curved geometric face/garment details and swept solid hair. Continuous yaw, Idle/Walk. Stylized interpretation, not an exact reference likeness; no facial rig or work/carry clips.",
};
const bytes = await new GLTFExporter().parseAsync(root, {
  binary: true,
  animations,
  onlyVisible: true,
});
await fs.mkdir("public/models", { recursive: true });
await fs.mkdir(`art/models/${modelId}`, { recursive: true });
await fs.writeFile(`public/models/${modelId}.glb`, Buffer.from(bytes));
await fs.writeFile(`art/models/${modelId}/${modelId}.glb`, Buffer.from(bytes));
let vertices = 0,
  triangles = 0,
  skins = 0,
  bones = 0;
root.traverse((o) => {
  if (o.isMesh) {
    vertices += o.geometry.attributes.position.count;
    triangles +=
      (o.geometry.index?.count || o.geometry.attributes.position.count) / 3;
  }
  if (o.isSkinnedMesh) skins++;
  if (o.isBone) bones++;
});
const report = {
  version: root.userData.version,
  bytes: bytes.byteLength,
  sha256: crypto.createHash("sha256").update(Buffer.from(bytes)).digest("hex"),
  vertices,
  triangles,
  skins,
  bones,
  animations: animations.map((a) => ({
    name: a.name,
    duration: a.duration,
    tracks: a.tracks.length,
  })),
  provenance:
    `Repository-authored volumetric geometry and shared rig. Geometric face and garment details; no image planes, raster textures or third-party model. Interprets owner ${root.name} reference; exact likeness is not claimed.`,
  reference: "art/references/launch-2026-10-19/characters.png",
};
await fs.writeFile(
  `art/models/${modelId}/model-report.json`,
  JSON.stringify(report, null, 2) + "\n",
);
console.log(report);
