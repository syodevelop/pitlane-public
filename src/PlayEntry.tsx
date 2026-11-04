import { useState, type ReactNode } from "react";
import type { InjectedWallet } from "./wallet-discovery";
import { PLAY_CITY } from "./play-art";

// Deliberately drawn as vector geometry: one closed circuit, crisp at any DPI.
export function EntryCircuit() {
  return (
    <svg className="entry-circuit" viewBox="0 0 180 140" aria-hidden="true">
      <path d="M142 110 44 110Q22 110 22 88V30Q22 14 40 14H80Q94 14 94 28V40Q94 54 78 54H50Q40 54 40 66V74Q40 87 54 87H142Q158 87 158 100Q158 110 142 110Z" />
      <path className="entry-pit-line" d="M74 99H132" />
      <path className="entry-finish" d="M108 105V115M112 105V115" />
    </svg>
  );
}
export function PlayCity({ phase = "waiting" }: { phase?: string }) {
  return (
    <div className={`entry-visual entry-${phase}`} aria-hidden="true">
      <img className="entry-city" src={PLAY_CITY} alt="" fetchPriority="high" />
      <div className="entry-city-shade" />
    </div>
  );
}
export function EntryLoader({
  done = 0,
  total = 1,
  error = "",
  retry,
  checking = false,
  label,
}: {
  done?: number;
  total?: number;
  error?: string;
  retry?: () => void;
  checking?: boolean;
  label?: string;
}) {
  return (
    <section
      className="entry-loading"
      aria-label="Loading garage"
      aria-busy={!error}
    >
      <span className="entry-logo">pitlane</span>
      <h1>
        {error
          ? "One more pit stop"
          : label ||
            (checking
              ? "Checking your saved session…"
              : "Preparing your garage")}
      </h1>
      <progress aria-label="Garage assets loaded" value={done} max={total} />
      <p role={error ? "alert" : "status"}>
        {error || `${done} / ${total} resources ready`}
      </p>
      {error && (
        <button className="entry-action" onClick={retry}>
          Retry loading
        </button>
      )}
    </section>
  );
}
export function EntryPass({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <section
      className={`entry-pass${wide ? " entry-pass-wide" : ""}`}
      aria-label={wide ? "Choose your crew lead" : "Garage access"}
    >
      <aside className="entry-pass-side" aria-hidden="true">
        <span className="entry-logo">pitlane</span>
        <EntryCircuit />
      </aside>
      <div className="entry-pass-content">{children}</div>
    </section>
  );
}
export function EntrySteps({ step }: { step: 0 | 1 | 2 }) {
  return (
    <ol className="entry-steps" aria-label="Garage entry steps">
      {["Connect", "Sign in", "Garage"].map((label, index) => (
        <li key={label} aria-current={index === step ? "step" : undefined}>
          <span>0{index + 1}</span> {label}
        </li>
      ))}
    </ol>
  );
}
export function WalletEntry({
  wallet,
  busy,
  injectedWallets,
  externalAvailable,
  connect,
  signIn,
  changeWallet,
  networkName,
}: {
  wallet: string;
  busy: boolean;
  injectedWallets: InjectedWallet[];
  externalAvailable: boolean;
  connect: (
    kind?: "injected" | "walletconnect",
    selected?: InjectedWallet,
  ) => void;
  signIn: () => void;
  changeWallet: () => void;
  networkName: string;
}) {
  const [selectedId, setSelectedId] = useState("");
  const selected =
    injectedWallets.find((w) => w.id === selectedId) || injectedWallets[0];
  const choices = injectedWallets.length
    ? injectedWallets
    : [
        { id: "rabby-unavailable", name: "Rabby", provider: undefined },
        { id: "metamask-unavailable", name: "MetaMask", provider: undefined },
      ];
  return (
    <>
      <EntrySteps step={wallet ? 1 : 0} />
      <h1>{wallet ? "Make it your garage" : "Your garage starts here"}</h1>
      <p className="entry-intro">
        {wallet
          ? "Sign the Pitlane login message"
          : "Connect your wallet, then sign in"}
      </p>
      {!wallet ? (
        <div className="entry-wallets" aria-label="Choose a wallet">
          {choices.map((item) => (
            <button
              key={item.id}
              className="entry-wallet"
              disabled={busy || !item.provider}
              aria-pressed={selected?.id === item.id}
              onClick={() => setSelectedId(item.id)}
            >
              {"icon" in item && item.icon ? (
                <img src={item.icon} alt="" />
              ) : (
                <span className="entry-wallet-mark" aria-hidden="true">
                  {item.name === "MetaMask" ? "M" : item.name.charAt(0)}
                </span>
              )}
              <span>{item.name}</span>
              <small>
                {item.provider
                  ? selected?.id === item.id
                    ? "Selected"
                    : "Detected"
                  : "Not detected"}
              </small>
              <span aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="entry-account">
          <strong>
            {wallet.slice(0, 8)}…{wallet.slice(-6)}
          </strong>
          <span>Connected, not signed in</span>
        </div>
      )}
      <button
        className="entry-action"
        disabled={busy}
        onClick={wallet ? signIn : () => connect("injected", selected)}
      >
        <span>
          {busy
            ? "Waiting for wallet…"
            : wallet
              ? "Sign in to Pitlane"
              : "Connect wallet"}
        </span>
        <span aria-hidden="true">→</span>
      </button>
      {wallet ? (
        <button
          className="entry-secondary"
          disabled={busy}
          onClick={changeWallet}
        >
          Change wallet
        </button>
      ) : (
        <button
          className="entry-secondary"
          aria-label="Connect external wallet"
          disabled={busy || !externalAvailable}
          onClick={() => connect("walletconnect")}
        >
          <svg viewBox="0 0 32 24" aria-hidden="true">
            <path d="M3 8Q16-4 29 8M6 12l6 6 4-4 4 4 6-6" />
          </svg>
          <span>WalletConnect / QR</span>
          <span className="entry-qr" aria-hidden="true">
            ▦
          </span>
        </button>
      )}
      <p className="entry-signature-note">
        Sign-in only. No transaction or token approval.
      </p>
      {!wallet && !externalAvailable && (
        <p className="entry-connector-note">
          Use a desktop wallet extension or open Pitlane in your wallet’s browser.
        </p>
      )}
      <p className="entry-network">
        {networkName || "Checking network settings…"}
      </p>
    </>
  );
}
