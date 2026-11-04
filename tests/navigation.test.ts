import { expect, it } from "vitest";
import {
  STATIONS,
  clearPath,
  distance,
  routeLength,
  routeTo,
  positionAt,
  durationAtRate,
  FIXTURES,
} from "../packages/game-core";
import { Scenario } from "../packages/game-core/scenario";
import { parseCommandEnvelope } from "../packages/protocol";

it("routes all 42 station pairs through clear segments without corner cutting", () => {
  let count = 0;
  for (const [from, start] of Object.entries(STATIONS)) {
    for (const [to, destination] of Object.entries(STATIONS)) {
      if (from === to) continue;
      const path = routeTo(start, destination);
      expect(path, `${from} -> ${to}`).not.toBeNull();
      expect(path!.at(-1)).toEqual(destination);
      expect(path!.length).toBeLessThanOrEqual(5);
      const points = [start, ...path!];
      for (let i = 1; i < points.length; i++)
        expect(clearPath(points[i - 1], points[i])).toBe(true);
      if (clearPath(start, destination)) expect(path).toEqual([destination]);
      else
        expect(routeLength(points)).toBeGreaterThan(
          distance(start, destination),
        );
      expect(routeTo(start, destination)).toEqual(path);
      count++;
    }
  }
  expect(count).toBe(42);
  expect(clearPath({ x: 342.9, y: 188.05 }, { x: 343.1, y: 187.95 })).toBe(
    false,
  );
  for (const destination of [
    { x: 400, y: 225 },
    { x: 343, y: 188 },
    { x: 0, y: 100 },
    { x: NaN, y: 100 },
  ])
    expect(routeTo(STATIONS.stock, destination)).toBeNull();
});

it("charges carried-part travel time for the entire detour and blocks early interaction", () => {
  const h = new Scenario("Gus");
  h.move("stock");
  h.command({ type: "pickUp", actorId: "player", station: "stock", amount: 2 });
  h.finish();
  const before = structuredClone(h.state.progress);
  h.command({ type: "navigate", actorId: "player", target: STATIONS.race });
  const a = h.state.progress.actors.player,
    t = a.travel!;
  expect(t.via!.length).toBeGreaterThan(0);
  const length = routeLength([t.from, ...t.via!, t.to]);
  expect(t.endsAt - t.startsAt).toBe(
    durationAtRate(Math.ceil((length * 1000) / FIXTURES.playerSpeed), 900),
  );
  let previous = t.from;
  for (let now = t.startsAt + 10; now < t.endsAt; now += 10) {
    const current = positionAt(a, now);
    expect(clearPath(previous, current)).toBe(true);
    expect(distance(previous, current)).toBeLessThanOrEqual(
      FIXTURES.playerSpeed * 0.9 * 0.01 + 1e-6,
    );
    previous = current;
  }
  h.advance(t.endsAt - 1);
  expect(() => h.command({ type: "interact", station: "race" })).toThrow(
    "Walk to the station",
  );
  h.advance(t.endsAt + 60_000);
  expect(h.state.progress.actors.player.position).toEqual(STATIONS.race);
  expect(h.state.progress.actors.player.travel).toBeNull();
  expect(h.state.progress.rep).toBe(before.rep);
  expect(h.state.progress.credits).toBe(before.credits);
  expect(h.state.progress.partsIssued).toBe(before.partsIssued);
  expect(h.state.progress.actors.player.carrying).toBe(2);
});

it("redirects an in-flight route from its interpolated position without teleporting", () => {
  const h = new Scenario();
  h.move("stock");
  h.command(
    { type: "navigate", actorId: "player", target: STATIONS.race },
    "navigate-first",
  );
  const scheduled = h.state.progress.actors.player.travel!;
  h.advance(
    scheduled.startsAt +
      Math.floor((scheduled.endsAt - scheduled.startsAt) * 0.55),
  );
  const current = positionAt(h.state.progress.actors.player, h.now);
  h.command(
    { type: "navigate", actorId: "player", target: STATIONS.reception },
    "navigate-second",
  );
  expect(h.state.progress.actors.player.travel!.from).toEqual(current);
  const redirected = structuredClone(h.state.progress.actors.player.travel);
  h.command(
    { type: "navigate", actorId: "player", target: STATIONS.reception },
    "navigate-second",
  );
  expect(h.state.progress.actors.player.travel).toEqual(redirected);
});

it("keeps old straight schedules compatible and forbids client route/speed/clock assertions", () => {
  const h = new Scenario();
  h.move("stock");
  h.command({ type: "move", actorId: "player", target: STATIONS.tires });
  const a = h.state.progress.actors.player,
    t = a.travel!;
  expect(t.via).toBeUndefined();
  expect(positionAt(a, (t.startsAt + t.endsAt) / 2)).toEqual({
    x: 187.5,
    y: 100,
  });
  h.advance(t.endsAt);
  expect(() =>
    h.command({ type: "move", actorId: "player", target: STATIONS.race }),
  ).toThrow("reachable waypoint");
  const envelope = {
    schemaVersion: 2,
    ruleset: h.state.progress.balanceVersion,
    generation: h.state.progress.generation,
    id: "navigation-test-0001",
    version: h.state.progress.revision,
    command: { type: "navigate", actorId: "player", target: STATIONS.race },
  };
  expect(parseCommandEnvelope(envelope).command.type).toBe("navigate");
  for (const patch of [
    { via: [STATIONS.race] },
    { speed: 99999 },
    { endsAt: 0 },
    { target: { x: Infinity, y: 0 } },
  ])
    expect(() =>
      parseCommandEnvelope({
        ...envelope,
        command: { ...envelope.command, ...patch },
      }),
    ).toThrow();
});
