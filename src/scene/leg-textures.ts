import Phaser from "phaser";

// Mechanical cutout of existing pixels. The rear trouser gap bends around
// Juno's left boot, so no single vertical crop can separate her two legs.
export function junoRearLeg(scene: Phaser.Scene, index: number): string {
  const key = `juno-back-leg-${index}`;
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.createCanvas(key, 192, 192);
  if (!texture) throw new Error("Unable to allocate character cutout");
  const ctx = texture.context;
  const outerX = index === 0 ? 0 : 192;
  ctx.beginPath();
  ctx.moveTo(outerX, 121);
  ctx.lineTo(87, 121);
  ctx.lineTo(87, 148);
  ctx.lineTo(94, 164);
  ctx.lineTo(94, 192);
  ctx.lineTo(outerX, 192);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(
    scene.textures.get("juno-back").getSourceImage() as HTMLImageElement,
    0,
    0,
  );
  texture.refresh();
  return key;
}
