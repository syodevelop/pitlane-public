// Cosmetic only: feet stay anchored at the authoritative ground position.
export class InteriorRest {
  mix = 1;
  elapsed = 0;
  private quietFor = 0;
  step(speed: number, delta: number, reducedMotion = false) {
    const dt = Math.min(50, Math.max(0, delta));
    this.quietFor = speed < 8 ? this.quietFor + dt : 0;
    const target = this.quietFor > 120 ? 1 : speed > 12 ? 0 : this.mix;
    this.mix += (target - this.mix) * (1 - Math.exp(-dt / (target ? 85 : 35)));
    if (this.mix > 0.01) this.elapsed += dt;
    const phase = this.elapsed / 1000;
    return {
      mix: this.mix,
      frame: reducedMotion
        ? 0
        : [0, 1, 2, 3, 2, 1][Math.floor(this.elapsed / 550) % 6],
      // Subpixel weight shift and ~1px breathing, with soles fixed.
      scaleY:
        1 +
        (reducedMotion
          ? 0
          : Math.sin((phase * Math.PI * 2) / 3.3) * 0.006 * this.mix),
      angle: reducedMotion
        ? 0
        : Math.sin((phase * Math.PI * 2) / 5.2) * 0.22 * this.mix,
    };
  }
}
export function restPose(direction: number, frame: number) {
  return {
    frame: [0, 1, 2, 3, 4, 3, 2, 1][direction] * 4 + frame,
    flip: direction >= 1 && direction <= 3,
  };
}
