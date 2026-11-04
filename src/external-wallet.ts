import { EthereumProvider } from "@walletconnect/ethereum-provider";
import { createAppKit } from "@reown/appkit/core";
import type { CaipNetwork } from "@reown/appkit";
import type { WalletConnectConfig } from "../shared/wallet-config";
import type { WalletProvider } from "./api";

export type ExternalWallet = WalletProvider & {
  enable(): Promise<string[]>;
  disconnect(): Promise<void>;
};
let cached: Promise<ExternalWallet> | undefined;
let configKey = "";
export function externalWallet(
  config: WalletConnectConfig,
): Promise<ExternalWallet> {
  const key = JSON.stringify(config);
  if (cached && configKey === key) return cached;
  if (cached)
    throw new Error("Wallet settings changed. Reload before connecting again.");
  configKey = key;
  cached = initialize(config).catch((error) => {
    cached = undefined;
    throw error;
  });
  return cached;
}
async function initialize(
  config: WalletConnectConfig,
): Promise<ExternalWallet> {
  if (config.appOrigin !== location.origin)
    throw new Error("Open the configured Pitlane address before connecting.");
  const metadata = {
    name: "Pitlane",
    description: "Sign in to your Pitlane garage",
    url: config.appOrigin,
    icons: [config.appOrigin + "/art/gus.webp"],
  };
  const provider = await EthereumProvider.init({
    projectId: config.projectId,
    optionalChains: [config.chainId],
    optionalMethods: ["personal_sign", "eth_accounts", "eth_requestAccounts"],
    optionalEvents: ["accountsChanged", "chainChanged", "disconnect"],
    rpcMap: { [config.chainId]: config.rpcUrl },
    metadata,
    customStoragePrefix: `pitlane:${config.appOrigin}:${config.chainId}`,
    telemetryEnabled: false,
    logger: "silent",
    showQrModal: false,
  });
  // Configure before initialization. Updating the compatibility modal afterwards
  // races SDK initialization and cannot undo initial analytics/network defaults.
  const network: CaipNetwork = {
    id: config.chainId,
    name: config.chainName,
    chainNamespace: "eip155",
    caipNetworkId: `eip155:${config.chainId}`,
    nativeCurrency: config.nativeCurrency,
    rpcUrls: { default: { http: [config.rpcUrl] } },
  };
  const modal = createAppKit({
    projectId: config.projectId,
    networks: [network],
    defaultNetwork: network,
    metadata,
    universalProvider: provider.signer,
    manualWCControl: true,
    enableInjected: false,
    enableEIP6963: false,
    enableCoinbase: false,
    enableNetworkSwitch: false,
    themeMode: "light",
    themeVariables: {
      "--w3m-accent": "#c84429",
      "--w3m-font-family": "Arial, sans-serif",
      "--w3m-z-index": 10000,
    },
    features: {
      email: false,
      socials: false,
      swaps: false,
      onramp: false,
      send: false,
      receive: false,
      history: false,
      analytics: false,
      smartSessions: false,
      pay: false,
      reownAuthentication: false,
    },
  });
  await modal.ready();
  let connecting: Promise<string[]> | undefined;
  async function connect() {
    if (provider.session) return provider.enable();
    await modal.open();
    let unsubscribe = () => {};
    const cancelled = new Promise<never>((_resolve, reject) => {
      unsubscribe = modal.subscribeState((state) => {
        if (!state.open && !provider.session) {
          provider.signer.abortPairingAttempt();
          reject(new Error("Connection cancelled. Please try again."));
        }
      });
    });
    try {
      return await Promise.race([provider.enable(), cancelled]);
    } finally {
      unsubscribe();
      await modal.close();
    }
  }
  return {
    request: (args) => provider.request(args),
    on: (event, listener) => {
      provider.events.on(event, listener);
    },
    removeListener: (event, listener) => {
      provider.events.removeListener(event, listener);
    },
    enable: () =>
      (connecting ??= connect().finally(() => {
        connecting = undefined;
      })),
    disconnect: async () => {
      await modal.close();
      if (provider.session) await provider.disconnect();
    },
  };
}
