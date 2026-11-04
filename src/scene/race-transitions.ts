import {
  ANNEX,
  STATIONS,
  type Garage,
  type Point,
  type Race,
} from "../../packages/game-core";

// Presentation location inferred from authoritative preparation history. It is
// neither an active-slot assignment nor a new server movement rule for cars.
export function carBay(g: Garage, carId: string): 0 | 1 {
  if (!g.progress.upgrades.capacity) return 0;
  const task = Object.values(g.progress.tasks)
    .filter((t) => t.carId === carId && t.station === "starter")
    .sort((a, b) => b.startsAt - a.startsAt || b.id.localeCompare(a.id))[0];
  return task?.workPosition ?? 0;
}

export function raceRoute(bay: 0 | 1): Point[] {
  const start = bay ? ANNEX.starter! : STATIONS.starter;
  return [
    start,
    { x: start.x, y: 650 },
    { x: -100, y: 650 },
    { x: -100, y: -90 },
    { x: 1400, y: -90 },
  ];
}

export type RaceTransition = { race: Race; direction: "depart" | "return" };
export class RaceTransitionCursor {
  private generation?: string;
  private revision = -1;
  private previous = new Map<string, Race["status"]>();
  read(
    g: Garage,
    visible: boolean,
  ): { reset: boolean; transitions: RaceTransition[] } {
    const p = g.progress;
    const reset = this.generation !== p.generation;
    if (!reset && p.revision <= this.revision)
      return { reset: false, transitions: [] };
    const transitions: RaceTransition[] = [];
    if (!reset && visible)
      for (const race of Object.values(p.races)) {
        const previous = this.previous.get(race.id);
        if (!previous && race.status === "started" && race.endsAt > p.lastNow)
          transitions.push({ race, direction: "depart" });
        else if (previous === "started" && race.status === "completed")
          transitions.push({ race, direction: "return" });
      }
    this.generation = p.generation;
    this.revision = p.revision;
    this.previous = new Map(
      Object.values(p.races).map((r) => [r.id, r.status]),
    );
    return { reset, transitions };
  }
}
