import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { api, ApiError, type WalletProvider } from "./api";
import { EntryLoader, EntryPass, PlayCity, WalletEntry } from "./PlayEntry";
import {
  savedInjectedProvider,
  useInjectedWallets,
  type InjectedWallet,
} from "./wallet-discovery";
import {
  publicWalletConfig,
  type WalletConnectConfig,
} from "../shared/wallet-config";
import type { ExternalWallet } from "./external-wallet";
import type { CrewId, WorkshopAccount } from "../shared/workshop-account";
import { WorkshopCloud } from "./workshop-cloud";
import "./play-entry.css";
const WorkshopGame = lazy(() => import("./WorkshopGame"));
const crew = [
  { id: "gus", name: "Gus", role: "Mechanic" },
  { id: "dash", name: "Dash", role: "Runner" },
  { id: "juno", name: "Juno", role: "Tuner" },
] as const;
const validAccount = (value: unknown) =>
  typeof value === "string" && /^0x[0-9a-f]{40}$/i.test(value)
    ? value.toLowerCase()
    : "";

export default function WorkshopEntry() {
  const injectedWallets = useInjectedWallets();
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [wallet, setWallet] = useState("");
  const [profile, setProfile] = useState<WorkshopAccount | null>(null);
  const [cloud, setCloud] = useState<WorkshopCloud | null>(null);
  const [chosen, setChosen] = useState<CrewId | null>(null);
  const [externalConfig, setExternalConfig] =
    useState<WalletConnectConfig | null>(null);
  const provider = useRef<WalletProvider | undefined>(undefined),
    external = useRef<ExternalWallet | null>(null);
  const epoch = useRef(0),
    lock = useRef(false),
    connecting = useRef(false);
  const detach = useRef<(() => void) | null>(null),
    channel = useRef<BroadcastChannel | null>(null);
  function invalidate(reason = "") {
    epoch.current++;
    setProfile(null);
    setCloud(null);
    setWallet("");
    setChosen(null);
    setBusy(false);
    setLoading(false);
    setError(reason);
    lock.current = false;
  }
  function observe(next: WalletProvider | undefined) {
    detach.current?.();
    provider.current = next;
    const changed = () => {
      if (!connecting.current)
        invalidate("Your wallet changed. Sign in again to open its garage.");
    };
    next?.on?.("accountsChanged", changed);
    next?.on?.("disconnect", changed);
    detach.current = () => {
      next?.removeListener?.("accountsChanged", changed);
      next?.removeListener?.("disconnect", changed);
    };
  }
  async function accountMatches(account: string) {
    const accounts = await provider.current?.request({
      method: "eth_accounts",
    });
    if (!Array.isArray(accounts) || validAccount(accounts[0]) !== account)
      throw new Error("Your wallet changed. Connect it again.");
  }
  async function enter(result: WorkshopAccount, current: number) {
    if (current !== epoch.current) return;
    if (!result.character) {
      setProfile(result);
      return;
    }
    const opened = await api<WorkshopAccount & { writer: string }>(
      "workshop/open",
      {},
      result.address,
    );
    await accountMatches(result.address);
    if (current !== epoch.current) return;
    setProfile(opened);
    setCloud(new WorkshopCloud(opened, () => accountMatches(opened.address)));
  }
  useEffect(() => {
    const current = epoch.current;
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("pitlane:auth");
      channel.current.onmessage = () =>
        invalidate(
          "Sign-in changed in another tab. Sign in again to continue.",
        );
    }
    void (async () => {
      try {
        const config = await api<{
          chainId: number;
          walletConnect: unknown;
          capabilities: { gameplay: boolean };
        }>("config");
        if (current !== epoch.current) return;
        if (!config.capabilities.gameplay)
          throw new Error(
            "The workshop is temporarily closed. Please check back shortly.",
          );
        const wc = publicWalletConfig(
          config.walletConnect,
          location.origin,
          config.chainId,
        );
        setExternalConfig(wc);
        let restoreExternal = false;
        try {
          restoreExternal =
            sessionStorage.getItem("pitlane:connector") === "walletconnect";
        } catch {
          /* optional hint */
        }
        if (wc && restoreExternal) {
          const { externalWallet } = await import("./external-wallet");
          const next = await externalWallet(wc);
          if (current !== epoch.current) return;
          external.current = next;
          observe(next);
        } else observe(savedInjectedProvider());
        const accounts = await provider.current?.request({
          method: "eth_accounts",
        });
        const account = Array.isArray(accounts)
          ? validAccount(accounts[0])
          : "";
        if (!account || current !== epoch.current) return;
        setWallet(account);
        const result = await api<WorkshopAccount>(
          "workshop/state",
          undefined,
          account,
        );
        await enter(result, current);
      } catch (e) {
        if (
          current === epoch.current &&
          !(e instanceof ApiError && e.status === 401)
        )
          setError(
            e instanceof Error ? e.message : "Could not open your garage.",
          );
      } finally {
        if (current === epoch.current) setLoading(false);
      }
    })();
    return () => {
      epoch.current++;
      detach.current?.();
      channel.current?.close();
    };
  }, []);
  async function connect(
    kind: "injected" | "walletconnect" = "injected",
    selected?: InjectedWallet,
  ) {
    if (lock.current) return;
    lock.current = true;
    connecting.current = true;
    setBusy(true);
    setError("");
    const current = epoch.current;
    try {
      if (kind === "walletconnect") {
        if (!externalConfig)
          throw new Error(
            "Open Pitlane in your wallet’s browser or use a desktop wallet extension.",
          );
        const { externalWallet } = await import("./external-wallet");
        external.current = await externalWallet(externalConfig);
        observe(external.current);
      } else observe(selected?.provider || window.ethereum);
      if (!provider.current)
        throw new Error(
          "Open Pitlane in your wallet’s browser or install a wallet extension.",
        );
      const accounts =
        kind === "walletconnect"
          ? await external.current!.enable()
          : await provider.current.request({ method: "eth_requestAccounts" });
      const account = Array.isArray(accounts) ? validAccount(accounts[0]) : "";
      if (!account) throw new Error("Choose a wallet account to continue.");
      await accountMatches(account);
      if (current !== epoch.current) return;
      setWallet(account);
      try {
        sessionStorage.setItem("pitlane:connector", kind);
        if (selected)
          sessionStorage.setItem("pitlane:injected-wallet", selected.id);
      } catch {
        /* optional hint */
      }
    } catch (e) {
      if (current === epoch.current)
        setError(e instanceof Error ? e.message : "Could not connect.");
    } finally {
      connecting.current = false;
      if (current === epoch.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  async function signIn() {
    if (lock.current || !wallet) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const current = epoch.current,
      account = wallet;
    try {
      await accountMatches(account);
      const challenge = await api<{ message: string }>("auth/challenge", {
        address: account,
      });
      if (current !== epoch.current) return;
      const encoded =
        "0x" +
        Array.from(new TextEncoder().encode(challenge.message), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join("");
      const signature = await provider.current!.request({
        method: "personal_sign",
        params: [encoded, account],
      });
      await accountMatches(account);
      if (current !== epoch.current) return;
      const verify = async () => {
        if (current !== epoch.current) return;
        channel.current?.postMessage("changing");
        await api("auth/verify", {
          address: account,
          message: challenge.message,
          signature,
        });
        channel.current?.postMessage("changed");
      };
      if (navigator.locks)
        await navigator.locks.request("pitlane:auth", verify);
      else await verify();
      if (current !== epoch.current) return;
      const result = await api<WorkshopAccount>(
        "workshop/state",
        undefined,
        account,
      );
      await enter(result, current);
    } catch (e) {
      if (current === epoch.current)
        setError(e instanceof Error ? e.message : "Sign-in failed. Try again.");
    } finally {
      if (current === epoch.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  async function choose() {
    if (!chosen || !profile || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const current = epoch.current;
    try {
      await accountMatches(profile.address);
      if (current !== epoch.current) return;
      const result = await api<WorkshopAccount>(
        "workshop/character",
        { character: chosen },
        profile.address,
      );
      await enter(result, current);
    } catch (e) {
      if (current === epoch.current)
        setError(
          e instanceof Error
            ? e.message
            : "Could not save your choice. Try again.",
        );
    } finally {
      if (current === epoch.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  async function signOut() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      if (cloud) {
        await cloud.flush();
        await cloud.flush();
        if (cloud.status.error)
          throw new Error("Save your progress before signing out.");
      }
      const account = profile?.address || wallet;
      if (account) await api("auth/logout", {}, account);
      channel.current?.postMessage("changed");
      invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign out.");
      setBusy(false);
      lock.current = false;
    }
  }
  if (cloud)
    return (
      <Suspense
        fallback={
          <main className="gate" role="status">
            Opening your workshop…
          </main>
        }
      >
        <WorkshopGame
          cloud={cloud}
          signOut={() => void signOut()}
          accountError={error}
          signOutBusy={busy}
        />
      </Suspense>
    );
  return (
    <main className="play-shell workshop-entry" id="main-content">
      <div className="play-root">
        <PlayCity />
        {loading ? (
          <EntryLoader checking label="Checking your wallet session…" />
        ) : (
          <div className="entry-stage">
            <EntryPass wide={!!profile}>
              {!profile ? (
                <WalletEntry
                  wallet={wallet}
                  busy={busy}
                  injectedWallets={injectedWallets}
                  externalAvailable={!!externalConfig}
                  connect={connect}
                  signIn={() => void signIn()}
                  changeWallet={() => invalidate()}
                  networkName="Wallet sign-in"
                />
              ) : (
                <>
                  <ol className="entry-steps crew-steps">
                    <li>
                      <span>✓</span> Signed in
                    </li>
                    <li aria-current="step">
                      <span>02</span> Choose character
                    </li>
                    <li>
                      <span>03</span> Enter garage
                    </li>
                  </ol>
                  <h1>Meet the crew.</h1>
                  <p className="lead">
                    Choose your permanent crew lead. Your garage and progress
                    stay with this wallet.
                  </p>
                  <div className="characters">
                    {crew.map((c) => (
                      <article
                        key={c.id}
                        className={chosen === c.id ? "crew-selected" : ""}
                      >
                        <div className="portrait">
                          <img
                            className="launch-portrait"
                            src={`/art/launch-${c.id}-portrait.webp`}
                            alt={c.name}
                          />
                        </div>
                        <h2>{c.name}</h2>
                        <span className="crew-role">{c.role}</span>
                        <button disabled={busy} onClick={() => setChosen(c.id)}>
                          Choose {c.name}
                        </button>
                      </article>
                    ))}
                  </div>
                  {chosen && (
                    <dialog
                      ref={(el) => {
                        if (el && !el.open) el.showModal();
                      }}
                      onCancel={() => {
                        if (!busy) setChosen(null);
                      }}
                      className="character-confirmation"
                      aria-label="Confirm permanent character"
                    >
                      <h2>
                        Make {crew.find((c) => c.id === chosen)!.name} your crew
                        lead?
                      </h2>
                      <p>
                        This choice is permanent for this wallet. You cannot
                        switch characters later.
                      </p>
                      <button
                        autoFocus
                        disabled={busy}
                        className="primary"
                        onClick={() => void choose()}
                      >
                        {busy
                          ? "Saving…"
                          : `Confirm ${crew.find((c) => c.id === chosen)!.name}`}
                      </button>
                      <button disabled={busy} onClick={() => setChosen(null)}>
                        Keep choosing
                      </button>
                      {error && <p role="alert">{error}</p>}
                    </dialog>
                  )}
                  <button
                    className="entry-signout"
                    disabled={busy}
                    onClick={() => void signOut()}
                  >
                    Sign out
                  </button>
                </>
              )}
              {error && (
                <p role="alert" className="entry-error">
                  {error}
                </p>
              )}
              <a className="entry-signout" href="/">
                Back to Pitlane
              </a>
            </EntryPass>
          </div>
        )}
      </div>
    </main>
  );
}
