import { expect, it } from "vitest";
import { Scenario } from "../packages/game-core/scenario";
import { stationView } from "../src/scene/station-state";

it("shows customer arrival, missing delivery, actual work and bay release from verified transitions", () => {
  const h = new Scenario();
  expect(stationView(h.state, "tires").customer).toBe(false);
  expect(stationView(h.state, "reception").label).toBe("6 customers waiting");
  const jobId = h.order("tires");
  expect(stationView(h.state, "tires")).toMatchObject({
    customer: true,
    customerId: jobId,
    label: "Needs 1 part",
    tone: "waiting",
  });
  h.deliver("tires", 1);
  expect(stationView(h.state, "tires")).toMatchObject({
    label: "Ready to service",
    parts: "Parts 1/4",
  });
  h.command({ type: "startWork", actorId: "player", kind: "service", jobId });
  expect(stationView(h.state, "tires")).toMatchObject({
    label: "Working",
    parts: "Parts 0/4",
    tone: "working",
  });
  h.finish();
  expect(stationView(h.state, "tires")).toMatchObject({
    label: "Free bay",
    customer: false,
    customerId: null,
  });
});

it("moves a two-step customer to its next post without reporting the contract complete", () => {
  const h = new Scenario();
  const jobId = h.order("engine");
  h.deliver("engine", 1);
  h.command({ type: "startWork", actorId: "player", kind: "service", jobId });
  h.finish();
  expect(h.state.progress.rep).toBe(0);
  expect(stationView(h.state, "engine").customer).toBe(false);
  expect(stationView(h.state, "quick")).toMatchObject({
    customer: true,
    customerId: jobId,
    label: "Needs 1 part",
  });
  h.deliver("quick", 1);
  h.command({ type: "startWork", actorId: "player", kind: "service", jobId });
  h.finish();
  expect(stationView(h.state, "quick").customer).toBe(false);
  expect(h.state.progress.rep).toBe(24);
});
