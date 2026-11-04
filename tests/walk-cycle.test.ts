import { describe, expect, it } from "vitest";
import { advanceWalkCycle, walkLegPose } from "../src/scene/walk-cycle";

describe("distance-driven visual gait", () => {
  it("keeps the same phase at different render frame rates", () => {
    const initial = { phase: 0, axisX: 1, axisY: 0 };
    let slow = initial, fast = initial;
    for (let i = 0; i < 20; i++) slow = advanceWalkCycle(slow, 2, 1);
    for (let i = 0; i < 80; i++) fast = advanceWalkCycle(fast, 0.5, 0.25);
    expect(slow.phase).toBeCloseTo(fast.phase, 10);
    expect(walkLegPose(slow, 0).angle).toBeCloseTo(walkLegPose(fast, 0).angle, 10);
    expect(advanceWalkCycle(slow, 0, 0)).toEqual(slow);
  });

  it("keeps opposite legs bounded throughout all travel directions", () => {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      let cycle = { phase: 0, axisX: dx, axisY: dy };
      for (let i = 0; i < 100; i++) {
        cycle = advanceWalkCycle(cycle, dx, dy);
        const a = walkLegPose(cycle, 0), b = walkLegPose(cycle, 1);
        expect(Number.isFinite(a.angle)).toBe(true);
        expect(a.angle).toBeCloseTo(-b.angle, 10);
        expect(a.stretch).toBeGreaterThanOrEqual(0.78);
        expect(a.stretch).toBeLessThanOrEqual(1.22);
        expect(a.stretch + b.stretch).toBeCloseTo(2, 10);
      }
    }
  });
});
