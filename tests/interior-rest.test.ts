import { expect, it } from "vitest";
import { InteriorRest, restPose } from "../src/scene/interior-rest";

it("blends from walking to planted idle without flickering on short pauses", () => {
  const rest = new InteriorRest();
  for (let i = 0; i < 30; i++) rest.step(180, 16);
  expect(rest.mix).toBeLessThan(0.01);
  for (let i = 0; i < 5; i++) rest.step(0, 16);
  expect(rest.mix).toBeLessThan(0.01);
  for (let i = 0; i < 40; i++) rest.step(0, 16);
  expect(rest.mix).toBeGreaterThan(0.99);
  const first = rest.step(180, 16);
  expect(first.mix).toBeGreaterThan(0);
  expect(first.mix).toBeLessThan(0.8);
});
it("idle varies gently and reduced motion keeps a stable planted pose", () => {
  const rest = new InteriorRest(),
    frames = new Set();
  for (let i = 0; i < 300; i++) {
    const pose = rest.step(0, 16);
    frames.add(pose.frame);
    expect(Math.abs(pose.scaleY - 1)).toBeLessThanOrEqual(0.0061);
    expect(Math.abs(pose.angle)).toBeLessThanOrEqual(0.221);
  }
  expect(frames.size).toBe(4);
  expect(rest.step(0, 16, true)).toMatchObject({
    frame: 0,
    scaleY: 1,
    angle: 0,
  });
  expect(restPose(6, 2)).toEqual({ frame: 10, flip: false });
  expect(restPose(2, 2)).toEqual({ frame: 10, flip: true });
});
