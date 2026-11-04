import { useEffect, useState, type FormEvent } from "react";
import type { WorkshopPlayerRow } from "../shared/workshop-account";
type PlayerList = {
  players: WorkshopPlayerRow[];
  total: number;
  offset: number;
  limit: number;
  stats: { total: number; playSeconds: number; recent: number };
};
const duration = (seconds: number) =>
  `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
const date = (value: number) => new Date(value).toLocaleString("en-GB");
export default function WorkshopPlayers() {
  const [result, setResult] = useState<PlayerList | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("");
  async function load(offset = 0, wallet = filter) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/whitelist/players?offset=${offset}&wallet=${encodeURIComponent(wallet)}`,
        { credentials: "same-origin", signal: AbortSignal.timeout(15000) },
      );
      const body = (await response.json()) as PlayerList & { error?: string };
      if (!response.ok)
        throw new Error(body.error || "Could not load players.");
      setResult(body);
      setFilter(wallet);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load players.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function submit(event: FormEvent) {
    event.preventDefault();
    void load(0, search.trim());
  }
  return (
    <section
      className="wl-admin-entries workshop-players"
      aria-label="Game players"
    >
      <div className="wl-admin-section-title">
        <h2>
          Game players <span>{result?.stats.total ?? "—"}</span>
        </h2>
        <button disabled={busy} onClick={() => void load(result?.offset || 0)}>
          Refresh players
        </button>
      </div>
      <p>
        Wallets appear after a verified sign-in. Progress updates while playing.
        Credits and REP below are synced gameplay statistics, not token balances
        or verified reward entitlements.
      </p>
      {result && (
        <dl className="players-summary">
          <div>
            <dt>Seen in the last 5 minutes</dt>
            <dd>{result.stats.recent}</dd>
          </div>
          <div>
            <dt>Total active play time</dt>
            <dd>{duration(result.stats.playSeconds)}</dd>
          </div>
        </dl>
      )}
      <form className="players-search" onSubmit={submit}>
        <label>
          Find wallet
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="0x…"
            maxLength={42}
          />
        </label>
        <button disabled={busy} type="submit">
          Search
        </button>
      </form>
      {error && (
        <p role="alert" className="wl-admin-error">
          {error}
        </p>
      )}
      {busy && <p role="status">Loading players…</p>}
      {result && !result.players.length && <p>No matching players yet.</p>}
      {!!result?.players.length && (
        <>
          <div
            className="wl-admin-table"
            tabIndex={0}
            role="region"
            aria-label="Player statistics"
          >
            <table>
              <thead>
                <tr>
                  {[
                    "Wallet / character",
                    "Credits",
                    "REP",
                    "Jobs",
                    "Races",
                    "Garage",
                    "Play time",
                    "Sign-ins",
                    "First seen",
                    "Last login",
                    "Last activity",
                  ].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.players.map((p) => (
                  <tr key={p.wallet}>
                    <td>
                      <code>{p.wallet}</code>
                      <small>
                        {p.character
                          ? p.character[0].toUpperCase() + p.character.slice(1)
                          : "Character not chosen"}
                      </small>
                    </td>
                    <td>{p.credits.toLocaleString("en-GB")}</td>
                    <td>{p.rep}</td>
                    <td>
                      {p.serviced} service<small>{p.engine_jobs} engine</small>
                    </td>
                    <td>
                      {p.races}
                      <small>Best {p.best_score}</small>
                    </td>
                    <td>
                      {p.bays} {p.bays === 1 ? "bay" : "bays"}
                      <small>
                        {p.tools ? "Pro tools" : "Basic tools"} ·{" "}
                        {p.mechanic ? "Mechanic hired" : "No mechanic"}
                      </small>
                    </td>
                    <td>{duration(p.play_seconds)}</td>
                    <td>{p.logins}</td>
                    <td>{date(p.first_seen)}</td>
                    <td>{date(p.last_login)}</td>
                    <td>{date(p.last_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="players-pages">
            <button
              disabled={busy || result.offset === 0}
              onClick={() =>
                void load(Math.max(0, result.offset - result.limit))
              }
            >
              Previous
            </button>
            <span>
              {result.offset + 1}–{result.offset + result.players.length} of{" "}
              {result.total}
            </span>
            <button
              disabled={busy || result.offset + result.limit >= result.total}
              onClick={() => void load(result.offset + result.limit)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}
