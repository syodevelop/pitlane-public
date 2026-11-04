import * as T from "three";

// UV landmarks measured on the owner's approved 1536×1024 lineup. This uses the
// unchanged source PNG as a surface texture, not new generated direction sheets.
export function applyReferenceGus({
  root,
  head,
  spine,
  chest,
  materials,
  mesh,
  loft,
}) {
  const material = new T.MeshBasicMaterial({ color: 0xffffff });
  material.name = "ReferenceGus";
  const remove = (names) =>
    names.forEach((name) => {
      for (const suffix of ["", "_ink"]) {
        const n = root.getObjectByName(name + suffix);
        if (n) {
          n.removeFromParent();
          n.geometry?.dispose();
        }
      }
    });
  const frontMaterial = material;
  // Each station: local y, half width/depth, source left/right x/y.
  function texturedVolume(parent, name, rows, backColor) {
    const pos = [],
      uv = [],
      idx = [],
      back = [],
      n = 24;
    for (const [y, rx, rz, lx, ly, rxp, ry] of rows) {
      for (let j = 0; j <= n; j++) {
        const a = (j / n) * Math.PI,
          x = Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** 0.65,
          z = Math.sin(a) ** 0.65;
        const k = (x + 1) / 2;
        const facial = name === "ReferenceFace";
        // The source shows a three-quarter face: unwrap its wider near half
        // and narrower far half onto a symmetric head, rather than painting
        // the near eye twice as wide on the front-facing model.
        const u = facial ? (k < 0.5 ? k * 1.3 : 0.65 + (k - 0.5) * 0.7) : k;
        const nose = facial
          ? 0.038 * Math.exp(-((x / 0.24) ** 2) - ((y + 0.04) / 0.1) ** 2)
          : 0;
        pos.push(x * rx, y, z * rz + nose);
        uv.push((lx + (rxp - lx) * u) / 1536, (ly + (ry - ly) * u) / 1024);
      }
    }
    for (let r = 0; r < rows.length - 1; r++)
      for (let j = 0; j < n; j++) {
        const a = r * (n + 1) + j,
          b = a + 1,
          c = a + n + 1,
          d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const face = new T.Mesh(geo, frontMaterial);
    face.name = name;
    parent.add(face);
    // Side/back is genuinely closed geometry, not a billboard that faces camera.
    for (const [y, rx, rz] of rows) back.push([y, rx, rz]);
    const shell = loft(back, 48, 0.65);
    const indices = [];
    const a = shell.index.array;
    for (let i = 0; i < a.length; i += 3) {
      const zs = [a[i], a[i + 1], a[i + 2]].map((q) =>
        shell.attributes.position.getZ(q),
      );
      if (zs.every((z) => z < 0.00001) || i >= (rows.length - 1) * 48 * 6)
        indices.push(a[i], a[i + 1], a[i + 2]);
    }
    shell.setIndex(indices);
    mesh(parent, name + "Back", shell, backColor);
    return face;
  }
  const faceNames = [];
  head.traverse((o) => {
    if (o.isMesh) faceNames.push(o.name);
  });
  remove(faceNames);
  // Front face landmarks undo the drawing's three-quarter perspective before UV
  // projection, so features belong to the head surface and rotate with it.
  texturedVolume(
    head,
    "ReferenceFace",
    [
      [-0.285, 0.185, 0.18, 353, 200, 421, 212],
      [-0.23, 0.219, 0.202, 345, 192, 425, 202],
      [-0.13, 0.238, 0.219, 344, 174, 428, 188],
      [-0.05, 0.245, 0.231, 344, 158, 431, 175],
      [0.035, 0.246, 0.232, 346, 145, 434, 160],
      [0.12, 0.251, 0.23, 348, 128, 436, 144],
      [0.22, 0.247, 0.214, 353, 107, 433, 126],
      [0.275, 0.211, 0.173, 354, 101, 421, 111],
    ],
    "skin",
  );

  // Shape is traced from the actual hair outline, with depth on the sides/back.
  const hairPoints = [
    [321, 96],
    [334, 95],
    [342, 76],
    [346, 87],
    [354, 76],
    [381, 68],
    [398, 59],
    [394, 73],
    [418, 70],
    [440, 63],
    [435, 80],
    [460, 87],
    [440, 97],
    [459, 114],
    [443, 110],
    [448, 122],
    [417, 105],
    [412, 119],
    [389, 102],
    [353, 103],
    [343, 126],
    [338, 145],
    [328, 141],
    [323, 109],
  ];
  const shape = new T.Shape();
  hairPoints.forEach(([x, y], i) => {
    const px = (x - 386) * 0.0042,
      py = (160 - y) * 0.0042;
    i ? shape.lineTo(px, py) : shape.moveTo(px, py);
  });
  shape.closePath();
  const hg = new T.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false });
  const hp = hg.attributes.position;
  // Front cap carries exact hair pigments; extruded side is a separate material.
  const hu = [];
  for (let i = 0; i < hp.count; i++) {
    const px = hp.getX(i) / 0.0042 + 386,
      py = 160 - hp.getY(i) / 0.0042;
    hu.push((px * 0.95 + 383 * 0.05) / 1536, (py * 0.95 + 103 * 0.05) / 1024);
    const x = hp.getX(i),
      y = hp.getY(i),
      front = hp.getZ(i) > 0.1;
    hp.setXYZ(
      i,
      front ? x : x * 0.9,
      front ? y : y * 0.91 + 0.018,
      front
        ? 0.095 +
            0.13 * Math.sqrt(Math.max(0, 1 - (x / 0.36) ** 2)) -
            Math.max(0, y - 0.16) * 0.55
        : -0.22 + Math.max(0, y - 0.18) * 0.35,
    );
  }
  hg.computeVertexNormals();
  hg.setAttribute("uv", new T.Float32BufferAttribute(hu, 2));
  // Flat pigment avoids dragging the paper background through concave locks.
  // The outline is traced; the rear volume is authored because it is not shown.
  const hairPigment = new T.MeshBasicMaterial({ color: "#39291c" });
  hairPigment.name = "HairPigment";
  const hm = new T.Mesh(hg, [hairPigment, materials.hair]);
  hm.name = "ReferenceHair";
  head.add(hm);
  // A curved rear cap fills the head volume; front is the traced swept silhouette.
  mesh(
    head,
    "HairRear",
    loft(
      [
        [-0.025, 0.239, 0.165, -0.065],
        [0.12, 0.258, 0.19, -0.045],
        [0.27, 0.25, 0.18, -0.025],
        [0.35, 0.16, 0.12, -0.025],
      ],
      24,
      0.65,
    ),
    "hair",
  );
  // Ears are independent volumes. The visible inner line is taken from the source.
  for (const s of [-1, 1]) {
    const e = mesh(head, "Ear" + s, new T.SphereGeometry(1, 20, 14), "skin", [
      s * 0.263,
      -0.005,
      -0.01,
    ]);
    e.scale.set(0.048, 0.073, 0.047);
  }
  const shirtNames = [];
  spine.traverse((o) => {
    if (o.isMesh && /^(BlueWorkShirt|Shirt|Pocket|Collar)/.test(o.name))
      shirtNames.push(o.name);
  });
  remove(shirtNames);
  texturedVolume(
    spine,
    "ReferenceShirt",
    [
      [-0.04, 0.279, 0.185, 305, 441, 437, 444],
      [0.08, 0.285, 0.185, 303, 410, 445, 412],
      [0.27, 0.32, 0.186, 287, 351, 455, 352],
      [0.43, 0.355, 0.183, 246, 292, 479, 297],
      [0.52, 0.378, 0.165, 238, 265, 462, 263],
      [0.57, 0.315, 0.143, 299, 235, 426, 239],
      [0.62, 0.125, 0.104, 317, 212, 394, 226],
    ],
    "shirt",
  );
  // The source already contains the collar and scarf; overlapping raised copies
  // would draw a second knot and tails. Keep the skin neck behind the garment.
  remove(["ScarfBand", "ScarfKnot", "ScarfTailA", "ScarfTailB", "ScarfFold"]);
  materials.skin.color.set("#eea67a");
  materials.hair.color.set("#362417");
  materials.shirt.color.set("#4e6b91");
  materials.shirtLight.color.set("#58769d");
  // Portable contour hulls for the new smooth volumes, excluding painted detail.
  const ink = new T.MeshBasicMaterial({ color: "#171919" });
  ink.name = "ContourInk";
  for (const name of [
    "ReferenceFaceBack",
    "HairRear",
    "Ear-1",
    "Ear1",
    "ReferenceShirtBack",
  ]) {
    const source = root.getObjectByName(name);
    if (!source) continue;
    const g = source.geometry.clone(),
      p = g.attributes.position,
      n = g.attributes.normal;
    const expansion = name.startsWith("Ear") ? 0.13 : 0.007;
    for (let i = 0; i < p.count; i++)
      p.setXYZ(
        i,
        p.getX(i) + n.getX(i) * expansion,
        p.getY(i) + n.getY(i) * expansion,
        p.getZ(i) + n.getZ(i) * expansion,
      );
    const a = g.index.array;
    for (let i = 0; i < a.length; i += 3)
      [a[i + 1], a[i + 2]] = [a[i + 2], a[i + 1]];
    const outline = source.clone(false);
    outline.geometry = g;
    outline.material = ink;
    outline.name = name + "_ink";
    source.parent.add(outline);
  }
  root.updateMatrixWorld(true);
}
