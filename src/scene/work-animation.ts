import type Phaser from "phaser";

export const WORK_TEXTURES = [
  "gus-work-front",
  "gus-work-back-right",
  "gus-work-back-left",
] as const;

export function applyWorkPose(
  sprite: Phaser.GameObjects.Sprite,
  facing: number,
  elapsed: number,
) {
  const texture = facing < 2 ? WORK_TEXTURES[0] : WORK_TEXTURES[facing - 1];
  const frame = Math.floor(Math.max(0, elapsed) / 360) % 2;
  sprite
    .setTexture(texture, frame)
    .setFlipX(facing === 1)
    .setY(0)
    .setAngle(0);
}
