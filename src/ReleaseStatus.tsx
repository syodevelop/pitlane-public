import { useState } from "react";
import type { PublicRelease } from "../shared/public-release";

export function releaseCopy(release: PublicRelease | null) {
  if (!release)
    return {
      title: "Garage access unavailable",
      text: "Release information could not be loaded. Reload the page to check again. Your saved progress is safe.",
    };
  if (release.phase === "CLOSED")
    return {
      title: "Demo closed",
      text: "The competition has ended. Results and whitelist eligibility are under review. The garage is closed during this review.",
    };
  if (release.phase === "PRELAUNCH")
    return {
      title: "Full game coming soon",
      text: "The garage is being prepared for the full release. Gameplay is not open yet.",
    };
  if (!release.published && !release.localPreview)
    return {
      title: "Coming soon",
      text: "Pitlane is not open to the public yet. An approved opening time will appear here when it is set.",
    };
  if (release.phase === "PAUSED_MONEY")
    return {
      title: "Token operations paused",
      text: release.gameplay
        ? "Nonfinancial garage play remains open. New token operations are paused; existing requests remain subject to review and reconciliation."
        : "New token operations are paused. The garage is also temporarily closed. Existing requests remain subject to review and reconciliation.",
    };
  if (!release.gameplay)
    return {
      title: "Garage temporarily closed",
      text: "Gameplay is currently unavailable. Your saved progress is retained. Check back for reopening information.",
    };
  if (release.localPreview)
    return {
      title: "Local garage preview",
      text: "The public competition is not open. This preview uses Credits and nonfinancial demo REP; real-token features are unavailable.",
    };
  if (release.phase === "DEMO")
    return {
      title: "Demo is open",
      text: "Service customers, restore your car and build your team. Demo play is free, with no paid advantage or daily attempt limit.",
    };
  return {
    title: "Garage is open",
    text: "Run your garage and send your team to the circuit. Only released features are available in the game; token rewards are never guaranteed.",
  };
}

function ReleaseDates({ release }: { release: PublicRelease }) {
  const dates =
    release.phase === "DEMO" || release.phase === "CLOSED"
      ? [
          ["Demo opens", release.demoOpensAt],
          ["Demo closes", release.demoClosesAt],
        ]
      : [["Full release", release.launchAt]];
  return (
    <div className="release-dates">
      {dates
        .filter(([, date]) => date)
        .map(([label, date]) => (
          <p key={label}>
            {label}:{" "}
            <time dateTime={date!}>
              {new Intl.DateTimeFormat("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "UTC",
              }).format(new Date(date!))}{" "}
              UTC
            </time>
          </p>
        ))}
    </div>
  );
}

export function ReleaseStatus({
  release,
  gate = false,
}: {
  release: PublicRelease | null;
  gate?: boolean;
}) {
  const copy = releaseCopy(release);
  return (
    <section
      className={gate ? "release-gate" : "release-status"}
      aria-label="Garage availability"
    >
      {gate ? <h1>{copy.title}</h1> : <h2>{copy.title}</h2>}
      <p>{copy.text}</p>
      {release && <ReleaseDates release={release} />}
      {!release && (
        <button onClick={() => window.location.reload()}>Reload</button>
      )}
    </section>
  );
}

export function TokenLaunch({
  token,
}: {
  token: NonNullable<PublicRelease["token"]>;
}) {
  const [copy, setCopy] = useState<"idle" | "pending" | "success" | "error">(
    "idle",
  );
  async function copyAddress() {
    setCopy("pending");
    try {
      await navigator.clipboard.writeText(token.address);
      setCopy("success");
    } catch {
      setCopy("error");
    }
  }
  return (
    <section className="token-launch" aria-label="Verified token contract">
      <h2>Pitlane · {token.ticker}</h2>
      <p>Token contract · Chain ID {token.chainId}</p>
      <code>{token.address}</code>
      <div className="token-actions">
        <button
          onClick={() => void copyAddress()}
          disabled={copy === "pending"}
        >
          Copy contract address
        </button>
        {token.buyUrl && (
          <a
            className="primary"
            href={token.buyUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Buy on Pons ↗
          </a>
        )}
      </div>
      <p role="status">
        {copy === "success"
          ? "Contract address copied."
          : copy === "error"
            ? "Copy failed. Select and copy the address above."
            : copy === "pending"
              ? "Copying…"
              : "Check the network and contract before using your wallet."}
      </p>
    </section>
  );
}
