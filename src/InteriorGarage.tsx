import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { InteriorMotion } from "./scene/interior-motion";
import {
  INTERIOR,
  interiorAt,
  type Command,
  type Garage,
} from "../packages/game-core";
import { InteriorCharacter, WALK_ASSETS } from "./scene/interior-character";
import { garageImage } from "./scene/garage-assets";
import type { GaitPreview } from "./scene/gus-model";
import {
  INTERIOR_ART_SCALE,
  projectInterior,
  unprojectInterior,
} from "./scene/interior-projection";

export default function InteriorGarage({
  state,
  offset,
  busy,
  send,
  onReady,
  previewCharacter,
  previewGait = "relaxed",
}: {
  state: Garage;
  offset: number;
  busy: boolean;
  send: (command: Command) => void;
  onReady: () => void;
  previewCharacter?: string;
  previewGait?: GaitPreview;
}) {
  const host = useRef<HTMLDivElement>(null);
  const stick = useRef({ x: 0, y: 0 });
  const live = useRef({ state, offset, busy, send, onReady, previewCharacter, previewGait });
  live.current = { state, offset, busy, send, onReady, previewCharacter, previewGait };
  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    const blocked = () =>
      document.hidden ||
      !!document.querySelector('[data-garage-blocked="true"]') ||
      !!document.activeElement?.closest("[data-local-crew-controls]") ||
      !!document.querySelector("dialog[open]");
    class InteriorScene extends Phaser.Scene {
      actor!: InteriorCharacter;
      keys!: Record<string, Phaser.Input.Keyboard.Key>;
      lastSend = 0;
      wasMoving = false;
      motion!: InteriorMotion;
      lastDirection = { x: 0, y: 0 };
      create() {
        for (const asset of WALK_ASSETS) {
          const cached = garageImage(asset.url);
          if (cached && asset.frame)
            this.textures.addSpriteSheet(asset.key, cached, asset.frame);
        }
        const background = garageImage("/art/garage-interior-v4.png");
        if (background) this.textures.addImage("interior", background);
        this.add
          .image(0, 0, "interior")
          .setOrigin(0)
          .setScale(INTERIOR_ART_SCALE)
          .setDepth(-10000);
        this.motion = new InteriorMotion(
          interiorAt(
            live.current.state.progress.interior,
            Date.now() + live.current.offset,
          ),
        );

        this.actor = new InteriorCharacter(
          this,
          live.current.state.profile.character || "Gus",
        );
        this.keys = this.input.keyboard!.addKeys(
          "W,A,S,D,UP,DOWN,LEFT,RIGHT",
        ) as typeof this.keys;
        this.cameras.main.setBackgroundColor("#b5a381");
        this.cameras.main.setBounds(
          0,
          0,
          1536 * INTERIOR_ART_SCALE,
          1024 * INTERIOR_ART_SCALE,
        );
        this.cameras.main.setZoom(this.scale.width < 650 ? 0.9 : 1);
        const q = projectInterior(
          interiorAt(
            live.current.state.progress.interior,
            Date.now() + live.current.offset,
          ),
        );
        this.cameras.main.centerOn(q.x, q.y - 65);
        this.scale.on("resize", () =>
          this.cameras.main.setZoom(this.scale.width < 650 ? 0.9 : 1),
        );
        this.events.once(Phaser.Scenes.Events.POST_UPDATE, () =>
          live.current.onReady(),
        );
      }
      update(_time: number, delta: number) {
        const current = live.current,
          now = Date.now() + current.offset;
        const interior = current.state.progress.interior;
        const p = interiorAt(interior, now);
        const visual = this.motion.step(p, delta);
        const q = projectInterior(visual);
        if (import.meta.env.DEV) this.actor.setPreview(current.previewCharacter || current.state.profile.character || "Gus", current.previewGait);
        this.actor.update(q, delta);
        element.dataset.gait = current.previewGait;
        const camera = this.cameras.main;
        const alpha = 1 - Math.exp(-Math.min(delta, 50) / 90);
        camera.centerOn(
          Phaser.Math.Linear(camera.midPoint.x, q.x, alpha),
          Phaser.Math.Linear(camera.midPoint.y, q.y - 20, alpha),
        );
        element.dataset.x = p.x.toFixed(2);
        element.dataset.y = p.y.toFixed(2);
        element.dataset.cameraX = camera.scrollX.toFixed(2);
        element.dataset.cameraY = camera.scrollY.toFixed(2);
        let dx =
          stick.current.x +
          (Number(this.keys.D.isDown || this.keys.RIGHT.isDown) -
            Number(this.keys.A.isDown || this.keys.LEFT.isDown));
        let dy =
          stick.current.y +
          (Number(this.keys.S.isDown || this.keys.DOWN.isDown) -
            Number(this.keys.W.isDown || this.keys.UP.isDown));
        if (blocked()) {
          dx = 0;
          dy = 0;
          this.input.keyboard?.resetKeys();
          stick.current = { x: 0, y: 0 };
        }
        const length = Math.hypot(dx, dy);
        element.dataset.facing = String(this.actor.facing);
        element.dataset.frame = String(this.actor.sprite.frame.name);
        element.dataset.idleMix = this.actor.rest.mix.toFixed(3);
        element.dataset.idleFrame = String(this.actor.restSprite.frame.name);
        element.dataset.idleScale = this.actor.restSprite.scaleY.toFixed(5);
        element.dataset.renderMode = this.actor.renderMode;
        element.dataset.yaw = this.actor.yaw.toFixed(5);
        element.dataset.walkWeight = this.actor.animationWeight.toFixed(4);
        element.dataset.stride = this.actor.stride.toFixed(5);
        element.dataset.headTurn = this.actor.headTurn.toFixed(6);
        element.dataset.visualX = visual.x.toFixed(2);
        element.dataset.visualY = visual.y.toFixed(2);
        const turning =
          length > 0.1 &&
          (dx / length) * this.lastDirection.x +
            (dy / length) * this.lastDirection.y <
            0.95;
        const stopping = length <= 0.1 && this.wasMoving;
        if (
          current.busy ||
          (!turning && !stopping && now - this.lastSend < 160)
        )
          return;
        if (length > 0.1) {
          const world = projectInterior(p);
          const ahead = unprojectInterior({
            x: world.x + (dx / length) * 100,
            y: world.y + (dy / length) * 100,
          });
          const groundLength = Math.hypot(ahead.x - p.x, ahead.y - p.y);
          const target = {
            x: Phaser.Math.Clamp(
              p.x + ((ahead.x - p.x) / groundLength) * 36,
              18,
              INTERIOR.accessibleWidth - 18,
            ),
            y: Phaser.Math.Clamp(
              p.y + ((ahead.y - p.y) / groundLength) * 36,
              18,
              INTERIOR.height - 18,
            ),
          };
          if (Math.hypot(target.x - p.x, target.y - p.y) > 0.5) {
            current.send({ type: "interiorMove", target });
            this.lastSend = now;
            this.wasMoving = true;
            this.lastDirection = { x: dx / length, y: dy / length };
          }
        } else if (this.wasMoving) {
          current.send({ type: "interiorStop" });
          this.lastSend = now;
          this.wasMoving = false;
        }
      }
    }
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: element,
      backgroundColor: "#101218",
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: element.clientWidth,
        height: element.clientHeight,
      },
      scene: InteriorScene,
      render: { antialias: true },
      input: { activePointers: 2 },
    });
    const clear = () => {
      stick.current = { x: 0, y: 0 };
      game.scene
        .getScenes()
        .forEach((scene) => scene.input.keyboard?.resetKeys());
    };
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    return () => {
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
      game.destroy(true);
    };
  }, []);
  return (
    <>
      <div
        ref={host}
        className="interior-canvas"
        aria-label="Walk around your garage"
      />
      <div
        className="interior-stick"
        role="group"
        aria-label="Movement joystick"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const r = e.currentTarget.getBoundingClientRect();
          stick.current = {
            x: (e.clientX - r.left - r.width / 2) / 40,
            y: (e.clientY - r.top - r.height / 2) / 40,
          };
        }}
        onPointerMove={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
          const r = e.currentTarget.getBoundingClientRect();
          stick.current = {
            x: (e.clientX - r.left - r.width / 2) / 40,
            y: (e.clientY - r.top - r.height / 2) / 40,
          };
        }}
        onPointerUp={() => {
          stick.current = { x: 0, y: 0 };
        }}
        onPointerCancel={() => {
          stick.current = { x: 0, y: 0 };
        }}
        onLostPointerCapture={() => {
          stick.current = { x: 0, y: 0 };
        }}
      >
        <span aria-hidden="true">✥</span>
      </div>
    </>
  );
}
