export const FLEET_KINDS = ["rustback", "club-coupe", "track-gt", "enduro", "prototype"] as const;
export type FleetKind = typeof FLEET_KINDS[number];
export type FleetVariant = "standard" | "upgraded";
export const FLEET_MODELS = ["rustback", "city-sprint", "rallye", "club-coupe", "nightline", "bayside", "track-gt", "apex", "vector", "enduro", "longtail", "silhouette", "prototype", "arrow", "spire"] as const;
export type FleetModel = typeof FLEET_MODELS[number];
export type FleetId = `${FleetModel}:${FleetVariant}`;
export interface CarSpec {
  name: string; length: number; width: number; height: number; wheelRadius: number;
  frontAxle: number; rearAxle: number; paint: string; accent: string; cabinFront: number;
  roofFront: number; roofRear: number; cabinRear: number; belt: number; roofWidth: number;
}
export const FLEET: Record<FleetKind, CarSpec> = {
  rustback: { name: "Rustback", length: 3.78, width: 1.72, height: 1.48, wheelRadius: .31, frontAxle: -1.12, rearAxle: 1.14, paint: "#ce2018", accent: "#eee4c9", cabinFront: -.66, roofFront: -.12, roofRear: .96, cabinRear: 1.55, belt: .86, roofWidth: .67 },
  "club-coupe": { name: "Club Coupe", length: 4.18, width: 1.79, height: 1.34, wheelRadius: .32, frontAxle: -1.25, rearAxle: 1.28, paint: "#185562", accent: "#eee4c9", cabinFront: -.66, roofFront: -.08, roofRear: .74, cabinRear: 1.65, belt: .79, roofWidth: .67 },
  "track-gt": { name: "Track GT", length: 4.48, width: 1.98, height: 1.26, wheelRadius: .35, frontAxle: -1.34, rearAxle: 1.30, paint: "#e05c12", accent: "#ece2c9", cabinFront: -.61, roofFront: -.02, roofRear: .71, cabinRear: 1.40, belt: .75, roofWidth: .67 },
  enduro: { name: "Enduro", length: 4.68, width: 2.09, height: 1.12, wheelRadius: .34, frontAxle: -1.34, rearAxle: 1.38, paint: "#e9dfc3", accent: "#1c3658", cabinFront: -.94, roofFront: -.34, roofRear: .38, cabinRear: .98, belt: .64, roofWidth: .55 },
  prototype: { name: "Prototype", length: 4.86, width: 2.12, height: 1.09, wheelRadius: .35, frontAxle: -1.43, rearAxle: 1.43, paint: "#e1e5df", accent: "#174a3c", cabinFront: -.95, roofFront: -.35, roofRear: .37, cabinRear: .90, belt: .49, roofWidth: .37 },
};
export interface ModelSpec extends CarSpec { kind: FleetKind; design: number }
const model = (kind: FleetKind, design: number, changes: Partial<CarSpec> = {}): ModelSpec => ({ ...FLEET[kind], kind, design, ...changes });
export const MODELS: Record<FleetModel, ModelSpec> = {
  rustback: model("rustback", 0),
  "city-sprint": model("rustback", 1, { name: "City Sprint", length: 3.42, width: 1.66, height: 1.56, paint: "#d6ac21", cabinFront: -.84, roofFront: -.43, roofRear: 1.02, cabinRear: 1.39, frontAxle: -1.02, rearAxle: 1.02, roofWidth: .66 }),
  rallye: model("rustback", 2, { name: "Rallye", length: 3.89, width: 1.81, height: 1.39, paint: "#7cabc0", accent: "#f4ecda", cabinFront: -.55, roofFront: -.08, roofRear: .63, cabinRear: 1.52, roofWidth: .66, frontAxle: -1.16, rearAxle: 1.18 }),
  "club-coupe": model("club-coupe", 0),
  nightline: model("club-coupe", 1, { name: "Nightline", length: 4.40, width: 1.83, height: 1.32, paint: "#594d7d", cabinFront: -.66, roofFront: -.12, roofRear: .61, cabinRear: 1.16, frontAxle: -1.36, rearAxle: 1.31, roofWidth: .65 }),
  bayside: model("club-coupe", 2, { name: "Bayside", length: 4.24, width: 1.85, height: 1.35, paint: "#9fa895", accent: "#e9dec1", cabinFront: -.42, roofFront: .12, roofRear: .55, cabinRear: 1.82, frontAxle: -1.28, rearAxle: 1.28, roofWidth: .59 }),
  "track-gt": model("track-gt", 0),
  apex: model("track-gt", 1, { name: "Apex", length: 4.61, width: 2.03, height: 1.26, paint: "#304cb0", accent: "#e4e6df", cabinFront: -.36, roofFront: .17, roofRear: .85, cabinRear: 1.48, frontAxle: -1.43, rearAxle: 1.42, roofWidth: .68 }),
  vector: model("track-gt", 2, { name: "Vector", length: 4.47, width: 2.02, height: 1.15, paint: "#b1c045", accent: "#263331", cabinFront: -.96, roofFront: -.44, roofRear: .32, cabinRear: .87, frontAxle: -1.34, rearAxle: 1.35, roofWidth: .64, belt: .68 }),
  enduro: model("enduro", 0),
  longtail: model("enduro", 1, { name: "Longtail", length: 5.04, width: 2.10, height: 1.05, paint: "#e3d6b6", accent: "#537965", cabinFront: -1.07, roofFront: -.52, roofRear: .26, cabinRear: .88, frontAxle: -1.53, rearAxle: 1.45, roofWidth: .50, belt: .61 }),
  silhouette: model("enduro", 2, { name: "Silhouette", length: 4.54, width: 2.14, height: 1.16, paint: "#d0d7d2", accent: "#85382e", cabinFront: -.81, roofFront: -.28, roofRear: .56, cabinRear: 1.1, frontAxle: -1.32, rearAxle: 1.32, roofWidth: .61, belt: .67 }),
  prototype: model("prototype", 0),
  arrow: model("prototype", 1, { name: "Arrow", length: 5.03, width: 2.15, height: 1.02, paint: "#dbdce2", accent: "#303e78", cabinFront: -1.20, roofFront: -.55, roofRear: .20, cabinRear: .82, frontAxle: -1.55, rearAxle: 1.45, roofWidth: .32, belt: .44 }),
  spire: model("prototype", 2, { name: "Spire", length: 4.72, width: 2.16, height: 1.12, paint: "#c8cccb", accent: "#a73b2e", cabinFront: -.84, roofFront: -.27, roofRear: .42, cabinRear: .96, frontAxle: -1.39, rearAxle: 1.37, roofWidth: .41, belt: .50 }),
};
export const FLEET_IDS: FleetId[] = FLEET_MODELS.flatMap(k => [`${k}:standard`, `${k}:upgraded`] as FleetId[]);
export function parseFleetId(id: string): { model: FleetModel; kind: FleetKind; variant: FleetVariant } | undefined {
  if (!FLEET_IDS.includes(id as FleetId)) return;
  const [model, variant] = id.split(":") as [FleetModel, FleetVariant]; return { model, kind: MODELS[model].kind, variant };
}
export const fleetLabel = (id: FleetId) => { const item = parseFleetId(id)!; return `${MODELS[item.model].name} / ${item.variant}`; };
