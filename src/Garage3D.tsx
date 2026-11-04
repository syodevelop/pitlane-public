import { useEffect, useRef, useState } from "react";
import { INTERIOR, interiorAt, type Command, type Garage } from "../packages/game-core";
import { InteriorMotion } from "./scene/interior-motion";
import { GarageWorld } from "./scene/garage-world";
import type { CrewCharacter, GaitPreview } from "./scene/gus-model";
import { cameraRelativeMove, DEFAULT_GARAGE_CAMERA, type GarageCameraSettings } from "./scene/garage-camera";
import { clipWalkAtCar } from "./scene/service-route";
import { WORLD_SCALE } from "./scene/garage-architecture";

export default function Garage3D(props: {
  state: Garage; offset: number; busy: boolean; send: (command: Command) => void;
  onReady: () => void; previewCharacter?: string; previewGait?: GaitPreview;
  cameraSettings?: GarageCameraSettings; previewVehicle?: string;
}) {
  const host = useRef<HTMLDivElement>(null), stick = useRef({ x: 0, y: 0 }), live = useRef(props);
  const [trafficLabel, setTrafficLabel] = useState("Client approaching");
  live.current = props;
  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    const initial = interiorAt(live.current.state.progress.interior, Date.now() + live.current.offset);
    const character = () => (live.current.previewCharacter || live.current.state.profile.character || "Gus").toLowerCase() as CrewCharacter;
    const world = new GarageWorld(element, character(), initial), motion = new InteriorMotion(initial);
    const keys = new Set<string>();
    const moveKeys = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"]);
    const blocked = () => document.hidden || !!document.querySelector('[data-garage-blocked="true"], dialog[open]') || !!document.activeElement?.closest('[data-local-crew-controls], [data-camera-controls], input, textarea, select, [contenteditable="true"]');
    const keyDown = (e: KeyboardEvent) => { const key = e.key.toLowerCase(); if (moveKeys.has(key) && !blocked()) { e.preventDefault(); keys.add(key); } };
    const keyUp = (e: KeyboardEvent) => { if (moveKeys.has(e.key.toLowerCase())) { if (!blocked()) e.preventDefault(); keys.delete(e.key.toLowerCase()); } };
    const clear = () => { keys.clear(); stick.current = { x: 0, y: 0 }; };
    window.addEventListener("keydown", keyDown); window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", clear); document.addEventListener("visibilitychange", clear);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0, lastTime = performance.now(), lastSend = 0, moving = false, lastDirection = { x: 0, y: 0 }, ready = false, lastTrafficLabel = "";
    const tick = (time: number) => {
      const dt = Math.min(50, Math.max(0, time - lastTime)); lastTime = time;
      const current = live.current, now = Date.now() + current.offset;
      const p = interiorAt(current.state.progress.interior, now), visual = motion.step(p, dt);
      const camera = current.cameraSettings || DEFAULT_GARAGE_CAMERA;
      world.setCameraSettings(camera);
      world.setCharacter(character(), current.previewGait || "relaxed");
      world.traffic.setPreview(current.previewVehicle);
      world.update(visual, motion.velocity, dt / 1000, reduced.matches);
      const label = world.traffic.yielding ? "Clear the lane for the car" : world.traffic.phase === "stopped" ? "Service stop" : world.traffic.phase === "departing" ? "Client leaving" : "Client approaching";
      if (label !== lastTrafficLabel) { setTrafficLabel(label); lastTrafficLabel = label; }
      const actor = world.actor;
      Object.assign(element.dataset, {
        x: p.x.toFixed(2), y: p.y.toFixed(2), visualX: visual.x.toFixed(2), visualY: visual.y.toFixed(2),
        cameraX: (world.focus.x / .032).toFixed(2), cameraY: (world.focus.z / .032).toFixed(2),
        yaw: actor.yaw.toFixed(5), stride: actor.stride.toFixed(5), walkWeight: actor.walkWeight.toFixed(4),
        headTurn: actor.headTurn.toFixed(6), idleMix: (1 - actor.walkWeight).toFixed(4),
        renderMode: `${world.character}-3d`, gait: current.previewGait || "relaxed", fleetId: world.traffic.client.id,
      });
      if (!ready) { ready = true; current.onReady(); }
      if (blocked()) clear();
      let dx = stick.current.x + Number(keys.has("d") || keys.has("arrowright")) - Number(keys.has("a") || keys.has("arrowleft"));
      let dy = stick.current.y + Number(keys.has("s") || keys.has("arrowdown")) - Number(keys.has("w") || keys.has("arrowup"));
      const length = Math.hypot(dx, dy); if (length > .1) { dx /= length; dy /= length; }
      const direction = cameraRelativeMove(dx, dy, camera.yaw); dx = direction.x; dy = direction.y;
      const turning = length > .1 && dx * lastDirection.x + dy * lastDirection.y < .95;
      if (!current.busy && (turning || length <= .1 && moving || now - lastSend >= 160)) {
        if (length > .1) {
          let target = { x: Math.max(INTERIOR.minX, Math.min(INTERIOR.accessibleWidth - 18, p.x + dx * 36)), y: Math.max(18, Math.min(INTERIOR.height - 18, p.y + dy * 36)) };
          const safe = clipWalkAtCar({ x: p.x * WORLD_SCALE, z: p.y * WORLD_SCALE }, { x: target.x * WORLD_SCALE, z: target.y * WORLD_SCALE }, world.traffic.pose);
          target = { x: safe.x / WORLD_SCALE, y: safe.z / WORLD_SCALE };
          if (Math.hypot(target.x - p.x, target.y - p.y) > .5) {
            current.send({ type: "interiorMove", target }); lastSend = now; moving = true; lastDirection = { x: dx, y: dy };
          } else if (moving) { current.send({ type: "interiorStop" }); moving = false; lastSend = now; }
        } else if (moving) { current.send({ type: "interiorStop" }); moving = false; lastSend = now; }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame); window.removeEventListener("keydown", keyDown); window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", clear); document.removeEventListener("visibilitychange", clear); world.dispose();
    };
  }, []);
  return <>
    <div className="service-traffic-status"><span>Traffic preview</span><strong>{trafficLabel}</strong></div>
    <div ref={host} className="interior-canvas" tabIndex={0} onPointerDown={e => e.currentTarget.focus({ preventScroll: true })} aria-label="Walk around your 3D garage" />
    <div className="interior-stick" role="group" aria-label="Movement joystick"
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); const r = e.currentTarget.getBoundingClientRect(); stick.current = { x: (e.clientX - r.left - r.width / 2) / 40, y: (e.clientY - r.top - r.height / 2) / 40 }; }}
      onPointerMove={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) return; const r = e.currentTarget.getBoundingClientRect(); stick.current = { x: (e.clientX - r.left - r.width / 2) / 40, y: (e.clientY - r.top - r.height / 2) / 40 }; }}
      onPointerUp={() => { stick.current = { x: 0, y: 0 }; }} onPointerCancel={() => { stick.current = { x: 0, y: 0 }; }} onLostPointerCapture={() => { stick.current = { x: 0, y: 0 }; }}
    ><span aria-hidden="true">✥</span></div>
  </>;
}
