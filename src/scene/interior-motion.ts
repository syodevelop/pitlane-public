import { INTERIOR, type Point } from "../../packages/game-core";

// Render-only critically damped follower. Server position remains authoritative.
// No resources, path acceptance or stored position depend on these coordinates.
export class InteriorMotion {
  position: Point;
  velocity: Point = { x: 0, y: 0 };
  constructor(position: Point) {
    this.position = { ...position };
  }
  step(target: Point, deltaMs: number): Point {
    const dt = Math.min(Math.max(deltaMs, 0), 50) / 1000;
    const omega = 28,
      decay = Math.exp(-omega * dt);
    for (const axis of ["x", "y"] as const) {
      const offset = this.position[axis] - target[axis];
      const impulse = this.velocity[axis] + omega * offset;
      this.position[axis] = target[axis] + (offset + impulse * dt) * decay;
      this.velocity[axis] =
        (this.velocity[axis] - omega * impulse * dt) * decay;
      this.position[axis] = Math.max(
        axis === "x" ? INTERIOR.minX : 18,
        Math.min(
          axis === "x" ? INTERIOR.accessibleWidth - 18 : INTERIOR.height - 18,
          this.position[axis],
        ),
      );
    }
    return { ...this.position };
  }
}

export function facing8(dx: number, dy: number) {
  return (Math.round((Math.atan2(dy, dx) * 4) / Math.PI) - 2 + 8) % 8;
}
export function walkPose(character: string, direction: number, step: number) {
  const rows = [0, 1, 2, 3, 4, 3, 2, 1];
  const row = rows[direction];
  // Correct the actual orientation of these authored rows before runtime mirroring.
  const authoredLeft =
    (character === "dash" && row === 2) || (character === "juno" && row === 1);
  return {
    frame: row * 8 + step,
    flip: (direction >= 1 && direction <= 3) !== authoredLeft,
  };
}
