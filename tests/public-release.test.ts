import { describe, expect, it } from "vitest";
import {
  publicRelease,
  readPublicRelease,
  safeExternalUrl,
  serializePublicRelease,
  utcTimestamp,
} from "../shared/public-release";
import {
  PHASES,
  releaseCapabilities,
  type ReleaseConfig,
} from "../shared/release";
import { releaseCopy } from "../src/ReleaseStatus";

const closed: ReleaseConfig = {
  environment: "production",
  phase: "DEMO",
  published: false,
  gameplayEnabled: true,
  moneyRequested: false,
  money: null,
};
// Synthetic config only; these addresses are never installed in a release file.
const launched: ReleaseConfig = {
  ...closed,
  phase: "LIVE",
  published: true,
  publicSite: {
    approved: true,
    tokenLaunchConfirmed: true,
    tokenTicker: "PTLN",
    xUrl: "https://x.com/test_fixture",
  },
  money: {
    schemaVersion: 1,
    version: "fixture",
    approved: true,
    testOnly: false,
    chainId: 1,
    token: "0x" + "1".repeat(40),
    shop: "0x" + "2".repeat(40),
    treasury: "0x" + "3".repeat(40),
    feeCollector: "0x" + "4".repeat(40),
    decimals: 18,
    ponsUrl: "https://ponsfamily.com/test-fixture",
    finalityPolicy: "PRIVATE_FINALITY",
    catalogVersion: "PRIVATE_CATALOG",
    allocationPolicy: "PRIVATE_ALLOCATION",
    withdrawalMinimum: "12345",
    operatorProcedureVersion: "PRIVATE_PROCEDURE",
    verifiedToken: true,
    verifiedShop: true,
  },
};

describe("public release projection and closed entry", () => {
  it("does not allow a complete monetary manifest to bypass publication or gameplay closure", () => {
    const live = { ...launched, moneyRequested: true };
    expect(releaseCapabilities(live).newMoney).toBe(true);
    for (const patch of [
      { published: false },
      { gameplayEnabled: false },
      { phase: "PAUSED_MONEY" as const },
    ]) {
      const capability = releaseCapabilities({ ...live, ...patch });
      expect(capability.newMoney).toBe(false);
      expect(capability.reconcileExisting).toBe(true);
    }
  });
  it("keeps every unpublished public phase closed and only permits local demo preview", () => {
    for (const phase of PHASES)
      expect(publicRelease({ ...closed, phase }).gameplay).toBe(false);
    expect(publicRelease({ ...closed, environment: "local" }).gameplay).toBe(
      true,
    );
    for (const phase of PHASES) {
      const c = publicRelease({ ...closed, phase, published: true });
      expect(c.gameplay).toBe(["DEMO", "LIVE", "PAUSED_MONEY"].includes(phase));
      expect(releaseCopy(c).title).not.toMatch(/DEMO|PRELAUNCH|PAUSED_MONEY/);
    }
    expect(releaseCopy(publicRelease(closed)).title).toBe("Coming soon");
    expect(releaseCopy(null).title).toBe("Garage access unavailable");
  });
  it("never publishes an unapproved, unlaunched, test or prelaunch token", () => {
    expect(publicRelease(launched).token?.address).toBe(launched.money!.token);
    const variants: ReleaseConfig[] = [
      { ...launched, published: false },
      { ...launched, phase: "DEMO" },
      { ...launched, phase: "PRELAUNCH" },
      { ...launched, publicSite: { ...launched.publicSite!, approved: false } },
      {
        ...launched,
        publicSite: { ...launched.publicSite!, tokenLaunchConfirmed: false },
      },
      {
        ...launched,
        publicSite: { ...launched.publicSite!, tokenTicker: "</script>" },
      },
      ...[
        { approved: false },
        { verifiedToken: false },
        { testOnly: true },
        { token: "0x" + "0".repeat(40) },
        { ponsUrl: "javascript:alert(1)" },
        { chainId: 0 },
      ].map((patch) => ({
        ...launched,
        money: { ...launched.money!, ...patch },
      })),
    ];
    for (const c of variants) expect(publicRelease(c).token).toBeNull();
  });
  it("keeps nonfinancial play and contract identity while hiding a new buy link during a money pause", () => {
    const p = publicRelease({ ...launched, phase: "PAUSED_MONEY" });
    expect(p.gameplay).toBe(true);
    expect(p.token?.address).toBe(launched.money!.token);
    expect(p.token?.buyUrl).toBeNull();
    expect(
      readPublicRelease(
        JSON.stringify({
          ...p,
          token: { ...p.token, buyUrl: launched.money!.ponsUrl },
        }),
      ),
    ).toBeNull();
  });
  it("emits an explicit allowlist without financial settings or binding secrets", () => {
    const p = publicRelease({
      ...launched,
      unknownSecret: "DO_NOT_PUBLISH",
    } as ReleaseConfig);
    const json = serializePublicRelease(p);
    for (const hidden of [
      "PRIVATE_",
      "DO_NOT_PUBLISH",
      "12345",
      "treasury",
      "feeCollector",
      "allocationPolicy",
      "operatorProcedure",
    ])
      expect(json).not.toContain(hidden);
    expect(readPublicRelease(json)).toEqual(p);
    expect(
      readPublicRelease(JSON.stringify({ ...p, injectedSecret: "SECRET" })),
    ).not.toHaveProperty("injectedSecret");
  });
  it("rejects malformed bootstrap data instead of opening a garage", () => {
    const p = publicRelease(closed);
    for (const text of [
      null,
      "",
      "{bad",
      "{}",
      JSON.stringify({ ...p, version: 0 }),
      JSON.stringify({ ...p, gameplay: true }),
      JSON.stringify({ ...p, phase: "UNKNOWN" }),
      JSON.stringify({ ...p, xUrl: "https://evil.invalid" }),
      JSON.stringify({ ...p, token: {} }),
    ])
      expect(readPublicRelease(text)).toBeNull();
  });
  it("escapes script termination even for unexpectedly hostile public strings", () => {
    const data = {
      ...publicRelease(closed),
      xUrl: "</script><script>alert(1)</script>&\u2028",
    };
    const json = serializePublicRelease(data);
    expect(json).not.toContain("<");
    expect(json).not.toContain("&");
    expect(JSON.parse(json)).toEqual(data);
  });
  it("only publishes approved, valid UTC timestamps, never rolling an invalid day into another month", () => {
    expect(utcTimestamp("2026-02-30T12:00:00Z")).toBeNull();
    expect(utcTimestamp("2026-10-20T12:00:00+07:00")).toBeNull();
    const publicSite = {
      approved: false,
      demoOpensAt: "2026-10-20T12:00:00Z",
      demoClosesAt: "2026-10-21T12:00:00Z",
    };
    expect(publicRelease({ ...closed, publicSite }).demoOpensAt).toBeNull();
    const p = publicRelease({
      ...closed,
      publicSite: { ...publicSite, approved: true },
    });
    expect(p.demoOpensAt).toBe(publicSite.demoOpensAt);
    expect(p.gameplay).toBe(false);
    expect(
      publicRelease({
        ...closed,
        publicSite: {
          ...publicSite,
          approved: true,
          demoClosesAt: publicSite.demoOpensAt,
        },
      }).demoOpensAt,
    ).toBeNull();
  });
  it("rejects misleading schemes, hosts, credentials and incomplete destination links", () => {
    for (const url of [
      "http://x.com/name",
      "https://x.com.evil.invalid/name",
      "https://user:pass@x.com/name",
      "https://x.com:8443/name",
      "https://x.com/name?redirect=evil",
      "https://x.com/",
    ])
      expect(safeExternalUrl(url, "x")).toBeNull();
    for (const url of [
      "javascript:alert(1)",
      "https://ponsfamily.com/",
      "https://ponsfamily.com.evil.invalid/token",
      "https://user@ponsfamily.com/token",
    ])
      expect(safeExternalUrl(url, "pons")).toBeNull();
  });
});
