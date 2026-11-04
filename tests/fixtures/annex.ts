import { Scenario } from "../../packages/game-core/scenario.ts";
import { ANNEX, distance, type Point } from "../../packages/game-core/index.ts";

export function walkTo(h: Scenario, target: Point, actorId = "player") {
  const actor = h.state.progress.actors[actorId];
  if (distance(actor.position, target) < 1 && !actor.travel) return;
  h.command({ type: "navigate", actorId, target });
  h.advance(h.state.progress.actors[actorId].travel!.endsAt);
}

// Only legitimate domain commands; no grants or manufactured inventory.
export function annexScenario() {
  const h = new Scenario();
  while (h.state.progress.credits < 1200) h.service();
  while (
    Object.values(h.state.progress.jobs).some((j) => j.status === "offered")
  )
    h.service();
  h.move("reception");
  h.command({ type: "hire", role: "Mechanic" });
  const helper = Object.values(h.state.progress.actors).find(
    (a) => a.role === "Mechanic",
  )!.id;
  const locked = structuredClone(h.state);
  h.command({ type: "upgrade", target: "capacity" });
  const expanded = structuredClone(h.state);
  const jobs = [h.order("tires"), h.order("tires")];
  h.deliver("tires", 2);
  walkTo(h, ANNEX.tires, helper);
  const emptyAnnex = structuredClone(h.state);
  h.move("stock");
  h.command({ type: "pickUp", actorId: "player", station: "stock", amount: 1 });
  h.finish();
  walkTo(h, ANNEX.tires);
  h.command({
    type: "putDown",
    actorId: "player",
    station: "tires",
    amount: 1,
  });
  h.move("tires");
  return { h, helper, jobs, locked, expanded, emptyAnnex };
}

export function ownedAnnexScenario() {
  // Main collection entitlement is synthetic: purchase verification is a later
  // stage. Work, parts and Credits below still come from normal domain commands.
  const h = new Scenario("Gus", "main");
  while (h.state.progress.credits < 1600) h.service();
  h.restore();
  h.move("reception");
  h.command({ type: "hire", role: "Team Manager" });
  h.command({ type: "upgrade", target: "capacity" });
  h.state.progress.cars["fixture-club-coupe"] = {
    ...h.state.progress.cars[h.starter()],
    id: "fixture-club-coupe",
    tier: 2,
    source: "verified-purchase",
    purchaseEvent: "fixture-only-not-an-onchain-event",
  };
  const helper = Object.values(h.state.progress.actors).find(
    (a) => a.role === "Team Manager",
  )!.id;
  const cars = [
    h.starter(),
    Object.values(h.state.progress.cars).find((c) => c.tier === 2)!.id,
  ];
  h.deliver("starter", 1);
  h.move("stock");
  h.command({ type: "pickUp", actorId: "player", station: "stock", amount: 1 });
  h.finish();
  walkTo(h, ANNEX.starter);
  h.command({
    type: "putDown",
    actorId: "player",
    station: "starter",
    amount: 1,
  });
  walkTo(h, ANNEX.starter, helper);
  h.move("starter");
  return { h, helper, cars };
}
