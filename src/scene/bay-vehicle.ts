import Phaser from "phaser";

// Short parking maneuvers only. Presence comes from authoritative job/race state;
// tweens have no callbacks into gameplay and never start or settle work.
export class BayVehicle {
  private key: string | null | undefined;
  readonly root: Phaser.GameObjects.Container;
  private readonly parked: { x: number; y: number };
  private readonly shadowOffset: { x: number; y: number };
  constructor(
    private scene: Phaser.Scene,
    readonly car: Phaser.GameObjects.Image,
    private shadow: Phaser.GameObjects.Ellipse,
  ) {
    this.parked = { x: car.x, y: car.y };
    this.shadowOffset = { x: shadow.x - car.x, y: shadow.y - car.y };
    shadow.setPosition(this.shadowOffset.x, this.shadowOffset.y);
    car.setPosition(0, 0);
    this.root = scene.add.container(this.parked.x, this.parked.y, [
      shadow,
      car,
    ]);
    this.root.setDepth(this.parked.y).setVisible(false);
  }
  sync(
    key: string | null,
    frame: number,
    texture = this.car.texture.key,
    motion = true,
  ) {
    if (key === this.key) {
      this.car.setTexture(texture, frame);
      return;
    }
    const animate =
      motion &&
      this.key !== undefined &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.scene.tweens.killTweensOf(this.root);
    if (animate && this.key && this.root.visible) {
      const car = this.scene.add
        .image(0, 0, this.car.texture.key, this.car.frame.name)
        .setOrigin(this.car.originX, this.car.originY)
        .setDisplaySize(this.car.displayWidth, this.car.displayHeight);
      const shadow = this.scene.add.ellipse(
        this.shadowOffset.x,
        this.shadowOffset.y,
        this.shadow.width,
        this.shadow.height,
        this.shadow.fillColor,
        this.shadow.fillAlpha,
      );
      const leaving = this.scene.add
        .container(this.root.x, this.root.y, [shadow, car])
        .setDepth(this.root.y)
        .setAlpha(this.root.alpha);
      this.scene.tweens.add({
        targets: leaving,
        x: leaving.x - 48,
        y: leaving.y + 24,
        alpha: 0,
        duration: 650,
        ease: "Sine.easeIn",
        onUpdate: () => leaving.setDepth(leaving.y),
        onComplete: () => leaving.destroy(),
      });
    }
    this.key = key;
    this.car.setTexture(texture, frame);
    this.root
      .setPosition(this.parked.x, this.parked.y)
      .setDepth(this.parked.y)
      .setAlpha(1)
      .setVisible(!!key);
    if (animate && key) {
      this.root.setPosition(this.parked.x + 48, this.parked.y - 24).setAlpha(0);
      this.scene.tweens.add({
        targets: this.root,
        x: this.parked.x,
        y: this.parked.y,
        alpha: 1,
        duration: 650,
        ease: "Sine.easeOut",
        onUpdate: () => this.root.setDepth(this.root.y),
      });
    }
  }
}
