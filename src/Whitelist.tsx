import ContactLinks from "./ContactLinks";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  WHITELIST_TASKS,
  type WhitelistPublic,
  type WhitelistTask,
} from "../shared/whitelist";
import "./whitelist.css";

function TaskIcon({ task }: { task: WhitelistTask }) {
  return (
    <svg
      className={`wl-task-icon wl-task-icon-${task}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {task === "follow" ? (
        <path d="M4 3h4.5L20 21h-4.5L4 3Zm16 0L4 21" />
      ) : task === "like" ? (
        <path
          fill="currentColor"
          stroke="none"
          d="M12 21C9 18.3 2 13.5 2 7.8A5.3 5.3 0 0 1 12 5a5.3 5.3 0 0 1 10 2.8C22 13.5 15 18.3 12 21Z"
        />
      ) : task === "repost" ? (
        <path d="m2 7 4-4 4 4M6 3v13a3 3 0 0 0 3 3h4m9-2-4 4-4-4m4 4V8a3 3 0 0 0-3-3h-4" />
      ) : (
        <path d="M21 11.5a9 9 0 0 1-12.6 8.2L3 21l1.3-5.4A9 9 0 1 1 21 11.5Z" />
      )}
    </svg>
  );
}

async function request<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(`/api/whitelist/${path}`, {
    signal: AbortSignal.timeout(15000),
    method: data ? "POST" : "GET",
    credentials: "same-origin",
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  }).catch(() => {
    throw new Error(
      path === "applications"
        ? "We could not confirm your submission. Check your connection and try again. A retry will not create a second application."
        : "This step could not be saved. Check your connection and try again.",
    );
  });
  if (!response.headers.get("Content-Type")?.includes("application/json"))
    throw new Error("Applications could not be reached. Please try again.");
  const result = await response.json();
  if (!response.ok) {
    const error = (result as { error?: unknown })?.error;
    throw new Error(typeof error === "string" ? error : "Please try again.");
  }
  return result as T;
}

export default function Whitelist() {
  const [campaign, setCampaign] = useState<WhitelistPublic | null>(null);
  const [completed, setCompleted] = useState<WhitelistTask[]>([]);
  const [pending, setPending] = useState<WhitelistTask[]>([]);
  const [step, setStep] = useState<"tasks" | "details">("tasks");
  const [receipt, setReceipt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [wallet, setWallet] = useState("");
  const [handle, setHandle] = useState("");
  const [reason, setReason] = useState("");
  const title = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLElement>(null);
  const enabled = campaign?.state === "open";
  const tasksComplete = WHITELIST_TASKS.every((task) =>
    completed.includes(task.id),
  );
  const canContinue = enabled && tasksComplete;
  const load = async () => {
    setError("");
    try {
      const data = await request<WhitelistPublic>("config");
      setCampaign(data);
      setCompleted(data.completed);
      setReceipt(data.receipt);
      setStep(
        data.state === "open" &&
          WHITELIST_TASKS.every((task) => data.completed.includes(task.id))
          ? "details"
          : "tasks",
      );
    } catch {
      setError(
        "Applications could not be loaded. Check your connection and try again.",
      );
    }
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const resize = () => {
      if (viewport.scale === 1)
        panel.current?.style.setProperty(
          "--wl-visible-height",
          `${viewport.height}px`,
        );
    };
    resize();
    viewport.addEventListener("resize", resize);
    return () => viewport.removeEventListener("resize", resize);
  }, []);
  const go = (next: "tasks" | "details") => {
    if (next === "details" && !canContinue) return;
    setStep(next);
    setError("");
    requestAnimationFrame(() => title.current?.focus());
  };
  const markTask = async (task: WhitelistTask) => {
    if (!campaign || pending.includes(task)) return;
    setPending((old) => [...old, task]);
    setError("");
    try {
      const result = await request<{ completed: WhitelistTask[] }>(
        "checkpoint",
        { task, revision: campaign.revision },
      );
      setCompleted((old) => [...new Set([...old, ...result.completed])]);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The link opened, but this step was not saved. Try again.",
      );
    } finally {
      setPending((old) => old.filter((id) => id !== task));
    }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!campaign || !canContinue || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await request<{ receipt: string }>("applications", {
        revision: campaign.revision,
        wallet,
        handle,
        reason,
        website: new FormData(event.currentTarget).get("website"),
      });
      setReceipt(result.receipt);
      requestAnimationFrame(() => title.current?.focus());
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Your application was not saved. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <main
      className="whitelist-page"
      id="whitelist-content"
      tabIndex={-1}
      aria-labelledby="wl-panel-title"
    >
      <section
        ref={panel}
        className="wl-panel"
        aria-labelledby="wl-panel-title"
      >
        <div className="wl-panel-top">
          <span>PITLANE NFT</span>
          <a className="wl-close" href="/" aria-label="Back to home">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="m6 6 12 12M18 6 6 18"
                stroke="currentColor"
                strokeWidth="1.8"
              />
            </svg>
          </a>
        </div>
        {!campaign ? (
          <div className="wl-received">
            <h1 id="wl-panel-title" tabIndex={-1} ref={title}>
              Whitelist Form
            </h1>
            {error ? (
              <>
                <p className="wl-error" role="alert" id="whitelist-error">
                  {error}
                </p>
                <button
                  className="wl-primary"
                  type="button"
                  onClick={() => void load()}
                >
                  Try again ↗
                </button>
              </>
            ) : (
              <p className="site-loading" role="status">
                Loading the checklist…
              </p>
            )}
            <div className="wl-panel-footer">
              <ContactLinks />
            </div>
          </div>
        ) : receipt ? (
          <div className="wl-received">
            <span className="wl-success-mark" aria-hidden="true">
              ✓
            </span>
            <h1 id="wl-panel-title" tabIndex={-1} ref={title}>
              Application received.
            </h1>
            <p>
              Your application has been received. Submitting does not guarantee
              a whitelist spot.
            </p>
            <a className="wl-primary" href="/docs#overview">
              Explore Pitlane <span aria-hidden="true">↗</span>
            </a>
          </div>
        ) : (
          <>
            <div className="wl-steps" aria-label="Application steps">
              <button
                type="button"
                aria-current={step === "tasks" ? "step" : undefined}
                onClick={() => go("tasks")}
              >
                <span>{tasksComplete ? "✓" : "01"}</span> The checklist
              </button>
              <span className="wl-step-line" aria-hidden="true" />
              <button
                type="button"
                aria-current={step === "details" ? "step" : undefined}
                disabled={!canContinue}
                onClick={() => go("details")}
              >
                <span>02</span> Your details
              </button>
            </div>
            <h1 id="wl-panel-title" tabIndex={-1} ref={title}>
              Whitelist Form
            </h1>
            {step === "tasks" ? (
              <>
                <p className="wl-panel-description">
                  {enabled
                    ? "Complete the steps below to apply for the Pitlane NFT whitelist."
                    : "Applications are currently closed. Follow @playpitlane on X for updates."}
                </p>
                <div className="wl-progress" role="status" aria-live="polite">
                  <span>Complete the following tasks</span>
                  <span>{completed.length} / 4</span>
                </div>
                <div className="wl-tasks">
                  {WHITELIST_TASKS.map((task) => {
                    const done = completed.includes(task.id),
                      waiting = pending.includes(task.id);
                    const contents = (
                      <>
                        <TaskIcon task={task.id} />
                        <span className="wl-task-text">
                          <strong>{task.title}</strong>
                          <small>
                            {waiting
                              ? "Saving…"
                              : done
                                ? "Checkpoint complete"
                                : task.detail}
                          </small>
                        </span>
                        <span className="wl-task-arrow" aria-hidden="true">
                          ›
                        </span>
                        <span className="wl-check" aria-hidden="true">
                          {done ? "✓" : ""}
                        </span>
                      </>
                    );
                    return enabled && campaign?.links[task.id] ? (
                      <a
                        key={task.id}
                        className={`wl-task${done ? " is-complete" : ""}`}
                        href={campaign.links[task.id]}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${task.title}${done ? ", checkpoint complete" : ""}; opens in a new tab`}
                        onClick={(event) => {
                          if (waiting) event.preventDefault();
                          else void markTask(task.id);
                        }}
                      >
                        {contents}
                      </a>
                    ) : (
                      <button className="wl-task" disabled key={task.id}>
                        {contents}
                      </button>
                    );
                  })}
                </div>
                <button
                  className="wl-primary"
                  type="button"
                  disabled={!canContinue}
                  onClick={() => go("details")}
                >
                  Your details
                  <span aria-hidden="true">→</span>
                </button>
              </>
            ) : (
              <form onSubmit={submit} className="wl-form">
                <p className="wl-panel-description">
                  No wallet connection. No signature. Just your details.
                </p>
                <label>
                  Your X handle <span>*</span>
                  <input
                    name="handle"
                    autoCapitalize="none"
                    aria-invalid={
                      (!!error && /handle|username/i.test(error)) || undefined
                    }
                    aria-describedby={error ? "whitelist-error" : undefined}
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="@yourhandle"
                    required
                    pattern="@?[A-Za-z0-9_]{1,15}"
                    maxLength={16}
                    title="Your X username, with or without @"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <label>
                  Your EVM wallet address <span>*</span>
                  <input
                    name="wallet"
                    autoCapitalize="none"
                    aria-invalid={
                      (!!error && /wallet|Ethereum/i.test(error)) || undefined
                    }
                    aria-describedby={error ? "whitelist-error" : undefined}
                    value={wallet}
                    onChange={(e) => setWallet(e.target.value)}
                    placeholder="0x…"
                    required
                    pattern="0x[a-fA-F0-9]{40}"
                    maxLength={42}
                    title="A 42-character Ethereum address beginning with 0x"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <label>
                  Why do you want to join Pitlane? <small>Optional</small>
                  <textarea
                    name="reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Tell us in a few words…"
                    maxLength={500}
                    rows={2}
                  />
                </label>
                <div className="wl-honeypot" aria-hidden="true">
                  <label>
                    Website
                    <input name="website" tabIndex={-1} autoComplete="off" />
                  </label>
                </div>
                <button
                  className="wl-primary"
                  disabled={busy || !canContinue}
                  type="submit"
                >
                  {busy ? "Sending…" : "Submit for Whitelist"}
                  <span aria-hidden="true">→</span>
                </button>
                <p className="wl-privacy">
                  We store these details to review your application. Submitting
                  does not guarantee a whitelist spot.
                </p>
              </form>
            )}
            {error && (
              <p className="wl-error" role="alert" id="whitelist-error">
                {error}
                {!campaign && (
                  <button type="button" onClick={() => void load()}>
                    Try again
                  </button>
                )}
              </p>
            )}
            <div className="wl-panel-footer">
              <a href="/docs#overview">About Pitlane ↗</a>
              <ContactLinks />
            </div>
          </>
        )}
      </section>
    </main>
  );
}
