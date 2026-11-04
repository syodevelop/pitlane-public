import { expect, it } from "vitest";
import { cameraRelativeMove, DEFAULT_GARAGE_CAMERA, normalizeGarageCamera } from "../src/scene/garage-camera";

it("rejects corrupt or unsupported stored camera values and clamps valid settings", () => {
  for (const value of [null, "broken", [], { version: 99, zoom: 50 }]) expect(normalizeGarageCamera(value)).toEqual(DEFAULT_GARAGE_CAMERA);
  const result = normalizeGarageCamera({ version: 1, tilt: Infinity, zoom: 100, yaw: -500, offsetX: NaN, offsetZ: "4", follow: false, anchorY: 500 });
  expect(result.tilt).toBe(DEFAULT_GARAGE_CAMERA.tilt);
  expect(result.zoom).toBe(1.6); expect(result.yaw).toBe(-180);
  expect(result.offsetX).toBe(0); expect(result.offsetZ).toBe(-.6);
  expect(result.follow).toBe(false); expect(result.anchorY).toBe(312);
});
it("maps keyboard and joystick axes into the camera's ground basis", () => {
  expect(cameraRelativeMove(0, -1, 0)).toEqual({ x: 0, y: -1 });
  const north = cameraRelativeMove(0, -1, 90), right = cameraRelativeMove(1, 0, 90);
  expect(north.x).toBeCloseTo(-1); expect(north.y).toBeCloseTo(0);
  expect(right.x).toBeCloseTo(0); expect(right.y).toBeCloseTo(-1);
  for (const yaw of [-180, -70, 14, 90, 180]) {
    const p = cameraRelativeMove(.6, -.8, yaw);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(1);
    const inverse = cameraRelativeMove(p.x, p.y, -yaw);
    expect(inverse.x).toBeCloseTo(.6); expect(inverse.y).toBeCloseTo(-.8);
  }
});
