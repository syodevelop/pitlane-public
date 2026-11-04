import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { INTERIOR, type Point } from "../../packages/game-core";
import { garageRoofImage, garageSurfaceImage } from "./garage-surface-asset";
import { SERVICE_ROADS } from "./service-route";
import { createWorkshopConcrete } from "./workshop-surfaces";

// Existing bay coordinates stay stable; the service court extends to the west.
export const WORLD_SCALE = .032;
export const BAY = { width: INTERIOR.accessibleWidth * WORLD_SCALE, depth: INTERIOR.height * WORLD_SCALE, height: 3.8 };
export const toGarageWorld = (p: Point) => new T.Vector3(p.x * WORLD_SCALE, 0, p.y * WORLD_SCALE);

function random(seed = 1931) {
  return () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
}

/** Authored, tileable surface detail, not a painting of the room. */
function mineralTexture(kind: "concrete" | "asphalt" | "plaster" | "roof") {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  const rng = random(kind === "asphalt" ? 9 : 13);
  ctx.fillStyle = kind === "asphalt" ? "#55585b" : kind === "roof" ? "#929da8" : kind === "plaster" ? "#d3c9b6" : "#c8bba5";
  ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 55000; i++) {
    const v = rng();
    ctx.fillStyle = v > .5 ? `rgba(255,244,222,${rng() * .09})` : `rgba(39,30,22,${rng() * .07})`;
    ctx.fillRect(rng() * 1024, rng() * 1024, 1 + rng() * 3, 1 + rng() * 3);
  }
  if (kind === "concrete" || kind === "roof") {
    for (let i = 0; i < 100; i++) {
      const x = rng() * 1024, y = rng() * 1024, r = 4 + rng() * 50;
      ctx.beginPath();
      for (let k = 0; k < 14; k++) {
        const a = k / 14 * Math.PI * 2, d = r * (.4 + rng() * .6);
        ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
      }
      ctx.closePath(); ctx.fillStyle = `rgba(74,62,45,${.025 + rng() * .11})`; ctx.fill();
    }
    for (let i = 0; i < 38; i++) {
      let x = rng() * 1024, y = rng() * 1024;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 12; k++) { x += rng() * 17 - 8; y += rng() * 13; ctx.lineTo(x, y); }
      ctx.strokeStyle = "rgba(59,47,29,.16)"; ctx.lineWidth = .8; ctx.stroke();
    }
  }
  if (kind === "asphalt") {
    for (let i = 0; i < 280; i++) {
      let x = rng() * 1024, y = rng() * 1024;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += rng() * 21 - 10; y += rng() * 13; ctx.lineTo(x, y); }
      ctx.strokeStyle = "rgba(20,25,30,.30)"; ctx.lineWidth = .8; ctx.stroke();
      ctx.strokeStyle = "rgba(168,166,148,.10)"; ctx.lineWidth = 2.4; ctx.stroke();
    }
  }
  const texture = new T.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 8;
  return texture;
}

export function buildGarageArchitecture() {
  const root = new T.Group(); root.name = "Pitlane_ServiceCourt_v4";
  const roofs = [new T.Group(), new T.Group()];
  const teamDoor = new T.Group(); teamDoor.name = "Team_Garage_Door"; root.add(teamDoor);
  const teamNorthGate = new T.Group(), teamSouthGate = new T.Group();
  teamNorthGate.name = "Team_North_Shutter"; teamSouthGate.name = "Team_South_Shutter";
  root.add(teamNorthGate, teamSouthGate);
  roofs.forEach((g, i) => { g.name = `Roof_Box_${i + 2}`; root.add(g); });
  const performanceDoor = new T.Group(), performanceNorth = new T.Group(), performanceSouth = new T.Group();
  root.add(performanceDoor,performanceNorth,performanceSouth);
  const fullFront = new T.Group(), cutFront = new T.Group();
  fullFront.name = "SouthFacade_Full"; cutFront.name = "SouthFacade_Cutaway";
  root.add(fullFront, cutFront); cutFront.visible = false;
  let group = root, offset = 0;
  const textures: T.Texture[] = [];
  const materials: T.Material[] = [];
  const geometries: T.BufferGeometry[] = [];
  const batches = new Map<T.Group, Map<T.Material, T.BufferGeometry[]>>();
  const worldUV = new Map<T.Material, number>();
  function mat(color: T.ColorRepresentation, roughness = .85, metalness = 0, texture?: T.Texture) {
    const m = new T.MeshStandardMaterial({ color, roughness, metalness, map: texture });
    materials.push(m); return m;
  }
  const concrete = new T.Texture(garageSurfaceImage()); concrete.needsUpdate = true;
  concrete.colorSpace = T.SRGBColorSpace; concrete.wrapS = concrete.wrapT = T.RepeatWrapping;
  concrete.anisotropy = 8;
  const roofTexture = new T.Texture(garageRoofImage()); roofTexture.needsUpdate = true;
  roofTexture.colorSpace = T.SRGBColorSpace; roofTexture.wrapS = roofTexture.wrapT = T.RepeatWrapping;
  roofTexture.anisotropy = 8;
  const plaster = mineralTexture("plaster"), asphalt = mineralTexture("asphalt");
  textures.push(concrete, plaster, asphalt, roofTexture);
  const workshopConcrete = createWorkshopConcrete();
  textures.push(workshopConcrete.map, workshopConcrete.detail);
  const floor = mat("#f4eddf", .91, 0, workshopConcrete.map), wall = mat("#f4e8d4", .92, 0, plaster);
  floor.bumpMap = workshopConcrete.detail; floor.bumpScale = .022;
  floor.roughnessMap = workshopConcrete.detail;
  wall.bumpMap = plaster; wall.bumpScale = .02;
  const dark = mat("#243039", .56, .4), steel = mat("#657076", .44, .65), bolt = mat("#9ca4a1", .34, .75);
  const red = mat("#ad191c", .48, .18), redLight = mat("#ce2922", .48, .18), redDark = mat("#6c171b", .54, .18);
  const yellow = mat("#dca625", .7), seam = mat("#827b6c"), pale = mat("#ddd1b8");
  const curbWhite = mat("#e3ddc9"), curbRed = mat("#bd312a"), road = mat("#d7d2c6", 1, 0, asphalt);
  const roof = mat("#b8c6d2", .98, 0, roofTexture), soil = mat("#403d2c"), trunk = mat("#8c6740");
  roof.bumpMap = roofTexture; roof.bumpScale = .025;
  worldUV.set(floor, 6); worldUV.set(wall, 6); worldUV.set(road, 6); worldUV.set(roof, 6);
  const greens = ["#254522", "#436223", "#718828", "#bdab2e"].map(c => mat(c));
  const foliageMaterials = new Set<T.Material>(greens);
  const foliageSectors = new Map<string, T.Group>();
  const glow = new T.MeshStandardMaterial({ color: "#fff2c5", emissive: "#ffd790", emissiveIntensity: 2.8 }); materials.push(glow);
  const amber = new T.MeshStandardMaterial({ color: "#ee8b22", emissive: "#ff7b08", emissiveIntensity: 1.6 }); materials.push(amber);

  function add(g: T.BufferGeometry, m: T.Material, x: number, y: number, z: number, rotation?: T.Euler) {
    const transform = new T.Matrix4().compose(new T.Vector3(x + offset, y, z), new T.Quaternion().setFromEuler(rotation || new T.Euler()), new T.Vector3(1, 1, 1));
    g.applyMatrix4(transform);
    // Project in metres so narrow paths and long walls keep the same texture
    // density as the floor instead of stretching one square over every box.
    const tileSize = worldUV.get(m);
    if (tileSize) {
      const p = g.getAttribute("position"), n = g.getAttribute("normal");
      const uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) {
        const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
        uv[i * 2] = (ny >= nx && ny >= nz ? p.getX(i) : nx >= nz ? p.getZ(i) : p.getX(i)) / tileSize;
        uv[i * 2 + 1] = (ny >= nx && ny >= nz ? p.getZ(i) : p.getY(i)) / tileSize;
      }
      g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    }
    // Keep distant planting out of the gameplay draw list. A single merged
    // foliage mesh spanning the whole district could never be frustum-culled.
    let target = group;
    if (group === root && foliageMaterials.has(m)) {
      const sector = `${Math.floor((x + offset) / 12)}_${Math.floor(z / 12)}`;
      target = foliageSectors.get(sector)!;
      if (!target) { target = new T.Group(); target.name = `Foliage_${sector}`; foliageSectors.set(sector, target); root.add(target); }
    }
    const batch = batches.get(target) || new Map<T.Material, T.BufferGeometry[]>();
    const bucket = batch.get(m) || []; bucket.push(g); batch.set(m, bucket); batches.set(target, batch);
  }
  function box(x: number, y: number, z: number, w: number, h: number, d: number, m: T.Material, bevel = 0) {
    add(bevel ? new RoundedBoxGeometry(w, h, d, 1, bevel) : new T.BoxGeometry(w, h, d), m, x, y, z);
  }
  function pipe(a: number[], b: number[], r: number, m = steel, sides = 10) {
    const from = new T.Vector3(...a), to = new T.Vector3(...b), delta = to.clone().sub(from);
    const g = new T.CylinderGeometry(r, r, delta.length(), sides);
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize()));
    const middle = from.add(to).multiplyScalar(.5); add(g, m, middle.x, middle.y, middle.z);
  }
  function label(text: string, x: number, y: number, z: number, w: number, h: number, facing = 0, bg = "#243039", fg = "#f1e7cf") {
    const c = document.createElement("canvas"); c.width = 512; c.height = 128;
    const ctx = c.getContext("2d")!; ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = fg; ctx.font = "bold 66px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, 256, 66, 478);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; textures.push(t);
    const m = mat("white", .7, 0, t); m.side = T.DoubleSide;
    add(new T.PlaneGeometry(w, h), m, x, y, z, new T.Euler(0, facing, 0));
  }
  function drain(x: number, z: number, width: number) {
    box(x, .014, z, width, .05, .28, dark, .012);
    for (let i = -width / 2 + .06; i < width / 2; i += .095) box(x + i, .045, z, .025, .022, .245, steel);
    box(x, .045, z - .14, width, .025, .025, steel);
    box(x, .045, z + .14, width, .025, .025, steel);
  }
  const W = BAY.width, D = BAY.depth, H = BAY.height;
  // Continuous textured district ground. No untextured strips between plots.
  const districtGround = mat("#e6dbc4", .95, 0, workshopConcrete.map); worldUV.set(districtGround, 6);
  box(-6, -.44, 2, 100, .6, 116, districtGround);
  box(W * 1.5, -.135, D / 2, W * 3 + .3, .2, D + .3, pale);
  const upperRoad = SERVICE_ROADS.upper, lowerRoad = SERVICE_ROADS.lower;
  box(-6, -.12, (upperRoad.minZ + upperRoad.maxZ) / 2, 100, .15, upperRoad.maxZ - upperRoad.minZ, road);
  for (let x = -53; x < 43; x += 4) { if (x > -22 && x < -14) continue; box(x, -.037, (upperRoad.clientZ + upperRoad.ambientZ) / 2, 1.8, .008, .10, curbWhite); }
  for (let x = -54; x < 43; x += 1.05) {
    if (x > -21.3 && x < -14.7) continue;
    if (x < 2.3 || x > 31.4) box(x, .04, -2.18, 1.025, .23, .30, Math.round(x / 1.05) % 2 ? curbRed : curbWhite, .045);
    box(x, .04, upperRoad.minZ - .20, 1.025, .23, .30, Math.round(x / 1.05) % 2 ? curbWhite : curbRed, .045);
  }
  // Walkway paving joints.
  for (let x = -2; x < W * 3 + 2; x += 1) {
    box(x, .005, -1.2, .012, .007, 1.6, seam);
    box(x, .005, D + 1.1, .012, .007, 1.6, seam);
  }
  for (let z = -1.8; z < D + 2; z += 1) {
    box(-1.1, .005, z, 1.8, .007, .012, seam);
    box(W * 3 + 1.1, .005, z, 1.8, .007, .012, seam);
  }
  function arrow(x: number, z: number, yaw = 0) {
    const shape = new T.Shape(); shape.moveTo(-.12, .65); shape.lineTo(.12, .65);
    shape.lineTo(.12, -.1); shape.lineTo(.40, -.1); shape.lineTo(0, -.65);
    shape.lineTo(-.40, -.1); shape.lineTo(-.12, -.1); shape.closePath();
    // Shape Y maps directly to world Z; arrow points north (-Z).
    const geo = new T.ShapeGeometry(shape); geo.rotateX(Math.PI / 2);
    curbWhite.side = T.DoubleSide; add(geo, curbWhite, x, .024, z, new T.Euler(0, yaw, 0));
  }
  function serviceCourt() {
    const court = new T.Group(); court.name = "Open_Service_Post_01"; root.add(court); group = court;
    box(2.25, -.08, D / 2, W + 6.2, .16, D, floor);
    for (let x = -5.31; x < W; x += 1.77) box(x, .003, D / 2, .012, .005, D, seam);
    for (let z = 1.76; z < D; z += 1.76) box(2.25, .004, z, W + 6.2, .005, .012, seam);
    // Two clear ends, no shutters or foreground wall. The next room remains closed.
    // A real opening connects service and team bays; the shutter closes it initially.
    for (const [a, b] of [[0, 6.8], [8.8, D]]) {
      box(W, H / 2, (a + b) / 2, .24, H, b - a, wall);
      box(W - .18, .16, (a + b) / 2, .10, .32, b - a, dark);
    }
    box(W, (H + 2.85) / 2, 7.8, .24, H - 2.85, 2, wall);
    box(W, H, D / 2, .34, .20, D + .3, dark, .025);
    for (const z of [.15, D - .15]) {
      box(W, H / 2, z, .34, H, .34, red, .025);
      box(W, .09, z, .55, .18, .55, dark, .03);
      pipe([W - .2, 3.2, z], [W - .2, 3.2, z < 1 ? 2 : D - 2], .035);
    }
    for (const z of [6.8, 8.8]) box(W - .15, 1.42, z, .24, 2.84, .13, dark, .025);
    box(W - .15, 2.85, 7.8, .34, .24, 2.16, dark, .025);
    label("02 / TEAM GARAGE", W - .35, 3.08, 7.8, 1.9, .24, -Math.PI / 2);
    group = teamDoor;
    box(W - .12, 1.39, 7.8, .10, 2.78, 1.94, redDark, .025);
    for (let y = .08; y < 2.75; y += .16) box(W - .18, y, 7.8, .016, .02, 1.90, red);
    label("LOCKED", W - .21, 2.20, 7.8, .98, .24, -Math.PI / 2);
    box(W - .30, 1.13, 8.25, .06, .13, .21, steel, .02);
    group = court;
    label("QUICK SERVICE", W - .15, 2.60, 3.2, 3.0, .43, -Math.PI / 2, "#ad191c");
    for (const z of [2.7, 8.8]) {
      box(W - .21, 3.13, z, .20, .20, 1.30, dark, .03);
      box(W - .33, 3.12, z, .04, .10, 1.15, glow, .02);
    }
    pipe([W - .22, 3.43, .3], [W - .22, 3.43, D - .3], .027);
    // Open motorsport gantries, with shade rolled to the edge rather than over
    // the service spot. The car and avatar remain visible from the play camera.
    for (const z of [.15, D - .15]) {
      const height = 3.45;
      for (const x of [.45, W - .4]) {
        box(x, height / 2, z, .14, height, .14, dark, .025);
        box(x, .09, z, .40, .18, .40, steel, .035);
        for (const dx of [-.13, .13]) for (const dz of [-.13, .13]) add(new T.CylinderGeometry(.025, .025, .03, 6), bolt, x + dx, .20, z + dz);
        pipe([x, height - .7, z], [x + (x < 1 ? .7 : -.7), height, z], .035, steel);
      }
      pipe([.45, height, z], [W - .4, height, z], .07, dark);
      pipe([.45, height + .22, z], [W - .4, height + .22, z], .04, steel);
      for (let x = .5; x < W - .8; x += .6) pipe([x, height, z], [x + .3, height + .22, z], .018, steel, 6);
      box(W / 2, height + .09, z + .08, 2.7, .38, .12, red, .035);
      label(z < 1 ? "PITLANE" : "01 / SERVICE", W / 2, height + .10, z + .15, 2.5, .28, 0, "#ad191c");
    }
    // Marked service footprint, arrows and flush drains; no wheel stops.
    for (const side of [-1, 1]) {
      const x = W / 2 + side * 2.02;
      box(x, .012, D / 2, .085, .012, 7.8, yellow);
      for (const z of [D / 2 - 3.86, D / 2 + 3.86]) box(x - side * .25, .012, z, .58, .012, .085, yellow);
    }
    arrow(W / 2, 9.30); arrow(W / 2, 1.0); arrow(W / 2, -1.1);
    drain(W / 2, .18, 4.2); drain(W / 2, D - .18, 4.2);
    for (const x of [1.6, W - 1.6]) for (const z of [-.9, D + .65]) {
      box(x, .38, z, .15, .76, .15, yellow, .035);
      box(x, .53, z, .16, .11, .16, dark, .015);
      box(x, .07, z, .28, .14, .28, steel, .025);
    }
    // The sheltered lounge is outside the vehicle corridor. Its perimeter,
    // benches and planters sit outside the enlarged walking rectangle.
    box(-5.7, 1.10, D / 2, .22, 2.2, D, wall);
    box(-5.7, 2.23, D / 2, .30, .10, D, pale, .025);
    box(-2.7, .50, .08, 6, 1, .20, wall); box(-2.7, 1.03, .08, 6.1, .10, .28, pale, .02);
    box(-2.7, .50, D - .08, 6, 1, .20, wall); box(-2.7, 1.03, D - .08, 6.1, .10, .28, pale, .02);
    const wood = mat("#95643d", .8), cloth = mat("#b91d27", .94), creamCloth = mat("#e9debf", .95);
    for (const z of [3.1, 6.5]) {
      for (let slat = 0; slat < 4; slat++) box(-5.14 + slat * .12, .52, z, .10, .075, 2.2, wood, .025);
      for (const dz of [-.85, .85]) {
        box(-4.95, .25, z + dz, .48, .48, .07, dark, .02);
        box(-5.37, .78, z + dz, .055, .95, .07, dark, .02);
      }
      for (const y of [.84, 1.04]) box(-5.36, y, z, .08, .14, 2.2, wood, .025);
    }
    for (const x of [-5.5, -4.1]) for (const z of [1.1, 8.9]) {
      pipe([x, 0, z], [x, 3.05, z], .045, steel);
      box(x, .04, z, .22, .08, .22, dark, .02);
    }
    // Slight fabric sag, individually stitched stripe panels.
    for (let stripe = 0; stripe < 10; stripe++) {
      const points: number[] = [], ids: number[] = [];
      for (let j = 0; j <= 12; j++) for (const k of [0, 1]) {
        const t = j / 12; points.push(-5.5 + t * 1.4, 3.05 + Math.sin(t * Math.PI) * .18, 1.1 + (stripe + k) * .78);
        if (j < 12 && k === 0) { const a = j * 2; ids.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.Float32BufferAttribute(points, 3)); geo.setIndex(ids); geo.computeVertexNormals();
      cloth.side = creamCloth.side = T.DoubleSide; add(geo, stripe % 2 ? creamCloth : cloth, 0, 0, 0);
    }
    // Roll the inboard half of the fabric back for a clear overhead cutaway.
    // It is an actual canopy over the lounge only, never a roof over the car.
    for (const z of [1.1, 8.9]) pipe([-5.5, 3.05, z], [-4.1, 3.05, z], .04);
    label("CREW / REST AREA", -5.55, 1.7, 5.3, 2.4, .3, Math.PI / 2, "#243039");
    group = root;
  }
  function buildBox(index: number) {
  if (index === 0) { serviceCourt(); return; }
  offset = index * W;
  // All three rooms are real interiors. Unlocking remains a separate game rule.
  box(W / 2, -.08, D / 2, W, .16, D, floor);
  for (let x = 1.77; x < W; x += 1.77) box(x, .003, D / 2, .016, .005, D, seam);
  for (let z = 1.76; z < D; z += 1.76) box(W / 2, .004, z, W, .005, .016, seam);
  for (const x of [W * .25, W * .75]) {
    box(x, .009, D / 2, .105, .009, D - 1.0, yellow);
    // Small chips break up painted lines while keeping the geometry legible.
    for (let z = .7; z < D - .5; z += .46) box(x + Math.sin(z * 6) * .034, .016, z, .032, .003, .02, seam);
  }
  box(W / 2, .01, D - .65, W * .5, .009, .105, yellow);
  drain(W / 2, .33, W * .76);
  drain(W / 2, D - .36, W * .76);
  // Wall body, steel columns, red structural uprights, base flashing.
  if (index === 0) box(0, H / 2, D / 2, .24, H, D, wall);
  if(index===1) {
    for(const [a,b] of [[0,5.8],[7.8,D]]) box(W,H/2,(a+b)/2,.24,H,b-a,wall);
    box(W,(H+2.85)/2,6.8,.24,H-2.85,2,wall);
  } else box(W, H / 2, D / 2, .24, H, D, wall);
  // Retained cutaway variant for archived art tooling; gameplay uses fullFront.
  group = cutFront;
  if (index === 0) {
    box(W / 2, .36, D, W, .72, .24, wall);
    box(W / 2, .75, D, W + .26, .15, .31, dark, .025);
  }
  group = root;
  for (const x of [0, W]) {
    if ((index === 1 && x === 0) || (index===1 && x===W) || (index===2 && x===0)) {
      for (const [a, b] of index===1 && x===0 ? [[0, 6.8], [8.8, D]] : [[0,5.8],[7.8,D]]) box(x, .17, (a + b) / 2, .30, .34, b - a, dark);
    } else box(x, .17, D / 2, .30, .34, D, dark);
    box(x, H, D / 2, .32, .24, D + .3, dark, .025);
    for (const z of [0, D / 2, D]) {
      const h = z === D ? .98 : H;
      box(x, h / 2, z, .28, h, .35, dark, .025);
      box(x + (x === 0 ? .15 : -.15), h / 2, z, .025, h - .18, .22, red);
      box(x, h + .03, z, .45, .09, .48, steel, .025);
      for (const bx of [-.13, .13]) for (const bz of [-.14, .14]) add(new T.CylinderGeometry(.036, .036, .045, 6), bolt, x + bx, h + .1, z + bz);
      box(x, .07, z, .45, .14, .48, dark, .02);
    }
    for (let z = 1.7; z < D; z += 1.7) {
      if ((index === 1 && x === 0 && z > 6.7 && z < 8.9) || (((index===1 && x===W)||(index===2 && x===0)) && z>5.7 && z<7.9)) continue;
      box(x + (x === 0 ? .124 : -.124), 1.95, z, .008, 3.45, .009, seam);
    }
  }
  // North shutter: individually extruded steel slats, rolled edges, side tracks.
  const gateWidth = W - 1.4;
  for (const x of [.35, W - .35]) {
    box(x, H / 2, 0, .70, H, .28, wall);
    box(x + (x < 1 ? .36 : -.36), H / 2, .16, .13, H, .22, dark, .025);
    box(x, 1.35, .28, .13, 2.7, .18, redDark);
  }
  if (index === 1) group = teamNorthGate;
  if (index === 2) group = performanceNorth;
  for (let i = 0; i < 18; i++) {
    const y = .12 + i * .172;
    box(W / 2, y, .05, gateWidth, .17, .105, i % 4 === 0 ? redLight : red, .028);
    box(W / 2, y - .063, .113, gateWidth - .05, .018, .028, redDark);
    box(W / 2, y + .059, .112, gateWidth - .1, .008, .018, redLight);
  }
  box(W / 2, .10, .13, gateWidth, .16, .14, dark, .02);
  box(W / 2, .73, .14, .65, .07, .08, dark, .02);
  group = root;
  box(W / 2, 3.45, -.035, W - .52, .62, .60, red, .06);
  box(W / 2, 3.75, -.02, W - .45, .06, .68, steel, .025);
  for (const x of [.78, W - .78]) {
    box(x, .57, .41, .23, 1.14, .24, yellow, .045);
    for (const y of [.22, .53, .84]) box(x, y, .538, .235, .10, .008, dark);
  }
  label("PITLANE", W / 2, 3.43, .276, 2.8, .38, 0, "#ad191c");
  label(`0${index + 1}`, .33, 3.32, .164, .40, .26);
  // Fixtures attached to walls, with brackets, conduits and junction boxes.
  for (const x of [.29, W - .29]) {
    pipe([x, .55, .31], [x, 3.35, .31], .026, dark);
    box(x, 2.34, .39, .16, .88, .11, dark, .03);
    box(x, 2.34, .46, .085, .72, .08, glow, .025);
    for (const y of [1.89, 2.78]) box(x, y, .45, .19, .06, .12, steel, .02);
    box(x, 1.2, .37, .20, .26, .12, steel, .02);
    add(new T.SphereGeometry(.036, 8, 6), red, x, 1.23, .45);
  }
  for (const z of [2.7, 7.9]) {
    for (const x of [.19, W - .19]) {
      box(x, 3.09, z, .16, .22, 1.68, dark, .035);
      box(x + (x < 1 ? .09 : -.09), 3.09, z, .07, .115, 1.48, glow, .028);
      for (const dz of [-.76, .76]) box(x, 3.09, z + dz, .24, .27, .06, steel);
    }
  }
  for (const x of [.19, W - .19]) {
    pipe([x, 3.42, .4], [x, 3.42, D - .3], .027);
    for (let z = .6; z < D; z += .7) box(x, 3.42, z, .085, .09, .025, dark);
  }
  if(index===1) {
    for(const z of [5.8,7.8]) box(W-.15,1.42,z,.24,2.84,.13,dark,.025);
    box(W-.15,2.85,6.8,.34,.24,2.16,dark,.025);
    label("03 / PERFORMANCE",W-.35,3.08,6.8,1.9,.24,-Math.PI/2);
    group=performanceDoor;
    box(W-.12,1.39,6.8,.10,2.78,1.94,redDark,.025);
    for(let y=.08;y<2.75;y+=.16)box(W-.18,y,6.8,.016,.02,1.90,red);
    label("LOCKED",W-.21,2.2,6.8,.98,.24,-Math.PI/2);
    group=root;
  }
  // Recessed service window on west wall, high enough to keep floor clear.
  box(.135, 2.00, 4.8, .08, 1.28, 2.5, dark, .025);
  box(.185, 2.0, 4.8, .04, 1.10, 2.30, mat("#719399", .3, .35));
  for (const z of [3.65, 4.4, 5.2, 5.95]) box(.222, 2.0, z, .04, 1.14, .045, steel);
  box(.23, 1.43, 4.8, .25, .10, 2.58, steel, .025);
  pipe([.20, .4, 8.9], [.20, 2.8, 8.9], .033, dark);
  box(.23, 1.15, 8.9, .2, .55, .40, steel, .03);
  label("240 V", .344, 1.20, 8.9, .3, .13, Math.PI / 2, "#d5a333", "#242522");
  // Solid full-height rear facade, including the first playable room.
  group = index === 0 ? fullFront : root;
  if (index > 0) {
    for (const x of [.35, W - .35]) box(x, 1.7, D, .7, 3.4, .24, wall);
    group = index===1 ? teamSouthGate : performanceSouth;
    for (let i = 0; i < 18; i++) {
      const y = .12 + i * .172;
      box(W / 2, y, D, gateWidth, .17, .105, i % 4 === 0 ? redLight : red, .028);
      box(W / 2, y - .063, D + .06, gateWidth - .05, .018, .028, redDark);
    }
    box(W / 2, .10, D, gateWidth, .16, .14, dark, .02);
    group = root;
    label(index===1 ? "02 / TEAM GARAGE" : "03 / PERFORMANCE", W / 2, 3.48, D - .20, 3.15, .32, Math.PI);
  } else {
    label(["01 / SERVICE", "02 / TEAM GARAGE", "03 / PERFORMANCE"][index], W / 2, 2.45, D - .14, 3.15, .45, Math.PI);
    box(W / 2, 1.7, D, W, 3.4, .24, wall);
    box(W / 2, .20, D + .15, W, .40, .06, steel);
  }
  box(W / 2, 3.44, D, W + .3, .26, .40, dark, .025);
  for (const x of [.03, W - .03]) {
    box(x, 1.7, D + .05, .4, 3.4, .40, red, .025);
    box(x, 3.62, D, .55, .12, .56, steel, .025);
    for (const dx of [-.16, .16]) for (const dz of [-.17, .17]) add(new T.CylinderGeometry(.046, .046, .04, 6), bolt, x + dx, 3.7, D + dz);
    for (let y = .3; y < 3.3; y += .4) add(new T.SphereGeometry(.034, 6, 4), bolt, x, y, D + .266);
  }
  if (index === 0) {
  box(W / 2, 2.35, D + .18, 2.0, .20, .12, dark, .04);
  box(W / 2, 2.35, D + .25, 1.92, .15, .07, amber, .04);
  box(W / 2, 2.35, D + .26, 1.80, .09, .07, glow, .035);
  pipe([W / 2 + 1, 2.35, D + .18], [W - 1.2, 2.35, D + .18], .025, dark);
  pipe([W - 1.2, 2.35, D + .18], [W - 1.2, .72, D + .18], .025, dark);
  box(W - 1.2, .72, D + .20, .27, .40, .13, steel, .02);
  for (let x = 1.5; x < W; x += 1.5) box(x, 1.72, D + .124, .014, 3.30, .01, seam);
  }
  group = root;
  if (index > 0) {
    group = roofs[index - 1];
    const cx = W / 2;
    box(cx, 3.19, D / 2, W - .16, .18, D, roof);
    for (let z = 1.76; z < D; z += 1.76) box(cx, 3.288, z, W - .24, .008, .016, dark);
    for (let x = 1.77; x < W; x += 1.77) box(x, 3.288, D / 2, .016, .008, D, dark);
    box(cx, 3.26, .36, W, .12, .20, dark);
    box(cx, 3.61, D, W, .2, .28, dark);
    const ventPositions = index === 1 ? [[8.4, 3.6]] : [[8.2, 3.6], [8.0, 8.0]];
    for (const [vx, vz] of ventPositions) {
      box(vx, 3.57, vz, 1.10, .56, 1.2, steel, .045);
      box(vx, 3.87, vz, 1.17, .06, 1.27, dark, .025);
      if (index === 1) box(vx, 3.92, vz, 1.05, .07, 1.15, bolt, .02);
      else for (let z = vz - .52; z < vz + .54; z += .10) box(vx, 3.91, z, .96, .025, .035, bolt);
      for (const dx of [-.49, .49]) for (const dz of [-.53, .53]) add(new T.SphereGeometry(.028, 6, 4), bolt, vx + dx, 3.95, vz + dz);
    }
    group = root;
  }
  offset = 0;
  }
  for (let i = 0; i < 3; i++) buildBox(i);
  // Perimeter details: paths connect to the street rather than an empty backdrop.
  const paving = mat("#ddd2b9", .93, 0, concrete);
  worldUV.set(paving, 6);
  box(W * 1.5, -.01, -1.2, W * 3 + 4.2, .035, 1.6, paving);
  box(W * 3 + 1.15, -.01, D / 2, 1.8, .035, D + 4.2, paving);
  box(W * 1.5, -.01, D + 1.1, W * 3 + 4.2, .035, 1.8, paving);
  // Lower two-lane road links the service entrance to the side street.
  box(13.8, -.12, (lowerRoad.minZ + lowerRoad.maxZ) / 2, 57.2, .15, lowerRoad.maxZ - lowerRoad.minZ, road);
  for (let x = -13; x < 42; x += 4) box(x, -.037, (lowerRoad.clientZ + lowerRoad.ambientZ) / 2, 1.8, .008, .10, curbWhite);
  for (let x = -13; x < 43; x += 1.05) {
    if (x < 2.0 || x > 31.4) box(x, .04, D + .85, 1.02, .20, .28, Math.round(x / 1.05) % 2 ? curbWhite : curbRed, .035);
    box(x, .04, lowerRoad.maxZ + .15, 1.02, .20, .28, pale, .035);
  }
  box(W / 2, -.035, D + .45, 7.0, .07, 1.4, floor);
  box(W * 1.5, -.035, D + .45, 7.0, .07, 1.4, floor);
  arrow(W / 2, D + .8);
  box(16, -.09, D + 9, 3.2, .07, 11, paving);
  // The narrow west alley previously exposed plain foundation in the play view.
  box(-6.6, -.055, 5.1, 1.3, .08, 13, paving);
  for (let z = -1.0; z < 11.5; z += .9) box(-6.6, -.01, z, 1.3, .008, .012, seam);
  for (let x = -1.5; x < W * 3 + 2; x += .9) {
    box(x, .012, D + 1.1, .009, .008, 1.8, seam);
  }
  for (const z of [2.0, 9.0]) drain(W * 3 + 1.15, z, 1.65);
  // Drainpipes, red side trim and masonry on the two exposed ends.
  for (const x of [W * 3 + .19]) {
    pipe([x, .16, D - .3], [x, 3.5, D - .3], .07, steel);
    for (const z of [1.6, 5.4, 8.4]) {
      box(x, 1.75, z, .08, 3.5, .22, red);
      for (let y = .3; y < 3.3; y += .55) add(new T.SphereGeometry(.035, 6, 4), bolt, x + (x < 0 ? -.047 : .047), y, z);
    }
  }
  // Neighbouring stucco roofs frame the garage, as in the reference foreground.
  const terracotta = mat("#ad5333", .92), glass = mat("#42636c", .25, .35);
  function neighbour(x: number, z: number, w: number, d: number, h: number) {
    box(x, h / 2 - .1, z, w, h, d, wall);
    box(x, h - .05, z, w - .2, .18, d - .2, paving);
    for (const side of [-1, 1]) {
      box(x + side * (w / 2 - .10), h + .12, z, .20, .38, d, pale, .025);
      box(x, h + .12, z + side * (d / 2 - .10), w, .38, .20, pale, .025);
      box(x, h + .31, z + side * (d / 2 - .10), w + .08, .06, .27, curbWhite, .02);
    }
    for (let px = x - w / 2 + .55; px < x + w / 2 - .4; px += 1.7) {
      box(px, h * .55, z - d / 2 - .025, 1.0, 1.18, .09, dark);
      box(px, h * .55, z - d / 2 - .08, .85, 1.04, .03, glass);
      box(px, h * .55 + .65, z - d / 2 - .24, 1.28, .12, .60, terracotta, .03);
      box(px, h * .55 - .65, z - d / 2 - .11, 1.15, .09, .22, pale, .02);
    }
    box(x + w * .22, h + .35, z + .4, 1.3, .52, 1.35, steel, .04);
    box(x + w * .22, h + .63, z + .4, 1.38, .06, 1.43, dark, .025);
    for (let pz = z - .15; pz < z + .98; pz += .11) box(x + w * .22, h + .68, pz, 1.15, .025, .035, bolt);
    pipe([x + w * .22, h + .15, z + 1.1], [x + w / 2 - .25, h + .15, z + 1.1], .045);
  }
  neighbour(3, D + 10.8, 10.6, 7.4, 2.1);
  neighbour(29.2, D + 10.8, 11.8, 7.4, 2.2);
  neighbour(-10.2, 5, 5, 12, 3.7);
  neighbour(W * 3 + 8.3, 8.1, 5.4, 12.5, 3.8);
  // Continue the coastal block beyond the original camera crop.
  neighbour(-30, 5.3, 11, 12, 4.1);
  neighbour(-30.8, 22, 12.4, 10, 3.4);
  neighbour(-45, 7, 9.6, 16, 4.8);
  neighbour(-30, -18.8, 13, 12, 4.5);
  neighbour(-3, -21, 12, 11, 4.2);
  neighbour(14.8, -23, 12.8, 10, 5.1);
  neighbour(33, -22.5, 11, 12, 3.9);
  neighbour(2, 44.5, 12, 10, 4.4);
  neighbour(28.5, 44, 13, 10, 3.6);
  // A connected side street and a rear service road frame the larger district.
  box(-18, -.12, 5, 6, .15, 94, road);
  box(-6, -.12, 34, 100, .15, 6, road);
  for (let z = -40; z < 50; z += 4) {
    if (Math.abs(z + 5.3) < 4 || Math.abs(z - 34) < 4 || Math.abs(z - D - 4) < 4) continue;
    box(-18, -.035, z, .1, .008, 1.8, curbWhite);
  }
  for (let x = -53; x < 43; x += 4) {
    if (Math.abs(x + 18) > 4) box(x, -.035, 34, 1.8, .008, .1, curbWhite);
  }
  for (let z = -36; z < 48; z += 1.5) {
    if (Math.abs(z + 5.3) < 4 || Math.abs(z - 34) < 4 || Math.abs(z - D - 4) < 4) continue;
    for (const x of [-21.2, -14.8]) box(x, .02, z, .28, .18, 1.48, pale, .035);
  }
  for (const x of [-22.4, -13.6]) for (const [from, to] of [[-32, -8.6], [-2, D + .7], [D + 7.3, 30.8], [37.3, 52]]) box(x, -.06, (from + to) / 2, 1.7, .12, to - from, paving);
  for (const z of [29.7, 38.2]) box(13.9, -.06, z, 57.2, .12, 1.9, paving);
  for (let x = -54; x < 43; x += 1.5) {
    if (x > -21.4 && x < -14.6) continue;
    for (const z of [30.9, 37.1]) box(x, .02, z, 1.48, .18, .28, pale, .035);
  }
  for (let x = -13; x < 41; x += 1.2) {
    for (const z of [29.7, 38.2]) box(x, .008, z, .012, .008, 1.9, seam);
  }
  for (const z of [-9.7, -.9, 29.7, 38.1]) {
    for (let x = -20.6; x < -15.1; x += .8) box(x, -.027, z, .42, .012, 2.0, curbWhite);
  }
  // Rear service parking: worn lines, wheel stops and a clear central passage.
  box(5.4, -.10, 26.6, 14, .10, 3.5, road);
  box(28.3, -.10, 26.6, 15.4, .10, 3.5, road);
  for (const start of [-1.2, 21.1]) for (let i = 0; i < 6; i++) {
    box(start + i * 2.4, -.042, 26.6, .065, .012, 3.15, curbWhite);
    if (i < 5) box(start + i * 2.4 + 1.2, .03, 25.1, 1.25, .16, .18, pale, .035);
  }
  // Chain-link boundary: crossed wire, rails and capped posts.
  function fence(x: number, z: number, length: number, alongX: boolean) {
    const at = (t: number, y: number) => [x + (alongX ? t : 0), y, z + (alongX ? 0 : t)];
    for (let t = 0; t <= length; t += 2) {
      pipe(at(t, .1), at(t, 1.33), .035, dark);
      const p = at(t, 1.36); add(new T.SphereGeometry(.055, 6, 4), bolt, p[0], p[1], p[2]);
    }
    pipe(at(0, 1.28), at(length, 1.28), .033, steel);
    pipe(at(0, .22), at(length, .22), .027, steel);
    for (let t = 0; t < length - .5; t += .24) {
      pipe(at(t, .24), at(t + .45, 1.24), .008, steel, 4);
      pipe(at(t, 1.24), at(t + .45, .24), .008, steel, 4);
    }
  }
  fence(-6.0, -.8, D + 1.6, false);
  fence(W * 3 + 2.25, -.8, D + 1.6, false);
  fence(-5, -10.9, W * 3 + 10, true);
  // Street lamps, kerb drains and service covers.
  for (const x of [-45, -28, -4.8, 11.5, 27.8, 37]) {
    box(x, .04, -8.95, .42, .12, .42, steel, .04);
    pipe([x, .08, -8.95], [x, 4.8, -8.95], .065, dark);
    pipe([x, 4.8, -8.95], [x, 4.8, -7.75], .055, dark);
    box(x, 4.73, -7.74, .40, .15, .76, dark, .10);
    box(x, 4.64, -7.74, .31, .025, .63, glow, .025);
    drain(x + 1.1, -2.35, .8);
  }
  for (const [x, z] of [[-1.2, -1], [15, -1.2], [33.3, 5.8]]) {
    box(x, .022, z, .50, .03, .60, steel, .02);
    for (let d = -.23; d < .24; d += .07) box(x + d, .04, z, .012, .01, .5, dark);
  }
  // Landscaped margins in the same coastal palette, built from curved leaves.
  const rng = random(221);
  function leaf(length: number, width: number, bend: number) {
    const positions: number[] = [], indices: number[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6, w = Math.sin(Math.PI * t) * width;
      for (const side of [-1, 0, 1]) positions.push(side * w, Math.sin(t * Math.PI * .9) * bend - (side === 0 ? 0 : .045), t * length);
      if (i < 6) { const a = i * 3; indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
    }
    const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals(); return g;
  }
  greens.forEach(m => { m.side = T.DoubleSide; });
  function palm(x: number, z: number, h: number, size: number) {
    pipe([x, 0, z], [x + .15, h, z - .05], .12, trunk, 9);
    for (let y = .2; y < h; y += .19) add(new T.TorusGeometry(.125, .016, 4, 9), soil, x + y / h * .15, y, z - y / h * .05, new T.Euler(Math.PI / 2, 0, 0));
    for (let n = 0; n < 11; n++) {
      const angle = n * Math.PI * 2 / 11 + rng() * .2;
      const length = size * (.8 + rng() * .35), rise = n % 3 === 0 ? .85 : .48;
      const points: T.Vector3[] = [];
      for (let j = 0; j <= 16; j++) {
        const t = j / 16;
        points.push(new T.Vector3(Math.sin(angle) * length * t, Math.sin(t * Math.PI) * rise - t * t * .45, Math.cos(angle) * length * t));
      }
      add(new T.TubeGeometry(new T.CatmullRomCurve3(points), 16, .019, 5, false), greens[2], x + .15, h, z - .05);
      for (let j = 2; j < 16; j++) {
        const t = j / 16, p = points[j], l = length * .36 * Math.sin(Math.PI * t) + .10;
        for (const side of [-1, 1]) {
          const g = leaf(l, .065, .10);
          add(g, greens[(n + j) % 4], x + .15 + p.x, h + p.y, z - .05 + p.z, new T.Euler(.25 + t * .35, angle + side * .95, 0));
        }
      }
    }
  }
  function bed(x: number, z: number, w: number, d: number) {
    box(x, .1, z, w, .2, d, pale, .06);
    box(x, .22, z, w - .16, .05, d - .16, soil);
    for (let i = 0; i < w * d * 3; i++) {
      const px = x + (rng() - .5) * (w - .4), pz = z + (rng() - .5) * (d - .4);
      const height = .33 + rng() * .35;
      const g = new T.IcosahedronGeometry(.24 + rng() * .15, 0); g.scale(1, .8, 1);
      add(g, greens[i % 2], px, height, pz);
      for (let l = 0; l < 8; l++) {
        const a = l * Math.PI / 4 + rng() * .3;
        add(leaf(.27 + rng() * .28, .08, .09), greens[(l + i) % 4], px, height + .12, pz, new T.Euler(-.35 + rng() * .7, a, .12));
      }
      if (i % 5 === 0) {
        for (let l = 0; l < 4; l++) add(new T.SphereGeometry(.045, 5, 4), yellow, px + Math.sin(l * 1.5) * .09, height + .22, pz + Math.cos(l * 1.5) * .09);
      }
    }
  }
  bed(-6.7, 4.5, .7, 10); bed(W * 3 + 3.15, 3.6, 1.65, 12.5);
  bed(-3, .62, 3.9, .7); bed(-3, D - .62, 3.9, .7);
  for(let bay=1;bay<3;bay++) {
    bed(bay*W+.55,D+.40,.8,.65);bed((bay+1)*W-.55,D+.40,.8,.65);
  }
  bed(W * 1.5, -10.2, W * 3 + 12, 2);
  bed(-13.3, 3.4, 1.0, 13); bed(-24.1, 10, 1.4, 27);
  bed(-6, -13.5, 17, 1.8); bed(15, -14.5, 17, 1.8); bed(34, -14.5, 11, 1.8);
  bed(16.1, 23, 3.2, 7.5); bed(16, 42.8, 7.8, 7);
  bed(41.8, 26.5, 1.5, 22);
  bed(-38, 8, 1.5, 24); bed(-30.5, 29, 13.5, 1.3);
  bed(-45, 17, 10, 1.4); bed(-31, -10.9, 14, 1.4);
  bed(-1, -13.2, 3, 2); bed(28, -13, 2.8, 2);
  for (const [x, z, h, size] of [
    [-6.7, .5, 4.2, 1.8], [-6.7, 8, 3.7, 1.7], [1, -10.2, 4.4, 2.3],
    [15, -10.2, 4.5, 2.6], [29, -10.2, 4.1, 2.3], [W * 3 + 3.1, .5, 4.3, 2.3],
    [W * 3 + 3.1, 9, 3.6, 2.2], [-13.2, 1, 4.9, 2.0], [-13.2, 22, 4.4, 2.1], [-24, 8, 5.0, 2.6],
    [-6, -13.5, 4.7, 2.5], [19, -14.5, 5.0, 2.6], [37, -14.5, 4.6, 2.4],
    [16, 22.3, 4.5, 2.7], [16, 42, 5.0, 3], [41.8, 24, 4.7, 2.6],
  ]) palm(x, z, h, size);
  // Small public garden and a stone promenade alongside the water.
  const benchWood = mat("#916641", .8);
  for (const [x, z] of [[12, 39.6], [20, 39.6], [-11.4, 19]]) {
    for (let i = 0; i < 4; i++) box(x, .55, z + (i - 1.5) * .14, 1.9, .09, .12, benchWood, .025);
    for (const dx of [-.65, .65]) { pipe([x + dx, .05, z], [x + dx, .53, z], .045, dark); pipe([x + dx, .55, z + .28], [x + dx, 1.05, z + .28], .035, dark); }
    for (const y of [.80, 1.02]) box(x, y, z + .28, 1.9, .15, .08, benchWood, .02);
  }
  box(43, -.04, 3, 1.8, .14, 110, paving);
  fence(43.7, -40, 91, false);
  // Coastal edge visible to the right of the district, with actual irregular rocks.
  const sea = mat("#2198ac", .32, .06), foam = mat("#b5e9df", .7);
  const coastalStone = ["#9b9a83", "#aca58b", "#b9b198"].map(c => { const m = mat(c); m.flatShading = true; return m; });
  const water = new T.PlaneGeometry(58, 124, 36, 60); water.rotateX(-Math.PI / 2);
  const vertices = water.getAttribute("position");
  for (let i = 0; i < vertices.count; i++) vertices.setY(i, Math.sin(vertices.getX(i) * 2.3 + vertices.getZ(i)) * .025);
  water.computeVertexNormals(); add(water, sea, 73, -.22, 2);
  for (let z = -56; z < 60; z += .7) {
    const rock = new T.IcosahedronGeometry(.42 + rng() * .4, 1); rock.scale(1.4, .6, 1.1);
    add(rock, coastalStone[Math.floor(rng() * 3)], 44 + rng() * .5, -.08, z, new T.Euler(rng() * .3, rng() * Math.PI, rng() * .3));
    const points = [0, .4, .8, 1.2].map((v, i) => new T.Vector3(45.0 + Math.sin(z + i) * .17 + v * .3, -.15, z + v));
    add(new T.TubeGeometry(new T.CatmullRomCurve3(points), 6, .015, 4, false), foam, 0, 0, 0);
  }
  // Batch static pieces by material: thousands of authored parts, few draw calls.
  for (const [target, batch] of batches) for (const [material, parts] of batch) {
    const merged = mergeGeometries(parts.map(g => { const n = g.index ? g.toNonIndexed() : g; if (!n.getAttribute("uv")) n.setAttribute("uv", new T.Float32BufferAttribute(new Float32Array(n.getAttribute("position").count * 2), 2)); return n; }));
    if (!merged) throw new Error("Garage geometry could not be assembled");
    parts.forEach(g => g.dispose());
    geometries.push(merged);
    const mesh = new T.Mesh(merged, material); mesh.castShadow = material !== glow; mesh.receiveShadow = true;
    mesh.name = `${target.name}_Part_${target.children.length}`;
    target.add(mesh);
  }
  root.userData.reference = "garage-interior-v4";
  root.userData.playableBays = 1;
  root.userData.completedInteriors = 3;
  root.userData.version = 4;
  root.userData.fullFrontWall = false;
  root.userData.openServicePost = true;
  root.userData.serviceDirection = "south-to-north";
  root.userData.districtBounds = { minX: -56, maxX: 102, minZ: -56, maxZ: 60 };
  root.userData.worldScale = WORLD_SCALE;
  return { root, roofs, setFacade(whole: boolean) { fullFront.visible = whole; cutFront.visible = !whole; },
    setTeamBayOpen(open: boolean) { teamDoor.visible = !open; roofs[0].visible = !open; root.userData.playableBays = open ? 2 : 1; },
    setPerformanceOpen(open:boolean) { performanceDoor.visible=!open;roofs[1].visible=!open;
      for(const gate of [performanceNorth,performanceSouth]) {gate.scale.y=open?.02:1;gate.position.y=open?3.16:0;}
    },
    setTeamGates(north: number, south: number) {
      for (const [gate, value] of [[teamNorthGate, north], [teamSouthGate, south]] as const) {
        gate.scale.y = 1 - value * .98; gate.position.y = value * 3.16;
      }
    },
    dispose() { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); root.removeFromParent(); } };
}
