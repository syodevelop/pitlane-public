import { expect, it } from "vitest";
import { initialState } from "../shared/game";
import { migrateLegacy } from "../packages/game-core/migrate";
import {
  BALANCE_VERSION,
  assertInvariants,
  settle,
} from "../packages/game-core";
const c = { now: 100_000, seed: 55, balanceVersion: BALANCE_VERSION };
it("preserves identity, resources, counters, upgrades and an unfinished legacy engine reward", () => {
  const old = {
    ...initialState(),
    character: "Juno" as const,
    credits: 321,
    rep: 123,
    parts: 1,
    restored: true,
    engine: 2,
    reliability: 2,
    completed: { tires: 6, quick: 6, engine: 6 },
    qualified: true,
    work: {
      id: "work-20",
      kind: "engine" as const,
      startsAt: 90_000,
      endsAt: 200_000,
    },
  };
  const exact = structuredClone(old);
  const next = migrateLegacy(old, "owner", "demo-v2-owner", "demo", c);
  expect(old).toEqual(exact);
  expect(next.profile).toEqual({ identity: "owner", character: "Juno" });
  expect(next.progress.credits).toBe(321);
  expect(next.progress.rep).toBe(123);
  expect(next.progress.completed).toEqual(old.completed);
  expect(next.progress.actors.player.carrying).toBe(1);
  expect(Object.values(next.progress.tasks)[0].endsAt).toBe(200_000);
  const before = settle(next, { ...c, now: 199_999 }).state;
  expect(before.progress.credits).toBe(321);
  const due = settle(before, { ...c, now: 999_999 }).state;
  expect(due.progress.credits).toBe(481);
  expect(due.progress.rep).toBe(143);
  expect(due.progress.completed.engine).toBe(7);
  expect(settle(due, { ...c, now: 999_999 }).events).toEqual([]);
  expect(
    due.progress.events.find((e) => e.kind === "service-completed")!.at,
  ).toBe(200_000);
  assertInvariants(due);
});
it("keeps a started stock delivery and qualification finite with their original finish times", () => {
  const old = {
    ...initialState(),
    character: "Gus" as const,
    restored: true,
    engine: 2,
    reliability: 2,
    completed: { tires: 6, quick: 6, engine: 6 },
    work: {
      id: "work-7",
      kind: "stock" as const,
      startsAt: 90_000,
      endsAt: 101_000,
    },
    race: {
      id: "race-1",
      kind: "qualification" as const,
      preparation: "sprint" as const,
      startsAt: 50_000,
      endsAt: 170_000,
      tokenWeight: 0 as const,
      ruleset: "garage-v0.1",
    },
  };
  const g = migrateLegacy(old, "owner", "demo-v2-owner", "demo", c);
  const result = settle(g, { ...c, now: 1_000_000 }).state;
  expect(result.progress.actors.player.carrying).toBe(2);
  expect(result.progress.qualified).toBe(true);
  const race = Object.values(result.progress.races)[0];
  expect(race.endsAt).toBe(170_000);
  expect(race.result).toBeNull();
  expect(race.contributionWeight).toBe(0);
  expect(result.progress.rep).toBe(20);
  expect(settle(result, { ...c, now: 2_000_000 }).events).toEqual([]);
  assertInvariants(result);
});
it("does not mint a new reward for old restoration or fabricate missing progress", () => {
  const old = {
    ...initialState(),
    character: "Dash" as const,
    work: {
      id: "work-2",
      kind: "restore" as const,
      startsAt: 90_000,
      endsAt: 110_000,
    },
  };
  const g = migrateLegacy(old, "owner", "demo-v2-owner", "demo", c);
  const result = settle(g, { ...c, now: 120_000 }).state;
  expect(Object.values(result.progress.cars)[0].restored).toBe(true);
  expect(result.progress.rep).toBe(0);
  expect(result.progress.tutorial.training).toBe(false);
  expect(() =>
    migrateLegacy(
      { ...old, credits: NaN },
      "owner",
      "demo-v2-owner",
      "demo",
      c,
    ),
  ).toThrow("migration review");
});
