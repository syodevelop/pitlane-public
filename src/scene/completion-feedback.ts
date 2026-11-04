import {
  CARS,
  GARAGE_UPGRADES,
  SERVICES,
  type Garage,
  type Event,
  type Upgrade,
} from "../../packages/game-core";

export type CompletionFeedback = { id: string; text: string; reward: boolean };

function describe(g: Garage, event: Event): CompletionFeedback | null {
  const p = g.progress;
  let text: string | undefined;
  const reward =
    event.kind === "service-completed" || event.kind === "race-completed";
  if (reward) {
    const job = p.jobs[event.entityId];
    const race = p.races[event.entityId];
    const car = race && p.cars[race.carId];
    text =
      event.kind === "service-completed"
        ? `${job ? SERVICES[job.kind].label : "Service"} complete`
        : `${car ? CARS[car.tier].name + " race" : "Race"} complete`;
    if (event.credits > 0) text += ` · +${event.credits} Credits`;
    if (event.rep > 0) text += ` · +${event.rep} REP`;
  } else if (event.kind === "work-completed") {
    const task = p.tasks[event.entityId];
    if (task?.kind === "stock") text = `${task.outputParts} parts collected`;
    if (task?.kind === "restore") text = "Rustback restored";
    if (task?.kind === "prepare") text = "Race preparation complete";
    // Service has its own single completed-order reward event. Intermediate
    // work steps and milestones must not look like a second payout.
  } else if (event.kind === "garage-upgraded") {
    const upgrade = GARAGE_UPGRADES[event.entityId as Upgrade];
    if (upgrade) text = `${upgrade.label} upgraded`;
  } else if (event.kind === "car-upgraded") {
    const car = p.cars[event.entityId];
    if (car) text = `${CARS[car.tier].name} upgraded`;
  } else if (event.kind === "staff-hired") text = "Helper ready";
  return text ? { id: event.id, text, reward } : null;
}

// A presentation cursor, not a reward ledger. Server event IDs use the shared
// generation:event:sequence scheme. Never infer completion from client time.
export class CompletionCursor {
  private generation?: string;
  private sequence = 0;
  consume(g: Garage, visible = true): CompletionFeedback[] {
    const p = g.progress;
    if (this.generation !== p.generation) {
      this.generation = p.generation;
      this.sequence = p.sequence;
      return []; // Initial load/reconnect/reset restores history without replay.
    }
    if (p.sequence <= this.sequence) return [];
    const previous = this.sequence;
    this.sequence = p.sequence;
    if (!visible) return [];
    return p.events
      .filter((event) => Number(event.id.split(":").at(-1)) > previous)
      .map((event) => describe(g, event))
      .filter((item): item is CompletionFeedback => item !== null);
  }
}
