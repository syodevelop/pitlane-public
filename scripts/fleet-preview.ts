import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { FleetCar } from "../src/scene/fleet-car";
import { FLEET, FLEET_KINDS, FLEET_MODELS, MODELS, FLEET_IDS, parseFleetId, type FleetId, type FleetModel, type FleetVariant } from "../src/scene/fleet-catalogue";

const host = document.querySelector<HTMLElement>("#scene")!;
const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = .94;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
host.appendChild(renderer.domElement);
const scene = new T.Scene(); scene.background = new T.Color("#d6dacb");
const generator = new T.PMREMGenerator(renderer), room = new RoomEnvironment();
const environment = generator.fromScene(room, .04); scene.environment = environment.texture; scene.environmentIntensity = .55; room.dispose(); generator.dispose();
scene.add(new T.HemisphereLight(0xf5f3e8, 0x66706a, .9));
const sun = new T.DirectionalLight(0xfff4dd, 2.6); sun.position.set(-4, 8, -5); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: .1, far: 30 });
sun.shadow.bias = -.00008; sun.shadow.normalBias = .012; scene.add(sun);
const fill = new T.DirectionalLight(0xc6d9e6, .8); fill.position.set(4, 3, 4); scene.add(fill);
const ground = new T.Mesh(new T.PlaneGeometry(200, 200), new T.ShadowMaterial({ color: "#243126", opacity: .22 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -.016; ground.receiveShadow = true; scene.add(ground);
const camera = new T.OrthographicCamera(-4, 4, 3, -3, .1, 100);
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.maxPolarAngle = Math.PI / 2 - .04; controls.minDistance = 3; controls.maxDistance = 16; controls.minZoom = .6; controls.maxZoom = 2.5;
let car = new FleetCar(), model: FleetModel = "rustback", variant: FleetVariant = "standard", turntable = false;
scene.add(car.root);
function resetCamera() { camera.position.set(-6.8, 5.6, -8.6); controls.target.set(0, .48, 0); camera.zoom = 1; controls.update(); camera.updateProjectionMatrix(); }
function resize() { const width = host.clientWidth, height = host.clientHeight, a = width / height, half = Math.max(3.25, 3.1 / a); camera.left = -half * a; camera.right = half * a; camera.top = half; camera.bottom = -half; camera.updateProjectionMatrix(); renderer.setSize(width, height); }
function render() { renderer.render(scene, camera); }
function select(id: FleetId) {
  const item = parseFleetId(id); if (!item) throw new Error(`Invalid car ${id}`);
  model = item.model; variant = item.variant; car.dispose(); car = new FleetCar(id); scene.add(car.root);
  document.querySelector("#name")!.textContent = car.spec.name;
  document.querySelector("#class")!.textContent = `${FLEET[item.kind].name} class · ${variant}`;
  document.querySelector("#dimensions")!.textContent = `${car.spec.length.toFixed(2)} m × ${car.spec.width.toFixed(2)} m · 360° model`;
  document.querySelectorAll<HTMLButtonElement>("[data-model]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.model === model)));
  document.querySelectorAll<HTMLButtonElement>("[data-variant]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.variant === variant)));
  render(); return describe();
}
function describe() {
  car.root.updateMatrixWorld(true); const bounds = new T.Box3().setFromObject(car.root), size = bounds.getSize(new T.Vector3());
  let triangles = 0, finite = true;
  car.root.traverse(o => { if (o instanceof T.Mesh) { const g = o.geometry; triangles += (g.index?.count || g.attributes.position.count) / 3; for (const v of g.attributes.position.array) if (!Number.isFinite(v)) finite = false; } });
  return { id: car.id, dimensions: size.toArray(), bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, triangles, finite, wheels: car.wheels.length, steering: car.frontPivots.length, footprint: car.footprint, calls: renderer.info.render.calls, memory: { ...renderer.info.memory } };
}
async function exportCar() {
  const rotation = car.root.rotation.y; car.root.rotation.y = 0; car.root.updateMatrixWorld(true);
  const result = await new GLTFExporter().parseAsync(car.root, { binary: true, onlyVisible: true }); car.root.rotation.y = rotation;
  const bytes = new Uint8Array(result as ArrayBuffer); let str = ""; for (let i = 0; i < bytes.length; i += 8192) str += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(str);
}
const nav = document.querySelector("#models")!;
for (const kind of FLEET_KINDS) {
  const section = document.createElement("section"), title = document.createElement("h3"); title.textContent = FLEET[kind].name; section.append(title);
  for (const key of FLEET_MODELS.filter(k => MODELS[k].kind === kind)) {
    const button = document.createElement("button"); button.dataset.model = key; button.textContent = MODELS[key].name;
    button.onclick = () => select(`${key}:${variant}`); section.append(button);
  }
  nav.append(section);
}
document.querySelectorAll<HTMLButtonElement>("[data-variant]").forEach(button => { button.onclick = () => select(`${model}:${button.dataset.variant as FleetVariant}`); });
document.querySelector("#reset")!.addEventListener("click", resetCamera);
document.querySelector("#rotate")!.addEventListener("click", () => { turntable = !turntable; document.querySelector("#rotate")!.setAttribute("aria-pressed", String(turntable)); });
document.querySelector("#download")!.addEventListener("click", async () => {
  const base64 = await exportCar(), a = document.createElement("a"); a.href = "data:model/gltf-binary;base64," + base64; a.download = car.id.replace(":", "-") + ".glb"; a.click();
});
new ResizeObserver(resize).observe(host); resize(); resetCamera(); select("rustback:standard");
let last = performance.now();
function tick(now: number) { const dt = Math.min(.05, (now - last) / 1000); last = now; if (turntable) car.root.rotation.y += dt * .25; controls.update(); render(); requestAnimationFrame(tick); }
requestAnimationFrame(tick);
Object.assign(window, { FLEET_REVIEW: { ids: FLEET_IDS, models: FLEET_MODELS, select, describe, exportCar,
  capture: (id: FleetId, angle = "front") => {
    select(id); car.root.rotation.set(0, 0, 0); controls.target.set(0, .52, 0); camera.zoom = 1.17;
    const views: Record<string, [number, number, number]> = { front: [-6.8, 5.6, -8.6], rear: [6.8, 5.6, 8.6], side: [-8, 1.8, 0], "side-right": [8, 1.8, 0], "front-low": [6, 1.4, -8], "rear-low": [-6, 1.4, 8] };
    camera.position.set(...(views[angle] || views.front));
    controls.update(); camera.updateProjectionMatrix(); render(); return renderer.domElement.toDataURL("image/png");
  }, animate: () => { car.animate(1, .35, true, true, .1); render(); return { wheel: car.wheels[0].rotation.x, steer: car.frontPivots[0].rotation.y }; },
} });
