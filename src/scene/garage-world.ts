import * as T from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { WorkshopDressing } from "./workshop-dressing";
import type { ServicePose } from "./crew-service-animation";
import { BAY, buildGarageArchitecture, toGarageWorld, WORLD_SCALE } from "./garage-architecture";
import { CrewActor, preloadCrew, type CrewCharacter, type GaitPreview } from "./gus-model";
import { preloadGarageSurface } from "./garage-surface-asset";
import type { Point } from "../../packages/game-core";
import { cameraRelativeMove, DEFAULT_GARAGE_CAMERA, normalizeGarageCamera, type GarageCameraSettings } from "./garage-camera";
import { ServiceTraffic } from "./service-traffic";
export async function preloadGarageCrew() { await Promise.all([preloadCrew(), preloadGarageSurface()]); }

/** The room and skinned actor share one depth buffer, lighting and camera. */
export class GarageWorld {
  readonly renderer: T.WebGLRenderer;
  readonly scene = new T.Scene();
  readonly camera = new T.OrthographicCamera(-10, 10, 8, -8, .1, 160);
  readonly architecture = buildGarageArchitecture();
  readonly traffic = new ServiceTraffic();
  actor: CrewActor;
  character: CrewCharacter;
  readonly focus = new T.Vector3();
  private overview = false;
  private district = false;
  private inspectionBay: number | null = null;
  private cameraSettings = DEFAULT_GARAGE_CAMERA;
  private cameraSource = DEFAULT_GARAGE_CAMERA;
  private width = 1;
  private height = 1;
  private heading = 0;
  private shadowTexture: T.CanvasTexture;
  private shadow: T.Mesh<T.PlaneGeometry, T.MeshBasicMaterial>;
  private frame = 0;
  private observer: ResizeObserver;
  private environment: T.WebGLRenderTarget;
  private dressing = new WorkshopDressing();
  constructor(private host: HTMLElement, character: CrewCharacter, start: Point) {
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:none";
    host.appendChild(this.renderer.domElement);
    this.scene.background = new T.Color("#b5bcad");
    // One baked light environment supplies broad reflections without an extra
    // screen-space pass, reflective mirrors or a render on every frame.
    const environment = new RoomEnvironment(), pmrem = new T.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(environment, .06);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = .38;
    environment.dispose(); pmrem.dispose();
    this.scene.add(this.architecture.root);
    this.scene.add(this.dressing.root);
    this.scene.add(this.traffic.root);
    this.scene.add(new T.HemisphereLight(0xe5eeff, 0x777060, 1.25));
    const sun = new T.DirectionalLight(0xffdfae, 2.9);
    sun.position.set(-12, 24, -15); sun.target.position.set(16, 0, 6);
    sun.castShadow = true;
    const shadowSize = host.clientWidth < 650 ? 2048 : 4096;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 28, bottom: -28, near: .5, far: 100 });
    sun.shadow.bias = -.00012; sun.shadow.normalBias = .018;
    this.scene.add(sun, sun.target);
    const fill = new T.DirectionalLight(0xc9dcf4, .8); fill.position.set(4, 10, 12); this.scene.add(fill);
    for (let bay = 0; bay < 3; bay++) {
      const lamp = new T.PointLight(0xffae39, 6, 5, 2);
      lamp.position.set(bay * BAY.width + BAY.width - .5, 2.3, .6); this.scene.add(lamp);
    }
    this.actor = new CrewActor(character); this.character = character; this.scene.add(this.actor.model);
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const ctx = c.getContext("2d")!, gradient = ctx.createRadialGradient(64, 64, 3, 64, 64, 62);
    gradient.addColorStop(0, "rgba(37,27,21,.35)"); gradient.addColorStop(.45, "rgba(37,27,21,.16)"); gradient.addColorStop(1, "rgba(37,27,21,0)");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
    this.shadowTexture = new T.CanvasTexture(c);
    this.shadow = new T.Mesh(new T.PlaneGeometry(1.4, 1.0), new T.MeshBasicMaterial({ map: this.shadowTexture, transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.scene.add(this.shadow);
    this.focus.copy(toGarageWorld(start)); this.focus.y = .65;
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host);
    this.resize();
    this.update(start, { x: 0, y: 0 }, 0, false);
  }
  private resize() {
    this.width = Math.max(1, this.host.clientWidth); this.height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(this.width, this.height, false);
    this.updateFrustum();
  }
  private updateFrustum() {
    const height = this.overview ? this.district ? Math.max(60, 116 * this.height / this.width) : Math.max(30, 52 * this.height / this.width) : 14 / this.cameraSettings.zoom;
    this.camera.top = height / 2; this.camera.bottom = -height / 2;
    this.camera.left = -height / 2 * this.width / this.height; this.camera.right = -this.camera.left;
    this.camera.updateProjectionMatrix();
  }
  setCameraSettings(settings: GarageCameraSettings) {
    if (settings === this.cameraSource) return;
    this.cameraSource = settings; this.cameraSettings = normalizeGarageCamera(settings); this.updateFrustum();
  }
  setOverview(on: boolean, district = false) { this.inspectionBay = null; this.overview = on; this.district = on && district; this.architecture.setFacade(true); this.resize(); }
  setRoofsVisible(visible: boolean) { this.architecture.roofs.forEach(r => { r.visible = visible; }); }
  inspectBay(index: number) {
    this.setOverview(false); this.inspectionBay = Math.max(0, Math.min(2, index));
    this.architecture.roofs.forEach((roof, i) => { roof.visible = i + 1 !== this.inspectionBay; });
  }
  setCharacter(character: CrewCharacter, gait: GaitPreview) {
    if (this.character !== character) {
      const next = new CrewActor(character); next.yaw = this.actor.yaw;
      next.model.position.copy(this.actor.model.position);
      this.actor.dispose(); this.actor = next; this.character = character;
      this.scene.add(next.model);
    }
    this.actor.setGait(gait);
  }
  update(position: Point, velocity: Point, deltaSeconds: number, reducedMotion: boolean, work?: ServicePose) {
    const p = toGarageWorld(position), speed = Math.hypot(velocity.x, velocity.y) * WORLD_SCALE;
    if (speed > .06) this.heading = Math.atan2(velocity.x, velocity.y);
    // The gait was authored at 216px/3.5 units. Use real ground distance here;
    // zoom and camera angle cannot affect animation cadence.
    this.actor.model.position.copy(p);
    this.actor.setWork(work);
    this.actor.update(deltaSeconds, work?.heading ?? this.heading, speed * 216 / 3.5, reducedMotion);
    this.actor.model.position.copy(p);
    this.shadow.position.set(p.x, .03, p.z);
    this.traffic.update(deltaSeconds, p);
    this.renderCamera(position, deltaSeconds);
  }
  /** Preview a camera adjustment without advancing the actor, traffic or service work. */
  renderCamera(position: Point, deltaSeconds: number) {
    const p = toGarageWorld(position);
    const config = this.cameraSettings;
    const anchor = config.follow ? p.clone() : toGarageWorld({ x: config.anchorX, y: config.anchorY });
    const shift = cameraRelativeMove(config.offsetX, config.offsetZ, config.yaw);
    const target = this.overview ? this.district ? new T.Vector3(2, .1, 7) : new T.Vector3(BAY.width * 1.5 + 3.2, .1, BAY.depth / 2 + 1) : this.inspectionBay !== null ? new T.Vector3(BAY.width * (this.inspectionBay + .5), .65, BAY.depth / 2) : anchor.add(new T.Vector3(shift.x, config.targetHeight, shift.y));
    this.focus.lerp(target, deltaSeconds ? 1 - Math.exp(-Math.min(.05, deltaSeconds) / .12) : 1);
    const tilt = config.tilt * Math.PI / 180, yaw = config.yaw * Math.PI / 180;
    this.camera.position.copy(this.focus).add(this.overview ? new T.Vector3(0, 32, 19) : new T.Vector3(Math.sin(yaw) * Math.cos(tilt) * 32, Math.sin(tilt) * 32, Math.cos(yaw) * Math.cos(tilt) * 32));
    this.camera.lookAt(this.focus);
    this.renderer.render(this.scene, this.camera);
    // Read-only diagnostics, sampled to avoid turning the HUD into per-frame DOM work.
    if (++this.frame % 3 === 0) {
      this.host.dataset.drawCalls = String(this.renderer.info.render.calls);
      this.host.dataset.triangles = String(this.renderer.info.render.triangles);
      this.host.dataset.geometry = "garage-3d-v4";
      this.host.dataset.cameraTilt = String(config.tilt);
      this.host.dataset.cameraRotation = String(config.yaw);
      this.host.dataset.cameraZoom = String(config.zoom);
      this.host.dataset.cameraFollow = String(config.follow);
      this.host.dataset.cameraHeight = String(config.targetHeight);
      this.host.dataset.cameraOffsetX = String(config.offsetX);
      this.host.dataset.cameraOffsetZ = String(config.offsetZ);
      this.host.dataset.frontWall = "open-service-post";
      this.host.dataset.trafficPhase = this.traffic.phase;
      this.host.dataset.trafficYielding = String(this.traffic.yielding);
      this.host.dataset.carX = this.traffic.pose.x.toFixed(3);
      this.host.dataset.carZ = this.traffic.pose.z.toFixed(3);
      this.host.dataset.carSpeed = this.traffic.speed.toFixed(3);
    }
  }
  dispose() {
    this.observer.disconnect(); this.actor.dispose(); this.architecture.dispose(); this.traffic.dispose();
    this.shadow.geometry.dispose(); this.shadow.material.dispose(); this.shadowTexture.dispose();
    this.scene.traverse(o => { if (o instanceof T.Light && "shadow" in o) (o as T.DirectionalLight).shadow?.dispose(); });
    this.dressing.dispose(); this.environment.dispose();
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove();
  }
}
