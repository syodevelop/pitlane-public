import { GARAGE_ASSETS, garageImage } from "./scene/garage-assets";
import { useEffect, useRef } from "react";
import Phaser from "phaser";
import {
  OBSTACLES,
  CARS,
  workPoints,
  garageBounds,
  positionAt,
  type Command,
  type Garage as State,
  type Station,
} from "../packages/game-core";
import { STATIONS } from "./game-view";
import { project, unproject, SCENE } from "./scene/coordinates";
import { GarageActors } from "./scene/actors";
import { stationView } from "./scene/station-state";
import { BayVehicle } from "./scene/bay-vehicle";
import { carAppearance } from "./scene/car-appearance";
import GarageFeedback from "./GarageFeedback";
import { GarageEquipment } from "./scene/garage-equipment";
import { GarageAnnex } from "./scene/garage-annex";
import { RaceTraffic } from "./scene/race-traffic";
import { carBay } from "./scene/race-transitions";
import { GarageEnvironment } from "./scene/garage-environment";

export default function Garage({
  state,
  offset,
  send,
  interact,
  actorId = "player",
  carId,
  onReady,
}: {
  state: State;
  offset: number;
  send: (c: Command) => void;
  interact: (s: Station, position?: 0 | 1) => void;
  actorId?: string;
  carId?: string;
  onReady?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef({
    state,
    offset,
    send,
    interact,
    actorId,
    carId,
    onReady,
  });
  live.current = { state, offset, send, interact, actorId, carId, onReady };
  const joystick = useRef({ x: 0, y: 0 });
  useEffect(() => {
    if (!host.current) return;
    const inputBlocked = () =>
      document.hidden ||
      !!document.querySelector('[data-garage-blocked="true"]') ||
      !!document.querySelector("dialog[open]") ||
      !!document.activeElement?.matches(
        "input, textarea, select, [contenteditable=true]",
      );
    class Scene extends Phaser.Scene {
      actors!: GarageActors;
      equipment!: GarageEquipment;
      annex!: GarageAnnex;
      annexEquipment!: GarageEquipment;
      traffic!: RaceTraffic;
      environment!: GarageEnvironment;
      trafficFocus?: Phaser.GameObjects.Container;
      trafficFollowCancelled = false;
      lastActorId?: string;
      expanded = false;
      starter!: BayVehicle;
      waitingCustomer!: Phaser.GameObjects.Image;
      stationLabels = new Map<Station, Phaser.GameObjects.Text>();
      stationTitles = new Map<Station, Phaser.GameObjects.Text>();
      customerCars = new Map<Station, BayVehicle>();
      lastStationState?: State;
      lastCarId?: string;
      keys!: Record<string, Phaser.Input.Keyboard.Key>;
      lastMove = 0;
      preload() {
        for (const asset of GARAGE_ASSETS) {
          const cached = garageImage(asset.url);
          if (cached) {
            if (asset.frame)
              this.textures.addSpriteSheet(asset.key, cached, asset.frame);
            else this.textures.addImage(asset.key, cached);
          } else if (asset.frame)
            this.load.spritesheet(asset.key, asset.url, asset.frame);
          else this.load.image(asset.key, asset.url);
        }
      }
      create() {
        this.environment = new GarageEnvironment(this);
        const ground = this.add.graphics().setDepth(-5);
        for (const [key, p] of Object.entries(STATIONS)) {
          const q = project(p);
          const bay = [
            { x: p.x - 66, y: p.y - 55 },
            { x: p.x + 66, y: p.y - 55 },
            { x: p.x + 66, y: p.y + 22 },
            { x: p.x - 66, y: p.y + 22 },
          ].map(project);
          ground.fillStyle(key === "starter" ? 0x8d9c85 : 0xaaa996, 0.55);
          ground.fillPoints(bay, true);
          ground.lineStyle(2, 0xe9e6d7, 0.85);
          ground.strokePoints(bay, true);
          const shadow = this.add
            .ellipse(q.x + 4, q.y - 22, 125, 34, 0x34453d, 0.24)
            .setDepth(q.y - 31);
          if (key === "stock" || key === "race" || key === "reception") {
            this.add
              .image(
                q.x,
                q.y - 20,
                key === "stock"
                  ? "stock-rack"
                  : key === "race"
                    ? "circuit-desk"
                    : "reception",
              )
              .setOrigin(0.5, 0.97)
              .setDisplaySize(102, 102)
              .setDepth(q.y - 20);
          } else {
            const car = this.add
              .image(q.x, q.y - 20, "rustback", key === "starter" ? 0 : 1)
              .setOrigin(0.5, 0.975)
              .setDisplaySize(174, 145)
              .setDepth(q.y - 20);
            const vehicle = new BayVehicle(this, car, shadow);
            if (key === "starter") this.starter = vehicle;
            else {
              this.customerCars.set(key as Station, vehicle);
            }
          }
          const title = this.add
            .text(q.x, q.y + 24, p.label, {
              fontFamily: "Arial, sans-serif",
              fontSize: "13px",
              color: "#263c35",
              backgroundColor: "#e5e4d5",
              padding: { x: 7, y: 4 },
            })
            .setOrigin(0.5)
            .setDepth(800);
          this.stationTitles.set(key as Station, title);
          this.stationLabels.set(
            key as Station,
            this.add
              .text(q.x, q.y + 46, "", {
                fontFamily: "Arial, sans-serif",
                fontSize: "12px",
                color: "#e9e6d7",
                backgroundColor: "#344b40",
                padding: { x: 5, y: 3 },
                align: "center",
              })
              .setOrigin(0.5, 0)
              .setDepth(801),
          );
          this.add
            .zone(q.x, q.y - 15, 140, 110)
            .setInteractive({ useHandCursor: true })
            .on("pointerdown", () => {
              if (!inputBlocked()) live.current.interact(key as Station);
            });
        }
        this.equipment = new GarageEquipment(this);
        this.annex = new GarageAnnex(this, (station) => {
          if (!inputBlocked()) live.current.interact(station, 1);
        });
        this.annexEquipment = new GarageEquipment(this, true);
        this.traffic = new RaceTraffic(this);
        for (const o of OBSTACLES) {
          const q = project({ x: o.x + o.w / 2, y: o.y + o.h });
          this.add
            .ellipse(q.x + 6, q.y + 1, 94, 31, 0x34453d, 0.25)
            .setDepth(q.y);
          this.add
            .image(q.x, q.y, "workbench")
            .setOrigin(0.5, 0.97)
            .setDisplaySize(112, 112)
            .setDepth(q.y);
        }
        const sign = project({ x: 95, y: 440 });
        const waiting = project({ x: 165, y: 411 });
        this.waitingCustomer = this.add
          .image(waiting.x, waiting.y, "rustback", 1)
          .setOrigin(0.5, 0.975)
          .setDisplaySize(130, 108)
          .setDepth(waiting.y);
        this.add
          .text(sign.x, sign.y + 25, "PITLANE / SERVICE ENTRANCE", {
            fontFamily: "monospace",
            fontSize: "14px",
            color: "#e3e9d7",
          })
          .setOrigin(0, 0.5);
        this.actors = new GarageActors(this);
        this.keys = this.input.keyboard!.addKeys("W,A,S,D,E") as Record<
          string,
          Phaser.Input.Keyboard.Key
        >;
        this.keys.E.on("down", () => {
          if (inputBlocked()) return;
          const p = positionAt(
            live.current.state.progress.actors[live.current.actorId],
            Date.now() + live.current.offset,
          );
          const nearest = (Object.keys(STATIONS) as Station[])
            .flatMap((station) =>
              workPoints(station, this.expanded).map((point, position) => ({
                station,
                position,
                point,
              })),
            )
            .sort(
              (a, b) =>
                Math.hypot(a.point.x - p.x, a.point.y - p.y) -
                Math.hypot(b.point.x - p.x, b.point.y - p.y),
            )[0];
          live.current.interact(nearest.station, nearest.position as 0 | 1);
        });
        this.input.on(
          "pointerdown",
          (p: Phaser.Input.Pointer, objects: unknown[]) => {
            if (objects.length || inputBlocked()) return;
            const target = unproject(this.cameras.main.getWorldPoint(p.x, p.y));
            live.current.send({
              type: "navigate",
              actorId: live.current.actorId,
              target: { x: Math.round(target.x), y: Math.round(target.y) },
            });
          },
        );
        this.cameras.main.setBounds(0, -20, SCENE.width, SCENE.height + 40);
        this.configureCamera();
        this.scale.on("resize", () => this.configureCamera());
        this.events.once(Phaser.Scenes.Events.POST_UPDATE, () =>
          live.current.onReady?.(),
        );
      }
      configureCamera() {
        this.trafficFocus = undefined;
        const mobile = this.scale.width < 700;
        this.annex?.configure(mobile);
        this.cameras.main.setZoom(mobile ? 1 : this.expanded ? 0.68 : 0.76);
        // The mobile canvas is scaled down in CSS; compensate so bay text remains legible.
        for (const title of this.stationTitles.values())
          title.setFontSize(mobile ? 18 : this.expanded ? 16 : 15);
        for (const label of this.stationLabels.values())
          label.setFontSize(mobile ? 18 : 14);
        if (mobile) {
          this.cameras.main.setBounds(
            -220,
            -450,
            this.expanded ? 1800 : SCENE.width + 360,
            this.expanded ? 1450 : SCENE.height + 600,
          );
          this.cameras.main.startFollow(this.actors.focus, true, 1, 1, 0, 25);
        } else {
          this.cameras.main.setBounds(
            -220,
            -220,
            this.expanded ? 1650 : 1450,
            this.expanded ? 1100 : 950,
          );
          this.cameras.main.stopFollow();
          this.cameras.main.centerOn(
            this.expanded ? 605 : 505,
            this.expanded ? 290 : 250,
          );
        }
      }
      update() {
        if (!this.actors || !this.keys) return;
        const g = live.current.state,
          now = Date.now(),
          serverNow = now + live.current.offset;
        const progress = g.progress,
          actor = progress.actors[live.current.actorId];
        if (this.expanded !== progress.upgrades.capacity > 0) {
          this.expanded = progress.upgrades.capacity > 0;
          this.environment.sync(this.expanded);
          this.configureCamera();
        }
        const starter = Object.values(progress.cars).find(
          (car) => car.source === "starter",
        )!;
        const preparing = Object.values(progress.tasks).find(
          (task) =>
            task.status === "started" &&
            task.station === "starter" &&
            (task.workPosition ?? 0) === 0 &&
            task.carId,
        );
        const displayedCar =
          progress.cars[preparing?.carId || live.current.carId || ""] ||
          starter;
        const s = {
          character: g.profile.character,
          travel: actor.travel,
          work: actor.taskId ? progress.tasks[actor.taskId] : null,
          parts: actor.carrying,
          restored: displayedCar.restored,
          race: Object.values(progress.races).find(
            (race) =>
              race.carId === displayedCar.id && race.status === "started",
          ),
        };
        const p = positionAt(actor, serverNow);
        this.actors.update(g, live.current.actorId, serverNow);
        this.traffic.sync(g);
        const flight = this.traffic.flights.values().next().value;
        if (!flight) this.trafficFollowCancelled = false;
        if (
          flight &&
          (actor.travel ||
            Object.values(this.keys).some((k) => k.isDown) ||
            joystick.current.x ||
            joystick.current.y ||
            (this.lastActorId !== undefined &&
              this.lastActorId !== live.current.actorId))
        )
          this.trafficFollowCancelled = true;
        this.lastActorId = live.current.actorId;
        const focus =
          flight && !this.trafficFollowCancelled ? flight.root : undefined;
        if (this.scale.width < 700 && focus !== this.trafficFocus) {
          this.cameras.main.startFollow(
            focus || this.actors.focus,
            true,
            1,
            1,
            0,
            25,
          );
          this.trafficFocus = focus;
        }
        const appearance = carAppearance(displayedCar);
        this.starter.sync(
          s.race ||
            this.traffic.flights.has(displayedCar.id) ||
            carBay(g, displayedCar.id) === 1 ||
            Object.values(progress.tasks).some(
              (t) =>
                t.status === "started" &&
                t.carId === displayedCar.id &&
                t.workPosition === 1,
            )
            ? null
            : displayedCar.id,
          appearance.frame,
          appearance.texture,
          false,
        );
        this.annex.sync(
          g,
          live.current.carId || starter.id,
          this.traffic.flights,
        );
        if (this.lastStationState !== g || this.lastCarId !== displayedCar.id) {
          this.lastStationState = g;
          this.equipment.sync(g);
          this.annexEquipment.sync(g);
          this.lastCarId = displayedCar.id;
          this.stationTitles
            .get("starter")
            ?.setText(CARS[displayedCar.tier].name);
          const colors = {
            idle: "#52655a",
            waiting: "#795024",
            ready: "#32644b",
            working: "#8f3f2d",
          };
          for (const [station, label] of this.stationLabels) {
            const view = stationView(g, station, displayedCar.id);
            if (station === "starter" && carBay(g, displayedCar.id) === 1) {
              view.label = "Free bay";
              view.tone = "idle";
            }
            label
              .setText(view.label + (view.parts ? "\n" + view.parts : ""))
              .setBackgroundColor(colors[view.tone]);
            this.customerCars.get(station)?.sync(view.customerId, 1);
          }
          this.waitingCustomer.setVisible(
            Object.values(g.progress.jobs).some((j) => j.status === "offered"),
          );
        }
        if (inputBlocked()) {
          joystick.current = { x: 0, y: 0 };
          this.input.keyboard?.resetKeys();
          return;
        }
        const screenX =
          (this.keys.D.isDown ? 1 : 0) -
          (this.keys.A.isDown ? 1 : 0) +
          joystick.current.x;
        const screenY =
          (this.keys.S.isDown ? 1 : 0) -
          (this.keys.W.isDown ? 1 : 0) +
          joystick.current.y;
        if ((screenX || screenY) && now - this.lastMove > 400 && !s.work) {
          this.lastMove = now;
          const a = unproject({ x: 360 + screenX, y: 60 + screenY }),
            length = Math.hypot(a.x, a.y);
          const bounds = garageBounds(this.expanded);
          live.current.send({
            type: "move",
            actorId: live.current.actorId,
            target: {
              x: Math.round(
                Phaser.Math.Clamp(
                  p.x + (a.x / length) * 44,
                  bounds.minX,
                  bounds.maxX,
                ),
              ),
              y: Math.round(
                Phaser.Math.Clamp(
                  p.y + (a.y / length) * 44,
                  bounds.minY,
                  bounds.maxY,
                ),
              ),
            },
          });
        }
      }
    }
    let game: Phaser.Game | undefined;
    const parent = host.current,
      mobile = () => matchMedia("(max-width: 700px)").matches;
    const boot = window.setTimeout(() => {
      game = new Phaser.Game({
        type: Phaser.AUTO,
        width: mobile() ? 550 : SCENE.width,
        height: mobile() ? 620 : SCENE.height,
        parent,
        backgroundColor: "#597364",
        scene: Scene,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        render: { antialias: true },
        input: { keyboard: { capture: [] } },
        audio: { noAudio: true },
      });
    }, 0);
    const reset = () => {
      joystick.current = { x: 0, y: 0 };
      game?.scene
        .getScenes()
        .forEach((scene) => scene.input.keyboard?.resetKeys());
    };
    let resizeFrame = 0;
    const resize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        if (!game?.isBooted) return;
        // setGameSize refreshes FIT using cached parent bounds. Read the laid-out
        // container first, otherwise CSS can narrow a still-tall desktop canvas.
        game.scale.getParentBounds();
        game.scale.setGameSize(
          mobile() ? 550 : SCENE.width,
          mobile() ? 620 : SCENE.height,
        );
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", reset);
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(resizeFrame);
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", reset);
      window.removeEventListener("resize", resize);
      window.clearTimeout(boot);
      game?.canvas?.remove();
      game?.destroy(true);
    };
  }, []);
  return (
    <div className="garage-visual">
      <div className="garage-stage">
        <div className="scene-hud" aria-label="Live garage resources">
          <span>
            <small>Credits</small>
            <b>{state.progress.credits.toLocaleString()}</b>
          </span>
          <span>
            <small>REP</small>
            <b>{state.progress.rep.toLocaleString()}</b>
          </span>
          <span>
            <small>Parts</small>
            <b>
              {state.progress.actors[actorId].carrying} /{" "}
              {state.progress.actors[actorId].role === "Runner"
                ? state.progress.actors[actorId].level + 1
                : 2}
            </b>
          </span>
        </div>
        <div
          ref={host}
          className="phaser-host"
          role="img"
          aria-label="Angled garage. Walk with WASD or the joystick. Station buttons provide an alternative to clicking the scene."
        />
        <div className="scene-caption">
          <span className="desktop-movement-hint">
            WASD to walk · E to interact · click a station
          </span>
          <span className="mobile-movement-hint">
            Move with the joystick. Tap a station to work.
          </span>
          <span>{state.profile.character} / GARAGE</span>
        </div>
        <div
          className="joystick"
          aria-label="Virtual joystick"
          role="group"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const r = e.currentTarget.getBoundingClientRect();
            joystick.current = {
              x: (e.clientX - r.left - r.width / 2) / 40,
              y: (e.clientY - r.top - r.height / 2) / 40,
            };
          }}
          onPointerMove={(e) => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
            const r = e.currentTarget.getBoundingClientRect();
            joystick.current = {
              x: (e.clientX - r.left - r.width / 2) / 40,
              y: (e.clientY - r.top - r.height / 2) / 40,
            };
          }}
          onPointerUp={() => {
            joystick.current = { x: 0, y: 0 };
          }}
          onPointerCancel={() => {
            joystick.current = { x: 0, y: 0 };
          }}
          onLostPointerCapture={() => {
            joystick.current = { x: 0, y: 0 };
          }}
        >
          <span>MOVE</span>
        </div>
      </div>
      <GarageFeedback state={state} />
    </div>
  );
}
