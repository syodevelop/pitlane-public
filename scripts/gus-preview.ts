import { GusModel, preloadCharacter, type CrewCharacter } from "../src/scene/gus-model";

// Standalone model review, no login, API calls, game state or public app route.
declare global {
  interface Window {
    GUS_GLB: string;
    CREW_CHARACTER?: CrewCharacter;
  }
}
async function main() {
  const character = window.CREW_CHARACTER || "gus";
  await preloadCharacter(character, window.GUS_GLB);
  const gus = new GusModel(Math.min(devicePixelRatio, 2) * 700, character);
  const canvas = gus.renderer.domElement;
  document.querySelector("#model")!.append(canvas);
  const angle = document.querySelector<HTMLInputElement>("#angle")!;
  const motion = document.querySelector<HTMLSelectElement>("#motion")!;
  const turn = document.querySelector<HTMLInputElement>("#turn")!;
  const height = document.querySelector<HTMLInputElement>("#height")!;
  let yaw = 0,
    last = performance.now(),
    dragging = false,
    pointer = 0;
  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    pointer = e.clientX;
    canvas.setPointerCapture(e.pointerId);
    turn.checked = false;
  });
  canvas.addEventListener("pointermove", (e) => {
    if (dragging) {
      yaw += (e.clientX - pointer) * 0.012;
      pointer = e.clientX;
    }
  });
  canvas.addEventListener("pointerup", () => {
    dragging = false;
  });
  canvas.addEventListener("pointercancel", () => {
    dragging = false;
  });
  angle.addEventListener("input", () => {
    yaw = (+angle.value * Math.PI) / 180;
    turn.checked = false;
  });
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (turn.checked) yaw += dt * 0.4;
    angle.value = String(((((yaw * 180) / Math.PI) % 360) + 360) % 360);
    gus.camera.position.set(0, 1.36 + +height.value, 8);
    gus.camera.lookAt(0, 1.36, 0);
    gus.update(dt, yaw, motion.value === "Walk" ? 105 : 0, reduced);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  document.querySelector("#loading")!.remove();
}
main().catch(() => {
  document.querySelector("#loading")!.textContent =
    "The 3D preview could not start. Open this file in Chrome or Edge with WebGL enabled.";
});
