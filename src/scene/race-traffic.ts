import Phaser from "phaser";
import type { Garage } from "../../packages/game-core";
import { movingCarAppearance } from "./car-appearance";
import { project } from "./coordinates";
import {
  carBay,
  raceRoute,
  RaceTransitionCursor,
  type RaceTransition,
} from "./race-transitions";

type Flight = {
  root: Phaser.GameObjects.Container;
  image: Phaser.GameObjects.Image;
  direction: "depart" | "return";
  raceId: string;
  segment: number;
};

// Cosmetic traffic only. No command, resource or settlement callback exists.
export class RaceTraffic {
  readonly flights = new Map<string, Flight>();
  private cursor = new RaceTransitionCursor();
  constructor(private scene: Phaser.Scene) {
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.clear());
  }
  private clear() {
    for (const id of this.flights.keys()) this.cancel(id);
  }
  private cancel(id: string) {
    const flight = this.flights.get(id);
    if (!flight) return;
    this.scene.tweens.killTweensOf(flight.root);
    flight.root.destroy();
    this.flights.delete(id);
  }
  sync(g: Garage) {
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const { reset, transitions } = this.cursor.read(
      g,
      !document.hidden && !reduced,
    );
    if (reset || document.hidden || reduced) this.clear();
    // A newly verified preparation takes precedence over a cosmetic return.
    for (const [carId, flight] of this.flights) {
      if (
        flight.direction === "return" &&
        Object.values(g.progress.tasks).some(
          (t) => t.carId === carId && t.status === "started",
        )
      )
        this.cancel(carId);
    }
    for (const transition of transitions) this.start(g, transition);
  }
  private start(g: Garage, { race, direction }: RaceTransition) {
    const car = g.progress.cars[race.carId];
    if (!car) return;
    this.cancel(car.id);
    const points = raceRoute(carBay(g, car.id));
    if (direction === "return") points.reverse();
    const start = project(points[0]);
    const appearance = movingCarAppearance(car, "sw");
    const image = this.scene.add
      .image(0, 0, appearance.texture, appearance.frame)
      .setOrigin(0.5, 0.975)
      .setDisplaySize(174, 145);
    const shadow = this.scene.add.ellipse(4, -38, 125, 34, 0x34453d, 0.24);
    const root = this.scene.add
      .container(start.x, start.y + (direction === "depart" ? -20 : 36), [
        shadow,
        image,
      ])
      .setDepth(Math.max(1, start.y - 20));
    const flight: Flight = {
      root,
      image,
      direction,
      raceId: race.id,
      segment: 0,
    };
    this.flights.set(car.id, flight);
    const leg = (index: number) => {
      if (this.flights.get(car.id) !== flight) return;
      if (index >= points.length - 1) {
        this.cancel(car.id);
        return;
      }
      flight.segment = index;
      const from = points[index],
        to = points[index + 1];
      // Reverse into the preparation bay, leaving its normal parked orientation.
      const reverse = direction === "return" && index === points.length - 2;
      const dx = (to.x - from.x) * (reverse ? -1 : 1),
        dy = (to.y - from.y) * (reverse ? -1 : 1);
      const facing =
        Math.abs(dx) > Math.abs(dy)
          ? dx > 0
            ? "se"
            : "nw"
          : dy > 0
            ? "sw"
            : "ne";
      const art = movingCarAppearance(car, facing);
      image.setTexture(art.texture, art.frame).setFlipX(art.flipX);
      const q = project(to);
      this.scene.tweens.add({
        targets: root,
        x: q.x,
        // Road waypoints use the wheelbase centre; bay art uses its existing
        // bottom anchor. Interpolate that difference through the parking leg.
        y: q.y + (reverse ? -20 : 36),
        duration:
          (Math.hypot(to.x - from.x, to.y - from.y) / (reverse ? 140 : 240)) *
          1000,
        ease: "Linear",
        onUpdate: () => root.setDepth(Math.max(1, root.y)),
        onComplete: () => leg(index + 1),
      });
    };
    leg(0);
  }
}
