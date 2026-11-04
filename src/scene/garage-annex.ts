import Phaser from "phaser";
import {
  ANNEX,
  CARS,
  type Garage,
  type Station,
} from "../../packages/game-core";
import { STATION_LABELS } from "../game-view";
import { project } from "./coordinates";
import { BayVehicle } from "./bay-vehicle";
import { carAppearance } from "./car-appearance";
import { stationView } from "./station-state";
import { carBay } from "./race-transitions";

// Uses the same authored points as server travel/proximity and independent stock.
export class GarageAnnex {
  readonly vehicles = new Map<Station, BayVehicle>();
  private objects: Phaser.GameObjects.Components.Visible[] = [];
  private labels = new Map<Station, Phaser.GameObjects.Text>();
  private titles = new Map<Station, Phaser.GameObjects.Text>();
  constructor(scene: Phaser.Scene, interact: (s: Station) => void) {
    const floor = scene.add.graphics().setDepth(-5);
    const quad = (
      x: number,
      y: number,
      w: number,
      h: number,
      color: number,
    ) => {
      const points = [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ].map(project);
      floor.fillStyle(color, 0.35).fillPoints(points, true);
      floor.lineStyle(2, 0xe9e6d7, 0.8).strokePoints(points, true);
    };
    this.objects.push(floor);
    for (const [key, point] of Object.entries(ANNEX)) {
      const station = key as Station,
        q = project(point);
      quad(point.x - 66, point.y - 55, 132, 77, 0xaaa996);
      const shadow = scene.add
        .ellipse(q.x + 4, q.y - 22, 125, 34, 0x34453d, 0.24)
        .setDepth(q.y - 31);
      if (station === "stock") {
        this.objects.push(
          shadow,
          scene.add
            .image(q.x, q.y - 20, "stock-rack")
            .setOrigin(0.5, 0.97)
            .setDisplaySize(102, 102)
            .setDepth(q.y - 20),
        );
      } else {
        const car = scene.add
          .image(q.x, q.y - 20, "rustback", 1)
          .setOrigin(0.5, 0.975)
          .setDisplaySize(174, 145);
        this.vehicles.set(station, new BayVehicle(scene, car, shadow));
      }
      const title = scene.add
        .text(q.x, q.y + 24, STATION_LABELS[station] + " / 2", {
          fontFamily: "Arial",
          fontSize: "13px",
          color: "#263c35",
          backgroundColor: "#e5e4d5",
          padding: { x: 7, y: 4 },
        })
        .setOrigin(0.5)
        .setDepth(800);
      const label = scene.add
        .text(q.x, q.y + 46, "", {
          fontFamily: "Arial",
          fontSize: "12px",
          color: "#e9e6d7",
          backgroundColor: "#344b40",
          padding: { x: 5, y: 3 },
          align: "center",
        })
        .setOrigin(0.5, 0)
        .setDepth(801);
      this.labels.set(station, label);
      this.titles.set(station, title);
      const zone = scene.add
        .zone(q.x, q.y - 15, 140, 110)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => interact(station));
      // Visible false does not disable a Phaser input zone; update active input too.
      this.objects.push(title, label, zone);
    }
    this.objects.forEach((o) => o.setVisible(false));
  }
  configure(mobile: boolean) {
    for (const title of this.titles.values())
      title.setFontSize(mobile ? 18 : 16);
    for (const label of this.labels.values())
      label.setFontSize(mobile ? 18 : 14);
  }
  sync(
    g: Garage,
    selectedCarId?: string,
    movingCars: ReadonlyMap<string, unknown> = new Map(),
  ) {
    const expanded = g.progress.upgrades.capacity > 0;
    this.objects.forEach((o) => {
      o.setVisible(expanded);
      const zone = o as Phaser.GameObjects.Zone;
      if (zone.input) zone.input.enabled = expanded;
    });
    for (const [station, label] of this.labels) {
      const task = Object.values(g.progress.tasks).find(
        (t) =>
          t.status === "started" &&
          t.station === station &&
          t.workPosition === 1,
      );
      const selected =
        selectedCarId && carBay(g, selectedCarId) === 1
          ? g.progress.cars[selectedCarId]
          : undefined;
      const car = task?.carId
        ? g.progress.cars[task.carId]
        : station === "starter"
          ? selected
          : undefined;
      const view = stationView(g, station, car?.id, 1);
      label.setText(
        (station === "starter" && !car ? "Free bay" : view.label) +
          (view.parts ? "\n" + view.parts : ""),
      );
      this.titles
        .get(station)
        ?.setText(
          (car ? CARS[car.tier].name : STATION_LABELS[station]) + " / 2",
        );
      const vehicle = this.vehicles.get(station);
      if (vehicle) {
        const absent =
          car &&
          (movingCars.has(car.id) ||
            Object.values(g.progress.races).some(
              (r) => r.carId === car.id && r.status === "started",
            ));
        const key =
          expanded && !absent
            ? station === "starter"
              ? (car?.id ?? null)
              : view.customerId
            : null;
        const appearance = car
          ? carAppearance(car)
          : { frame: 1, texture: "rustback" };
        vehicle.sync(
          key,
          appearance.frame,
          appearance.texture,
          station !== "starter",
        );
      }
    }
  }
}
