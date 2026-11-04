import { useEffect, useState } from "react";
import type { WalletProvider } from "./api";

export type InjectedWallet = {
  id: string;
  name: string;
  icon?: string;
  provider: WalletProvider;
};
// EIP-6963: metadata is an untrusted display hint, never authentication.
const known = new Map<string, InjectedWallet>();
export function savedInjectedProvider(): WalletProvider | undefined {
  let saved = "";
  try {
    saved = sessionStorage.getItem("pitlane:injected-wallet") || "";
  } catch {
    /* Optional hint. */
  }
  return saved ? known.get(saved)?.provider : window.ethereum;
}
export function useInjectedWallets() {
  const [wallets, setWallets] = useState<InjectedWallet[]>([]);
  useEffect(() => {
    const update = () => {
      const list = [...known.values()];
      if (!list.length && window.ethereum)
        list.push({
          id: "browser",
          name: "Browser wallet",
          provider: window.ethereum,
        });
      setWallets(list);
    };
    const announce = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (
        !detail?.provider ||
        typeof detail.provider.request !== "function" ||
        typeof detail.info?.rdns !== "string" ||
        typeof detail.info?.name !== "string"
      )
        return;
      const id = detail.info.rdns.slice(0, 150);
      if (!id || known.has(id) || known.size >= 20) return;
      const icon =
        typeof detail.info.icon === "string" &&
        detail.info.icon.length < 150000 &&
        /^data:image\/(png|webp|jpeg|svg\+xml)[;,]/i.test(detail.info.icon)
          ? detail.info.icon
          : undefined;
      known.set(id, {
        id,
        name: detail.info.name.slice(0, 60),
        icon,
        provider: detail.provider,
      });
      update();
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    update();
    return () =>
      window.removeEventListener("eip6963:announceProvider", announce);
  }, []);
  return wallets;
}
