import * as T from "three";
import { CarMesh, type V3 } from "./car-mesh";
import { createWorkshopWheel } from "./workshop-wheel";
import { createVehicleContactShadow } from "./workshop-surfaces";
import { MODELS, parseFleetId, type FleetId, type ModelSpec } from "./fleet-catalogue";

const mix = T.MathUtils.lerp;
const clamp = T.MathUtils.clamp;
const section = (points: number[][], z: number, column: number) => {
  for (let i = 1; i < points.length; i++) if (z <= points[i][0]) {
    const a = points[i - 1], b = points[i]; return mix(a[column], b[column], clamp((z - a[0]) / (b[0] - a[0]), 0, 1));
  }
  return points[points.length - 1][column];
};

/** Authored, full-volume vehicles. All measurements are metres; forward is -Z. */
export class FleetCar {
  readonly root: T.Group;
  readonly wheels: T.Group[] = [];
  readonly frontPivots: T.Group[] = [];
  readonly spec: ModelSpec;
  readonly footprint: { halfWidth: number; halfLength: number; frontAxle: number };
  private mesh = new CarMesh();
  private brake: T.MeshPhysicalMaterial;
  private indicator: T.MeshPhysicalMaterial;
  private serviceHood?: T.Group;
  private hoodOpen = 0;
  private serviceContacts = new Map<string, T.Vector3>();
  private replacementWheels = new Map<string, { mesh: CarMesh; original: T.Group }>();
  private restorationPaint: T.MeshPhysicalMaterial;
  private restorationAccent: T.MeshPhysicalMaterial;
  private restorationLens: T.MeshPhysicalMaterial;
  private serviceLenses = new Map<string, {material:T.MeshPhysicalMaterial; clean:number; front:boolean}>();
  private contactShadow: ReturnType<typeof createVehicleContactShadow>;
  constructor(readonly id: FleetId = "rustback:standard", readonly scale = 1) {
    const parsed = parseFleetId(id); if (!parsed) throw new Error(`Unknown fleet model: ${id}`);
    const s = MODELS[parsed.model], upgraded = parsed.variant === "upgraded", b = this.mesh;
    this.spec = s; this.root = b.root; this.root.name = `Pitlane_${s.name.replaceAll(" ", "_")}_${parsed.variant}`;
    const hatch = s.kind === "rustback", coupe = s.kind === "club-coupe", gt = s.kind === "track-gt";
    const endurance = s.kind === "enduro", proto = s.kind === "prototype", race = endurance || proto;
    const l = s.length / 2, w = s.width / 2, r = s.wheelRadius, axles = [s.frontAxle, s.rearAxle];
    const paint = b.material(s.paint, .28, .28, true), accent = b.material(s.accent, .48, .10);
    this.restorationPaint = paint; this.restorationAccent = accent;
    paint.name = "Enamel_coachwork"; accent.name = "Livery";
    const black = b.material("#141b20", .47, .12), seam = b.material("#182023", .65, .05), rubber = b.material("#24272b", .89, 0);
    const metal = b.material("#a5adae", .25, .83), darkMetal = b.material("#3b4248", .33, .73), copper = b.material("#ad7440", .3, .65);
    const red = b.material("#b53124", .44, .13), ivory = b.material("#eee5cf", .34, .1);
    const glass = b.material("#526975", .16, .08); glass.transparent = true; glass.opacity = .67; glass.depthWrite = false; glass.name = "Tinted_glazing";
    glass.clearcoat = .8; glass.clearcoatRoughness = .12;
    const lens = b.material("#e4ebdf", .19, .15); lens.emissive.set("#c9d9c9"); lens.emissiveIntensity = .12;
    this.restorationLens = lens;
    const amber = b.material("#c8771d", .26, .12);
    this.brake = b.material("#8e181b", .25, .14); this.brake.emissive.set("#fa2414"); this.brake.emissiveIntensity = .14;
    this.indicator = b.material("#e59027", .23, .13); this.indicator.emissive.set("#ff9418");
    const archR = r + (upgraded ? .065 : .052), wheelX = w - .075;

    // Longitudinal profiles differ by body family and individual chassis.
    const noseHeight = hatch ? (s.design === 1 ? .72 : .68) : coupe ? (s.design === 2 ? .53 : .59) : gt ? (s.design === 1 ? .57 : .47) : endurance && s.design === 2 ? .51 : .39;
    for (const side of [-1, 1]) {
      const end = side < 0 ? "left" : "right";
      this.serviceContacts.set("front-" + end, new T.Vector3(side * (s.design === 1 ? .58 : w * .64), noseHeight - (s.design === 1 ? .14 : .074), -l - .085));
      this.serviceContacts.set("rear-" + end, new T.Vector3(side * w * .68, s.belt - .18, l + .055));
      this.serviceContacts.set("wheel-" + end, new T.Vector3(side * (wheelX + .10), r, s.frontAxle));
    }
    this.serviceContacts.set("engine", new T.Vector3(-w * .72, s.belt - .06, -l + .72));
    const samples = [
      [-l, w * (proto ? .75 : gt ? (s.design === 2 ? .76 : .82) : endurance && s.design === 1 ? .69 : endurance && s.design === 2 ? .97 : .88), noseHeight],
      [-l + .16, w * .97, noseHeight + .06],
      [s.frontAxle, w, s.belt - .02],
      [s.cabinFront, w * (race ? .91 : .97), s.belt],
      [.30, w * (proto ? .86 : .97), s.belt],
      [s.rearAxle, w, s.belt + .015],
      [l - .18, w * .98, s.belt - (race ? .16 : .07)],
      [l, w * (endurance && s.design === 1 ? .78 : .9), s.belt - (race ? .22 : .14)],
    ].sort((a, c) => a[0] - c[0]);
    const baseWidth = proto ? .50 : race ? .67 : w * .87;
    const cabinWidth = (z: number) => mix(baseWidth, baseWidth * .97, clamp((z - s.cabinFront) / (s.cabinRear - s.cabinFront), 0, 1));
    const widthAt = (z: number) => proto
      ? section([[-l, .13], [s.cabinFront, baseWidth + .04], [s.cabinRear, baseWidth + .025], [l, .35]], z, 1)
      : section(samples, z, 1);
    const topAt = (x: number, z: number) => {
      const f = Math.abs(x / widthAt(z));
      if (proto) return s.belt + .025 * Math.exp(-((z / 1.5) ** 2)) - .045 * f ** 4 - .12 * clamp((-z - 1.2) / (l - 1.2), 0, 1);
      const arch = Math.max(...axles.map(a => Math.exp(-Math.pow((z - a) / .65, 2))));
      const shoulder = Math.exp(-Math.pow((f - .81) * 6, 2));
      const y = section(samples, z, 2) + shoulder * (race ? (s.design === 2 ? .12 : .18) : gt ? .11 : coupe && s.design === 2 ? .08 : .035) * arch - .065 * Math.pow(f, 8);
      const crown = Math.max(...axles.map(a => Math.abs(z - a) < archR ? r + Math.sqrt(archR ** 2 - (z - a) ** 2) + .025 : 0));
      return y + Math.max(0, crown - y) * T.MathUtils.smoothstep(f, .55, .94);
    };
    const sideAt = (z: number, y: number) => {
      let low = race ? .19 : .23;
      for (const a of axles) if (Math.abs(z - a) < archR) low = Math.max(low, r + Math.sqrt(archR ** 2 - (z - a) ** 2));
      const x = widthAt(z), top = topAt(x, z);
      const v = clamp((y - Math.min(low, top - .006)) / Math.max(.006, top - low), 0, 1);
      return x - .025 * Math.sin(v * Math.PI);
    };
    const stripe = (x: number, width: number, z0: number, z1: number, m: T.Material) => {
      b.surface((u, v) => { const z = mix(z0, z1, u), xx = x + (v - .5) * width; return [xx, topAt(xx, z) + .009, z]; }, m, 30, 2);
    };
    if (!proto) {
      // Exact shared edges around the cabin opening; no grid-cell cut-out.
      for (const [z0, z1] of [[-l, s.cabinFront], [s.cabinRear, l]]) {
        if (hatch && z0 === -l) {
          // Real opening: the lifting hood replaces this surface, rather than
          // overlaying a second panel above a solid bonnet.
          const front = -l + .20, rear = s.cabinFront - .04, hw = w * .65;
          for (const [a, c] of [[z0, front], [rear, z1]])
            b.surface((u, v) => { const z = mix(a, c, u), x = (v * 2 - 1) * widthAt(z); return [x, topAt(x, z), z]; }, paint, 8, 24);
          for (const side of [-1, 1])
            b.surface((u, v) => { const z = mix(front, rear, u), x = side * mix(hw, widthAt(z), v); return [x, topAt(x, z), z]; }, paint, 24, 8);
          const pivot = new T.Group(), hingeY = topAt(0, rear);
          pivot.name = "ServiceHood"; pivot.position.set(0, hingeY, rear); this.root.add(pivot); this.serviceHood = pivot;
          b.surface((u, v) => { const z = mix(front, rear, u), x = (v * 2 - 1) * hw; return [x, topAt(x, z) - hingeY, z - rear]; }, paint, 24, 20, pivot);
          b.surface((u, v) => { const z = mix(front, rear, u), x = (v * 2 - 1) * hw; return [x, topAt(x, z) - hingeY - .025, z - rear]; }, black, 24, 20, pivot);
          for (const side of [-1, 1]) b.line(Array.from({ length: 16 }, (_, i): V3 => {
            const z = mix(front, rear, i / 15), x = side * hw; return [x, topAt(x, z) - hingeY + .006, z - rear];
          }), .005, seam, pivot);
          const middle = (front + rear) / 2;
          b.box([0, .49, middle], [hw * 1.98, .07, rear - front], black, .03);
          b.box([0, .64, middle], [.55, .22, .46], darkMetal, .04);
          b.box([0, .77, middle], [.48, .05, .40], metal, .02);
          for (let i = -2; i <= 2; i++) b.box([i * .075, .81, middle], [.023, .025, .35], darkMetal, .005);
          b.box([-.38, .65, middle], [.17, .22, .30], black, .02);
          b.box([-.38, .78, middle], [.14, .03, .26], red, .008);
          b.cylinder([.36, .67, middle], .10, .17, ivory, "y", undefined, 16);
          b.line([[.22, .66, middle - .17], [.39, .67, front + .10], [.05, .61, front + .08]], .025, rubber);
        } else b.surface((u, v) => { const z = mix(z0, z1, u), x = (v * 2 - 1) * widthAt(z); return [x, topAt(x, z), z]; }, paint, 48, 32);
      }
      for (const side of [-1, 1])
        b.surface((u, v) => { const z = mix(s.cabinFront, s.cabinRear, u), x = side * mix(cabinWidth(z), widthAt(z), v); return [x, topAt(x, z), z]; }, paint, 64, 8);
      for (const side of [-1, 1]) {
        // Lower shell has true arch cut-outs; tyre openings are not painted circles.
        b.surface((u, v) => {
          const z = mix(-l, l, u), x = widthAt(z);
          let low = race ? .19 : .23;
          for (const a of axles) if (Math.abs(z - a) < archR) low = Math.max(low, r + Math.sqrt(archR * archR - (z - a) ** 2));
          const top = topAt(x, z), y = mix(Math.min(low, top - .006), top, v);
          return [side * (x - .025 * Math.sin(v * Math.PI)), y, z];
        }, paint, 160, 3, undefined, side > 0);
        for (const a of axles) {
          b.line(Array.from({ length: 33 }, (_, i): V3 => {
            const angle = i / 32 * Math.PI, z = a + Math.cos(angle) * archR;
            return [side * (widthAt(z) + .006), r + Math.sin(angle) * archR, z];
          }), upgraded || race ? .021 : .013, hatch ? black : paint);
        }
        // Sculpted sills and an inset door with continuous panel gaps.
        const sillZ0 = s.frontAxle + archR + .035, sillZ1 = s.rearAxle - archR - .035;
        b.box([side * (w - .025), .215, (sillZ0 + sillZ1) / 2], [.09, upgraded ? .15 : .095, sillZ1 - sillZ0], race ? accent : upgraded ? black : paint, .025);
        if (!race) {
          const z0 = s.cabinFront + .03, z1 = s.roofRear + (hatch ? .09 : .18);
          const door = [[z0, s.belt - .015], [z0 + .04, .47], [z0 + .17, .35], [z1 - .10, .35], [z1, .56], [z1, s.belt - .01]];
          const seamPoints: V3[] = [];
          for (let i = 1; i < door.length; i++) for (let j = 0; j <= 8; j++) {
            const z = mix(door[i - 1][0], door[i][0], j / 8), y = mix(door[i - 1][1], door[i][1], j / 8);
            seamPoints.push([side * (sideAt(z, y) + .003), y, z]);
          }
          b.line(seamPoints, .004, seam, undefined, false);
          const handleX = sideAt(z1 - .13, s.belt - .09);
          b.box([side * (handleX + .008), s.belt - .09, z1 - .13], [.025, .038, .16], black, .012);
          b.box([side * (handleX + .022), s.belt - .083, z1 - .13], [.006, .013, .11], metal, .003);
        }
        if (hatch || coupe) {
          // Ivory stripe sits on the actual skin, with a narrow lower pinstripe.
          for (const [y, height, m] of [[s.belt - .11, .105, accent], [s.belt - .19, .016, accent], [.36, .055, black]] as [number, number, T.Material][]) {
            b.surface((u, v) => { const z = mix(-l + .10, l - .08, u); let yy = y + (v - .5) * height;
              for (const a of axles) if (Math.abs(z - a) < archR) yy = Math.max(yy, r + Math.sqrt(archR ** 2 - (z - a) ** 2) + .008);
              yy = Math.min(yy, topAt(widthAt(z), z) - .003);
              return [side * (sideAt(z, yy) + .003), yy, z]; }, m, 120, 2);
          }
        }
        if (gt || race) {
          const vent = [[.39, s.rearAxle - .60], [s.belt - .06, s.rearAxle - .48], [s.belt - .08, s.rearAxle - .13], [.35, s.rearAxle - .26]];
          b.panel(vent.map(([y, z]): V3 => [side * (sideAt(z, y) + .005), y, z]), black);
          for (let i = 0; i < 3; i++) { const y = .44 + i * .062, z = s.rearAxle - .36; b.box([side * (sideAt(z, y) + .009), y, z], [.018, .014, .23], darkMetal, .003); }
        }
      }
      // End faces, undertray, bumpers and diffuser.
      for (const end of [-1, 1]) {
        const z = end * l, ww = widthAt(z);
        b.surface((u, v) => { const x = mix(-ww, ww, u); return [x, mix(.23, topAt(x, z), v), z]; }, paint, 24, 3);
      }
      b.box([0, .19, 0], [s.width - .25, .08, s.length - .15], black, .035);
      if (hatch || coupe) for (const end of [-1, 1]) {
        b.box([0, .35, end * (l + .012)], [s.width * .96, .15, .12], black, .04);
        b.box([0, .32, end * (l + .077)], [s.width * .91, .022, .012], hatch ? red : accent, .005);
      } else {
        b.box([0, .19, -l - .025], [s.width * .97, .055, .27], black, .03);
        b.box([0, .22, l - .045], [s.width * .85, .16, .19], black, .025);
        for (let i = -3; i <= 3; i++) b.box([i * .18, .16, l - .02], [.018, .14, .32], darkMetal, .003, [-.20, 0, 0]);
      }
      if (gt && s.design === 0) { stripe(0, .35, -l + .03, s.cabinFront, black); stripe(0, .35, s.cabinRear, l, black); for (const side of [-1, 1]) { stripe(side * .195, .024, -l + .03, s.cabinFront, ivory); stripe(side * .195, .024, s.cabinRear, l, ivory); } }
      if (gt && s.design === 1) for (const side of [-1, 1]) { stripe(side * .22, .12, -l + .03, s.cabinFront, accent); stripe(side * .22, .12, s.cabinRear, l, accent); }
      if (endurance) {
        if (s.design === 0) { stripe(-.12, .15, -l + .025, s.cabinFront, red); stripe(.12, .15, -l + .025, s.cabinFront, red); }
        else stripe(0, s.design === 1 ? .35 : .52, -l + .025, s.cabinFront, accent);
        stripe(0, s.design === 0 ? .22 : .35, s.cabinRear, l, s.design === 0 ? red : accent);
        b.box([0, .30, -l - .014], [s.width * .94, .21, .10], accent, .035);
        for (const side of [-1, 1]) b.box([side * (w - .03), .26, .40], [.11, .15, 1.60], accent, .035);
      }
      // Hood seam follows the coachwork instead of floating flat over it.
      const hoodHalf = race ? .48 : w * .65;
      if (!hatch) for (const side of [-1, 1]) b.line(Array.from({ length: 16 }, (_, i): V3 => { const z = mix(-l + .20, s.cabinFront - .04, i / 15), x = side * hoodHalf; return [x, topAt(x, z) + .008, z]; }), .005, seam);
    } else {
      this.prototypeBody(b, s, upgraded, paint, accent, black, copper, widthAt, topAt, cabinWidth);
    }

    // Cabin proportions and glass are defined independently for every chassis.
    const roofY = (x: number, z: number) => s.height - (race ? .10 : gt ? .065 : .045) * (x / s.roofWidth) ** 2 - (race ? .055 : .018) * ((z - (s.roofFront + s.roofRear) / 2) / (s.roofRear - s.roofFront)) ** 2;
    const windshield = (u: number, v: number): V3 => {
      const x = (v * 2 - 1) * mix(baseWidth, s.roofWidth, u), z = mix(s.cabinFront, s.roofFront, u);
      return [x, mix(topAt((v * 2 - 1) * baseWidth, s.cabinFront), roofY((v * 2 - 1) * s.roofWidth, s.roofFront), u) + (race ? .055 : .023) * Math.sin(u * Math.PI), z];
    };
    const rearGlass = (u: number, v: number): V3 => {
      const x = (v * 2 - 1) * mix(s.roofWidth, baseWidth * .97, u), z = mix(s.roofRear, s.cabinRear, u);
      return [x, mix(roofY((v * 2 - 1) * s.roofWidth, s.roofRear), topAt((v * 2 - 1) * baseWidth * .97, s.cabinRear), u) + .02 * Math.sin(u * Math.PI), z];
    };
    b.surface(windshield, glass, 12, 16); b.surface(rearGlass, glass, 12, 16);
    const roofMat = gt ? (s.design === 1 ? paint : accent) : hatch && s.design === 1 ? ivory : paint;
    b.surface((u, v) => { const x = (v * 2 - 1) * s.roofWidth, z = mix(s.roofFront, s.roofRear, u); return [x, roofY(x, z), z]; }, roofMat, 16, 16);
    if (gt && s.design === 0 || race) b.surface((u, v) => { const x = (v - .5) * (gt ? .35 : proto ? .17 : s.design === 0 ? .12 : .30), z = mix(s.roofFront, s.roofRear, u); return [x, roofY(x, z) + .007, z]; }, gt ? black : proto || s.design !== 0 ? accent : red, 12, 2);
    for (const fn of [windshield, rearGlass]) {
      for (const edge of [0, 1]) {
        b.line(Array.from({ length: 12 }, (_, i) => fn(edge, i / 11)), .014, black);
        b.line(Array.from({ length: 12 }, (_, i) => fn(i / 11, edge)), .029, paint);
      }
    }
    for (const side of [-1, 1]) {
      // Door shoulders, glazing, pillars and roof use the same boundary curves.
      const sideSkin = (z: number, v: number): V3 => {
        const lower: V3 = [side * cabinWidth(z), topAt(cabinWidth(z), z), z];
        const upper: V3 = z < s.roofFront ? windshield((z - s.cabinFront) / (s.roofFront - s.cabinFront), side < 0 ? 0 : 1)
          : z > s.roofRear ? rearGlass((z - s.roofRear) / (s.cabinRear - s.roofRear), side < 0 ? 0 : 1)
          : [side * s.roofWidth, roofY(s.roofWidth, z), z];
        return [mix(lower[0], upper[0], v), mix(lower[1], upper[1], v), z];
      };
      const pillarZ = mix(s.roofFront, s.roofRear, hatch ? .55 : .72);
      const frontFrame = s.cabinFront + .065, rearFrame = s.cabinRear - (race ? .12 : .16);
      const cuts = [s.cabinFront, frontFrame, s.roofFront, s.roofRear, rearFrame, s.cabinRear, ...(!proto ? [pillarZ - .035, pillarZ + .035] : [])].sort((a, c) => a - c);
      for (let i = 1; i < cuts.length; i++) {
        const z0 = cuts[i - 1], z1 = cuts[i], mid = (z0 + z1) / 2;
        const solid = mid < frontFrame || mid > rearFrame || !proto && Math.abs(mid - pillarZ) < .035;
        for (const [v0, v1, material] of (solid ? [[0, 1, mid > frontFrame && mid < rearFrame ? black : paint]] : [[0, .13, paint], [.13, .91, glass], [.91, 1, paint]]) as [number, number, T.Material][])
          b.surface((u, v) => sideSkin(mix(z0, z1, u), mix(v0, v1, v)), material, Math.max(2, Math.ceil((z1 - z0) * 32)), 4);
      }
      for (const v of [.13, .91]) b.line(Array.from({length: 49}, (_, i) => sideSkin(mix(frontFrame, rearFrame, i / 48), v)), .009, black, undefined, false);
      const mirrorZ = s.cabinFront + .14, mirrorY = s.belt + .16;
      b.line([sideSkin(mirrorZ, .10), [side * (w + .06), mirrorY - .02, mirrorZ]], .018, black, undefined, false);
      b.box([side * (w + .08), mirrorY, mirrorZ], [.18, .10, .20], race ? accent : black, .045);
      b.box([side * (w + .08), mirrorY + .005, mirrorZ + .105], [.13, .065, .008], metal, .017);
    }
    // Real seats, dashboard, steering wheel and cage remain visible through glazing.
    const seatY = race ? .37 : .48, seatZ = mix(s.roofFront, s.roofRear, .65);
    b.box([0, seatY - .13, .05], [baseWidth * 1.85, .08, 1.45], black, .03);
    for (const side of race ? [-1] : [-1, 1]) {
      const x = side * (race ? .12 : .31);
      b.box([x, seatY, seatZ - .12], [.40, .12, .49], black, .055);
      b.box([x, seatY + .22, seatZ + .07], [.38, .43, .13], black, .05, [-.12, 0, 0]);
      b.box([x, seatY + .24, seatZ - .015], [.21, .33, .045], hatch ? red : darkMetal, .02, [-.12, 0, 0]);
      b.box([x, seatY + .48, seatZ + .07], [.22, .13, .13], black, .04);
      if (race || upgraded) for (const dx of [-.07, .07]) b.line([[x + dx, seatY + .42, seatZ - .015], [x + dx, seatY + .1, seatZ - .08], [x + dx, seatY + .07, seatZ - .32]], .015, red);
    }
    b.box([0, s.belt - .015, s.cabinFront + .13], [baseWidth * 1.82, .12, .26], black, .045);
    const steerX = race ? -.12 : -.31, steerZ = s.cabinFront + .34;
    b.add(new T.TorusGeometry(.12, .014, 6, 28), black, [steerX, s.belt + .12, steerZ], [-.32, 0, 0]);
    b.line([[steerX - .10, s.belt + .12, steerZ], [steerX, s.belt + .08, steerZ], [steerX + .10, s.belt + .12, steerZ]], .011, metal, undefined, false);
    if (race || upgraded) b.line([[-baseWidth * .8, seatY, seatZ + .30], [-s.roofWidth * .86, s.height - .08, seatZ + .22], [s.roofWidth * .86, s.height - .08, seatZ + .22], [baseWidth * .8, seatY, seatZ + .30]], .019, metal, undefined, false);
    b.line([[.055, .23], [.15, .44], [.19, .67]].map(([u, v]): V3 => {
      const p = windshield(u, v); return [p[0], p[1] + .009, p[2] - .006];
    }), .009, black, undefined, false);

    // Headlight signatures: rectangular road lamps, distinct round endurance lamps,
    // and vertical slit lamps in the separated prototype pods.
    for (const side of [-1, 1]) {
      const end = side < 0 ? "left" : "right";
      const frontLens = lens.clone(), tailLens = this.brake.clone();
      this.serviceLenses.set("front-" + end, {material:frontLens, clean:1, front:true});
      this.serviceLenses.set("rear-" + end, {material:tailLens, clean:1, front:false});
      if (hatch || coupe) {
        const round = s.design === 2;
        const y = noseHeight - (hatch && s.design === 1 ? .14 : .08), z = -l - .019;
        if (hatch && s.design === 1) {
          b.cylinder([side * .58, y, z], .13, .035, metal, "z"); b.cylinder([side * .58, y, z - .022], .105, .018, frontLens, "z");
        } else if (coupe && s.design === 1) {
          // Raised pop-up lamp housings define the notchback's front silhouette.
          const x = side * .59, zz = -l + .34, yy = topAt(x, zz);
          b.box([x, yy + .095, zz], [.30, .18, .28], paint, .016, [-.15, 0, 0]);
          b.box([x, yy + .13, zz - .151], [.24, .11, .019], black, .01);
          b.box([x, yy + .13, zz - .163], [.205, .077, .01], frontLens, .007);
        } else if (round) {
          for (const offset of [-.085, .085]) {
            b.cylinder([side * w * .65 + offset, y, z], .078, .028, black, "z");
            b.cylinder([side * w * .65 + offset, y, z - .018], .061, .014, frontLens, "z");
          }
        } else {
          b.box([side * w * .65, y, z], [s.design === 1 ? .31 : .27, .145, .06], black, .018);
          b.box([side * w * .64, y + .006, z - .035], [.225, .113, .018], frontLens, .01);
          for (let i = 0; i < 5; i++) b.box([side * w * .64 - .085 + i * .042, y + .006, z - .047], [.004, .097, .003], metal);
        }
        b.box([side * w * .86, y - .015, z], [.10, .11, .07], side > 0 ? this.indicator : amber, .015);
        b.box([side * w * .69, .27, z - .045], [.20, .06, .015], ivory, .01);
      } else if (endurance && s.design === 2) {
        b.box([side * .76, .43, -l - .022], [.39, .12, .06], black, .02);
        for (const dx of [-.085, .085]) b.box([side * .76 + dx, .43, -l - .056], [.14, .08, .014], frontLens, .012);
      } else if (endurance) {
        for (let i = 0; i < (s.design === 1 ? 1 : 2); i++) {
          const x = side * (w * .72 + (i ? .065 : -.08)), z = -l + .20 + i * .12, y = topAt(x, z) + .02;
          b.cylinder([x, y, z], i ? .072 : .105, .045, black, "y");
          b.cylinder([x, y + .028, z], i ? .054 : .086, .015, frontLens, "y");
        }
        const cover = (u: number, v: number): V3 => { const z = mix(-l + .035, -l + .58, u), x = side * (w * .74 + (v - .5) * .31); return [x, topAt(x, z) + .09 * Math.sin(u * Math.PI) + .035, z]; };
        b.surface(cover, glass, 12, 8);
        for (const edge of [0, 1]) for (const cross of [false, true]) {
          b.surface((u, v) => { const p = cross ? cover(edge, u) : cover(u, edge); return [p[0], mix(topAt(p[0], p[2]), p[1], v), p[2]]; }, glass, 12, 2);
          b.line(Array.from({length: 13}, (_, i): V3 => { const p = cross ? cover(edge, i / 12) : cover(i / 12, edge); return [p[0], topAt(p[0], p[2]) + .004, p[2]]; }), .007, black, undefined, false);
        }
      } else {
        const x = side * w * .76, z = -l + (proto ? .28 : .18), y = proto ? this.podTop(x, z, s) + .012 : topAt(x, z) + .012;
        const vertical = proto || gt && s.design === 1;
        b.box([x, y, z], [vertical ? .15 : .34, .045, vertical ? .35 : .14], black, .02, [.15, 0, 0]);
        for (let i = 0; i < (s.design === 2 ? 3 : 2); i++) b.box([x, y + .027, z + (i - .5) * (vertical ? .09 : .04)], [vertical ? .105 : .28, .015, vertical ? .045 : .018], frontLens, .006);
      }
      // Taillamps, exhaust, reflector and tow eye.
      const tailY = proto ? .32 : Math.min(s.belt - .16, topAt(w * .7, l) - (race ? .04 : .075));
      if (hatch && s.design === 1) b.box([side * w * .83, .54, l + .015], [.11, .26, .035], tailLens, .016);
      else if (gt && s.design !== 2 || coupe && s.design === 1) for (const dx of [-.075, .075]) {
        b.cylinder([side * w * .7 + dx, tailY, l + .012], .06, .025, black, "z");
        b.cylinder([side * w * .7 + dx, tailY, l + .028], .043, .012, tailLens, "z");
      } else b.box([side * w * .7, tailY, l + .015], [race ? .28 : .32, race ? .045 : .105, .03], tailLens, .012);
      b.cylinder([side * (race ? .20 : .60), .26, l + .015], race ? .055 : .043, .14, metal, "z");
      b.cylinder([side * (race ? .20 : .60), .26, l + .09], race ? .042 : .031, .005, black, "z");
    }
    if (!proto) {
      b.box([0, noseHeight - .105, -l - .025], [w * (race ? .95 : .85), race ? .13 : .14, .045], black, .013);
      for (let i = 0; i < (race ? 5 : 4); i++) b.box([0, noseHeight - .15 + i * .028, -l - .051], [w * .81, .009, .008], darkMetal);
    }
    if (gt) for (const side of [-1, 1]) {
      b.box([side * w * .66, .32, -l - .035], [.38, .16, .055], black, .035);
      for (let i = 0; i < 4; i++) b.box([side * w * .66 - .12 + i * .08, .32, -l - .067], [.014, .12, .014], darkMetal, .003);
      b.box([side * w * .68, .425, -l - .035], [.37, .035, .06], paint, .012);
    }
    if (gt && s.design === 2) {
      const z = mix(s.cabinRear, l, .5);
      b.box([0, topAt(0, z) + .014, z], [.76, .035, .73], black, .05);
      for (let i = 0; i < 9; i++) b.box([0, topAt(0, z) + .04, z - .30 + i * .075], [.69, .014, .022], darkMetal, .005);
      b.box([0, topAt(0, l) - .06, l + .026], [1.48, .035, .018], this.brake, .008);
      for (const side of [-1, 1]) b.panel([[side * .6, s.height - .15, s.roofRear], [side * .91, s.belt + .03, 1.43], [side * .79, s.belt + .03, 1.51], [side * .56, s.height - .17, s.roofRear]], paint);
    }
    if (gt && s.design === 1) {
      b.box([0, .365, -l - .07], [.82, .23, .04], black, .045);
      for (let i = -3; i <= 3; i++) b.box([i * .10, .36, -l - .095], [.012, .17, .014], darkMetal);
      const z = -1.16; b.box([0, topAt(0, z) + .025, z], [.42, .035, .36], black, .04);
    }
    if (hatch && s.design === 2) {
      for (const side of [-1, 1]) b.cylinder([side * .29, .48, -l - .13], .091, .095, black, "z");
      for (const side of [-1, 1]) b.cylinder([side * .29, .48, -l - .181], .074, .009, ivory, "z");
      b.box([0, topAt(0, -.93) + .04, -.93], [.45, .09, .40], paint, .04);
      b.box([0, topAt(0, -.93) + .04, -1.14], [.34, .045, .008], black, .012);
      for (const side of [-1, 1]) for (const axle of axles) b.line(Array.from({ length: 24 }, (_, i): V3 => { const a = i / 23 * Math.PI; return [side * (w + .022), r + Math.sin(a) * (archR + .012), axle + Math.cos(a) * (archR + .012)]; }), .045, paint);
    }
    if (coupe && s.design === 2) for (const side of [-1, 1]) for (let i = 0; i < 3; i++) b.box([side * (w + .014), s.belt - .15, s.frontAxle + .49 + i * .065], [.018, .13, .032], black, .008, [.20, 0, 0]);
    // Fasteners, fuel cap and slim metallic window trim bring out scale at close range.
    if (!proto) {
      const fuelZ = s.rearAxle + .42, fuelY = Math.max(s.belt - .10, r + .09), fuelX = sideAt(fuelZ, fuelY);
      b.cylinder([fuelX + .004, fuelY, fuelZ], .052, .012, darkMetal, "x");
      b.cylinder([fuelX + .012, fuelY, fuelZ], .038, .006, race ? metal : paint, "x");
    }
    for (const side of [-1, 1]) {
      if (!proto) for (const z of [-l + .23, s.cabinFront - .16]) b.cylinder([side * w * .56, topAt(side * w * .56, z) + .015, z], .015, .009, metal, "y", undefined, 10);
      if (!race) b.line(Array.from({length: 33}, (_, i): V3 => { const z = mix(s.cabinFront, s.cabinRear, i / 32), x = side * cabinWidth(z); return [x, topAt(x, z) + .006, z]; }), .006, metal, undefined, false);
    }
    b.box([0, .38, l + .036], [.28, .085, .012], ivory, .006);
    b.box([0, .38, l + .044], [.20, .012, .004], black);
    b.add(new T.TorusGeometry(.037, .009, 5, 16), red, [w * .37, .23, -l - .08]);
    b.box([w * .37, .23, -l - .025], [.025, .025, .12], darkMetal, .005);

    // Cooling and aero distinguish upgrades without replacing the base silhouette.
    if (upgraded || race || (gt && s.design === 2)) {
      const start = -l + (hatch ? .48 : .43), count = upgraded ? 7 : 4;
      for (const side of [-1, 1]) for (let i = 0; i < count; i++) {
        const z = start + i * .068, x = side * (proto ? w * .79 : race ? w * .72 : w * .50);
        const y = proto ? this.podTop(x, z, s) + .006 : topAt(x, z) + .006;
        b.box([x, y, z], [race ? .22 : .18, .016, .045], black, .006, [-.12, 0, 0]);
        b.box([x, y + .012, z + .016], [race ? .21 : .17, .007, .012], race ? paint : darkMetal);
      }
    }
    if (race) {
      b.box([0, s.height + .015, s.roofRear - .08], [proto ? .15 : .23, .11, .32], proto ? accent : paint, .045);
      b.box([0, s.height + .025, s.roofRear - .245], [proto ? .10 : .17, .058, .009], black, .015);
    }
    const hasWing = upgraded || gt || race || hatch;
    if (hasWing) {
      const wingZ = hatch && !upgraded ? s.roofRear + .06 : l - .20;
      const wingY = hatch && !upgraded ? s.height + .005 : endurance && s.design === 1 ? (upgraded ? 1.04 : .79) : race ? (upgraded ? 1.18 : 1.00) : upgraded ? s.belt + .40 : s.belt + .12;
      const wingW = race ? s.width * .96 : upgraded ? s.width * .85 : s.width * .77;
      for (const side of [-1, 1]) {
        const x = side * wingW * .33;
        const mountY = hatch && !upgraded
          ? rearGlass(clamp((wingZ - s.roofRear) / (s.cabinRear - s.roofRear), 0, 1), (x / s.roofWidth + 1) / 2)[1]
          : proto ? this.podHeight(wingZ, s) - .12 : topAt(x, wingZ);
        const bottom = Math.min(mountY - .025, wingY - .04);
        b.box([x, (wingY + bottom) / 2, wingZ], [hatch && !upgraded ? .055 : .045, wingY - bottom, .16], hatch && !upgraded ? paint : black, .008);
      }
      b.surface((u, v) => { const x = (u - .5) * wingW, z = wingZ + (v - .5) * (race ? .36 : .23); return [x, wingY + .04 * Math.sin(v * Math.PI) - .02 * v, z]; }, upgraded || race ? black : paint, 12, 8);
      b.box([0, wingY - .012, wingZ], [wingW, .023, race ? .36 : .23], upgraded || race ? black : paint, .011);
      if (upgraded || race) for (const side of [-1, 1]) b.box([side * wingW / 2, wingY + .025, wingZ], [.025, upgraded && proto ? .24 : .14, race ? .41 : .27], race ? accent : paint, .018);
    }
    if (upgraded && (gt || race)) for (const side of [-1, 1]) {
      b.panel([[side * (w - .07), .29, -l + .02], [side * (w + .11), .31, -l + .20], [side * (w + .10), .34, -l + .48], [side * (w - .02), .36, -l + .43]], black);
    }
    // Independent steering pivots and rolling wheels. Calipers remain on the axle.
    for (const side of [-1, 1]) for (const axle of axles) {
      const pivot = new T.Group(); pivot.name = `${axle < 0 ? "Front" : "Rear"}_${side < 0 ? "Left" : "Right"}_Steering`;
      pivot.position.set(side * wheelX, r, axle); this.root.add(pivot); if (axle < 0) this.frontPivots.push(pivot);
      const wheel = new T.Group(); wheel.name = `${pivot.name}_Wheel`; pivot.add(wheel); this.wheels.push(wheel);
      const depth = race ? .29 : gt ? .25 : upgraded ? .23 : .19, outside = side * (depth / 2 + .005);
      b.cylinder([0, 0, 0], r * .95, depth * .92, rubber, "x", wheel, 48);
      for (const x of [-depth / 2 + .04, depth / 2 - .04]) b.add(new T.TorusGeometry(r - .049, .05, 8, 48), rubber, [x, 0, 0], [0, Math.PI / 2, 0], wheel);
      const rimMat = upgraded ? (hatch ? copper : darkMetal) : hatch ? ivory : gt || endurance ? copper : metal;
      b.cylinder([outside * .6, 0, 0], r * .67, .028, darkMetal, "x", wheel);
      b.cylinder([outside * .78, 0, 0], r * .60, .016, metal, "x", wheel);
      b.add(new T.TorusGeometry(r * .72, .013, 6, 40), rimMat, [outside, 0, 0], [0, Math.PI / 2, 0], wheel);
      if (hatch && !upgraded) b.cylinder([outside - side * .008, 0, 0], r * .68, .018, ivory, "x", wheel);
      const spokes = hatch && !upgraded ? 8 : gt || endurance ? 12 : proto ? 7 : upgraded ? 6 : 5;
      for (let i = 0; i < spokes; i++) {
        const a = i / spokes * Math.PI * 2, rr = r * .39;
        b.box([outside, Math.cos(a) * rr, Math.sin(a) * rr], [.025, r * .60, hatch && !upgraded ? .057 : .027], rimMat, .007, [a, 0, 0], wheel);
        if (hatch && !upgraded) b.cylinder([outside + side * .014, Math.cos(a) * r * .56, Math.sin(a) * r * .56], .022, .006, black, "x", wheel, 10);
      }
      b.cylinder([outside + side * .008, 0, 0], .061, .028, rimMat, "x", wheel, 20);
      b.cylinder([outside + side * .025, 0, 0], race ? .032 : .021, .011, race ? red : black, "x", wheel, 6);
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; b.cylinder([outside + side * .024, .043 * Math.cos(a), .043 * Math.sin(a)], .007, .01, metal, "x", wheel, 6); }
      b.box([side * depth * .27, -.055, -.14], [.055, .15, .06], red, .018, [0, 0, 0], pivot);
      for (let i = 0; i < 40; i++) {
        const a = i / 40 * Math.PI * 2;
        b.box([0, Math.cos(a) * (r - .004), Math.sin(a) * (r - .004)], [depth * .70, .006, .009], black, 0, [a, 0, 0], wheel);
      }
    }
    b.finish();
    this.contactShadow = createVehicleContactShadow(s.width, s.length);
    this.root.scale.setScalar(scale);
    this.root.updateMatrixWorld(true);
    const bounds = new T.Box3().setFromObject(this.root);
    this.footprint = { halfWidth: Math.max(Math.abs(bounds.min.x), bounds.max.x), halfLength: Math.max(Math.abs(bounds.min.z), bounds.max.z), frontAxle: s.frontAxle * scale };
    // Visual occlusion must not enlarge the collision envelope.
    this.root.add(this.contactShadow.mesh);
    this.root.userData = { fleetId: id, class: s.kind, model: s.name, variant: parsed.variant, units: "metres", forward: "-Z", scale, footprint: this.footprint };
  }

  private podHeight(z: number, s: ModelSpec) {
    const exponent = s.design === 1 ? 6 : s.design === 2 ? 8 : 4;
    return (s.design === 2 ? .46 : .40) + (s.design === 2 ? .28 : .38) * Math.max(Math.exp(-Math.pow((z - s.frontAxle) / .77, exponent)), Math.exp(-Math.pow((z - s.rearAxle) / .72, exponent)));
  }
  private podTop(x: number, z: number, s: ModelSpec) {
    const l = s.length / 2, z0 = z < 0 ? -l + .04 : .55, z1 = z < 0 ? -.59 : l - .04;
    const u = clamp((z - z0) / (z1 - z0), 0, 1);
    const taper = Math.sin(u * Math.PI) ** (s.design === 1 ? .7 : .35);
    const f = clamp((Math.abs(x) - s.width / 2 * .77) / (.24 * (.65 + .35 * taper)), -1, 1);
    return this.podHeight(z, s) + (s.design === 2 ? .009 : .055) * (1 - f * f) - (s.design === 2 ? .07 : .12) * Math.abs(f) ** 3;
  }
  private prototypeBody(b: CarMesh, s: ModelSpec, upgraded: boolean, paint: T.Material, accent: T.Material, black: T.Material, copper: T.Material, widthAt: (z: number) => number, topAt: (x: number, z: number) => number, cabinWidth: (z: number) => number) {
    const l = s.length / 2, w = s.width / 2;
    // Central monocoque and nose taper into an exposed splitter; channels between
    // the nose and front wheel pods are open space, not painted depressions.
    for (const [z0, z1] of [[-l, s.cabinFront], [s.cabinRear, l]])
      b.surface((u, v) => { const z = mix(z0, z1, u), x = (v * 2 - 1) * widthAt(z); return [x, topAt(x, z), z]; }, paint, 40, 20);
    for (const side of [-1, 1]) {
      b.surface((u, v) => { const z = mix(s.cabinFront, s.cabinRear, u), x = side * mix(cabinWidth(z), widthAt(z), v); return [x, topAt(x, z), z]; }, paint, 40, 6);
      b.surface((u, v) => { const z = mix(-l, l, u), x = side * widthAt(z); return [x, mix(.17, topAt(x, z), v), z]; }, paint, 80, 4);
    }
    for (const z of [-l, l]) b.surface((u, v) => { const x = (u * 2 - 1) * widthAt(z); return [x, mix(.17, topAt(x, z), v), z]; }, paint, 12, 4);
    b.surface((u, v) => { const z = mix(-l + .03, s.cabinFront, u), x = (v - .5) * mix(.12, .23, u); return [x, topAt(x, z) + .006, z]; }, accent, 30, 2);
    b.box([0, .15, 0], [s.width * .96, .055, s.length * .96], black, .035);
    for (const side of [-1, 1]) {
      for (const axle of [s.frontAxle, s.rearAxle]) {
        const z0 = axle < 0 ? -l + .04 : .55, z1 = axle < 0 ? -.59 : l - .04;
        const pod = (u: number, v: number): V3 => {
          const z = mix(z0, z1, u);
          const taper = Math.sin(u * Math.PI) ** (s.design === 1 ? .7 : .35), x = side * (w * .77 + (v * 2 - 1) * .24 * (.65 + .35 * taper));
          return [x, this.podTop(x, z, s), z];
        };
        b.surface(pod, paint, 48, 14);
        for (const edge of [-1, 1]) b.surface((u, v) => {
          const z = mix(z0, z1, u), radius = s.wheelRadius + .06;
          const low = edge === 1 && Math.abs(z - axle) < radius ? s.wheelRadius + Math.sqrt(radius ** 2 - (z - axle) ** 2) : .18;
          const top = pod(u, edge < 0 ? 0 : 1);
          return [top[0], mix(Math.min(low, top[1]), top[1], v), z];
        }, paint, 72, 2);
        // Close both cut ends of each fender pod with the same crown profile.
        for (const end of [0, 1]) b.surface((u, v) => { const top = pod(end, u); return [top[0], mix(.18, top[1], v), top[2]]; }, paint, 14, 4);
      }
      b.panel([[side * .43, .22, -.68], [side * .88, .28, -.46], [side * 1.00, .54, .63], [side * .57, .52, .91]], accent);
      b.panel([[side * .46, .22, -.58], [side * .65, .53, .62], [side * .48, .55, .82]], black);
      b.line([[side * .96, .19, -.5], [side * 1.01, .23, .55], [side * .96, .28, 1.0]], .013, copper);
      b.panel([[side * .20, .18, -l], [side * 1.04, .18, -l + .07], [side * 1.04, .26, -l + .35], [side * .32, .24, -l + .22]], black);
      for (let i = 0; i < (upgraded ? 3 : 2); i++) b.panel([[side * (w - .12), .23 + i * .08, -l + .32], [side * (w + .045), .26 + i * .08, -l + .45], [side * (w - .015), .37 + i * .08, -l + .77]], black);
    }
    // A full-height central fin, side radiators, rear crash structure and diffuser.
    for (const x of s.design === 2 ? [-.17, .17] : [0]) b.panel([[x, topAt(x, s.roofRear) - .018, s.roofRear], [x, s.height - .06, s.roofRear + .11], [x, s.height - .10, l - .28], [x, topAt(x, l - .08) - .018, l - .08]], accent);
    if (s.design === 2) {
      // Spire's broad bridge nose and twin fins differ from the narrow central spine.
      b.surface((u, v) => { const z = mix(-l + .06, -l + .56, u), x = (v * 2 - 1) * .81; return [x, .34 + .12 * u + .08 * Math.abs(v * 2 - 1), z]; }, accent, 12, 18);
      for (const side of [-1, 1]) b.panel([[side * .37, .18, -l + .02], [side * .65, .18, -l + .02], [side * .60, .38, -l + .10], [side * .40, .34, -l + .10]], black);
    }
    if (s.design === 1) {
      b.surface((u, v) => { const x = (u * 2 - 1) * .95; return [x, .21 + .025 * Math.sin(v * Math.PI), -l + .12 + v * .18 + Math.abs(x) * .20]; }, accent, 18, 4);
      for (const side of [-1, 1]) b.panel([[side * .46, .33, -.6], [side * .52, .88, .72], [side * .58, .58, 1.30], [side * .72, .26, .2]], paint);
    }
    b.box([0, .27, l - .09], [s.width * .92, .14, .22], black, .025);
    for (let i = -4; i <= 4; i++) b.box([i * .19, .15, l - .03], [.016, .18, .42], black, .003, [-.18, 0, 0]);
  }
  serviceContact(id: string) {
    this.root.updateWorldMatrix(true, false);
    return this.root.localToWorld((this.serviceContacts.get(id) || new T.Vector3()).clone());
  }
  setLightService(ids: string[], progress: Record<string, number>) {
    for (const [id, lamp] of this.serviceLenses) {
      const clean = ids.includes(id) ? Math.min(1, progress[id] || 0) : 1;
      if (lamp.clean === clean) continue;
      lamp.clean = clean;
      lamp.material.color.set(lamp.front ? "#948564" : "#52362b").lerp(new T.Color(lamp.front ? "#e4ebdf" : "#8e181b"), clean);
      lamp.material.roughness = mix(.88, .19, clean);
      if (lamp.front) lamp.material.emissiveIntensity = clean * .12;
    }
  }
  setRestoration(cleaned: number, ready: boolean) {
    const amount = ready ? 1 : Math.min(.65, cleaned * .65);
    this.restorationPaint.color.set("#784732").lerp(new T.Color(this.spec.paint), amount);
    this.restorationPaint.roughness = mix(.92, .28, amount);
    this.restorationAccent.color.set("#8d8575").lerp(new T.Color(this.spec.accent), amount);
    this.restorationLens.color.set("#8c825c").lerp(new T.Color("#e4ebdf"), cleaned);
    this.restorationLens.emissiveIntensity = cleaned * .12;
    this.setLightService(["front-left", "front-right"], {"front-left":cleaned,"front-right":cleaned});
  }
  setWheelService(progress: Record<string, number>, activeId?: string | string[]) {
    for (const [id, index] of [["wheel-left", 0], ["wheel-right", 2]] as const) {
      const done = (progress[id] || 0) >= 1;
      if (done && !this.replacementWheels.has(id)) {
        const mesh = createWorkshopWheel(), original = this.wheels[index];
        mesh.root.scale.setScalar(this.spec.wheelRadius / .43);
        mesh.root.rotation.y = Math.PI / 2;
        original.parent!.add(mesh.root);
        this.replacementWheels.set(id, { mesh, original });
      }
      this.wheels[index].visible = !done && !((Array.isArray(activeId) ? activeId.includes(id) : activeId === id) && (progress[id] || 0) > .12);
      const replacement = this.replacementWheels.get(id);
      if (replacement) replacement.mesh.root.visible = done;
    }
  }
  setServiceHood(open: boolean, dt: number) {
    this.hoodOpen += ((open ? 1 : 0) - this.hoodOpen) * (1 - Math.exp(-Math.min(.05, dt) / .22));
    if (this.serviceHood) this.serviceHood.rotation.x = this.hoodOpen * 1.12;
  }
  animate(distance: number, steer: number, braking: boolean, indicating: boolean, time: number) {
    this.wheels.forEach(w => { w.rotation.x -= distance / (this.spec.wheelRadius * this.scale); });
    this.replacementWheels.forEach(({mesh, original}) => { mesh.root.rotation.x = original.rotation.x; });
    this.frontPivots.forEach(p => { p.rotation.y = steer; });
    this.brake.emissiveIntensity = braking ? 1.3 : .14;
    for (const lamp of this.serviceLenses.values()) if (!lamp.front) lamp.material.emissiveIntensity = this.brake.emissiveIntensity * (.3 + .7 * lamp.clean);
    this.indicator.emissiveIntensity = indicating && time % .8 < .4 ? 1.8 : 0;
  }
  dispose() { this.contactShadow.dispose(); this.replacementWheels.forEach(({mesh}) => mesh.dispose()); this.mesh.dispose(); }
}

