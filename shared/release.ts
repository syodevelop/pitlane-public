export const PHASES = [
  "DEMO",
  "CLOSED",
  "PRELAUNCH",
  "LIVE",
  "PAUSED_MONEY",
] as const;
export type Phase = (typeof PHASES)[number];
export type Environment = "local" | "staging" | "production";
export type MoneyManifest = {
  schemaVersion: 1;
  version: string;
  approved: boolean;
  testOnly: boolean;
  chainId: number;
  token: string;
  shop: string;
  treasury: string;
  feeCollector: string;
  decimals: number;
  ponsUrl: string;
  finalityPolicy: string;
  catalogVersion: string;
  allocationPolicy: string;
  withdrawalMinimum: string;
  operatorProcedureVersion: string;
  verifiedToken: boolean;
  verifiedShop: boolean;
};
export type ReleaseConfig = {
  environment: Environment;
  phase: Phase;
  published: boolean;
  gameplayEnabled: boolean;
  moneyRequested: boolean;
  money: MoneyManifest | null;
  walletConnect?: import("./wallet-config").WalletConnectConfig | null;
  publicSite?: {
    approved: boolean;
    xUrl?: string;
    demoOpensAt?: string;
    demoClosesAt?: string;
    launchAt?: string;
    tokenLaunchConfirmed?: boolean;
    tokenTicker?: string;
  };
};
export function moneyBlockers(c: ReleaseConfig): string[] {
  const m = c.money,
    errors: string[] = [];
  if (!c.moneyRequested) errors.push("Money surfaces are disabled.");
  if (c.phase !== "LIVE")
    errors.push("The current phase does not accept new money operations.");
  if (!m)
    return [
      ...errors,
      "CONFIG_UNDECIDED: approved monetary manifest is missing.",
    ];
  if (m.schemaVersion !== 1 || !m.approved)
    errors.push("Monetary manifest has not been approved.");
  if (c.environment === "production" && m.testOnly)
    errors.push("Test fixtures cannot be used in production.");
  if (!m.verifiedToken || !m.verifiedShop)
    errors.push("Token and shop verification are required.");
  if (!Number.isSafeInteger(m.chainId) || m.chainId <= 0)
    errors.push("Chain ID is missing.");
  if (!Number.isInteger(m.decimals) || m.decimals < 0 || m.decimals > 36)
    errors.push("Verified token decimals are missing.");
  for (const key of ["token", "shop", "treasury", "feeCollector"] as const)
    if (!/^0x[0-9a-fA-F]{40}$/.test(m[key]) || /^0x0{40}$/i.test(m[key]))
      errors.push(`Invalid ${key} address.`);
  if (m.treasury.toLowerCase() === m.feeCollector.toLowerCase())
    errors.push("Treasury and fee collector must be separate.");
  for (const key of [
    "version",
    "finalityPolicy",
    "catalogVersion",
    "allocationPolicy",
    "operatorProcedureVersion",
  ] as const)
    if (!m[key] || /UNDECIDED|PROTOTYPE|MOCK/i.test(m[key]))
      errors.push(`CONFIG_UNDECIDED: ${key}.`);
  if (
    !/^[1-9][0-9]{0,77}$/.test(m.withdrawalMinimum) ||
    BigInt(m.withdrawalMinimum) >= 2n ** 256n
  )
    errors.push("Approved withdrawal minimum is missing.");
  try {
    const url = new URL(m.ponsUrl);
    if (
      url.protocol !== "https:" ||
      !["ponsfamily.com", "www.ponsfamily.com"].includes(url.hostname)
    )
      errors.push("Verified Pons URL is missing.");
  } catch {
    errors.push("Verified Pons URL is missing.");
  }
  return errors;
}
export function releaseCapabilities(c: ReleaseConfig) {
  return {
    gameplay:
      c.gameplayEnabled &&
      (c.environment === "local" || c.published) &&
      ["DEMO", "LIVE", "PAUSED_MONEY"].includes(c.phase),
    newMoney:
      c.gameplayEnabled &&
      (c.environment === "local" || c.published) &&
      moneyBlockers(c).length === 0,
    reconcileExisting: true,
  };
}
