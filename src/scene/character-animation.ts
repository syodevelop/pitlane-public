import type Phaser from "phaser";

// Paired original art shares four facings and one animation system. Art never
// changes class modifiers, worker rates or race performance.
export type PairedCharacter = "crew" | "dash" | "juno";
export const PAIRED_TEXTURES = ["crew", "dash", "juno"].flatMap((name) =>
  ["front", "back", "work-front", "work-back"].map((pose) => `${name}-${pose}`),
);

export const pairedTexture = (facing: number, art: PairedCharacter) =>
  `${art}-${facing < 2 ? "front" : "back"}`;
export const mirroredFacing = (facing: number) => facing === 1 || facing === 3;

export function applyPairedPose(
  sprite: Phaser.GameObjects.Sprite,
  facing: number,
  carrying: boolean,
  work: { kind: string; startsAt: number } | null,
  now: number,
  art: PairedCharacter,
) {
  const elapsed = work ? Math.max(0, now - work.startsAt) : 0;
  const toolWork = work && work.kind !== "stock";
  const texture = toolWork
    ? `${art}-work-${facing < 2 ? "front" : "back"}`
    : pairedTexture(facing, art);
  const frame = work
    ? Math.floor(elapsed / (toolWork ? 360 : 700)) % 2
    : Number(carrying);
  sprite
    .setTexture(texture, frame)
    .setFlipX(mirroredFacing(facing))
    .setY(0)
    .setAngle(0);
}
