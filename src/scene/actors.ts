import Phaser from "phaser";
import { positionAt, workPoints, type Garage } from "../../packages/game-core";
import { project } from "./coordinates";
import { launchPose } from "./launch-character";
import { advanceWalkCycle, walkLegPose, type WalkCycle } from "./walk-cycle";
import {
  applyPairedPose,
  pairedTexture,
  mirroredFacing,
} from "./character-animation";

type ActorVisual = {
  root: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  marker: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  selected: Phaser.GameObjects.Ellipse;
  progress: Phaser.GameObjects.Graphics;
  walkRig: Phaser.GameObjects.Container;
  torso: Phaser.GameObjects.Image;
  legs: Phaser.GameObjects.Image[];
  last: { x: number; y: number } | null;
  cycle: WalkCycle;
  facing: number;
};

// Every actor remains on the scene when control changes. Only the input target and
// mobile camera focus change; selecting a helper never moves or hides the player.
export class GarageActors {
  readonly focus: Phaser.GameObjects.Zone;
  private visuals = new Map<string, ActorVisual>();
  constructor(
    private scene: Phaser.Scene,
    private projection = project,
  ) {
    this.focus = scene.add.zone(0, 0, 1, 1);
  }
  private create(): ActorVisual {
    const s = this.scene;
    const shadow = s.add.ellipse(3, 2, 33, 15, 0x283d32, 0.3);
    const selected = s.add.ellipse(0, 1, 41, 21).setStrokeStyle(2, 0xf1ebc9);
    const sprite = s.add
      .sprite(0, 0, "gus", 5)
      .setOrigin(0.5, 184 / 192)
      .setScale(0.61);
    const label = s.add
      .text(0, -67, "", {
        fontSize: "12px",
        color: "#ffffff",
        backgroundColor: "#33464c",
        padding: { x: 4, y: 3 },
      })
      .setOrigin(0.5);
    const marker = s.add.container(0, 0, [
      s.add.rectangle(0, -17, 25, 33, 0x33464c),
      s.add.circle(0, -42, 12, 0xddac7d),
      label,
    ]);
    const progress = s.add.graphics();
    // Runtime cutout animation reuses original raster pixels, not generated lookalike
    // stride frames. Keep the upper trousers overlapped beneath the torso at the hips.
    const legs = [48, 82].map((hip, index) =>
      s.add
        .image((hip - 64) * 0.61, (136 - 184) * 0.61, "gus", 5)
        .setOrigin(hip / 128, 136 / 192)
        .setScale(0.61)
        .setCrop(index === 0 ? 0 : 64, 136, 64, 56),
    );
    const torso = s.add
      .image(0, 0, "gus", 5)
      .setOrigin(0.5, 184 / 192)
      .setScale(0.61)
      .setCrop(0, 0, 128, 145);
    const walkRig = s.add.container(0, 0, [...legs, torso]).setVisible(false);
    const root = s.add.container(0, 0, [
      shadow,
      selected,
      sprite,
      marker,
      walkRig,
      progress,
    ]);
    return {
      root,
      sprite,
      marker,
      label,
      selected,
      progress,
      walkRig,
      torso,
      legs,
      last: null,
      cycle: { phase: 0, axisX: 1, axisY: 0 },
      facing: 1,
    };
  }
  update(g: Garage, selectedId: string, now: number) {
    for (const [id, visual] of this.visuals) {
      if (!g.progress.actors[id]) {
        visual.root.destroy();
        this.visuals.delete(id);
      }
    }
    for (const actor of Object.values(g.progress.actors)) {
      let v = this.visuals.get(actor.id);
      if (!v) {
        v = this.create();
        this.visuals.set(actor.id, v);
      }
      const q = this.projection(positionAt(actor, now));
      const moving = !!actor.travel && now < actor.travel.endsAt;
      const dx = v.last ? q.x - v.last.x : 0,
        dy = v.last ? q.y - v.last.y : 0;
      if (moving && Math.hypot(dx, dy) > 0.01)
        v.facing = dy >= 0 ? (dx >= 0 ? 0 : 1) : dx >= 0 ? 2 : 3;
      if (moving) v.cycle = advanceWalkCycle(v.cycle, dx, dy);
      else v.cycle.phase = 0;
      v.last = q;
      const work = actor.taskId ? g.progress.tasks[actor.taskId] : null;
      // Face the equipment, including after a reload with no remembered travel.
      // Props are drawn just above their server interaction point in Garage.tsx.
      if (work) {
        const equipment = this.projection(
          workPoints(work.station, g.progress.upgrades.capacity > 0)[
            work.workPosition ?? 0
          ],
        );
        const targetX = equipment.x + 8 - q.x;
        const targetY = equipment.y - 45 - q.y;
        v.facing = targetY >= 0 ? (targetX >= 0 ? 0 : 1) : targetX >= 0 ? 2 : 3;
      }
      const isCrew = actor.id !== "player";
      const hero = isCrew
        ? null
        : launchPose(
            g.profile.character || "Gus",
            v.facing,
            !!actor.carrying,
            work,
            now,
          );
      const walking = moving && !work;
      v.root.setPosition(q.x, q.y).setDepth(q.y);
      v.sprite.setY(0).setAngle(0).setVisible(!walking);
      if (isCrew)
        applyPairedPose(
          v.sprite,
          v.facing,
          !!actor.carrying,
          work,
          now,
          "crew",
        );
      if (hero)
        v.sprite.setTexture(hero.texture, hero.frame).setFlipX(hero.mirrored);
      v.walkRig.setVisible(walking);
      if (walking) {
        const width = 192;
        const middle = width / 2;
        const legTop = hero ? 110 : 121;
        const hips = [82, 112];
        const mirrored = hero ? hero.mirrored : mirroredFacing(v.facing);
        const texture = hero ? hero.texture : pairedTexture(v.facing, "crew");
        const idleFrame = hero ? hero.idleFrame : 0;
        const carryFrame = hero ? hero.carryFrame : 1;
        v.walkRig.setScale(mirrored ? -1 : 1, 1);
        v.torso
          .setTexture(texture, actor.carrying ? carryFrame : idleFrame)
          .setCrop(0, 0, width, hero ? 121 : 132)
          .setY(0);
        v.legs.forEach((leg, index) => {
          const pose = walkLegPose(v.cycle, index, (192 - legTop) * 0.61);
          leg
            .setTexture(
              texture,
              hero && actor.carrying ? carryFrame : idleFrame,
            )
            .setPosition((hips[index] - middle) * 0.61, (legTop - 184) * 0.61)
            .setOrigin(hips[index] / width, legTop / 192)
            .setCrop(index === 0 ? 0 : middle, legTop, middle, 192 - legTop)
            .setAngle(mirrored ? -pose.angle : pose.angle)
            .setScale(0.61, 0.61 * pose.stretch);
        });
      }
      v.marker.setVisible(isCrew);
      for (const shape of v.marker.list.slice(0, 2))
        (shape as Phaser.GameObjects.Shape).setVisible(false);
      v.label.setY(isCrew ? (work ? -144 : -116) : -67);
      v.label.setText(
        actor.id === "player" ? g.profile.character || "" : actor.role,
      );
      v.selected.setVisible(actor.id === selectedId);
      v.progress.clear();
      if (work) {
        const done = Phaser.Math.Clamp(
          (now - work.startsAt) / (work.endsAt - work.startsAt),
          0,
          1,
        );
        v.progress.fillStyle(0x273c35).fillRoundedRect(-28, -122, 56, 7, 3);
        v.progress
          .fillStyle(0xe9bc62)
          .fillRoundedRect(-26, -120, 52 * done, 3, 1);
      }
      if (actor.id === selectedId) this.focus.setPosition(q.x, q.y);
    }
  }
}
