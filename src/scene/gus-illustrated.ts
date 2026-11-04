import * as T from "three";

export const GUS_ILLUSTRATED_URL = "/art/gus-illustrated-v4.png";
let atlas: T.Texture | undefined;
let loading: Promise<void> | undefined;
export function preloadIllustratedGus() {
  return (loading ??= new T.TextureLoader()
    .loadAsync(GUS_ILLUSTRATED_URL)
    .then((t) => {
      t.colorSpace = T.SRGBColorSpace;
      t.minFilter = T.LinearMipmapLinearFilter;
      t.magFilter = T.LinearFilter;
      atlas = t;
    })
    .catch((e) => {
      loading = undefined;
      throw e;
    }));
}

/** A deformable 2D illustration, deliberately not a 360-degree 3D model.
 * All motion is cosmetic; the caller owns the authoritative ground anchor. */
export class GusIllustrated {
  readonly renderer: T.WebGLRenderer;
  readonly scene = new T.Scene();
  readonly camera = new T.OrthographicCamera(-192, 192, 314, -70, 0.1, 10);
  readonly geometry = new T.PlaneGeometry(320, 320, 32, 64);
  readonly material: T.MeshBasicMaterial;
  readonly mesh: T.Mesh;
  yaw = 0;
  walkWeight = 0;
  stride = 0;
  headTurn = 0;
  direction = 0;
  private elapsed = 0;
  private source: Float32Array;
  constructor(size = 384) {
    if (!atlas) throw Error("Gus illustration must finish loading");
    this.renderer = new T.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(size, size, false);
    this.renderer.setClearColor(0, 0);
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.camera.position.z = 5;
    this.material = new T.MeshBasicMaterial({
      map: atlas,
      transparent: true,
      depthWrite: false,
      side: T.DoubleSide,
    });
    this.mesh = new T.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    this.source = new Float32Array(this.geometry.attributes.uv.array);
    this.update(0, 0, 0, true);
  }
  update(dt: number, heading: number, speed: number, reducedMotion: boolean) {
    const seconds = Math.min(0.05, Math.max(0, dt));
    const gap = Math.atan2(
      Math.sin(heading - this.yaw),
      Math.cos(heading - this.yaw),
    );
    this.yaw += gap * (1 - Math.exp(-seconds / 0.085));
    this.direction = ((Math.round(this.yaw / (Math.PI / 4)) % 8) + 8) % 8;
    const frame = [0, 1, 2, 3, 4, 3, 2, 1][this.direction],
      flip = this.direction > 4;
    const target = T.MathUtils.smoothstep(speed, 8, 85);
    this.walkWeight +=
      (target - this.walkWeight) * (1 - Math.exp(-seconds / 0.1));
    this.stride += (seconds * Math.max(0, speed)) / 100;
    this.elapsed += seconds;
    const phase = this.stride * Math.PI * 2,
      weight = this.walkWeight;
    const breathe = reducedMotion
      ? 0
      : Math.sin(this.elapsed * 1.8) * (1 - weight);
    this.headTurn = reducedMotion
      ? 0
      : Math.sin(this.elapsed * 1.15) * 0.7 * (1 - weight);
    const positions = this.geometry.attributes.position,
      uv = this.geometry.attributes.uv;
    for (let i = 0; i < positions.count; i++) {
      const u = this.source[i * 2],
        v = 1 - this.source[i * 2 + 1];
      let x = (u - 0.5) * 320,
        y = (0.94921875 - v) * 320;
      const leg = Math.tanh((u - 0.5) / 0.014);
      const legWeight = T.MathUtils.smoothstep(v, 0.52, 0.91);
      const upper = 1 - T.MathUtils.smoothstep(v, 0.46, 0.6);
      const swing = Math.sin(phase) * leg;
      const profile = frame === 2 ? 1 : frame === 1 || frame === 3 ? 0.6 : 0.15;
      x += swing * 11 * profile * legWeight * weight;
      y += Math.max(0, swing) * 7 * legWeight * weight;
      y += upper * (Math.abs(Math.sin(phase)) * 1.4 * weight + breathe * 0.65);
      x += upper * (this.headTurn * T.MathUtils.smoothstep(1 - v, 0.65, 0.9));
      // Small counter-swing at the hands; avoid stretching the face or torso.
      const arm =
        T.MathUtils.smoothstep(Math.abs(u - 0.5), 0.11, 0.17) *
        (1 - T.MathUtils.smoothstep(v, 0.6, 0.67)) *
        T.MathUtils.smoothstep(v, 0.3, 0.54);
      x -= Math.sin(phase) * leg * arm * 2.5 * weight;
      positions.setXYZ(i, x, y, 0);
      uv.setXY(i, (frame + (flip ? 1 - u : u)) / 5, 1 - v);
    }
    positions.needsUpdate = true;
    uv.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
