import { expect, it } from "vitest";
import {
  InteriorMotion,
  facing8,
  walkPose,
} from "../src/scene/interior-motion";

it("smooths corrections without a teleport and settles on the server position", () => {
  const motion = new InteriorMotion({ x: 100, y: 100 });
  const first = motion.step({ x: 130, y: 100 }, 16);
  expect(first.x).toBeGreaterThan(100);
  expect(first.x).toBeLessThan(105);
  for (let i = 0; i < 100; i++) motion.step({ x: 130, y: 100 }, 16);
  expect(motion.position.x).toBeCloseTo(130, 4);
});
it("handles reversals and pauses without crossing the demo bounds", () => {
  const motion = new InteriorMotion({ x: 300, y: 300 });
  for (let i = 0; i < 50; i++) motion.step({ x: 315.333, y: 312 }, 16);
  for (let i = 0; i < 100; i++) {
    const p = motion.step({ x: 18, y: 18 }, i === 10 ? 5000 : 16);
    expect(p.x).toBeGreaterThanOrEqual(18);
    expect(p.x).toBeLessThanOrEqual(315.334);
    expect(p.y).toBeGreaterThanOrEqual(18);
  }
  expect(motion.position.x).toBeCloseTo(18, 3);
});
it("maps all eight directions and corrects authored left-facing rows", () => {
  [
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
  ].forEach(([x, y], i) => expect(facing8(x, y)).toBe(i));
  expect(walkPose("dash", 6, 2)).toEqual({ frame: 18, flip: true });
  expect(walkPose("dash", 2, 2)).toEqual({ frame: 18, flip: false });
  expect(walkPose("juno", 7, 2)).toEqual({ frame: 10, flip: true });
  expect(walkPose("gus", 7, 2)).toEqual({ frame: 10, flip: false });
});
