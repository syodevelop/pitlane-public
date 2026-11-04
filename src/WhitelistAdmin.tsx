import { useEffect, useState, type FormEvent } from "react";
import {
  configuredPostId,
  postIntentLinks,
  type WhitelistConfig,
} from "../shared/whitelist";
import "./whitelist-admin.css";
import WorkshopPlayers from "./WorkshopPlayers";

type Application = {
  id: string;
  wallet: string;
  handle: string;
  reason: string;
  revision: number;
  created_at: number;
};
export default function WhitelistAdmin() {
  const [section, setSection] = useState<"whitelist" | "players">("players");
  const [password, setPassword] = useState("");
  const [settings, setSettings] = useState<WhitelistConfig | null>(null);
  const [postId, setPostId] = useState("");
  const [local, setLocal] = useState(false);
  const [applications, setApplications] = useState<Application[]>([]);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const intents = postIntentLinks(postId);
  async function api<T>(path: string, data?: unknown): Promise<T> {
    const response = await fetch(`/api/admin/whitelist/${path}`, {
      signal: AbortSignal.timeout(15000),
      method: data ? "POST" : "GET",
      credentials: "same-origin",
      headers: {
        ...(data ? { "Content-Type": "application/json" } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    if (response.status === 401 && path !== "login") setSettings(null);
    if (!response.headers.get("Content-Type")?.includes("application/json"))
      throw new Error("Administration could not be reached. Please try again.");
    const body = await response.json();
    if (!response.ok) {
      const error = (body as { error?: unknown })?.error;
      throw new Error(
        typeof error === "string" ? error : "Admin request failed.",
      );
    }
    return body as T;
  }
  async function load(quiet = false) {
    setError("");
    setBusy(true);
    try {
      const result = await api<{ config: WhitelistConfig; local: boolean }>(
        "config",
      );
      setSettings(result.config);
      setPostId(configuredPostId(result.config.links));
      setLocal(result.local);
      const list = await api<{ applications: Application[]; total: number }>(
        "applications",
      );
      setApplications(list.applications);
      setTotal(list.total);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not load settings.";
      if (!(quiet && message === "Admin access required.")) setError(message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load(true);
  }, []);
  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("login", { password });
      setPassword("");
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Sign-in failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    setBusy(true);
    setError("");
    try {
      await api("logout", {});
      setSettings(null);
      setApplications([]);
      setTotal(0);
      setPassword("");
      setMessage("");
    } catch {
      setError("Could not sign out. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{ config: WhitelistConfig }>("config", {
        revision: settings.revision,
        state: settings.state,
        followUrl: settings.links.follow.trim(),
        postId: postId.trim(),
      });
      setSettings(result.config);
      setPostId(configuredPostId(result.config.links));
      setMessage(
        "Settings saved. Visitors will use these links after refreshing the page.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Settings were not saved.");
    } finally {
      setBusy(false);
    }
  }
  async function exportAll() {
    setExporting(true);
    setError("");
    try {
      const response = await fetch("/api/admin/whitelist/applications.csv", {
        signal: AbortSignal.timeout(30000),
        credentials: "same-origin",
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: unknown };
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Could not export applications.",
        );
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "pitlane-whitelist.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not export applications.",
      );
    } finally {
      setExporting(false);
    }
  }
  return (
    <main className="wl-admin" id="main-content" tabIndex={-1}>
      <span className="guide-kicker">
        {local ? "LOCAL ADMIN" : "ADMIN"} / PITLANE
      </span>
      <h1>Pitlane control desk.</h1>
      <p className="wl-admin-lead">
        View game players, manage whitelist applications, and update campaign
        links.
      </p>
      {!settings ? (
        <form onSubmit={signIn} className="wl-admin-login">
          <label>
            Admin password
            <input
              type="password"
              name="password"
              required
              maxLength={256}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? "Loading…" : "Open admin"}
          </button>
        </form>
      ) : (
        <>
          <button type="button" onClick={() => void signOut()} disabled={busy}>
            Sign out
          </button>
          <nav className="admin-sections" aria-label="Administration sections">
            <button
              aria-pressed={section === "players"}
              onClick={() => setSection("players")}
            >
              Game players
            </button>
            <button
              aria-pressed={section === "whitelist"}
              onClick={() => setSection("whitelist")}
            >
              Whitelist
            </button>
          </nav>
          {section === "players" && <WorkshopPlayers />}
          <div hidden={section !== "whitelist"}>
            <form onSubmit={save} className="wl-admin-settings">
              <h2>Task destinations</h2>
              <p>
                A click completes a checkpoint. This does not verify a follow,
                like, repost or quote on X.
              </p>
              <label>
                X profile URL
                <input
                  type="url"
                  required={settings.state === "open"}
                  value={settings.links.follow}
                  placeholder="https://x.com/playpitlane"
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      links: { ...settings.links, follow: event.target.value },
                    })
                  }
                />
              </label>
              <label>
                Post ID
                <input
                  type="text"
                  required={settings.state === "open"}
                  value={postId}
                  placeholder="2114015920498823592"
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="wl-post-hint"
                  onChange={(event) => setPostId(event.target.value)}
                />
              </label>
              <p id="wl-post-hint">
                Paste the post ID or its X URL. Like, repost and quote links
                update together when you save. Quote opens a composer with the
                post link.
              </p>
              <details className="wl-admin-intents">
                <summary>Generated task links</summary>
                {(["like", "repost", "quote"] as const).map((task) => (
                  <label key={task}>
                    {task[0].toUpperCase() + task.slice(1)} intent link
                    <input type="url" readOnly value={intents?.[task] ?? ""} />
                  </label>
                ))}
              </details>
              <label>
                Applications
                <select
                  value={settings.state}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      state: e.target.value as "open" | "closed",
                    })
                  }
                >
                  <option value="closed">Closed</option>
                  <option value="open">Open</option>
                </select>
              </label>
              <div className="wl-admin-actions">
                <button type="submit" disabled={busy}>
                  Save campaign
                </button>
                <a href="/whitelist" target="_blank" rel="noopener noreferrer">
                  Open page ↗
                </a>
              </div>
            </form>
            <section className="wl-admin-entries">
              <div className="wl-admin-section-title">
                <h2>
                  Applications <span>{total}</span>
                </h2>
                <div>
                  <button onClick={() => void load()} disabled={busy}>
                    Refresh
                  </button>
                  <button
                    onClick={() => void exportAll()}
                    disabled={exporting || busy}
                  >
                    {exporting ? "Exporting…" : "Export all CSV"}
                  </button>
                </div>
              </div>
              <p>
                Showing the latest {applications.length} of {total}. Entries are
                received applications, not approved mint access.
              </p>
              <p>
                CSV includes all applications, with handle and wallet columns.
              </p>
              {!applications.length ? (
                <p>No applications yet.</p>
              ) : (
                <div
                  className="wl-admin-table"
                  tabIndex={0}
                  role="region"
                  aria-label="Received applications"
                >
                  <table>
                    <thead>
                      <tr>
                        <th>Received</th>
                        <th>Wallet</th>
                        <th>X handle</th>
                        <th>Why they want to join</th>
                      </tr>
                    </thead>
                    <tbody>
                      {applications.map((a) => (
                        <tr key={a.id}>
                          <td>
                            {new Date(a.created_at).toLocaleString("en-GB")}
                          </td>
                          <td>
                            <code>{a.wallet}</code>
                          </td>
                          <td>@{a.handle}</td>
                          <td>{a.reason || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}
      {message && (
        <p role="status" className="wl-admin-message">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="wl-admin-error">
          {error}
        </p>
      )}
    </main>
  );
}
