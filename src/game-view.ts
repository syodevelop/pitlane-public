import {
  STATIONS as POINTS,
  SERVICES,
  type Garage,
  type Station,
  type Event,
} from "../packages/game-core";
export const STATION_LABELS: Record<Station, string> = {
  stock: "Free stock",
  tires: "Tires",
  quick: "Quick service",
  engine: "Engine work",
  starter: "Team preparation",
  race: "Circuit desk",
  reception: "Reception",
};
export const STATIONS = Object.fromEntries(
  Object.entries(POINTS).map(([key, point]) => [
    key,
    { ...point, label: STATION_LABELS[key as Station] },
  ]),
) as { [K in Station]: (typeof POINTS)[K] & { label: string } };
export const CHARACTER_DETAILS = {
  Gus: "+10% customer service rate · −10% delivery rate",
  Dash: "+10% delivery rate · −10% own-car preparation rate",
  Juno: "+10% own-car preparation rate · −10% customer service rate",
};
export function describeEvent(g: Garage, e: Event) {
  if (e.kind === "service-completed")
    return (
      (SERVICES[g.progress.jobs[e.entityId]?.kind]?.label || "Service") +
      ` complete: +${e.credits} Credits / +${e.rep} REP.`
    );
  if (e.kind === "race-completed")
    return `Race complete: +${e.credits} Credits / +${e.rep} REP.`;
  if (e.kind === "work-completed") {
    const kind = g.progress.tasks[e.entityId]?.kind;
    return kind === "stock"
      ? "Free parts collected."
      : kind === "restore"
        ? "Rustback restored."
        : kind === "prepare"
          ? "Car preparation complete."
          : null;
  }
  if (e.kind === "staff-hired")
    return "Your helper is ready for an assignment.";
  if (e.kind === "demo-car-purchased")
    return "Club Coupe added to your collection. Assign a race slot to use it.";
  if (e.kind === "legacy-migrated")
    return "Your garage was updated. Saved progress and started tasks were preserved.";
  return null;
}
