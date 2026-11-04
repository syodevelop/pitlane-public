import * as T from "three";
import {
  WORKSHOP,
  type WorkshopState,
  type WorkPoint,
} from "../../packages/workshop-core";
import {
  MECHANIC,
  mechanicTask,
  tickMechanic,
} from "../../packages/workshop-core/mechanic";
import { CrewActor } from "./gus-model";
import type { FleetCar } from "./fleet-car";
import { mechanicObstacles, mechanicRoute } from "./mechanic-route";
import type { VehiclePose } from "./service-route";

export class WorkshopMechanic {
  readonly actor = new CrewActor("gus");
  work?: WorkPoint;
  private heading = 0;
  constructor() {
    this.actor.model.name = "Workshop_Mechanic";
    // Keep the approved rig and gait; a red uniform distinguishes staff from Gus.
    const colors: Record<string, string> = {
      shirt: "#943b35",
      shirtLight: "#b95343",
      shirtDark: "#602e2b",
      orange: "#d7c8a6",
      orangeDark: "#9e8564",
    };
    this.actor.model.traverse((o) => {
      if (!(o instanceof T.Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        if (m instanceof T.MeshToonMaterial && colors[m.name])
          m.color.set(colors[m.name]);
    });
  }
  update(
    s: WorkshopState,
    dt: number,
    car: FleetCar,
    pose: VehiclePose,
    reduced: boolean,
    playerWork?: WorkPoint,
  ) {
    const m = s.mechanic,
      task = mechanicTask(s, car.footprint, playerWork);
    const before = { ...m.position };
    const path = mechanicRoute(
      before,
      task,
      mechanicObstacles(car.footprint, pose, s.position),
    );
    let remaining = Math.min(0.05, Math.max(0, dt)) * MECHANIC.speed;
    for (const next of path) {
      const d = Math.hypot(next.x - m.position.x, next.z - m.position.z);
      if (d <= remaining) {
        m.position = { x: next.x, z: next.z };
        remaining -= d;
      } else {
        const t = remaining / d;
        m.position.x += (next.x - m.position.x) * t;
        m.position.z += (next.z - m.position.z) * t;
        break;
      }
    }
    const distance = Math.hypot(
      m.position.x - before.x,
      m.position.z - before.z,
    );
    const reached =
      Math.hypot(m.position.x - task.x, m.position.z - task.z) < 0.06;
    const event = tickMechanic(s, dt, car.footprint, task, reached, playerWork);
    if (!reached && distance < 0.001) m.phase = "waiting";
    this.work =
      reached && (m.phase === "working" || m.phase === "collecting")
        ? task.work
        : undefined;
    if (distance > 0.001)
      this.heading = Math.atan2(
        m.position.x - before.x,
        m.position.z - before.z,
      );
    const target = this.work
      ? this.work.kind === "collect"
        ? new T.Vector3(WORKSHOP.rack.x - 0.49, 1.6, WORKSHOP.rack.z + 0.2)
        : car.serviceContact(this.work.id)
      : undefined;
    const work =
      this.work && target
        ? {
            kind: this.work.kind,
            target,
            heading: Math.atan2(
              target.x - m.position.x,
              target.z - m.position.z,
            ),
            progress:
              this.work.kind === "collect"
                ? m.collectProgress
                : s.order.progress[this.work.id] || 0,
          }
        : undefined;
    this.actor.model.position.set(m.position.x, 0, m.position.z);
    this.actor.setCarriedWheel(!!m.carried);
    this.actor.setWork(work);
    this.actor.update(
      dt,
      work?.heading ?? this.heading,
      dt > 0 ? ((distance / dt) * 216) / 3.5 : 0,
      reduced,
    );
    this.actor.model.position.set(m.position.x, 0, m.position.z);
    return event;
  }
  dispose() {
    this.actor.dispose();
  }
}
