import Phaser from "phaser";
import { project } from "./coordinates";
export { ENVIRONMENT_TEXTURES } from "./garage-assets";

// Original material pixels are projected onto the same ground plane as stations.
// These layers are presentation only; server movement bounds/obstacles do not change.
export class GarageEnvironment {
  private base: Phaser.GameObjects.Image;
  private expanded: Phaser.GameObjects.Image;
  private expansionWalls: Phaser.GameObjects.Image[] = [];
  private lot: Phaser.GameObjects.Text;
  private textureKeys: string[] = [];
  constructor(private scene: Phaser.Scene) {
    scene.add
      .tileSprite(-500, -600, 2500, 2200, "grass-material")
      .setOrigin(0)
      .setTileScale(0.65)
      .setTint(0xc5d1bd)
      .setDepth(-20);
    scene.add
      .rectangle(-500, -600, 2500, 2200, 0x596e5e, 0.32)
      .setOrigin(0)
      .setDepth(-19);
    this.base = this.floor(false);
    this.expanded = this.floor(true).setVisible(false);
    for (let x = 0; x < 760; x += 190) this.wall(x, 190, false);
    for (let x = 760; x < 1100; x += 170) this.wall(x, 170, true);
    for (let x = 220; x <= 1220; x += 200) {
      const p = project({ x, y: -205 });
      scene.add
        .ellipse(p.x + 5, p.y + 4, 164, 12, 0x25362e, 0.24)
        .setAngle(20)
        .setDepth(p.y - 1);
      scene.add
        .image(p.x, p.y, "guardrail", x % 400 === 220 ? 0 : 1)
        .setOrigin(0.5, 0.71)
        .setDisplaySize(240, 100)
        .setDepth(p.y);
    }
    const p = project({ x: 930, y: 335 });
    this.lot = scene.add
      .text(p.x, p.y, "EXPANSION LOT\nCustomer capacity", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#e9e6d7",
        backgroundColor: "#344b40",
        align: "center",
        padding: { x: 10, y: 7 },
      })
      .setOrigin(0.5)
      .setDepth(795);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const key of this.textureKeys) scene.textures.remove(key);
    });
  }
  private material(ctx: CanvasRenderingContext2D, name: string, scale = 0.5) {
    const pattern = ctx.createPattern(
      this.scene.textures.get(name).getSourceImage() as HTMLImageElement,
      "repeat",
    )!;
    pattern.setTransform(new DOMMatrix().scale(scale));
    return pattern;
  }
  private floor(expanded: boolean) {
    const key = "garage-ground-" + (expanded ? "expanded" : "base");
    const texture = this.scene.textures.createCanvas(key, 1940, 900)!;
    this.textureKeys.push(key);
    const ctx = texture.context;
    ctx.setTransform(0.86, 0.32, -0.58, 0.56, 580, 160);
    const asphalt = this.material(ctx, "asphalt-material"),
      concrete = this.material(ctx, "concrete-material");
    ctx.strokeStyle = concrete;
    ctx.lineWidth = 146;
    ctx.lineJoin = "round";
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(1405, -90);
    ctx.lineTo(-100, -90);
    ctx.lineTo(-100, 650);
    ctx.lineTo(625, 650);
    ctx.stroke();
    ctx.strokeStyle = asphalt;
    ctx.lineWidth = 130;
    ctx.stroke();
    ctx.fillStyle = asphalt;
    ctx.fillRect(210, 430, 140, 225);
    if (expanded) ctx.fillRect(480, 580, 140, 75);
    // A quiet buildable foundation is distinct from the open, usable annex.
    if (!expanded) {
      ctx.globalAlpha = 0.26;
      ctx.fillStyle = concrete;
      ctx.fillRect(780, 0, 320, 600);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#d6cba6";
      ctx.lineWidth = 2;
      ctx.setLineDash([14, 10]);
      ctx.strokeRect(785, 5, 310, 590);
      ctx.setLineDash([]);
    }
    const width = expanded ? 1100 : 760,
      height = expanded ? 600 : 450;
    ctx.fillStyle = "#4a5148";
    ctx.fillRect(0, 8, width, height);
    ctx.fillStyle = concrete;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(72,74,63,.35)";
    ctx.lineWidth = 1;
    for (let x = 130; x < width; x += 130) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 130; y < height; y += 130) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(22,37,31,.15)";
    ctx.fillRect(0, 0, width, 22);
    ctx.strokeStyle = "#e6e0ca";
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, width - 8, height - 8);
    // Painted lines belong to the ground plane, not to a moving screen overlay.
    ctx.strokeStyle = "#d7d5c1";
    ctx.lineWidth = 3;
    ctx.setLineDash([30, 35]);
    ctx.beginPath();
    ctx.moveTo(1405, -90);
    ctx.lineTo(-100, -90);
    ctx.lineTo(-100, 650);
    ctx.lineTo(625, 650);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let x = -25; x < 1400; x += 35) {
      ctx.fillStyle = Math.round((x + 25) / 35) % 2 ? "#b64632" : "#dcd8c4";
      ctx.fillRect(x, -27, 35, 15);
    }
    texture.refresh();
    return this.scene.add.image(-220, -100, key).setOrigin(0).setDepth(-10);
  }
  private wall(x: number, width: number, expanded: boolean) {
    const key = "garage-wall-projected-" + width;
    if (!this.scene.textures.exists(key)) {
      const texture = this.scene.textures.createCanvas(
        key,
        Math.ceil(width * 0.86) + 2,
        Math.ceil(70 + width * 0.32) + 2,
      )!;
      texture.context.setTransform(0.86, 0.32, 0, 1, 0, 0);
      texture.context.drawImage(
        this.scene.textures
          .get("garage-wall-panel")
          .getSourceImage() as HTMLImageElement,
        0,
        0,
        width,
        70,
      );
      texture.refresh();
      this.textureKeys.push(key);
    }
    const p = project({ x, y: 0 });
    const wall = this.scene.add
      .image(p.x, p.y - 70, key)
      .setOrigin(0)
      .setDepth(p.y + width * 0.16);
    if (expanded) {
      wall.setVisible(false);
      this.expansionWalls.push(wall);
    }
  }
  sync(expanded: boolean) {
    this.base.setVisible(!expanded);
    this.expanded.setVisible(expanded);
    this.lot.setVisible(!expanded);
    for (const wall of this.expansionWalls) wall.setVisible(expanded);
  }
}
