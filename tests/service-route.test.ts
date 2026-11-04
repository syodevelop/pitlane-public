import { expect, it } from "vitest";
import { clipWalkAtCar, slideWalkAtCar, insideCar, sampleServiceRoute, SERVICE_ROUTE, SERVICE_ROUTE_LENGTH, SERVICE_STOP_DISTANCE } from "../src/scene/service-route";

it("drives west on the lower north lane, stops north-facing, then joins the eastbound upper lane", () => {
  expect(sampleServiceRoute(0)).toMatchObject({ x: 43, z: SERVICE_ROUTE.lowerLaneZ, yaw: Math.PI / 2 });
  const stop = sampleServiceRoute(SERVICE_STOP_DISTANCE), end = sampleServiceRoute(SERVICE_ROUTE_LENGTH);
  expect(stop.x).toBeCloseTo(SERVICE_ROUTE.centerX); expect(stop.z).toBeCloseTo(SERVICE_ROUTE.stopZ); expect(stop.yaw).toBe(0);
  expect(end.x).toBeCloseTo(43); expect(end.z).toBeCloseTo(SERVICE_ROUTE.upperLaneZ); expect(end.yaw).toBe(-Math.PI / 2);
});
it("has continuous tangents and positions at joins, without reversing along the service lane", () => {
  let prev = sampleServiceRoute(0);
  for (let d = .02; d < SERVICE_ROUTE_LENGTH; d += .02) {
    const pose = sampleServiceRoute(d);
    expect(Math.hypot(pose.x - prev.x, pose.z - prev.z)).toBeLessThan(.021);
    expect(Math.abs(pose.yaw - prev.yaw)).toBeLessThan(.008);
    expect(pose.z).toBeLessThanOrEqual(prev.z + 1e-8);
    if (pose.z < 9 && pose.z > 0) expect(pose.x).toBeCloseTo(SERVICE_ROUTE.centerX);
    prev = pose;
  }
});
it("clips walking at a car's rotated footprint and allows leaving a restored overlapping position", () => {
  for (const yaw of [0, .4, Math.PI / 2, -Math.PI / 2]) {
    const car = { x: 0, z: 0, yaw, turning: false };
    const result = clipWalkAtCar({ x: -5, z: 0 }, { x: 5, z: 0 }, car);
    expect(insideCar(result, car)).toBe(false);
    expect(result.x).toBeLessThan(0);
    expect(clipWalkAtCar({ x: 0, z: 0 }, { x: 5, z: 0 }, car)).toEqual({ x: 5, z: 0 });
    expect(clipWalkAtCar({ x: -5, z: 5 }, { x: 5, z: 5 }, car)).toEqual({ x: 5, z: 5 });
  }
});

it("preserves sliding distance along a door regardless of the car's orientation", () => {
  const from = {x:1.43,z:-1}, to={x:1.2,z:-.6};
  const base = {x:0,z:0,yaw:0,turning:false};
  const expected=slideWalkAtCar(from,to,base);
  expect(expected.z).toBeCloseTo(to.z);
  for(const yaw of [.2,.7,1.2,2.4,-.8]) {
    const c=Math.cos(yaw),s=Math.sin(yaw);
    const rotate=(p:{x:number;z:number})=>({x:8+p.x*c+p.z*s,z:3-p.x*s+p.z*c});
    const car={...base,x:8,z:3,yaw};
    const actual=slideWalkAtCar(rotate(from),rotate(to),car),wanted=rotate(expected);
    expect(actual.x).toBeCloseTo(wanted.x,8);
    expect(actual.z).toBeCloseTo(wanted.z,8);
    expect(insideCar(actual,car)).toBe(false);
  }
});
