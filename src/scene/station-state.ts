import {
  SERVICES,
  stationCapacity,
  stationStock,
  type Garage,
  type Station,
} from "../../packages/game-core";

export type StationView = {
  label: string;
  tone: "idle" | "waiting" | "ready" | "working";
  customer: boolean;
  customerId: string | null;
  parts: string | null;
};

// Presentation of authoritative work only. Animation cannot accept, finish or reward a job.
export function stationView(
  g: Garage,
  station: Station,
  carId?: string,
  position: 0 | 1 = 0,
): StationView {
  const p = g.progress;
  const tasks = Object.values(p.tasks).filter(
    (t) =>
      t.station === station &&
      t.status === "started" &&
      (t.workPosition ?? 0) === position,
  );
  const jobs = Object.values(p.jobs).filter(
    (j) =>
      (j.status === "accepted" || j.status === "working") &&
      SERVICES[j.kind].steps[j.step]?.station === station,
  );
  const parts =
    station === "stock" || station === "reception" || station === "race"
      ? null
      : `Parts ${stationStock(g, station, position)}/${stationCapacity(g)}`;
  const assigned = new Map<number, string>();
  for (const task of Object.values(p.tasks))
    if (task.status === "started" && task.station === station && task.jobId)
      assigned.set(task.workPosition ?? 0, task.jobId);
  for (const job of jobs) {
    if ([...assigned.values()].includes(job.id) || job.status === "working")
      continue;
    const empty = [0, ...(p.upgrades.capacity > 0 ? [1] : [])].find(
      (i) => !assigned.has(i),
    );
    if (empty !== undefined) assigned.set(empty, job.id);
  }
  const customerId = assigned.get(position) ?? null;
  const result: StationView = {
    label: "Free bay",
    tone: "idle",
    customer: !!customerId,
    customerId,
    parts,
  };
  if (tasks.length)
    return {
      ...result,
      label: station === "stock" ? "Collecting" : "Working",
      tone: "working",
    };
  if (station === "stock") return { ...result, label: "Free parts" };
  if (station === "reception") {
    const offered = Object.values(p.jobs).filter(
      (j) => j.status === "offered",
    ).length;
    return {
      ...result,
      label: offered ? `${offered} customers waiting` : "Invite customers",
      tone: offered ? "waiting" : "idle",
    };
  }
  if (station === "race") {
    const racing = Object.values(p.races).filter(
      (r) => r.status === "started",
    ).length;
    return {
      ...result,
      label: racing ? `${racing} on circuit` : "Race dispatch",
      tone: racing ? "working" : "idle",
    };
  }
  if (station === "starter") {
    const car =
      (carId && p.cars[carId]) ||
      Object.values(p.cars).find((c) => c.source === "starter")!;
    if (
      Object.values(p.races).some(
        (r) => r.carId === car.id && r.status === "started",
      )
    )
      return { ...result, label: "On circuit", tone: "working" };
    if (car.prepared) return { ...result, label: "Race ready", tone: "ready" };
    const missing =
      (car.restored ? 1 : 2) - stationStock(g, "starter", position);
    return {
      ...result,
      label:
        missing > 0
          ? `Needs ${missing} part${missing > 1 ? "s" : ""}`
          : car.restored
            ? "Prepare here"
            : "Ready to restore",
      tone: missing > 0 ? "waiting" : "ready",
    };
  }
  if (customerId) {
    const missing = Math.min(
      ...jobs
        .filter((j) => j.id === customerId)
        .map(
          (j) =>
            SERVICES[j.kind].steps[j.step].parts -
            stationStock(g, station, position),
        ),
    );
    return {
      ...result,
      label:
        missing > 0
          ? `Needs ${missing} part${missing > 1 ? "s" : ""}`
          : "Ready to service",
      tone: missing > 0 ? "waiting" : "ready",
    };
  }
  return result;
}
