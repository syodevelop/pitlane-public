import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  ApiError,
  type Pending,
  type Snapshot,
  type WalletProvider,
} from "./api";
import { SCHEMA_VERSION } from "../packages/protocol";
import { BALANCE_VERSION, type Command } from "../packages/game-core";
import {
  publicWalletConfig,
  type WalletConnectConfig,
} from "../shared/wallet-config";
import type { ExternalWallet } from "./external-wallet";
import {
  savedInjectedProvider,
  useInjectedWallets,
  type InjectedWallet,
} from "./wallet-discovery";

const changedMessage =
  "Wallet or network changed. Sign in again to open the matching garage.";
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The wallet cancelled or could not finish. Your saved progress is safe.";
const address = (value: unknown): string =>
  typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)
    ? value.toLowerCase()
    : "";
class WalletIdentityError extends Error {}

function savedRequest(account: string, value?: Pending | null): Pending | null {
  const key = `pitlane:pending:${account}`;
  try {
    if (value === null) sessionStorage.removeItem(key);
    else if (value) sessionStorage.setItem(key, JSON.stringify(value));
    else
      return JSON.parse(
        sessionStorage.getItem(key) || "null",
      ) as Pending | null;
  } catch {
    /* Pending storage is best effort; the server owns idempotency. */
  }
  return value || null;
}

async function walletIdentity(provider: WalletProvider | undefined) {
  if (!provider)
    throw new WalletIdentityError(
      "Reconnect your wallet to open your saved garage.",
    );
  const [accounts, chain] = await Promise.all([
    provider.request({ method: "eth_accounts" }),
    provider.request({ method: "eth_chainId" }),
  ]);
  const account = Array.isArray(accounts) ? address(accounts[0]) : "";
  const chainId =
    typeof chain === "string" && /^0x[0-9a-fA-F]+$/.test(chain)
      ? Number(chain)
      : 0;
  if (!account || !Number.isSafeInteger(chainId) || chainId <= 0)
    throw new WalletIdentityError(
      "Reconnect your wallet to open your saved garage.",
    );
  return { account, chainId };
}

function forgetRequest(account: string, id: string) {
  // A late response from a previous login cannot remove a newer pending action.
  if (savedRequest(account)?.id === id) savedRequest(account, null);
}

// Cookie-changing operations are serialized across same-origin tabs where Web
// Locks is available. Account headers still enforce isolation without that API.
let authTail: Promise<unknown> = Promise.resolve();
async function authOperation<T>(operation: () => Promise<T>): Promise<T> {
  if (navigator.locks)
    return await navigator.locks.request("pitlane:auth", operation);
  const result = authTail.then(operation, operation);
  authTail = result.catch(() => {});
  return result;
}

export function useGarageSession() {
  const injectedWallets = useInjectedWallets();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [identityVersion, setIdentityVersion] = useState(0);
  const [offset, setOffset] = useState(0);
  const [externalConfig, setExternalConfig] =
    useState<WalletConnectConfig | null>(null);
  const [networkName, setNetworkName] = useState("");
  const activeProvider = useRef<WalletProvider | undefined>(window.ethereum);
  const external = useRef<ExternalWallet | null>(null);
  const detach = useRef<(() => void) | null>(null);
  const generation = useRef(0),
    lock = useRef(false),
    reading = useRef(false);
  const connecting = useRef<number | null>(null);
  const expected = useRef(""),
    chain = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const invalidate = useCallback((reason: string) => {
    generation.current++;
    expected.current = "";
    lock.current = false;
    reading.current = false;
    setSnapshot(null);
    setWallet("");
    setPending(null);
    setBusy(false);
    setLoading(false);
    setError(reason);
    setIdentityVersion(generation.current);
  }, []);
  const receive = useCallback((s: Snapshot) => {
    setSnapshot((prior) =>
      prior &&
      prior.address === s.address &&
      prior.state.progress.generation === s.state.progress.generation &&
      prior.state.progress.revision > s.state.progress.revision
        ? prior
        : s,
    );
    setOffset(s.now - Date.now());
  }, []);
  const checkWallet = useCallback(async (account: string, chainId: number) => {
    const actual = await walletIdentity(activeProvider.current);
    if (actual.account !== account)
      throw new WalletIdentityError(changedMessage);
    if (actual.chainId !== chainId)
      throw new WalletIdentityError(
        `Select ${chainId === 4663 ? "Robinhood Chain" : "network " + chainId} in your wallet, then connect and sign in again. No funds are needed.`,
      );
  }, []);
  const refresh = useCallback(async () => {
    if (reading.current) return;
    const current = generation.current;
    reading.current = true;
    try {
      if (!activeProvider.current) return;
      const actual = await walletIdentity(activeProvider.current);
      if (!chain.current) {
        const config = await api<{ chainId: number }>("config");
        if (!Number.isSafeInteger(config.chainId) || config.chainId <= 0)
          throw new Error(
            "Wallet configuration is unavailable. Reload to retry.",
          );
        chain.current = config.chainId;
        setNetworkName(
          config.chainId === 4663
            ? "Robinhood Chain"
            : `Network ${config.chainId}`,
        );
      }
      if (current !== generation.current) return;
      const account = expected.current || actual.account;
      if (actual.account !== account || actual.chainId !== chain.current)
        throw new Error(changedMessage);
      const s = await api<Snapshot>("state", undefined, account);
      await checkWallet(account, chain.current);
      if (current !== generation.current) return;
      if (s.address !== account)
        throw new Error("Your sign-in account changed. Sign in again.");
      expected.current = account;
      setWallet(account);
      receive(s);
    } catch (e) {
      if (current !== generation.current) return;
      if (e instanceof ApiError && e.status === 401) {
        // A first visit is a normal gate; an expired existing garage is explicit.
        invalidate(
          expected.current
            ? "Your session expired or changed. Sign in again. Your progress is saved."
            : "",
        );
      } else invalidate(message(e));
    } finally {
      if (current === generation.current) {
        reading.current = false;
        setLoading(false);
      }
    }
  }, [checkWallet, invalidate, receive]);
  const observeProvider = useCallback(
    (provider: WalletProvider | undefined) => {
      detach.current?.();
      activeProvider.current = provider;
      const changed = () => invalidate(changedMessage);
      const accountsChanged = () => {
        // Permission approval can emit accountsChanged before requestAccounts
        // resolves. No garage is open during connect; verify the returned account.
        if (connecting.current !== generation.current) changed();
      };
      provider?.on?.("accountsChanged", accountsChanged);
      provider?.on?.("chainChanged", accountsChanged);
      provider?.on?.("disconnect", changed);
      detach.current = () => {
        provider?.removeListener?.("accountsChanged", accountsChanged);
        provider?.removeListener?.("chainChanged", accountsChanged);
        provider?.removeListener?.("disconnect", changed);
      };
    },
    [invalidate],
  );
  useEffect(() => {
    const current = generation.current;
    observeProvider(window.ethereum);
    if (typeof BroadcastChannel !== "undefined") {
      const bus = new BroadcastChannel("pitlane:auth");
      bus.onmessage = () =>
        invalidate(
          "Sign-in changed in another tab. Sign in again to continue.",
        );
      channel.current = bus;
    }
    void (async () => {
      try {
        const config = await api<{ chainId: number; walletConnect: unknown }>(
          "config",
        );
        if (current !== generation.current) return;
        if (!Number.isSafeInteger(config.chainId) || config.chainId <= 0)
          throw new Error(
            "Wallet configuration is unavailable. Reload to retry.",
          );
        chain.current = config.chainId;
        const wc = publicWalletConfig(
          config.walletConnect,
          location.origin,
          config.chainId,
        );
        setNetworkName(
          config.chainId === 4663
            ? "Robinhood Chain"
            : `Network ${config.chainId}`,
        );
        setExternalConfig(wc);
        let restoreExternal = false;
        try {
          restoreExternal =
            sessionStorage.getItem("pitlane:connector") === "walletconnect";
        } catch {
          /* Manual reconnection remains available. */
        }
        if (wc && restoreExternal) {
          const { externalWallet } = await import("./external-wallet");
          const provider = await externalWallet(wc);
          if (current !== generation.current) return;
          external.current = provider;
          observeProvider(provider);
        } else observeProvider(savedInjectedProvider());
        await refresh();
      } catch (e) {
        if (current === generation.current) invalidate(message(e));
      }
    })();
    return () => {
      generation.current++;
      reading.current = false;
      detach.current?.();
      channel.current?.close();
      channel.current = null;
    };
  }, [invalidate, observeProvider, refresh]);
  useEffect(() => {
    if (!snapshot) return;
    const tick = () => {
      if (!document.hidden && !lock.current) void refresh();
    };
    const interval = setInterval(tick, 3000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [!!snapshot, refresh]);
  useEffect(() => {
    if (!snapshot) return;
    const account = snapshot.address;
    const progressGeneration = snapshot.state.progress.generation;
    const current = generation.current;
    let disposed = false,
      sending = false,
      lastSent = 0;
    const heartbeat = async () => {
      if (
        disposed ||
        sending ||
        document.hidden ||
        Date.now() - lastSent < 20_000
      )
        return;
      sending = true;
      try {
        await checkWallet(account, chain.current);
        if (disposed || current !== generation.current) return;
        lastSent = Date.now();
        await api(
          "heartbeat",
          {
            schemaVersion: SCHEMA_VERSION,
            ruleset: BALANCE_VERSION,
            generation: progressGeneration,
          },
          account,
        );
      } catch (e) {
        if (
          !disposed &&
          current === generation.current &&
          (e instanceof WalletIdentityError ||
            (e instanceof ApiError && e.status === 401))
        )
          invalidate(message(e));
        // A network interruption lets the server grace expire. No gameplay grant.
      } finally {
        sending = false;
      }
    };
    void heartbeat();
    const interval = setInterval(() => void heartbeat(), 20_000);
    const visible = () => void heartbeat();
    document.addEventListener("visibilitychange", visible);
    return () => {
      disposed = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [
    snapshot?.address,
    snapshot?.state.progress.generation,
    checkWallet,
    invalidate,
  ]);
  useEffect(() => {
    if (!snapshot) return;
    const stored = savedRequest(snapshot.address);
    if (
      stored &&
      (stored.schemaVersion !== SCHEMA_VERSION ||
        stored.ruleset !== BALANCE_VERSION ||
        stored.generation !== snapshot.state.progress.generation)
    ) {
      savedRequest(snapshot.address, null);
      setPending(null);
      setError(
        "Your garage was updated. Review the saved progress before starting another action.",
      );
    } else setPending(stored);
  }, [snapshot?.address, snapshot?.state.progress.generation]);

  async function connect(
    kind: "injected" | "walletconnect" = "injected",
    selected?: InjectedWallet,
  ) {
    if (lock.current) return;
    lock.current = true;
    const current = generation.current;
    connecting.current = current;
    setBusy(true);
    setError("");
    try {
      if (kind === "walletconnect") {
        if (!externalConfig)
          throw new Error(
            "External wallet connection is not configured for this preview.",
          );
        const { externalWallet } = await import("./external-wallet");
        const provider = await externalWallet(externalConfig);
        if (current !== generation.current) return;
        external.current = provider;
        observeProvider(provider);
      } else observeProvider(selected?.provider || window.ethereum);
      const provider = activeProvider.current;
      if (!provider)
        throw new Error(
          "No browser wallet detected. Use a wallet browser or desktop extension, or choose Connect external wallet when available.",
        );
      const accounts =
        kind === "walletconnect"
          ? await external.current!.enable()
          : await provider.request({
              method: "eth_requestAccounts",
            });
      if (current !== generation.current) return;
      const account = Array.isArray(accounts) ? address(accounts[0]) : "";
      if (!account) throw new Error("Choose a wallet account to continue.");
      if ((await walletIdentity(provider)).account !== account)
        throw new WalletIdentityError(changedMessage);
      if (current !== generation.current) return;
      expected.current = account;
      setWallet(account);
      try {
        sessionStorage.setItem("pitlane:connector", kind);
        if (kind === "injected") {
          if (selected && selected.id !== "browser")
            sessionStorage.setItem("pitlane:injected-wallet", selected.id);
          else sessionStorage.removeItem("pitlane:injected-wallet");
        }
      } catch {
        /* No effect on server identity. */
      }
    } catch (e) {
      if (current === generation.current) setError(message(e));
    } finally {
      if (connecting.current === current) connecting.current = null;
      if (current === generation.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  async function signIn() {
    if (lock.current) return;
    lock.current = true;
    const current = generation.current,
      account = wallet;
    setBusy(true);
    setError("");
    try {
      const provider = activeProvider.current;
      if (!provider || !account) throw new Error("Connect your wallet first.");
      const challenge = await api<{
        message: string;
        chainId: number;
        expires: number;
      }>("auth/challenge", { address: account });
      if (current !== generation.current) return;
      chain.current = challenge.chainId;
      await checkWallet(account, challenge.chainId);
      if (current !== generation.current) return;
      const encoded =
        "0x" +
        Array.from(new TextEncoder().encode(challenge.message), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join("");
      const signature = await provider.request({
        method: "personal_sign",
        params: [encoded, account],
      });
      if (current !== generation.current) return;
      await checkWallet(account, challenge.chainId);
      await authOperation(async () => {
        if (current !== generation.current) return;
        if (Date.now() >= challenge.expires)
          throw new Error(
            "Sign-in message expired. Sign in again to request a new message.",
          );
        channel.current?.postMessage("changing");
        await api("auth/verify", {
          address: account,
          message: challenge.message,
          signature,
        });
        channel.current?.postMessage("changed");
      });
      if (current === generation.current) await refresh();
    } catch (e) {
      if (current === generation.current) setError(message(e));
    } finally {
      if (current === generation.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  async function send(command: Command, retry?: Pending) {
    if (!snapshot || lock.current || (pending && !retry)) return;
    const current = generation.current,
      account = snapshot.address;
    const envelope = retry || {
      schemaVersion: SCHEMA_VERSION,
      ruleset: BALANCE_VERSION,
      id: crypto.randomUUID(),
      generation: snapshot.state.progress.generation,
      version: snapshot.state.progress.revision,
      command,
    };
    lock.current = true;
    setBusy(true);
    setError("");
    let dispatched = false;
    try {
      await checkWallet(account, chain.current);
      if (current !== generation.current) return;
      savedRequest(account, envelope);
      dispatched = true;
      const s = await api<Snapshot>("command", envelope, account);
      forgetRequest(account, envelope.id);
      if (current !== generation.current) return;
      await checkWallet(account, chain.current);
      if (current !== generation.current) return;
      if (s.address !== account)
        throw new WalletIdentityError(
          "Your sign-in account changed. Sign in again.",
        );
      receive(s);
      setPending(null);
    } catch (e) {
      if (current !== generation.current) return;
      if (
        !dispatched ||
        e instanceof WalletIdentityError ||
        (e instanceof ApiError && e.status === 401)
      ) {
        invalidate(message(e));
        return;
      }
      setError(message(e));
      if (e instanceof ApiError && e.status < 500) {
        forgetRequest(account, envelope.id);
        setPending(null);
        await refresh();
      } else setPending(envelope);
    } finally {
      if (current === generation.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  async function signOut() {
    if (lock.current) return;
    const account = snapshot?.address || wallet;
    invalidate("");
    const current = generation.current;
    lock.current = true;
    setBusy(true);
    try {
      await authOperation(async () => {
        if (current !== generation.current) return;
        channel.current?.postMessage("changing");
        await api("auth/logout", {}, account);
        channel.current?.postMessage("changed");
      });
    } catch (e) {
      if (current === generation.current) setError(message(e));
    } finally {
      if (current === generation.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  async function changeWallet() {
    if (lock.current) return;
    const previous =
      activeProvider.current === external.current ? external.current : null;
    invalidate("");
    observeProvider(window.ethereum);
    try {
      sessionStorage.removeItem("pitlane:connector");
      sessionStorage.removeItem("pitlane:injected-wallet");
    } catch {
      /* Reconnect remains explicit. */
    }
    if (previous) {
      setBusy(true);
      const current = generation.current;
      lock.current = true;
      try {
        await previous.disconnect();
      } catch (e) {
        if (current === generation.current) setError(message(e));
      } finally {
        if (current === generation.current) {
          lock.current = false;
          setBusy(false);
        }
      }
    }
  }
  return {
    snapshot,
    loading,
    wallet,
    busy,
    error,
    pending,
    identityVersion,
    offset,
    connect,
    injectedWallets,
    networkName,
    signIn,
    signOut,
    send,
    externalAvailable: externalConfig !== null,
    changeWallet,
  };
}
