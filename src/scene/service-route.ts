// Metres in the shared garage coordinate frame. Right-hand traffic: westbound
// on the northern lane; both customer turns are right turns, without crossing it.
const courtDepth = 330 * .032;
// Clearance includes the enlarged mirrors and tyres, not just the car centre.
export const SERVICE_ROADS = {
  upper: { minZ: -10.1, maxZ: -2.3, clientZ: -4.3, ambientZ: -8.1 },
  lower: { minZ: courtDepth + 1, maxZ: courtDepth + 8.8, clientZ: courtDepth + 3, ambientZ: courtDepth + 6.8 },
};
export const SERVICE_ROUTE = {
  centerX: 1000 / 6 * .032, stopZ: 5.2, lowerLaneZ: SERVICE_ROADS.lower.clientZ,
  upperLaneZ: SERVICE_ROADS.upper.clientZ, radius: 3, startX: 43, endX: 43,
};
const C = SERVICE_ROUTE;
const approach = C.startX - C.centerX - C.radius;
const arc = Math.PI / 2 * C.radius;
const entry = C.lowerLaneZ - C.radius - C.stopZ;
export const SERVICE_STOP_DISTANCE = approach + arc + entry;
const departure = C.stopZ - (C.upperLaneZ + C.radius);
export const SERVICE_ROUTE_LENGTH = SERVICE_STOP_DISTANCE + departure + arc + C.endX - C.centerX - C.radius;
export type VehiclePose = { x: number; z: number; yaw: number; turning: boolean; halfWidth?: number; halfLength?: number };
export function sampleServiceRoute(distance: number): VehiclePose {
  let d = Math.max(0, Math.min(SERVICE_ROUTE_LENGTH, distance));
  if (d <= approach) return { x: C.startX - d, z: C.lowerLaneZ, yaw: Math.PI / 2, turning: false };
  d -= approach;
  if (d <= arc) {
    const a = Math.PI / 2 + d / C.radius;
    return { x: C.centerX + C.radius + Math.cos(a) * C.radius, z: C.lowerLaneZ - C.radius + Math.sin(a) * C.radius, yaw: Math.PI - a, turning: true };
  }
  d -= arc;
  if (d <= entry + departure) return { x: C.centerX, z: C.lowerLaneZ - C.radius - d, yaw: 0, turning: false };
  d -= entry + departure;
  if (d <= arc) {
    const a = Math.PI + d / C.radius;
    return { x: C.centerX + C.radius + Math.cos(a) * C.radius, z: C.upperLaneZ + C.radius + Math.sin(a) * C.radius, yaw: Math.PI - a, turning: true };
  }
  return { x: C.centerX + C.radius + d - arc, z: C.upperLaneZ, yaw: -Math.PI / 2, turning: false };
}

export function insideCar(p: { x: number; z: number }, car: VehiclePose, margin = .28) {
  const x = p.x - car.x, z = p.z - car.z, c = Math.cos(car.yaw), s = Math.sin(car.yaw);
  return Math.abs(x * c - z * s) < (car.halfWidth ?? 1.12) + margin && Math.abs(x * s + z * c) < (car.halfLength ?? 2.3) + margin;
}
/** Separating-axis check for two oriented vehicle footprints. */
export function carsOverlap(a: VehiclePose, b: VehiclePose, margin = .35) {
  const axes = [a.yaw, b.yaw].flatMap(y => [[Math.cos(y), -Math.sin(y)], [Math.sin(y), Math.cos(y)]]);
  for (const [x, z] of axes) {
    const radius = (p: VehiclePose) => Math.abs(x * Math.cos(p.yaw) - z * Math.sin(p.yaw)) * (p.halfWidth ?? 1.12) + Math.abs(x * Math.sin(p.yaw) + z * Math.cos(p.yaw)) * (p.halfLength ?? 2.3);
    if (Math.abs((a.x - b.x) * x + (a.z - b.z) * z) >= radius(a) + radius(b) + margin) return false;
  }
  return true;
}

/** Swept player movement against the visible car, including diagonal approaches.
 * This only chooses an input target; the server still owns movement and bounds. */
export function clipWalkAtCar(from: { x: number; z: number }, to: { x: number; z: number }, car: VehiclePose) {
  if (insideCar(from, car)) return to; // let a restored position escape, never trap it
  const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .06));
  let safe = from;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, p = { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t };
    if (insideCar(p, car)) break;
    safe = p;
  }
  return safe;
}

/** Keep the free component of movement along a bumper instead of sticking
 * whenever diagonal input has a small component into the vehicle. */
export function slideWalkAtCar(from: { x: number; z: number }, to: { x: number; z: number }, car: VehiclePose): { x: number; z: number } {
  // Resolve tangential movement in the obstacle's frame, so rotated cars do
  // not turn free movement along a door into movement through that door.
  if (Math.abs(car.yaw) > 1e-8) {
    const c = Math.cos(car.yaw), s = Math.sin(car.yaw);
    const local = (p: { x: number; z: number }) => ({ x: (p.x-car.x)*c-(p.z-car.z)*s, z: (p.x-car.x)*s+(p.z-car.z)*c });
    const result = slideWalkAtCar(local(from), local(to), { ...car, x: 0, z: 0, yaw: 0 });
    return { x: car.x+result.x*c+result.z*s, z: car.z-result.x*s+result.z*c };
  }
  const direct = clipWalkAtCar(from, to, car);
  if (Math.hypot(direct.x - to.x, direct.z - to.z) < .0001) return direct;
  const xFirst = clipWalkAtCar(from, { x: to.x, z: from.z }, car);
  const zFirst = clipWalkAtCar(from, { x: from.x, z: to.z }, car);
  const options = [direct, clipWalkAtCar(xFirst, { x: xFirst.x, z: to.z }, car), clipWalkAtCar(zFirst, { x: to.x, z: zFirst.z }, car)];
  return options.reduce((best, p) => Math.hypot(p.x - to.x, p.z - to.z) < Math.hypot(best.x - to.x, best.z - to.z) ? p : best);
}
