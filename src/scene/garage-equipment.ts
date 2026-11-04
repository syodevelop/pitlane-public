import Phaser from "phaser";
import { ANNEX, STATIONS, type Garage } from "../../packages/game-core";
import { project } from "./coordinates";

// Equipment reflects server-confirmed investment only. These props occupy the
// existing service areas and do not create new movement obstacles or work slots.
export class GarageEquipment {
  private quick: Phaser.GameObjects.Image[];
  private engine: Phaser.GameObjects.Image;
  private team: Phaser.GameObjects.Image;
  private shadows: Phaser.GameObjects.Ellipse[] = [];
  constructor(
    scene: Phaser.Scene,
    private expandedOnly = false,
  ) {
    const prop = (
      station: "tires" | "quick" | "engine" | "starter",
      texture: string,
    ) => {
      const q = project((expandedOnly ? ANNEX : STATIONS)[station]);
      const offsetX = expandedOnly ? -96 : 62;
      this.shadows.push(
        scene.add
          .ellipse(q.x + offsetX + 4, q.y - 10, 58, 18, 0x34453d, 0.22)
          .setDepth(q.y - 15)
          .setVisible(!expandedOnly),
      );
      return scene.add
        .image(q.x + offsetX, q.y - 14, texture, 0)
        .setOrigin(0.5, 0.97)
        .setDisplaySize(80, 80)
        .setDepth(q.y - 14)
        .setVisible(!expandedOnly);
    };
    this.quick = [
      prop("tires", "service-station"),
      prop("quick", "service-station"),
    ];
    this.engine = prop("engine", "engine-stand");
    this.team = prop("starter", "team-trolley");
  }
  sync(g: Garage) {
    for (const object of [
      ...this.quick,
      this.engine,
      this.team,
      ...this.shadows,
    ])
      object.setVisible(!this.expandedOnly || g.progress.upgrades.capacity > 0);
    const texture =
      g.progress.upgrades.quickTools > 0
        ? "service-station-upgraded"
        : "service-station";
    for (const trolley of this.quick)
      if (trolley.texture.key !== texture) trolley.setTexture(texture);
    this.engine.setFrame(g.progress.upgrades.engineTools > 0 ? 1 : 0);
    this.team.setFrame(g.progress.upgrades.team > 0 ? 1 : 0);
  }
}
