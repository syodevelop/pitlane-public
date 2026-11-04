import { JOBS, type State as LegacyState } from "../../shared/game.ts";
import { assertInvariants, createGarage, RuleError } from "./index.ts";
import { CHARACTERS, SERVICES, type Mode } from "./catalog.ts";
import type { Context, Garage, Task } from "./model.ts";

// Only consume a trusted SQLite v0.1 blob, never a client-supplied save.
// The caller must retain the exact original JSON and commit migration atomically.
export function migrateLegacy(
  old: LegacyState,
  identity: string,
  generation: string,
  mode: Mode,
  c: Context,
): Garage {
  if (
    !old ||
    old.ruleset !== "garage-v0.1" ||
    ![
      old.version,
      old.credits,
      old.rep,
      old.parts,
      old.engine,
      old.reliability,
      old.sequence,
      old.completed?.tires,
      old.completed?.quick,
      old.completed?.engine,
    ].every((n) => Number.isSafeInteger(n) && n >= 0) ||
    old.parts > 2 ||
    (old.character !== null && !Object.hasOwn(CHARACTERS, old.character)) ||
    !old.position ||
    !Number.isFinite(old.position.x) ||
    !Number.isFinite(old.position.y)
  )
    throw new RuleError(
      "The saved garage needs migration review. Its original data was not changed.",
    );
  for (const item of [old.travel, old.work, old.race]) {
    if (
      item &&
      (!Number.isSafeInteger(item.startsAt) ||
        !Number.isSafeInteger(item.endsAt) ||
        item.endsAt <= item.startsAt)
    )
      throw new RuleError("The saved task schedule needs migration review.");
  }
  const g = createGarage(identity, generation, mode, c);
  const p = g.progress,
    player = p.actors.player;
  const starter = Object.values(p.cars)[0];
  g.profile.character = old.character;
  p.revision = old.version + 1;
  p.credits = old.credits;
  p.rep = old.rep;
  p.completed = { ...old.completed };
  player.position = { ...old.position };
  player.travel = structuredClone(old.travel);
  player.carrying = old.parts;
  starter.restored = old.restored;
  starter.engine = old.engine;
  starter.reliability = old.reliability;
  p.qualified = old.qualified;
  const count = Object.values(old.completed).reduce((a, b) => a + b, 0);
  // Existing qualified profiles already passed the old verified race; do not revoke access.
  p.tutorial = {
    collected: old.parts > 0 || count > 0 || old.restored,
    delivered: count > 0 || old.restored,
    service: count > 0,
    training: old.qualified,
  };
  p.partsConsumed = count + (old.restored ? 2 : 0);
  p.milestones = [
    ...(old.restored ? ["starter-restored"] : []),
    ...(count ? ["first-service"] : []),
    ...(old.qualified ? ["first-training", "qualified"] : []),
  ];
  if (old.work) {
    const w = old.work,
      id = `${generation}:legacy:${w.id}`;
    const task: Task = {
      id,
      actorId: "player",
      kind:
        w.kind === "stock"
          ? "stock"
          : w.kind === "restore"
            ? "restore"
            : "service",
      station: w.kind === "restore" ? "starter" : w.kind,
      jobId: null,
      carId: w.kind === "restore" ? starter.id : null,
      preparation: null,
      step: null,
      startsAt: w.startsAt,
      endsAt: w.endsAt,
      processedAt: null,
      status: "started",
      parts: w.kind === "stock" ? 0 : w.kind === "restore" ? 2 : 1,
      outputParts: w.kind === "stock" ? 2 : 0,
      rate: 1000,
      balanceVersion: "garage-v0.1",
    };
    if (task.kind === "service") {
      if (!Object.hasOwn(JOBS, w.kind))
        throw new RuleError("Unknown saved work kind.");
      const kind = w.kind as keyof typeof JOBS;
      const offer = JOBS[kind],
        jobId = `${id}:customer`;
      // The old one-step contract remains one finite completion, not a new two-step job.
      const step = SERVICES[kind].steps.length - 1;
      p.jobs[jobId] = {
        id: jobId,
        kind,
        status: "working",
        step,
        credits: offer.credits,
        rep: offer.rep,
        balanceVersion: "garage-v0.1",
        arrivedAt: w.startsAt,
        acceptedAt: w.startsAt,
        completedAt: null,
      };
      task.jobId = jobId;
      task.step = step;
    }
    p.partsConsumed += task.parts;
    p.tasks[id] = task;
    player.taskId = id;
  }
  p.partsIssued = p.partsConsumed + player.carrying;
  if (old.race) {
    const r = old.race,
      id = `${generation}:legacy:${r.id}`;
    p.races[id] = {
      id,
      carId: starter.id,
      kind: r.kind,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      processedAt: null,
      status: "started",
      inputs: {
        pace: 0,
        reliability: 0,
        preparation: 0,
        setup: r.preparation,
        opponents: [],
        balanceVersion: c.balanceVersion,
      },
      result: null,
      credits: 100,
      rep: 20,
      contributionWeight: 0,
      balanceVersion: "garage-v0.1",
      legacyRuleset: "garage-v0.1",
    };
    // A v0.1 qualification in flight already required the entire verified old checklist.
    if (r.kind === "qualification") p.tutorial.training = true;
  }
  p.events.push({
    id: `${generation}:migration`,
    kind: "legacy-migrated",
    entityId: identity,
    at: c.now,
    processedAt: c.now,
    credits: 0,
    rep: 0,
    balanceVersion: c.balanceVersion,
  });
  assertInvariants(g);
  return g;
}
