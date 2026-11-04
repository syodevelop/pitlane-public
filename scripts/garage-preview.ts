import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { preloadCharacter } from "../src/scene/gus-model";
import { GarageWorld } from "../src/scene/garage-world";
import { preloadGarageSurface } from "../src/scene/garage-surface-asset";
import { SERVICE_STOP_DISTANCE } from "../src/scene/service-route";

declare global { interface Window { GARAGE_GUS: string; GARAGE_SURFACE: string; GARAGE_ROOF: string } }
async function start() {
  await Promise.all([preloadCharacter("gus", window.GARAGE_GUS), preloadGarageSurface(window.GARAGE_SURFACE, window.GARAGE_ROOF)]);
  const host = document.getElementById("scene")!;
  const world = new GarageWorld(host, "gus", { x: 90, y: 180 });
  world.actor.setGait("relaxed");
  let paused = false;
  const controls = new OrbitControls(world.camera, world.renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .09;
  controls.minPolarAngle = .15; controls.maxPolarAngle = Math.PI * .46;
  controls.minZoom = .5; controls.maxZoom = 3;
  const roofToggle = document.getElementById("roofs") as HTMLInputElement;
  const setView = (overview: boolean, district = false) => {
    paused = false;
    world.setRoofsVisible(!roofToggle.checked);
    world.camera.zoom = 1; world.setOverview(overview, district); world.update({ x: 90, y: 180 }, { x: 0, y: 0 }, 0, false);
    controls.target.copy(world.focus); controls.update();
  };
  document.getElementById("box")!.onclick = () => setView(false);
  document.getElementById("site")!.onclick = () => setView(true);
  document.getElementById("district")!.onclick = () => setView(true, true);
  const routeView = () => {
    setView(false);
    const h = Math.max(23, 35 * host.clientHeight / host.clientWidth);
    world.camera.top = h / 2; world.camera.bottom = -h / 2;
    world.camera.left = -h / 2 * host.clientWidth / host.clientHeight; world.camera.right = -world.camera.left;
    world.camera.updateProjectionMatrix(); world.focus.set(4.4, 0, 5.7);
    world.camera.position.set(8.9, 25, 24.7); controls.target.copy(world.focus); controls.update();
  };
  document.getElementById("route")!.onclick = routeView;
  document.getElementById("replay")!.onclick = () => { roofToggle.checked = false; world.traffic.reset(); routeView(); };
  document.getElementById("car")!.onclick = () => {
    setView(false); paused = true; world.traffic.distance = SERVICE_STOP_DISTANCE; world.traffic.phase = "stopped";
    world.traffic.update(.001);
    const aspect = host.clientWidth / host.clientHeight, h = Math.max(5.6, 8 / aspect);
    world.camera.top = h / 2; world.camera.bottom = -h / 2; world.camera.left = -h / 2 * aspect; world.camera.right = -world.camera.left;
    world.camera.updateProjectionMatrix(); world.camera.position.set(10.5, 4.8, -.6);
    controls.target.set(5.333, .70, 5.2); controls.update();
  };
  for (const index of [1, 2]) document.getElementById(`box${index + 1}`)!.onclick = () => {
    paused = false;
    roofToggle.checked = true;
    world.inspectBay(index); world.setRoofsVisible(false); world.update({ x: 166.67, y: 180 }, { x: 0, y: 0 }, 0, false);
    controls.target.copy(world.focus); controls.update();
  };
  roofToggle.onchange = () => world.setRoofsVisible(!roofToggle.checked);
  routeView();
  document.getElementById("loading")!.remove();
  let previous = performance.now(), frame = 0;
  const tick = (time: number) => {
    const dt = Math.min(.05, (time - previous) / 1000); previous = time;
    world.actor.update(dt, 0, 0, false);
    if (!paused) world.traffic.update(dt);
    const status = document.getElementById("traffic-status")!;
    const text = paused ? "Club 23 / 3D model" : world.traffic.phase === "stopped" ? "On the service post · 9-second preview stop" : world.traffic.phase === "departing" ? "Leaving for the upper road" : "Arriving from the lower road";
    if (status.textContent !== text) status.textContent = text;
    controls.update(); world.renderer.render(world.scene, world.camera); frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  window.addEventListener("pagehide", () => { cancelAnimationFrame(frame); controls.dispose(); world.dispose(); }, { once: true });
}
void start().catch(() => { document.getElementById("loading")!.textContent = "Could not open WebGL. Open this file in Chrome or Edge."; });
