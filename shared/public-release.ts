import {
  PHASES,
  releaseCapabilities,
  type Phase,
  type ReleaseConfig,
} from "./release.ts";

export const RELEASE_ELEMENT_ID = "pitlane-public-release";
export type PublicRelease = {
  version: 1;
  phase: Phase;
  localPreview: boolean;
  published: boolean;
  gameplay: boolean;
  xUrl: string | null;
  demoOpensAt: string | null;
  demoClosesAt: string | null;
  launchAt: string | null;
  token: {
    address: string;
    chainId: number;
    ticker: string;
    buyUrl: string | null;
  } | null;
};
export function safeExternalUrl(
  value: unknown,
  kind: "x" | "pons",
): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const u = new URL(value);
    const hosts =
      kind === "x"
        ? ["x.com", "www.x.com", "twitter.com", "www.twitter.com"]
        : ["ponsfamily.com", "www.ponsfamily.com"];
    if (
      u.protocol !== "https:" ||
      !hosts.includes(u.hostname) ||
      u.username ||
      u.password ||
      u.port ||
      u.hash
    )
      return null;
    if (
      kind === "x" &&
      (!/^\/[a-zA-Z0-9_]{1,15}\/?$/.test(u.pathname) || u.search)
    )
      return null;
    if (kind === "pons" && u.pathname === "/") return null;
    return u.href;
  } catch {
    return null;
  }
}
export function utcTimestamp(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value)
  )
    return null;
  const time = Date.parse(value);
  return Number.isFinite(time) &&
    new Date(time).toISOString() === value.replace("Z", ".000Z")
    ? value
    : null;
}
const validAddress = (a: unknown): a is string =>
  typeof a === "string" &&
  /^0x[0-9a-fA-F]{40}$/.test(a) &&
  !/^0x0{40}$/i.test(a);
const validTicker = (s: unknown): s is string =>
  typeof s === "string" && /^[A-Z0-9]{2,10}$/.test(s);

// Explicit allowlist only. Never serialize the monetary manifest or bindings.
export function publicRelease(c: ReleaseConfig): PublicRelease {
  const site = c.publicSite?.approved ? c.publicSite : undefined;
  let open = utcTimestamp(site?.demoOpensAt),
    close = utcTimestamp(site?.demoClosesAt);
  if (open && close && open >= close) {
    open = null;
    close = null;
  }
  const m = c.money,
    buy = safeExternalUrl(m?.ponsUrl, "pons");
  const launched =
    c.published &&
    ["LIVE", "PAUSED_MONEY"].includes(c.phase) &&
    site?.tokenLaunchConfirmed &&
    m?.approved &&
    m.verifiedToken &&
    !m.testOnly &&
    validAddress(m.token) &&
    Number.isSafeInteger(m.chainId) &&
    m.chainId > 0 &&
    validTicker(site.tokenTicker) &&
    buy;
  return {
    version: 1,
    phase: c.phase,
    localPreview: c.environment === "local",
    published: c.published,
    gameplay: releaseCapabilities(c).gameplay,
    xUrl: safeExternalUrl(site?.xUrl, "x"),
    demoOpensAt: open,
    demoClosesAt: close,
    launchAt: utcTimestamp(site?.launchAt),
    token: launched
      ? {
          address: m!.token,
          chainId: m!.chainId,
          ticker: site!.tokenTicker!,
          buyUrl: c.phase === "LIVE" ? buy : null,
        }
      : null,
  };
}

// JSON inside a script data block still needs escaping against HTML termination.
export function serializePublicRelease(c: PublicRelease): string {
  return JSON.stringify(c).replace(
    /[<>&\u2028\u2029]/g,
    (ch) => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}
export function readPublicRelease(
  text: string | null | undefined,
): PublicRelease | null {
  try {
    const c = JSON.parse(text || "null") as PublicRelease;
    if (
      !c ||
      c.version !== 1 ||
      !PHASES.includes(c.phase) ||
      typeof c.localPreview !== "boolean" ||
      typeof c.published !== "boolean" ||
      typeof c.gameplay !== "boolean"
    )
      return null;
    if (
      c.gameplay &&
      (!(c.localPreview || c.published) ||
        !["DEMO", "LIVE", "PAUSED_MONEY"].includes(c.phase))
    )
      return null;
    if (c.xUrl !== null && safeExternalUrl(c.xUrl, "x") !== c.xUrl) return null;
    for (const field of ["demoOpensAt", "demoClosesAt", "launchAt"] as const)
      if (c[field] !== null && utcTimestamp(c[field]) !== c[field]) return null;
    if (c.demoOpensAt && c.demoClosesAt && c.demoOpensAt >= c.demoClosesAt)
      return null;
    const t = c.token;
    if (
      t !== null &&
      (!c.published ||
        !["LIVE", "PAUSED_MONEY"].includes(c.phase) ||
        !t ||
        !validAddress(t.address) ||
        !Number.isSafeInteger(t.chainId) ||
        t.chainId <= 0 ||
        !validTicker(t.ticker) ||
        (t.buyUrl !== null &&
          (c.phase !== "LIVE" ||
            safeExternalUrl(t.buyUrl, "pons") !== t.buyUrl)))
    )
      return null;
    // Keep the same explicit allowlist even if an extra field was injected.
    return {
      version: 1,
      phase: c.phase,
      localPreview: c.localPreview,
      published: c.published,
      gameplay: c.gameplay,
      xUrl: c.xUrl,
      demoOpensAt: c.demoOpensAt,
      demoClosesAt: c.demoClosesAt,
      launchAt: c.launchAt,
      token: t
        ? {
            address: t.address,
            chainId: t.chainId,
            ticker: t.ticker,
            buyUrl: t.buyUrl,
          }
        : null,
    };
  } catch {
    return null;
  }
}
