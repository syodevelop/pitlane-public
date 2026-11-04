import * as T from "three";
import { MarchingCubes } from "three/addons/objects/MarchingCubes.js";

// Closed volumetric forms: one head/hair/body, evaluated at any yaw.
// Fine details are curved geometry, never camera-facing image planes or painted
// photographs stretched over the head. The rig remains the checked v2 skeleton.
export function sculptGus({
  root,
  head,
  spine,
  chest,
  mesh,
  loft,
  materials,
  seam,
}) {
  const remove = (names) =>
    names.forEach((name) => {
      const n = root.getObjectByName(name);
      if (n) {
        n.removeFromParent();
        n.geometry?.dispose();
      }
    });
  const names = [];
  head.traverse((o) => {
    if (o.isMesh) names.push(o.name);
  });
  remove(names);
  function volume(parent, name, rows, relief = false, mat = "skin") {
    const n = 64,
      pos = [],
      idx = [];
    rows.forEach(([y, rx, rz, cz = 0]) => {
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2,
          c = Math.cos(a),
          s = Math.sin(a),
          x = Math.sign(c) * Math.abs(c) ** 0.68 * rx;
        let z = Math.sign(s) * Math.abs(s) ** 0.62 * rz + cz;
        if (relief && s > 0) {
          z +=
            0.084 * Math.exp(-((x / 0.051) ** 2) - ((y + 0.033) / 0.075) ** 2);
        }
        pos.push(x, y, z);
      }
    });
    for (let r = 0; r < rows.length - 1; r++)
      for (let i = 0; i < n; i++) {
        const a = r * (n + 1) + i,
          b = a + 1,
          c = a + n + 1,
          d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    for (let i = 1; i < n - 1; i++) {
      idx.push(0, i, i + 1);
      const a = (rows.length - 1) * (n + 1);
      idx.push(a, a + i + 1, a + i);
    }
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new T.Mesh(g, materials[mat]);
    m.name = name;
    parent.add(m);
    return m;
  }
  // A broad cheek, narrowing jaw and rounded rear skull, with a real nose profile.
  const face = volume(
    head,
    "SculptedHead",
    [
      [-0.265, 0.157, 0.135, 0.026],
      [-0.235, 0.213, 0.183, 0.012],
      [-0.14, 0.237, 0.209, 0],
      [-0.05, 0.246, 0.218, 0],
      [0.045, 0.25, 0.221, 0],
      [0.145, 0.253, 0.218, -0.004],
      [0.245, 0.245, 0.204, -0.008],
      [0.3, 0.206, 0.17, -0.012],
    ],
    true,
  );
  const faceRows = [
    [-0.265, 0.157, 0.135, 0.026],
    [-0.235, 0.213, 0.183, 0.012],
    [-0.14, 0.237, 0.209, 0],
    [-0.05, 0.246, 0.218, 0],
    [0.045, 0.25, 0.221, 0],
    [0.145, 0.253, 0.218, -0.004],
    [0.245, 0.245, 0.204, -0.008],
    [0.3, 0.206, 0.17, -0.012],
  ];
  function surfaceZ(rows, x, y, nose = false) {
    let i = 0;
    while (i < rows.length - 2 && rows[i + 1][0] < y) i++;
    const a = rows[i],
      b = rows[i + 1],
      t = T.MathUtils.clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
    const rx = T.MathUtils.lerp(a[1], b[1], t),
      rz = T.MathUtils.lerp(a[2], b[2], t),
      cz = T.MathUtils.lerp(a[3] || 0, b[3] || 0, t);
    const c = Math.min(1, Math.abs(x / rx) ** (1 / 0.68));
    return (
      Math.sqrt(1 - c * c) ** 0.62 * rz +
      cz +
      (nose
        ? 0.084 * Math.exp(-((x / 0.051) ** 2) - ((y + 0.033) / 0.075) ** 2)
        : 0)
    );
  }
  // Subdivided surface patches follow the cheeks and cloth, so eyes and pockets
  // cannot become floating rectangular plates when viewed in profile.
  function detail(
    parent,
    name,
    points,
    rows,
    mat,
    offset = 0.005,
    nose = false,
  ) {
    const v = [],
      ids = [],
      pts = points.map((p) => new T.Vector2(...p));
    function triangle(a, b, c, level) {
      if (level) {
        const ab = a.clone().add(b).multiplyScalar(0.5),
          bc = b.clone().add(c).multiplyScalar(0.5),
          ca = c.clone().add(a).multiplyScalar(0.5);
        triangle(a, ab, ca, level - 1);
        triangle(ab, b, bc, level - 1);
        triangle(ca, bc, c, level - 1);
        triangle(ab, bc, ca, level - 1);
        return;
      }
      const base = v.length / 3;
      for (const p of [a, b, c])
        v.push(p.x, p.y, surfaceZ(rows, p.x, p.y, nose) + offset);
      ids.push(base, base + 1, base + 2);
    }
    for (const [a, b, c] of T.ShapeUtils.triangulateShape(pts, []))
      triangle(pts[a], pts[b], pts[c], 3);
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(v, 3));
    g.setIndex(ids);
    g.computeVertexNormals();
    // ShapeUtils uses CCW contours for outward-facing +Z surfaces.
    const o = mesh(parent, name, g, mat);
    o.material.side = T.DoubleSide;
    return o;
  }
  const oval = (cx, cy, rx, ry) =>
    Array.from({ length: 24 }, (_, i) => [
      cx + Math.cos((i / 24) * Math.PI * 2) * rx,
      cy + Math.sin((i / 24) * Math.PI * 2) * ry,
    ]);
  for (const s of [-1, 1]) {
    detail(
      head,
      "EyeSocket" + s,
      oval(s * 0.119, 0.025, 0.071, 0.044),
      faceRows,
      "skinShadow",
      0.003,
      true,
    );
    detail(
      head,
      "EyeWhite" + s,
      [
        [s * 0.052, 0.053],
        [s * 0.185, 0.047],
        [s * 0.18, 0.013],
        [s * 0.151, -0.008],
        [s * 0.101, -0.012],
        [s * 0.06, 0.008],
      ],
      faceRows,
      "eye",
      0.005,
      true,
    );
    detail(
      head,
      "Iris" + s,
      oval(s * 0.122, 0.025, 0.026, 0.029),
      faceRows,
      "ink",
      0.008,
      true,
    );
    detail(
      head,
      "EyeGlint" + s,
      oval(s * 0.118 - 0.008, 0.036, 0.007, 0.008),
      faceRows,
      "eye",
      0.011,
      true,
    );
    detail(
      head,
      "HeavyBrow" + s,
      [
        [s * 0.052, 0.116],
        [s * 0.163, 0.135],
        [s * 0.19, 0.116],
        [s * 0.183, 0.093],
        [s * 0.056, 0.095],
      ],
      faceRows,
      "hair",
      0.009,
      true,
    );
    detail(
      head,
      "UpperLid" + s,
      [
        [s * 0.05, 0.065],
        [s * 0.187, 0.058],
        [s * 0.185, 0.04],
        [s * 0.05, 0.046],
      ],
      faceRows,
      "skin",
      0.013,
      true,
    );
    detail(
      head,
      "Moustache" + s,
      [
        [0, -0.099],
        [s * 0.046, -0.084],
        [s * 0.139, -0.111],
        [s * 0.183, -0.102],
        [s * 0.174, -0.131],
        [s * 0.113, -0.139],
        [s * 0.042, -0.121],
        [0, -0.123],
      ],
      faceRows,
      "hair",
      0.009,
      true,
    );
  }
  seam(
    head,
    "MouthCrease",
    [
      [-0.073, -0.164, surfaceZ(faceRows, -0.073, -0.164) + 0.004],
      [0, -0.17, surfaceZ(faceRows, 0, -0.17) + 0.005],
      [0.082, -0.16, surfaceZ(faceRows, 0.082, -0.16) + 0.004],
    ],
    0.0035,
    "skinShadow",
  );
  head.scale.setScalar(1);
  head.position.y -= 0.035;
  const earNames = [];
  for (const s of [-1, 1]) {
    const ear = mesh(
      head,
      "SculptedEar" + s,
      new T.SphereGeometry(1, 20, 16),
      "skin",
      [s * 0.267, -0.012, -0.014],
    );
    ear.scale.set(0.052, 0.079, 0.047);
    earNames.push(ear.name);
    seam(
      head,
      "EarCrease" + s,
      [
        [s * 0.279, 0.025, 0.023],
        [s * 0.299, -0.006, 0.027],
        [s * 0.281, -0.039, 0.024],
      ],
      0.004,
      "skinShadow",
    );
  }
  // Skull-fitting cap; front edge follows a shaped hairline while the rear reaches
  // the nape. Sweep masses have varying depth and tapered cross-sections, not
  // an extruded tracing with a flat front and back.
  const rings = 40,
    levels = 12,
    p = [],
    indices = [];
  for (let j = 0; j <= levels; j++) {
    const t = j / levels;
    for (let i = 0; i < rings; i++) {
      const a = (i / rings) * Math.PI * 2,
        s = Math.sin(a),
        c = Math.cos(a);
      const base =
        s > 0 ? 0.205 - 0.085 * Math.exp(-(((c - 0.38) / 0.22) ** 2)) : -0.055;
      const radius = Math.sqrt(Math.max(0, 1 - t ** 4));
      p.push(
        Math.sign(c) * Math.abs(c) ** 0.68 * 0.292 * radius + 0.025 * t,
        base + (0.395 - base) * t,
        Math.sign(s) * Math.abs(s) ** 0.62 * 0.262 * radius - 0.018,
      );
    }
  }
  for (let j = 0; j < levels; j++)
    for (let i = 0; i < rings; i++) {
      const a = j * rings + i,
        b = j * rings + ((i + 1) % rings),
        c = a + rings,
        d = b + rings;
      indices.push(a, c, b, b, c, d);
    }
  const cap = new T.BufferGeometry();
  cap.setAttribute("position", new T.Float32BufferAttribute(p, 3));
  cap.setIndex(indices);
  cap.computeVertexNormals();
  mesh(head, "HairVolume", cap, "hair");
  const locks = [
    [
      "CrownSweep",
      [
        [0.25, 0.18, 0.13, -0.015, -0.08],
        [0.32, 0.19, 0.13, -0.03, -0.025],
        [0.39, 0.125, 0.09, -0.045, 0.1],
        [0.445, 0.003, 0.003, -0.075, 0.19],
      ],
    ],
    [
      "RearSweep",
      [
        [0.2, 0.14, 0.12, -0.11, 0.06],
        [0.31, 0.15, 0.12, -0.13, 0.12],
        [0.365, 0.075, 0.065, -0.15, 0.22],
        [0.4, 0.003, 0.003, -0.18, 0.28],
      ],
    ],
    [
      "TempleSweep",
      [
        [0.17, 0.075, 0.105, 0.025, 0.22],
        [0.23, 0.08, 0.095, 0.015, 0.25],
        [0.285, 0.04, 0.05, -0.005, 0.3],
        [0.3, 0.003, 0.003, -0.02, 0.35],
      ],
    ],
    [
      "LeftSweep",
      [
        [0.15, 0.06, 0.1, -0.025, -0.235],
        [0.24, 0.065, 0.085, -0.03, -0.25],
        [0.315, 0.003, 0.003, -0.05, -0.27],
      ],
    ],
  ];
  function smoothLoft(rows) {
    const centers = new T.CatmullRomCurve3(
      rows.map((r) => new T.Vector3(r[4] || 0, r[0], r[3] || 0)),
      false,
      "centripetal",
    );
    const radii = new T.CatmullRomCurve3(
      rows.map((r) => new T.Vector3(r[1], r[2], 0)),
      false,
      "centripetal",
    );
    const dense = Array.from({ length: 25 }, (_, i) => {
      const p = centers.getPoint(i / 24),
        r = radii.getPoint(i / 24);
      return [p.y, Math.max(0.002, r.x), Math.max(0.002, r.y), p.z, p.x];
    });
    return loft(dense, 32, 0.8);
  }
  for (const [name, rows] of locks) mesh(head, name, smoothLoft(rows), "hair");
  // Forelock is a curved solid wedge, its tip close to the forehead.
  mesh(
    head,
    "ForelockVolume",
    loft(
      [
        [0.145, 0.008, 0.013, 0.218, 0.09],
        [0.2, 0.046, 0.037, 0.215, 0.07],
        [0.275, 0.085, 0.055, 0.17, 0.025],
        [0.32, 0.11, 0.06, 0.13, 0],
      ],
      16,
      0.6,
    ),
    "hair",
  );
  for (const s of [-1, 1])
    mesh(
      head,
      "SideburnVolume" + s,
      loft(
        [
          [0, 0.018, 0.035],
          [0.14, 0.026, 0.047],
          [0.22, 0.024, 0.045],
        ],
        12,
        0.6,
      ),
      "hair",
      [s * 0.249, 0.0, 0.025],
    );

  // Fit geometric stitching to the fully closed shirt surface.
  const shirtNames = [];
  spine.traverse((o) => {
    if (o.isMesh && /^(BlueWorkShirt|Shirt|Pocket|Collar)/.test(o.name))
      shirtNames.push(o.name);
  });
  remove(shirtNames);
  remove([
    "ScarfBand",
    "ScarfKnot",
    "ScarfTailA",
    "ScarfTailB",
    "ScarfTailA_ink",
    "ScarfTailB_ink",
    "ScarfFold",
  ]);
  const shirtRows = [
    [-0.04, 0.284, 0.19],
    [0.09, 0.288, 0.193],
    [0.27, 0.325, 0.2],
    [0.43, 0.357, 0.19],
    [0.52, 0.375, 0.166],
    [0.58, 0.29, 0.136],
    [0.62, 0.125, 0.105],
  ];
  const shirt = volume(spine, "WorkShirtVolume", shirtRows, false, "shirt");
  detail(
    spine,
    "ButtonPlacket",
    [
      [-0.012, -0.025],
      [0.012, -0.025],
      [0.012, 0.49],
      [-0.012, 0.49],
    ],
    shirtRows,
    "shirtDark",
    0.002,
  );
  for (const s of [-1, 1]) {
    detail(
      spine,
      "PocketStitch" + s,
      [
        [s * 0.075, 0.38],
        [s * 0.25, 0.38],
        [s * 0.243, 0.205],
        [s * 0.16, 0.184],
        [s * 0.079, 0.205],
      ],
      shirtRows,
      "shirtDark",
      0.004,
    );
    detail(
      spine,
      "PocketCloth" + s,
      [
        [s * 0.085, 0.37],
        [s * 0.24, 0.37],
        [s * 0.234, 0.214],
        [s * 0.16, 0.195],
        [s * 0.089, 0.214],
      ],
      shirtRows,
      "shirtLight",
      0.006,
    );
    detail(
      spine,
      "PocketFlap" + s,
      [
        [s * 0.082, 0.357],
        [s * 0.245, 0.357],
        [s * 0.16, 0.333],
      ],
      shirtRows,
      "shirtDark",
      0.008,
    );
    detail(
      spine,
      "CollarEdge" + s,
      [
        [s * 0.07, 0.62],
        [s * 0.15, 0.59],
        [s * 0.25, 0.46],
        [s * 0.155, 0.49],
        [s * 0.11, 0.44],
      ],
      shirtRows,
      "shirtDark",
      0.009,
    );
    detail(
      spine,
      "CollarFabric" + s,
      [
        [s * 0.084, 0.606],
        [s * 0.146, 0.581],
        [s * 0.225, 0.48],
        [s * 0.151, 0.505],
        [s * 0.119, 0.466],
      ],
      shirtRows,
      "shirtLight",
      0.013,
    );
  }
  for (let i = 0; i < 4; i++) {
    const y = 0.06 + i * 0.095;
    const b = mesh(
      spine,
      "Button" + i,
      new T.SphereGeometry(0.008, 12, 8),
      "shirtLight",
      [0, y, surfaceZ(shirtRows, 0, y) + 0.009],
    );
    b.scale.z = 0.4;
  }
  const knot = mesh(
    chest,
    "NeckerchiefKnot",
    loft(
      [
        [0.24, 0.025, 0.019],
        [0.28, 0.045, 0.03],
        [0.315, 0.038, 0.029],
        [0.34, 0.018, 0.02],
      ],
      20,
      0.8,
    ),
    "orange",
    [0, 0, 0.192],
  );
  mesh(
    chest,
    "NeckerchiefTail",
    loft(
      [
        [0.065, 0.004, 0.004],
        [0.125, 0.035, 0.014],
        [0.2, 0.029, 0.018],
        [0.275, 0.018, 0.015],
      ],
      16,
      0.6,
    ),
    "orange",
    [-0.012, 0, 0.21],
  );
  mesh(
    chest,
    "NeckerchiefTailRear",
    loft(
      [
        [0.12, 0.004, 0.004],
        [0.17, 0.024, 0.014],
        [0.26, 0.02, 0.015],
      ],
      16,
      0.7,
    ),
    "orangeDark",
    [0.035, 0, 0.19],
  );
  seam(
    chest,
    "NeckerchiefWrap",
    [
      [-0.1, 0.39, -0.05],
      [-0.117, 0.38, 0.055],
      [-0.07, 0.33, 0.14],
      [0, 0.3, 0.19],
      [0.075, 0.34, 0.13],
      [0.115, 0.39, 0.035],
      [0.08, 0.4, -0.07],
    ],
    0.022,
    "orange",
  );
  // Neck is shorter; shoulders and arms read as connected cloth rather than caps.
  const neck = root.getObjectByName("Neck");
  neck.scale.y = 0.92;
  materials.skin.color.set("#eda477");
  materials.skinShadow.color.set("#bd7957");
  materials.hair.color.set("#38271b");
  materials.pants.color.set("#343638");
  materials.shirt.color.set("#4e6b91");
  materials.shirtLight.color.set("#58779c");
  materials.shirtDark.color.set("#344e6c");
  // A single smooth surface for each hand: palm, webbing, fingers and thumb.
  // The implicit union avoids separately shaded overlapping finger ellipsoids.
  function handGeometry(sign) {
    const resolution = 40,
      mc = new MarchingCubes(resolution, materials.skin, false, false, 15000);
    mc.isolation = 1;
    const smooth = (a, b, k) => {
      const h = Math.max(k - Math.abs(a - b), 0) / k;
      return Math.min(a, b) - h * h * k * 0.25;
    };
    const capsule = (p, a, b, r) => {
      const pa = p.clone().sub(a),
        ba = b.clone().sub(a),
        h = T.MathUtils.clamp(pa.dot(ba) / ba.lengthSq(), 0, 1);
      return pa.sub(ba.multiplyScalar(h)).length() - r;
    };
    const fingers = [
      [-0.048, -0.174],
      [-0.016, -0.197],
      [0.018, -0.19],
      [0.05, -0.167],
    ];
    for (let z = 0; z < resolution; z++)
      for (let y = 0; y < resolution; y++)
        for (let x = 0; x < resolution; x++) {
          const p = new T.Vector3(
            ((x / resolution) * 2 - 1) * 0.15,
            ((y / resolution) * 2 - 1) * 0.17 - 0.07,
            ((z / resolution) * 2 - 1) * 0.09,
          );
          let d =
            (Math.sqrt(
              (p.x / 0.068) ** 2 +
                ((p.y + 0.043) / 0.079) ** 2 +
                (p.z / 0.044) ** 2,
            ) -
              1) *
            0.044;
          d = smooth(
            d,
            capsule(
              p,
              new T.Vector3(0, 0.005, 0),
              new T.Vector3(0, 0.044, 0),
              0.058,
            ),
            0.022,
          );
          for (const [fx, end] of fingers)
            d = smooth(
              d,
              capsule(
                p,
                new T.Vector3(-sign * fx, -0.086, 0.002),
                new T.Vector3(-sign * fx, end, 0.016),
                0.018,
              ),
              0.012,
            );
          d = smooth(
            d,
            capsule(
              p,
              new T.Vector3(sign * 0.052, -0.03, 0.022),
              new T.Vector3(sign * 0.087, -0.099, 0.043),
              0.022,
            ),
            0.019,
          );
          mc.field[x + y * resolution + z * resolution * resolution] = 1 - d;
        }
    mc.update();
    const g = new T.BufferGeometry();
    g.setAttribute(
      "position",
      new T.Float32BufferAttribute(
        mc.geometry.attributes.position.array.slice(0, mc.count * 3),
        3,
      ),
    );
    g.setAttribute(
      "normal",
      new T.Float32BufferAttribute(
        mc.geometry.attributes.normal.array.slice(0, mc.count * 3),
        3,
      ),
    );
    g.scale(0.15, 0.17, 0.09);
    g.translate(0, -0.07, 0);
    // The sculpt starts palm-forward (+Z), with each thumb on its outer edge.
    // Relaxed arms need palms toward the thighs and thumbs pointing forward.
    // Rotate only the hand surface about the wrist, not the elbow/arm rig.
    g.rotateY(-sign * Math.PI / 2);
    mc.geometry.dispose();
    return g;
  }
  for (const side of ["L", "R"]) {
    const sign = side === "L" ? -1 : 1;
    remove([
      "Palm" + side,
      "Palm" + side + "_ink",
      "Thumb" + side,
      ...Array.from({ length: 4 }, (_, i) => "Finger" + side + i),
    ]);
    mesh(
      root.getObjectByName("Hand" + side),
      "SculptedHand" + side,
      handGeometry(sign),
      "skin",
    );
    // Remove hard patch-shaped knee marks; preserve the trouser silhouette.
    remove([
      "TrouserKneeFold" + side,
      "TrouserHemFold" + side,
      "TrouserKneeFold" + side + "_ink",
      "TrouserHemFold" + side + "_ink",
      "ArmSkin" + side + "_ink",
    ]);
    const arm = root.getObjectByName("Arm" + side);
    arm.position.x *= 0.95;
    // Recess the shoulder crown beneath the shirt, retaining its skinned topology.
    for (const name of ["Sleeve" + side, "Sleeve" + side + "_ink"]) {
      const m = root.getObjectByName(name),
        a = m.geometry.attributes.position;
      for (let i = 0; i < a.count; i++)
        if (a.getY(i) > -0.07) a.setY(i, a.getY(i) - 0.025);
      m.geometry.computeVertexNormals();
    }
  }
  // Thin silhouette hulls. The new textured closed surfaces stay true volumes.
  const ink = new T.MeshBasicMaterial({ color: "#1c1b19" });
  ink.name = "ContourInk";
  const solids = [
    face,
    root.getObjectByName("WorkShirtVolume"),
    ...head.children.filter(
      (o) => o.isMesh && /Volume|Sweep|SculptedEar/.test(o.name),
    ),
  ];
  for (const src of solids) {
    const g = src.geometry.clone(),
      p = g.attributes.position,
      n = g.attributes.normal;
    const e = src.name.startsWith("SculptedEar") ? 0.08 : 0.004;
    for (let i = 0; i < p.count; i++)
      p.setXYZ(
        i,
        p.getX(i) + n.getX(i) * e,
        p.getY(i) + n.getY(i) * e,
        p.getZ(i) + n.getZ(i) * e,
      );
    const a = g.index.array;
    for (let i = 0; i < a.length; i += 3)
      [a[i + 1], a[i + 2]] = [a[i + 2], a[i + 1]];
    const o = src.clone(false);
    o.geometry = g;
    o.material = ink;
    o.name = src.name + "_ink";
    src.parent.add(o);
  }
  root.updateMatrixWorld(true);
  return { volume, detail, surfaceZ, faceRows, smoothLoft };
}
