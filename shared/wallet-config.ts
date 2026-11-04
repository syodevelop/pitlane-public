export type WalletConnectConfig = {
  projectId: string;
  appOrigin: string;
  chainId: number;
  chainName: string;
  rpcUrl: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
};

// Only explicit public connector settings leave the server. No RPC secret may
// be placed here: the entire returned object is visible in the browser.
export function publicWalletConfig(
  value: unknown,
  origin: string,
  chainId: number,
): WalletConnectConfig | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<WalletConnectConfig>;
  try {
    const app = new URL(origin),
      rpc = new URL(v.rpcUrl || "");
    const local = ["127.0.0.1", "localhost"].includes(app.hostname);
    if (
      v.appOrigin !== origin ||
      app.origin !== origin ||
      (app.protocol !== "https:" && !(local && app.protocol === "http:")) ||
      !/^[a-f0-9]{32}$/i.test(v.projectId || "") ||
      !Number.isSafeInteger(chainId) ||
      chainId <= 0 ||
      v.chainId !== chainId ||
      typeof v.chainName !== "string" ||
      !v.chainName.trim() ||
      v.chainName.length > 80 ||
      rpc.protocol !== "https:" ||
      rpc.username ||
      rpc.password ||
      rpc.hash ||
      !v.nativeCurrency ||
      typeof v.nativeCurrency.name !== "string" ||
      !v.nativeCurrency.name.trim() ||
      !/^[a-zA-Z0-9]{1,12}$/.test(v.nativeCurrency.symbol) ||
      !Number.isInteger(v.nativeCurrency.decimals) ||
      v.nativeCurrency.decimals < 0 ||
      v.nativeCurrency.decimals > 36
    )
      return null;
    return {
      projectId: v.projectId!,
      appOrigin: origin,
      chainId,
      chainName: v.chainName,
      rpcUrl: rpc.href,
      nativeCurrency: {
        name: v.nativeCurrency.name,
        symbol: v.nativeCurrency.symbol,
        decimals: v.nativeCurrency.decimals,
      },
    };
  } catch {
    return null;
  }
}
