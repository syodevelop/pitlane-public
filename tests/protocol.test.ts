import { describe, it, expect } from "vitest";
import {
  parseBaseUnits,
  parseCommandEnvelope,
  SCHEMA_VERSION,
  validateResponse,
} from "../packages/protocol";
import {
  BALANCE_VERSION as RULESET,
  createGarage,
} from "../packages/game-core";
import {
  moneyBlockers,
  releaseCapabilities,
  type ReleaseConfig,
} from "../shared/release";
const envelope = {
  schemaVersion: SCHEMA_VERSION,
  ruleset: RULESET,
  generation: "demo-v2-test",
  id: "test-command-123456",
  version: 0,
  command: { type: "select", character: "Gus" },
};
describe("versioned transport and closed money configuration", () => {
  it("rejects incompatible or corrupt snapshots before client state replacement", () => {
    const snapshot = {
      schemaVersion: SCHEMA_VERSION,
      state: createGarage("0x" + "a".repeat(40), "demo-v2-test", "demo", {
        now: 1,
        seed: 1,
        balanceVersion: RULESET,
      }),
      address: "0x" + "a".repeat(40),
      now: 1,
    };
    expect(() => validateResponse(snapshot, "state", true)).not.toThrow();
    for (const patch of [
      { schemaVersion: 0 },
      { state: {} },
      { now: -1 },
      { address: "unknown" },
      {
        state: {
          ...snapshot.state,
          progress: { ...snapshot.state.progress, credits: 0.1 },
        },
      },
      {
        state: {
          ...snapshot.state,
          progress: { ...snapshot.state.progress, races: { bad: {} } },
        },
      },
    ])
      expect(() =>
        validateResponse({ ...snapshot, ...patch }, "state", true),
      ).toThrow();
    expect(() =>
      validateResponse(
        {
          schemaVersion: SCHEMA_VERSION,
          error: "Expired",
          code: "AUTH_REQUIRED",
        },
        "state",
        false,
      ),
    ).not.toThrow();
  });
  it("accepts known intent and rejects injected balances, clocks, and identity", () => {
    expect(parseCommandEnvelope(envelope).command.type).toBe("select");
    for (const patch of [
      { credits: 999 },
      { now: 1 },
      { address: "0x123" },
      { schemaVersion: 0 },
      { ruleset: "old" },
      { version: -1 },
    ])
      expect(() => parseCommandEnvelope({ ...envelope, ...patch })).toThrow();
    expect(() =>
      parseCommandEnvelope({
        ...envelope,
        command: { type: "start", kind: "tires", rep: 999 },
      }),
    ).toThrow();
  });
  it("requires explicit bounded finite waypoint coordinates", () => {
    for (const x of ["5", NaN, Infinity, 1e100])
      expect(() =>
        parseCommandEnvelope({
          ...envelope,
          command: { type: "move", actorId: "player", target: { x, y: 10 } },
        }),
      ).toThrow();
  });
  it("preserves integer token amounts without floating point", () => {
    expect(parseBaseUnits("1000000000000000001")).toBe(1000000000000000001n);
    for (const input of [1, "01", "-1", "1.5", "1e18", (2n ** 256n).toString()])
      expect(() => parseBaseUnits(input)).toThrow();
  });
  it("allows local demo but never activates missing money configuration", () => {
    const c: ReleaseConfig = {
      environment: "local",
      phase: "DEMO",
      published: false,
      gameplayEnabled: true,
      moneyRequested: false,
      money: null,
    };
    expect(releaseCapabilities(c)).toEqual({
      gameplay: true,
      newMoney: false,
      reconcileExisting: true,
    });
    expect(
      moneyBlockers({
        ...c,
        environment: "production",
        phase: "LIVE",
        moneyRequested: true,
      }),
    ).toContain("CONFIG_UNDECIDED: approved monetary manifest is missing.");
    expect(
      releaseCapabilities({ ...c, environment: "production" }).gameplay,
    ).toBe(false);
  });
  it("rejects approved-looking production fixtures and preserves reconciliation while paused", () => {
    const c: ReleaseConfig = {
      environment: "production",
      phase: "PAUSED_MONEY",
      published: true,
      gameplayEnabled: true,
      moneyRequested: true,
      money: {
        schemaVersion: 1,
        version: "local-v1",
        approved: true,
        testOnly: true,
        chainId: 31337,
        token: "0x" + "1".repeat(40),
        shop: "0x" + "2".repeat(40),
        treasury: "0x" + "3".repeat(40),
        feeCollector: "0x" + "3".repeat(40),
        decimals: 18,
        ponsUrl: "https://attacker.invalid",
        finalityPolicy: "CONFIG_UNDECIDED",
        catalogVersion: "prototype",
        allocationPolicy: "CONFIG_UNDECIDED",
        withdrawalMinimum: "",
        operatorProcedureVersion: "",
        verifiedToken: false,
        verifiedShop: false,
      },
    };
    expect(moneyBlockers(c).length).toBeGreaterThan(5);
    expect(releaseCapabilities(c)).toEqual({
      gameplay: true,
      newMoney: false,
      reconcileExisting: true,
    });
  });
});
