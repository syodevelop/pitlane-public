import { describe, expect, it } from "vitest";
import { publicWalletConfig } from "../shared/wallet-config";
const origin = "https://staging.pitlane.invalid",
  chain = 11155111;
const config = {
  projectId: "1".repeat(32),
  appOrigin: origin,
  chainId: chain,
  chainName: "Sepolia",
  rpcUrl: "https://rpc.invalid/",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
};
describe("public wallet configuration", () => {
  it("fails closed until a matching project, origin, chain and public RPC are configured", () => {
    for (const value of [
      null,
      {},
      { ...config, projectId: "" },
      { ...config, appOrigin: "https://other.invalid" },
      { ...config, chainId: 1 },
      { ...config, rpcUrl: "https://secret:password@rpc.invalid/" },
      { ...config, rpcUrl: "http://rpc.invalid/" },
      { ...config, nativeCurrency: null },
    ])
      expect(publicWalletConfig(value, origin, chain)).toBeNull();
    expect(publicWalletConfig(config, origin, chain)).toEqual(config);
  });
  it("projects only the public fields and rejects non-local HTTP origins", () => {
    expect(
      publicWalletConfig(
        {
          ...config,
          privateKey: "must not be serialized",
          nativeCurrency: { ...config.nativeCurrency, secret: "no" },
        },
        origin,
        chain,
      ),
    ).toEqual(config);
    expect(
      publicWalletConfig(
        { ...config, appOrigin: "http://staging.pitlane.invalid" },
        "http://staging.pitlane.invalid",
        chain,
      ),
    ).toBeNull();
    expect(
      publicWalletConfig(
        { ...config, appOrigin: "ftp://127.0.0.1" },
        "ftp://127.0.0.1",
        chain,
      ),
    ).toBeNull();
  });
});
