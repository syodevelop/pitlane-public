import type Phaser from "phaser";

export const STOCK_TEXTURES = ["gus-stock-front", "gus-stock-back"] as const;

// Reaching and lifting illustrate a started stock task. Inventory remains server-owned.
export function applyStockPose(
  sprite: Phaser.GameObjects.Sprite,
  facing: number,
  elapsed: number,
) {
  const frame = Math.floor(Math.max(0, elapsed) / 700) % 2;
  sprite
    .setTexture(STOCK_TEXTURES[facing < 2 ? 0 : 1], frame)
    .setFlipX(facing === 1 || facing === 3)
    .setY(0)
    .setAngle(0);
}
