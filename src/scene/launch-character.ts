// One visual atlas/animation contract for all three demo leads. No game rates.
export const LAUNCH_TEXTURES = ["launch-gus", "launch-dash", "launch-juno"];
export function launchPose(
  character: string,
  facing: number,
  carrying: boolean,
  work: { kind: string; startsAt: number } | null,
  now: number,
) {
  const base = facing < 2 ? 0 : 4;
  const beat = work
    ? Math.floor(
        Math.max(0, now - work.startsAt) / (work.kind === "stock" ? 700 : 360),
      ) % 2
    : 0;
  return {
    texture: `launch-${character.toLowerCase()}`,
    frame:
      base +
      (work ? (work.kind === "stock" ? beat : 2 + beat) : Number(carrying)),
    idleFrame: base,
    carryFrame: base + 1,
    // Front master looks right; rear master looks left.
    mirrored: facing === 1 || facing === 2,
  };
}
