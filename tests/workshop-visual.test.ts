import { describe, it, expect } from "vitest";
import * as T from "three";
import {
  createCrewIdle,
  createServiceAnimation,
  serviceHandMotion,
  type ServiceKind,
} from "../src/scene/crew-service-animation";
import { FleetCar } from "../src/scene/fleet-car";

describe("workshop visual continuity", () => {
  it("keeps contact strokes periodic, bounded and holds the ratchet still between turns", () => {
    for (const kind of [
      "wipe",
      "repair",
      "diagnose",
      "bench",
    ] as ServiceKind[]) {
      const start = serviceHandMotion(kind, 0),
        end = serviceHandMotion(kind, Math.PI * 2);
      for (const k of ["across", "up", "turn"] as const)
        expect(start[k]).toBeCloseTo(end[k], 8);
      for (let t = 0; t < Math.PI * 2; t += 0.01) {
        const m = serviceHandMotion(kind, t);
        expect(Math.abs(m.across)).toBeLessThan(0.08);
        expect(Math.abs(m.up)).toBeLessThan(0.09);
        expect(Math.abs(m.turn)).toBeLessThan(0.36);
      }
    }
    expect(serviceHandMotion("repair", 0).turn).toBe(0);
    expect(serviceHandMotion("repair", 0.93 * Math.PI * 2).turn).toBe(0);
    expect(serviceHandMotion("diagnose", 1)).not.toEqual(
      serviceHandMotion("repair", 1),
    );
  });
  it("retains the planted idle legs and generates closed finite work animation loops", () => {
    const base = new T.AnimationClip("Idle", 4, [
      new T.VectorKeyframeTrack(
        "Hips.position",
        [0, 4],
        [0, 1.46, 0, 0, 1.46, 0],
      ),
    ]);
    const idle = createCrewIdle(base);
    expect(base.duration).toBe(4);
    expect(idle.duration).toBe(8);
    expect([...idle.tracks[0].values]).toEqual([...base.tracks[0].values]);
    for (const kind of [
      "wipe",
      "repair",
      "wheel",
      "collect",
      "diagnose",
      "bench",
      "install",
    ] as ServiceKind[]) {
      const clip = createServiceAnimation(kind);
      for (const track of clip.tracks) {
        expect([...track.values].every(Number.isFinite)).toBe(true);
        const size = track.getValueSize();
        for (let i = 0; i < size; i++)
          expect(track.values[i]).toBeCloseTo(
            track.values[track.values.length - size + i],
            5,
          );
      }
    }
  });
  it("keeps contact shadows out of collisions and restores each lamp separately", () => {
    const car = new FleetCar();
    try {
      const before = { ...car.footprint },
        shadow = car.root.getObjectByName("Chassis_contact_shadow")!;
      expect(shadow).toBeDefined();
      shadow.scale.set(10, 10, 10);
      expect(car.footprint).toEqual(before);
      const lamps = (): T.MeshPhysicalMaterial[] => {
        const materials = new Set<T.MeshPhysicalMaterial>();
        car.root.traverse((o) => {
          if (
            o instanceof T.Mesh &&
            o.material instanceof T.MeshPhysicalMaterial
          )
            materials.add(o.material);
        });
        return [...materials];
      };
      const initial = lamps().map((m) => ({
        material: m,
        color: m.color.getHex(),
        roughness: m.roughness,
      }));
      car.setLightService(["front-left", "rear-right"], {});
      expect(
        initial.filter((m) => m.color !== m.material.color.getHex()),
      ).toHaveLength(2);
      car.setLightService(["front-left", "rear-right"], { "front-left": 1 });
      expect(
        initial.filter((m) => m.color !== m.material.color.getHex()),
      ).toHaveLength(1);
      car.setLightService([], {});
      expect(
        initial.filter((m) => m.color !== m.material.color.getHex()),
      ).toHaveLength(0);
    } finally {
      car.dispose();
    }
  });
});
