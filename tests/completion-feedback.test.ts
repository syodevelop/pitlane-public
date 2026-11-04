import { expect, it } from "vitest";
import { Scenario } from "../packages/game-core/scenario";
import { CompletionCursor } from "../src/scene/completion-feedback";

it("reports only the completed order, never a timer or its intermediate work step", () => {
  const h = new Scenario(),
    cursor = new CompletionCursor();
  const jobId = h.order("quick");
  h.deliver("quick", 1);
  h.command({ type: "startWork", actorId: "player", kind: "service", jobId });
  expect(cursor.consume(h.state)).toEqual([]);
  const task = h.state.progress.tasks[h.state.progress.actors.player.taskId!];
  h.advance(task.endsAt - 1);
  expect(cursor.consume(h.state)).toEqual([]);
  h.finish();
  expect(cursor.consume(h.state)).toEqual([]);
  h.command({ type: "startWork", actorId: "player", kind: "service", jobId });
  h.finish();
  const before = structuredClone(h.state);
  expect(cursor.consume(h.state)).toMatchObject([
    { text: "Quick Service complete · +120 Credits · +15 REP", reward: true },
  ]);
  expect(h.state).toEqual(before);
  expect(cursor.consume(h.state)).toEqual([]);
  h.advance(h.now + 60000);
  expect(cursor.consume(h.state)).toEqual([]);
});

it("skips restored history, hidden-tab backlog and stale snapshots", () => {
  const h = new Scenario(),
    cursor = new CompletionCursor();
  cursor.consume(h.state);
  const stale = structuredClone(h.state);
  h.service("tires");
  expect(cursor.consume(h.state, false)).toEqual([]);
  expect(cursor.consume(stale)).toEqual([]);
  expect(cursor.consume(h.state)).toEqual([]);
  expect(new CompletionCursor().consume(h.state)).toEqual([]);
  h.service("tires");
  const items = cursor.consume(h.state);
  expect(items.filter((x) => x.reward)).toHaveLength(1);
  const reset = structuredClone(h.state);
  reset.progress.generation = "wiped-generation";
  expect(cursor.consume(reset)).toEqual([]);
});

it("separates physical collection, restoration and earned rewards", () => {
  const h = new Scenario(),
    cursor = new CompletionCursor();
  cursor.consume(h.state);
  h.move("stock");
  h.command({ type: "pickUp", actorId: "player", station: "stock", amount: 2 });
  h.finish();
  expect(cursor.consume(h.state)).toMatchObject([
    { text: "2 parts collected", reward: false },
  ]);
  h.move("starter");
  h.command({
    type: "putDown",
    actorId: "player",
    station: "starter",
    amount: 2,
  });
  h.restore();
  expect(cursor.consume(h.state)).toMatchObject([
    { text: "Rustback restored", reward: false },
  ]);
  expect(h.state.progress.rep).toBe(0);
});

it("shows a race reward only after authoritative settlement, once", () => {
  const h = new Scenario(),
    cursor = new CompletionCursor();
  h.tutorial();
  cursor.consume(h.state);
  const race = Object.values(h.state.progress.races)[0];
  h.advance(race.endsAt - 1);
  expect(cursor.consume(h.state)).toEqual([]);
  h.advance(race.endsAt);
  expect(cursor.consume(h.state)).toMatchObject([
    { text: "Rustback race complete · +100 Credits · +20 REP", reward: true },
  ]);
  h.advance(race.endsAt + 60000);
  expect(cursor.consume(h.state)).toEqual([]);
  expect(h.state.progress.rep).toBe(20);
});
