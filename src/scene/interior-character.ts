import Phaser from "phaser";
import { facing8, walkPose } from "./interior-motion";
import { InteriorRest, restPose } from "./interior-rest";
import type { Point } from "../../packages/game-core";
import { GusModel, type CrewCharacter, type GaitPreview, CREW_MODELS } from "./gus-model";

export const WALK_ASSETS = ["gus", "dash", "juno"].flatMap((name) => [
  {
    key: `walk-${name}-v3`,
    url: `/art/walk-${name}-v3.png`,
    frame: { frameWidth: 192, frameHeight: 192 },
  },
  {
    key: `idle-${name}-v1`,
    url: `/art/idle-${name}-v1.png`,
    frame: { frameWidth: 192, frameHeight: 192 },
  },
]);
export class InteriorCharacter {
  sprite: Phaser.GameObjects.Sprite;
  restSprite: Phaser.GameObjects.Sprite;
  rest = new InteriorRest();
  shadow: Phaser.GameObjects.Ellipse;
  facing = 0;
  phase = 0;
  last: Point | null = null;
  private turnClock = 0;
  private speed = 0;
  private character: string;
  private gus?: GusModel;
  private gusImage?: Phaser.GameObjects.Image;
  private gusTexture?: Phaser.Textures.CanvasTexture;
  private heading = 0;
  get renderMode() {
    return this.gus ? `${this.character}-3d` : "sprite";
  }
  get yaw() {
    return this.gus?.yaw ?? (this.facing * Math.PI) / 4;
  }
  get animationWeight() {
    return this.gus?.walkWeight ?? 1 - this.rest.mix;
  }
  get stride() {
    return this.gus?.stride ?? this.phase;
  }
  get headTurn() {
    return this.gus?.headTurn ?? this.restSprite.angle;
  }
  setPreview(character: string, gait: GaitPreview) {
    if (!import.meta.env.DEV) return;
    const name = character.toLowerCase();
    if (name in CREW_MODELS && name !== this.character && this.gus) {
      const next = new GusModel(384, name as CrewCharacter);
      next.yaw = this.gus.yaw;
      this.gus.dispose();
      this.gus = next;
      this.character = name;
    }
    this.gus?.setGait(gait);
  }
  constructor(scene: Phaser.Scene, character: string) {
    this.character = character.toLowerCase();
    this.shadow = scene.add.ellipse(0, 0, 50, 20, 0x342b24, 0.24);
    this.sprite = scene.add
      .sprite(0, 0, `walk-${character.toLowerCase()}-v3`, 1)
      .setOrigin(0.5, 182 / 192)
      .setScale(0.9);
    this.restSprite = scene.add
      .sprite(0, 0, `idle-${this.character}-v1`, 0)
      .setOrigin(0.5, 182 / 192)
      .setScale(0.9);
    if (this.character in CREW_MODELS) {
      this.gus = new GusModel(384, this.character as CrewCharacter);
      const textureKey = `${this.character}-live-3d`;
      this.gusTexture = scene.textures.createCanvas(textureKey, 384, 384)!;
      this.gusImage = scene.add
        .image(0, 0, textureKey)
        .setOrigin(0.5, 0.819)
        .setDisplaySize(216, 216);
      this.sprite.setVisible(false);
      this.restSprite.setVisible(false);
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.gus?.dispose();
        scene.textures.remove(textureKey);
      });
    }
  }
  update(p: Point, delta: number) {
    const dx = this.last ? p.x - this.last.x : 0,
      dy = this.last ? p.y - this.last.y : 0;
    const distance = Math.hypot(dx, dy);
    const dt = Math.min(delta, 50);
    this.speed +=
      ((distance * 1000) / Math.max(1, dt) - this.speed) *
      (1 - Math.exp(-dt / 60));
    this.turnClock += dt;
    if (distance > 0.02 && this.speed > 8) {
      const desired = facing8(dx, dy);
      if (this.turnClock >= 45 && desired !== this.facing) {
        const gap = ((desired - this.facing + 12) % 8) - 4;
        this.facing = (this.facing + Math.sign(gap) + 8) % 8;
        this.turnClock = 0;
      }
      this.phase = (this.phase + distance / 18) % 8;
    }
    const pose = walkPose(this.character, this.facing, Math.floor(this.phase));
    const resting = this.rest.step(
      this.speed,
      dt,
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    const idle = restPose(this.facing, resting.frame);
    this.sprite
      .setPosition(p.x, p.y)
      .setFrame(pose.frame)
      .setFlipX(pose.flip)
      .setAlpha(1 - resting.mix)
      .setDepth(p.y);
    this.restSprite
      .setPosition(p.x, p.y)
      .setFrame(idle.frame)
      .setFlipX(idle.flip)
      .setScale(0.9, 0.9 * resting.scaleY)
      .setAngle(resting.angle)
      .setAlpha(resting.mix)
      .setDepth(p.y + 0.01);
    this.shadow.setPosition(p.x, p.y + 1).setDepth(p.y - 1);
    if (this.gus && this.gusTexture && this.gusImage) {
      if (distance > 0.02 && this.speed > 8) this.heading = Math.atan2(dx, dy);
      this.gus.update(
        dt / 1000,
        this.heading,
        this.speed,
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      );
      const context = this.gusTexture.context;
      context.clearRect(0, 0, 384, 384);
      context.drawImage(this.gus.renderer.domElement, 0, 0);
      this.gusTexture.refresh();
      this.gusImage.setPosition(p.x, p.y).setDepth(p.y);
    }
    this.last = { ...p };
  }
}
