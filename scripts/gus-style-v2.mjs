import * as T from "three";

/** Authored volume changes from the approved Gus lineup. Retains the working rig. */
export function refineGus({
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
}) {
  head.scale.setScalar(0.92);
  function remove(...names) {
    names.forEach((name) => {
      const node = root.getObjectByName(name);
      if (node) {
        node.removeFromParent();
        node.geometry?.dispose();
      }
    });
  }
  function replace(name, parent, g, mat, pos) {
    remove(name);
    return mesh(parent, name, g, mat, pos);
  }
  materials.skin.color.set("#efa77d");
  materials.shirt.color.set("#49658a");
  materials.shirtLight.color.set("#557197");
  materials.shirtDark.color.set("#24354b");
  materials.pants.color.set("#353633");
  materials.hair.color.set("#332417");
  materials.hairLight.color.set("#422c1d");
  materials.boot.color.set("#6b4930");
  materials.ink.color.set("#171919");

  // Broad cheek planes, square adult jaw and a visible chin below the moustache.
  replace(
    "Face",
    head,
    loft(
      [
        [-0.29, 0.185, 0.167, 0.012],
        [-0.265, 0.226, 0.195, 0.01],
        [-0.13, 0.245, 0.215],
        [0.015, 0.248, 0.222],
        [0.155, 0.26, 0.22],
        [0.255, 0.25, 0.205],
        [0.29, 0.2, 0.16],
      ],
      24,
      0.4,
    ),
    "skin",
  );
  remove(
    "NoseBridge",
    "NoseTip",
    "Smile",
    "HairCap",
    "SweptFringe",
    "CrownQuiff",
    "RightHairPoint",
    "BackHairPoint",
    "Forelock",
  );
  for (const s of [-1, 1]) {
    remove(
      "EyeOutline" + s,
      "EyeWhite" + s,
      "Pupil" + s,
      "UpperLid" + s,
      "Brow" + s,
      "Moustache" + s,
      "Sideburn" + s,
      "EarInset" + s,
    );
    const ear = root.getObjectByName("Ear" + s);
    ear.scale.set(0.82, 0.95, 0.9);
    ear.position.set(s * 0.263, -0.02, -0.015);
    seam(
      head,
      "EarFold" + s,
      [
        [s * 0.287, 0.022, 0.035],
        [s * 0.302, -0.012, 0.039],
        [s * 0.286, -0.043, 0.036],
      ],
      0.007,
      "skinShadow",
    );
    // Curved lower lid, very shallow embedded features: no rectangular glasses.
    patch(
      head,
      "EyeWhite" + s,
      [
        [s * 0.051, 0.051],
        [s * 0.196, 0.044],
        [s * 0.183, 0.012],
        [s * 0.15, -0.004],
        [s * 0.105, -0.007],
        [s * 0.069, 0.009],
      ],
      0.219,
      0.006,
      "eye",
    );
    ellipsoid(
      head,
      "Pupil" + s,
      [s * 0.123, 0.026, 0.231],
      [0.028, 0.027, 0.009],
      "ink",
      20,
    );
    patch(
      head,
      "UpperLid" + s,
      [
        [s * 0.046, 0.078],
        [s * 0.201, 0.07],
        [s * 0.197, 0.042],
        [s * 0.051, 0.052],
      ],
      0.233,
      0.003,
      "skin",
    );
    seam(
      head,
      "LidLine" + s,
      [
        [s * 0.052, 0.052, 0.24],
        [s * 0.125, 0.048, 0.241],
        [s * 0.196, 0.043, 0.236],
      ],
      0.005,
      "skinShadow",
    );
    patch(
      head,
      "Brow" + s,
      [
        [s * 0.047, 0.125],
        [s * 0.168, 0.132],
        [s * 0.2, 0.106],
        [s * 0.049, 0.099],
      ],
      0.226,
      0.009,
      "hair",
    );
    patch(
      head,
      "Moustache" + s,
      [
        [0, -0.115],
        [s * 0.042, -0.101],
        [s * 0.132, -0.124],
        [s * 0.191, -0.118],
        [s * 0.201, -0.1],
        [s * 0.208, -0.139],
        [s * 0.137, -0.148],
        [s * 0.055, -0.136],
        [0, -0.133],
      ],
      0.221,
      0.019,
      "hair",
    );
    const sideburn = mesh(
      head,
      "Sideburn" + s,
      loft(
        [
          [0.0, 0.023, 0.05],
          [0.19, 0.028, 0.072],
          [0.26, 0.022, 0.061],
        ],
        12,
        0.65,
      ),
      "hair",
      [s * 0.248, 0, 0.036],
    );
    sideburn.rotation.z = -s * 0.06;
  }
  // Planar nose, integrated into the face instead of a spherical button nose.
  const ng = new T.BufferGeometry();
  ng.setAttribute(
    "position",
    new T.Float32BufferAttribute(
      [
        -0.024, 0.065, 0.22, 0.025, 0.065, 0.22, -0.039, -0.088, 0.235, 0.042,
        -0.083, 0.235, -0.014, -0.078, 0.289, 0.03, -0.079, 0.286, 0.014,
        -0.019, 0.265,
      ],
      3,
    ),
  );
  ng.setIndex([
    0, 4, 2, 0, 6, 4, 0, 1, 6, 1, 5, 6, 1, 3, 5, 2, 4, 5, 2, 5, 3, 4, 6, 5,
  ]);
  ng.computeVertexNormals();
  mesh(head, "SculptedNose", ng, "skin");
  seam(
    head,
    "NoseAccent",
    [
      [0.033, -0.079, 0.287],
      [0.043, -0.091, 0.25],
      [0.023, -0.094, 0.243],
    ],
    0.005,
    "skinShadow",
  );
  seam(
    head,
    "Smile",
    [
      [-0.098, -0.166, 0.219],
      [0.005, -0.174, 0.225],
      [0.105, -0.159, 0.216],
    ],
    0.005,
    "skinShadow",
  );

  // Fitted hair cap, swept locks made from tapered curved cross-sections.
  // The silhouette has a few long points, without the v1 pyramid/crown shapes.
  const cap = loft(
    [
      [-0.02, 0.24, 0.17, -0.04],
      [0.13, 0.268, 0.211, -0.026],
      [0.25, 0.271, 0.224, -0.01],
      [0.32, 0.23, 0.19, -0.015],
      [0.355, 0.125, 0.115, -0.02],
    ],
    24,
    0.65,
  );
  // Raise the front hairline, leaving the forehead visible; back stays low.
  const cp = cap.attributes.position;
  for (let i = 0; i < 24; i++) {
    const z = cp.getZ(i);
    if (z > 0) cp.setY(i, 0.21 + Math.max(0, cp.getX(i)) * 0.05);
  }
  cap.computeVertexNormals();
  mesh(head, "HairCap", cap, "hair");
  function lock(name, rows) {
    const g = loft(rows, 12, 0.65);
    mesh(head, name, g, "hair");
  }
  lock("SweptTop", [
    [0.235, 0.17, 0.1, 0.08, -0.1],
    [0.29, 0.19, 0.11, 0.07, -0.035],
    [0.34, 0.17, 0.09, 0.045, 0.04],
    [0.39, 0.07, 0.045, 0.015, 0.13],
    [0.435, 0.002, 0.002, -0.015, 0.185],
  ]);
  lock("SweptCrown", [
    [0.24, 0.145, 0.12, -0.08, 0.06],
    [0.31, 0.15, 0.11, -0.09, 0.125],
    [0.35, 0.1, 0.07, -0.095, 0.19],
    [0.405, 0.002, 0.002, -0.1, 0.27],
  ]);
  lock("LeftHairLift", [
    [0.2, 0.065, 0.1, -0.02, -0.22],
    [0.29, 0.055, 0.08, -0.01, -0.245],
    [0.345, 0.002, 0.002, 0.005, -0.235],
  ]);
  lock("BackSweep", [
    [0.16, 0.13, 0.08, -0.175, 0.03],
    [0.28, 0.13, 0.07, -0.18, 0.1],
    [0.34, 0.002, 0.002, -0.22, 0.2],
  ]);
  // The right temple tuft and central forelock lean sideways like the drawing.
  patch(
    head,
    "TempleTuft",
    [
      [0.13, 0.29],
      [0.27, 0.28],
      [0.335, 0.18],
      [0.276, 0.201],
      [0.308, 0.13],
      [0.224, 0.164],
    ],
    0.115,
    0.09,
    "hair",
  );
  patch(
    head,
    "Forelock",
    [
      [-0.03, 0.28],
      [0.12, 0.27],
      [0.16, 0.207],
      [0.141, 0.126],
      [0.084, 0.189],
    ],
    0.203,
    0.035,
    "hair",
  );

  // Work shirt: broad shoulders flow into sleeves; no inflated shoulder balls.
  replace(
    "BlueWorkShirt",
    spine,
    loft(
      [
        [-0.04, 0.265, 0.165],
        [0.08, 0.274, 0.165],
        [0.27, 0.32, 0.183],
        [0.43, 0.355, 0.181],
        [0.52, 0.38, 0.165],
        [0.57, 0.32, 0.142],
        [0.62, 0.125, 0.103],
      ],
      24,
      0.55,
    ),
    "shirt",
  );
  remove("BeltBuckle");
  patch(spine, "ShirtWaistFold", [[-.25,.03],[-.12,.105],[.015,.13],[-.085,.065],[.08,.025]], .169,.007,"shirtDark");
  patch(spine, "ShirtWaistHighlight", [[-.22,.04],[-.12,.084],[-.015,.102],[-.115,.048]], .179,.004,"shirtLight");
  root.getObjectByName("ShirtPlacket").scale.x = 0.55;
  for (let i = 0; i < 4; i++) {
    const b = root.getObjectByName("ShirtButton" + i);
    b.scale.setScalar(0.6);
  }
  for (const s of [-1, 1]) {
    remove("Collar" + s, "CollarFace" + s);
    patch(
      spine,
      "Collar" + s,
      [
        [s * 0.075, 0.625],
        [s * 0.16, 0.59],
        [s * 0.255, 0.465],
        [s * 0.153, 0.495],
        [s * 0.112, 0.435],
        [s * 0.065, 0.585],
      ],
      0.145,
      0.022,
      "shirtDark",
    );
    patch(
      spine,
      "CollarFace" + s,
      [
        [s * 0.084, 0.612],
        [s * 0.155, 0.58],
        [s * 0.234, 0.485],
        [s * 0.149, 0.513],
        [s * 0.119, 0.472],
        [s * 0.078, 0.585],
      ],
      0.169,
      0.01,
      "shirt",
    );
  }
  // Larger neckerchief, with a folded knot and tapered cloth instead of a bow.
  remove("ScarfKnot", "ScarfTailA", "ScarfTailB");
  patch(
    chest,
    "ScarfKnot",
    [
      [-0.044, 0.342],
      [0.017, 0.369],
      [0.05, 0.326],
      [0.019, 0.272],
      [-0.035, 0.284],
    ],
    0.163,
    0.036,
    "orange",
  );
  patch(
    chest,
    "ScarfTailA",
    [
      [-0.029, 0.289],
      [0.017, 0.285],
      [0.037, 0.18],
      [0.008, 0.049],
      [-0.054, 0.149],
    ],
    0.19,
    0.018,
    "orange",
  );
  patch(
    chest,
    "ScarfTailB",
    [
      [0.026, 0.29],
      [0.056, 0.275],
      [0.082, 0.176],
      [0.054, 0.125],
      [0.032, 0.207],
    ],
    0.171,
    0.015,
    "orangeDark",
  );
  seam(
    chest,
    "ScarfFold",
    [
      [-0.015, 0.273, 0.214],
      [0.006, 0.179, 0.215],
      [0.008, 0.095, 0.21],
    ],
    0.005,
    "orangeDark",
  );
  for (const [s, side] of [
    [-1, "L"],
    [1, "R"],
  ]) {
    const arm = root.getObjectByName("Arm" + side);
    arm.position.x = s * 0.37;
    const sleeve = root.getObjectByName("Sleeve" + side);
    // Keep vertex topology/skin attributes; reshape existing rings.
    const p = sleeve.geometry.attributes.position;
    const radii = [
      [0.08, 0.11],
      [0.115, 0.118],
      [0.142, 0.124],
      [0.143, 0.123],
    ];
    for (let i = 0; i < p.count; i++) {
      const row = Math.floor(i / 12),
        a = ((i % 12) / 12) * Math.PI * 2;
      p.setX(
        i,
        Math.sign(Math.cos(a)) * Math.abs(Math.cos(a)) ** 0.7 * radii[row][0],
      );
      p.setZ(
        i,
        Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** 0.7 * radii[row][1],
      );
    }
    sleeve.geometry.computeVertexNormals();
    replace(
      "SleeveCuff" + side,
      arm,
      loft(
        [
          [-0.205, 0.147, 0.127],
          [-0.24, 0.147, 0.127],
        ],
        16,
        0.65,
      ),
      "shirt",
    );
    seam(
      arm,
      "CuffLine" + side,
      [
        [s * 0.139, -0.239, 0.04],
        [s * 0.1, -0.239, 0.112],
        [0, -0.239, 0.128],
        [-s * 0.1, -0.239, 0.112],
      ],
      0.006,
      "ink",
    );
    const leg = root.getObjectByName("TrouserLeg" + side),
      lp = leg.geometry.attributes.position;
    for (let i = 0; i < lp.count; i++) {
      const y = lp.getY(i);
      const width = y < -0.5 ? 1.18 : y < -0.25 ? 1.08 : 1;
      lp.setX(i, lp.getX(i) * width);
    }
    leg.geometry.computeVertexNormals();
    const thigh = root.getObjectByName("Thigh" + side);
    const shin = root.getObjectByName("Shin" + side);
    patch(shin,"TrouserKneeFold"+side,[[s*-.08,-.025],[s*.08,-.075],[s*.04,-.096],[s*-.07,-.055]],.106,.003,"sole");
    patch(shin,"TrouserHemFold"+side,[[s*-.09,-.53],[s*.085,-.49],[s*.06,-.535],[s*-.08,-.56]],.104,.004,"sole");
    seam(
      thigh,
      "TrouserPocket" + side,
      [
        [s * 0.07, 0.01, 0.13],
        [s * 0.04, -0.08, 0.15],
        [-s * 0.04, -0.17, 0.14],
      ],
      0.006,
      "ink",
    );
    // Boot shafts are mostly covered by trouser hems, with a broad work-shoe toe.
    root.getObjectByName("BootAnkle" + side).scale.y = 0.7;
    const shoe = root.getObjectByName("BootUpper" + side);
    shoe.scale.y = 0.78;
    shoe.position.y = -0.055;
    const fingers = root.getObjectByName("Hand" + side);
    fingers.scale.set(1.04, 1.08, 1);
  }
  // Crisp silhouette ink travels with each mesh and with the actual skin weights.
  // Reverse winding makes the expanded hull portable in ordinary glTF viewers.
  const ink = new T.MeshBasicMaterial({ color: "#171919" });
  ink.name = "ContourInk";
  const sources = [];
  root.traverse((o) => {
    if (
      o.isMesh &&
      /^(Face|Ear[-1]|HairCap|Swept|LeftHair|BackSweep|TempleTuft|Forelock|BlueWorkShirt|Sleeve|ArmSkin|Palm|Trouser|Boot|ScarfTail)/.test(
        o.name,
      )
    )
      sources.push(o);
  });
  for (const source of sources) {
    const outline = source.clone(false),
      g = source.geometry.clone(),
      p = g.attributes.position,
      n = g.attributes.normal;
    const thickness = /Face|Ear|Hair|Swept|Forelock|Temple|BackSweep/.test(
      source.name,
    )
      ? 0.0065
      : 0.008;
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(
        i,
        p.getX(i) + n.getX(i) * thickness,
        p.getY(i) + n.getY(i) * thickness,
        p.getZ(i) + n.getZ(i) * thickness,
      );
      n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
    }
    if (g.index) {
      const a = g.index.array;
      for (let i = 0; i < a.length; i += 3)
        [a[i + 1], a[i + 2]] = [a[i + 2], a[i + 1]];
    } else {
      const indices = [];
      for (let i = 0; i < p.count; i += 3) indices.push(i, i + 2, i + 1);
      g.setIndex(indices);
    }
    outline.geometry = g;
    outline.material = ink;
    outline.name = source.name + "_ink";
    outline.userData.isContour = true;
    source.parent.add(outline);
  }
  root.updateMatrixWorld(true);
}
