import { createEnginePart } from "./engine-part";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { createRelaxedWalk } from "./relaxed-walk";
import { createServiceAnimation, createCrewIdle, serviceHandMotion, reachServicePoint, type ServicePose, type ServiceKind } from "./crew-service-animation";
import { createServiceTools } from "./service-tools";
import { createWorkshopWheel } from "./workshop-wheel";
export type GaitPreview = "original" | "relaxed";

export type CrewCharacter = "gus" | "dash" | "juno";
export const CREW_MODELS = { gus: "/models/gus-v5.glb", dash: "/models/dash-v1.glb", juno: "/models/juno-v1.glb" } as const;
const assets = new Map<string, GLTF>();
const pending = new Map<string, Promise<void>>();
export function preloadCharacter(character: CrewCharacter, url: string = CREW_MODELS[character]) {
  const key = `${character}:${url}`;
  if (pending.has(key)) return pending.get(key)!;
  const request = new GLTFLoader()
    .loadAsync(url)
    .then((gltf) => {
      if (
        !gltf.animations.some((a) => a.name === "Walk") ||
        !gltf.animations.some((a) => a.name === "Idle")
      )
        throw new Error(`${character} animation asset is incomplete`);
      assets.set(character, gltf);
    })
    .catch((error) => {
      pending.delete(key);
      throw error;
    });
  pending.set(key, request);
  return request;
}
// Kept for standalone Gus reviews and previous tooling.
export function preloadGus(url = CREW_MODELS.gus as string) { return preloadCharacter("gus", url); }
export function preloadCrew() { return Promise.all((Object.keys(CREW_MODELS) as CrewCharacter[]).map(c => preloadCharacter(c))); }

/** Shared skinned actor. Can live directly in a world scene without a second renderer. */
export class CrewActor {
  readonly model: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  private idle: THREE.AnimationAction;
  private walk: THREE.AnimationAction;
  private originalWalk: THREE.AnimationAction;
  private relaxedWalk?: THREE.AnimationAction;
  private gait: GaitPreview = "original";
  private work?: THREE.AnimationAction;
  private workActions = new Map<ServiceKind, THREE.AnimationAction>();
  private workKind?: ServiceKind;
  private workWeight = 0;
  private tools = createServiceTools();
  private servicePose?: ServicePose;
  private carriedWheel = createWorkshopWheel();
  private enginePart=createEnginePart();
  private carryingPart=false;
  private carrying = false;
  private carryWeight = 0;
  yaw = 0;
  walkWeight = 0;
  get stride() {
    return this.walk.time;
  }
  get headTurn() {
    return this.model.getObjectByName("Head")!.quaternion.y;
  }
  constructor(character: CrewCharacter = "gus") {
    const asset = assets.get(character);
    if (!asset)
      throw new Error(`${character} must be preloaded before entering the garage`);
    this.model = clone(asset.scene);
    // A soft cel palette keeps the solid model close to the illustrated world.
    const gradient = new THREE.DataTexture(
      new Uint8Array([100, 165, 215, 255]),
      4,
      1,
      THREE.RedFormat,
    );
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
    this.model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const convert = (source: THREE.Material) => {
        const material = source instanceof THREE.MeshBasicMaterial
          ? source.clone()
          : new THREE.MeshToonMaterial({
              color: (source as THREE.MeshStandardMaterial).color,
              gradientMap: gradient,
              side: source.side,
            });
        material.name = source.name;
        return material;
      };
      object.material = Array.isArray(object.material)
        ? object.material.map(convert)
        : convert(object.material);
      object.frustumCulled = false;
      object.castShadow = true;
      object.receiveShadow = true;
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    this.idle = this.mixer
      .clipAction(createCrewIdle(asset.animations.find((a) => a.name === "Idle")!))
      .play();
    this.walk = this.mixer
      .clipAction(asset.animations.find((a) => a.name === "Walk")!)
      .play();
    this.walk.setEffectiveWeight(0);
    this.originalWalk = this.walk;
    this.setGait("relaxed");
    this.model.getObjectByName("HandR")?.add(this.tools.root);
    this.model.add(this.carriedWheel.root,this.enginePart.root);
    this.enginePart.root.visible=false;
    this.carriedWheel.root.visible = false;
  }
  setEnginePart(carrying:boolean) { this.carryingPart=carrying; }
  setCarriedWheel(carrying: boolean) { this.carrying = carrying; }
  setWork(pose?: ServicePose) {
    // Retain the contact target while blending out of work; otherwise the hand
    // jumps from the lamp straight to its idle rotation on the first walk frame.
    if (pose) this.servicePose = pose;
    const kind = pose?.kind;
    if (this.workKind === kind) return;
    this.workKind = kind;
    if (kind) {
      this.work?.stop();
      if (!this.workActions.has(kind)) this.workActions.set(kind, this.mixer.clipAction(createServiceAnimation(kind)));
      this.work = this.workActions.get(kind)!.reset().play();
      this.work.setEffectiveWeight(this.workWeight);
      this.tools.cloth.visible = kind === "wipe";
      this.tools.ratchet.visible = kind === "repair" || kind === "bench";
      this.tools.scanner.visible = kind === "diagnose";
    }
  }
  setGait(gait: GaitPreview) {
    if (this.gait === gait) return;
    const previous=this.walk;
    const next=gait === "original" ? this.originalWalk : (this.relaxedWalk ??= this.mixer.clipAction(createRelaxedWalk()));
    next.reset().play();
    next.time=previous.time / previous.getClip().duration * next.getClip().duration;
    next.setEffectiveWeight(this.walkWeight).crossFadeFrom(previous,.18,false);
    this.walk=next;
    this.gait=gait;
  }
  update(dt: number, heading: number, speed: number, reducedMotion: boolean) {
    const seconds = Math.min(0.05, Math.max(0, dt));
    const gap = Math.atan2(
      Math.sin(heading - this.yaw),
      Math.cos(heading - this.yaw),
    );
    this.yaw += gap * (1 - Math.exp(-seconds / (this.servicePose ? 0.18 : 0.085)));
    this.model.rotation.y = this.yaw;
    const target = THREE.MathUtils.smoothstep(speed, 8, 85);
    this.walkWeight +=
      (target - this.walkWeight) * (1 - Math.exp(-seconds / 0.1));
    this.workWeight += ((this.workKind ? 1 : 0) - this.workWeight) * (1 - Math.exp(-seconds / .18));
    if (!this.workKind && this.workWeight < .015) this.servicePose = undefined;
    this.work?.setEffectiveWeight(this.workWeight);
    this.work?.setEffectiveTimeScale(reducedMotion ? .65 : 1);
    this.tools.root.visible = !!this.servicePose && this.workWeight > .08;
    this.walk.setEffectiveWeight(this.walkWeight * (1 - this.workWeight));
    this.walk.setEffectiveTimeScale(Math.max(0.15, speed / 92));
    this.idle.setEffectiveWeight((1 - this.walkWeight) * (1 - this.workWeight));
    this.idle.setEffectiveTimeScale(reducedMotion ? 0 : 1);
    if (reducedMotion) this.idle.time = 0;
    this.mixer.update(seconds);
    this.carryWeight += ((this.carrying || this.carryingPart ? 1 : 0) - this.carryWeight) * (1 - Math.exp(-seconds / .16));
    const wheelWork = this.servicePose?.kind === "wheel";
    this.carriedWheel.root.visible = this.carrying || wheelWork;
    const partWork=this.servicePose?.kind==="install";
    this.enginePart.root.visible=this.carryingPart || partWork;
    if (this.carrying || wheelWork || this.carryingPart || partWork) {
      const wheel = this.carryingPart || partWork ? this.enginePart.root : this.carriedWheel.root;
      const height = this.model.getObjectByName("Hips")!.position.y;
      wheel.position.set(0, height + .02, .56);
      wheel.rotation.set(0, 0, 0);
      if (!wheelWork && !partWork && !reducedMotion) {
        const sway = Math.sin(this.stride / this.walk.getClip().duration * Math.PI * 2);
        wheel.position.y += sway * .012 * this.walkWeight;
        wheel.rotation.z = sway * .018 * this.walkWeight;
      }
      if (wheelWork || partWork) {
        const pose = this.servicePose!;
        const center = pose.target.clone().add(new THREE.Vector3(Math.sin(pose.heading) * .14, 0, Math.cos(pose.heading) * .14));
        const local = this.model.worldToLocal(center);
        const reach = THREE.MathUtils.smoothstep(pose.progress || 0, .03, .30);
        wheel.position.lerp(local, reach);
        wheel.rotation.z = Math.sin((pose.progress || 0) * Math.PI * 6) * .035 * reach;
      }
      wheel.updateWorldMatrix(true, false);
      for (const [side, name] of [[-1, "L"], [1, "R"]] as const) {
        const grip = wheel.localToWorld(new THREE.Vector3(side * .32, .15, .04));
        const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.yaw, 0));
        reachServicePoint(this.model.getObjectByName("Arm" + name)!, this.model.getObjectByName("Forearm" + name)!,
          this.model.getObjectByName("Hand" + name)!, grip, orientation, new THREE.Vector3(0, -.13, .03), (wheelWork || partWork) ? this.workWeight : this.carryWeight);
      }
    }
    if (this.servicePose?.kind === "collect") {
      const pose = this.servicePose;
      for (const [side, name] of [[-1, "L"], [1, "R"]] as const) {
        const grip = pose.target.clone().add(new THREE.Vector3(Math.cos(pose.heading) * side * .30, .12, -Math.sin(pose.heading) * side * .30));
        reachServicePoint(this.model.getObjectByName("Arm" + name)!, this.model.getObjectByName("Forearm" + name)!,
          this.model.getObjectByName("Hand" + name)!, grip, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.yaw, 0)),
          new THREE.Vector3(0, -.13, 0), this.workWeight);
      }
    }
    if (this.servicePose && this.work && this.workWeight > .01 && !wheelWork && !partWork && this.servicePose.kind !== "collect") {
      const pose = this.servicePose, wipe = pose.kind === "wipe";
      const phase = this.work.time / this.work.getClip().duration * Math.PI * 2;
      const target = pose.target.clone();
      const motion = serviceHandMotion(pose.kind, phase);
      target.x += Math.cos(pose.heading) * motion.across;
      target.z -= Math.sin(pose.heading) * motion.across;
      target.y += motion.up;
      const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0,
        pose.heading + motion.turn, 0));
      reachServicePoint(this.model.getObjectByName("ArmR")!, this.model.getObjectByName("ForearmR")!,
        this.model.getObjectByName("HandR")!, target, orientation,
        new THREE.Vector3(0, wipe || pose.kind === "diagnose" ? -.13 : -.22, wipe ? .055 : pose.kind === "diagnose" ? .12 : .25), this.workWeight);
      if (!wipe) {
        const brace = pose.target.clone().add(new THREE.Vector3(
          Math.cos(pose.heading) * -.13 + Math.sin(pose.heading) * .22,
          .12, -Math.sin(pose.heading) * -.13 + Math.cos(pose.heading) * .22));
        reachServicePoint(this.model.getObjectByName("ArmL")!, this.model.getObjectByName("ForearmL")!,
          this.model.getObjectByName("HandL")!, brace,
          new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, -pose.heading)),
          new THREE.Vector3(0, -.13, 0), this.workWeight);
      }
    }
  }
  dispose() {
    this.enginePart.dispose();
    this.carriedWheel.dispose();
    this.tools.dispose();
    this.tools.root.removeFromParent();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    const textures = new Set<THREE.Texture>();
    this.model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        const gradient = (material as THREE.MeshToonMaterial).gradientMap;
        if (gradient) textures.add(gradient);
        material.dispose();
      }
      // Geometry belongs to the cached asset. A scene unmount must not dispose it.
      if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
    });
    textures.forEach((t) => t.dispose());
    this.model.removeFromParent();
  }
}

/** Compatibility renderer for the retained illustrated location and model reviews. */
export class GusModel extends CrewActor {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1.75, 1.75, 1.75, -1.75, .1, 30);
  constructor(size = 384, character: CrewCharacter = "gus") {
    super(character);
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(size, size, false);
    this.renderer.setClearColor(0, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(this.model, new THREE.HemisphereLight(0xfff3e2, 0x858797, 2.1));
    const key = new THREE.DirectionalLight(0xfff5e6, 1.7);
    key.position.set(-3, 6, 5);
    this.scene.add(key);
    const target = new THREE.Vector3(0, 1.36, 0);
    this.camera.position.copy(target).add(new THREE.Vector3(0, 5.5, 8));
    this.camera.lookAt(target);
    this.update(0, 0, 0, false);
  }
  override update(dt: number, heading: number, speed: number, reducedMotion: boolean) {
    super.update(dt, heading, speed, reducedMotion);
    this.renderer.render(this.scene, this.camera);
  }
  override dispose() {
    super.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
