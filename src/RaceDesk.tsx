import { useEffect, useRef } from "react";
import WorkshopCrew from "./WorkshopCrew";
import type { WorkshopState } from "../packages/workshop-core";
import {
  carStats,
  nearRaceDesk,
  RACE_STATS,
  SPRINT,
  sprintResult,
  type RaceStat,
} from "../packages/workshop-core/racing";

export function raceStatus(s: WorkshopState, yielding = false) {
  const r = s.racing;
  if (yielding) return "Clear the driveway for your Rustback";
  return r.phase === "leaving"
    ? "Heading to the start"
    : r.phase === "racing"
      ? `On track · ${Math.ceil(SPRINT.seconds - r.elapsed)}s`
      : r.phase === "returning"
        ? "Returning to the garage"
        : r.phase === "result"
          ? "Race report ready"
          : r.preparation >= 1
            ? "Ready for the grid"
            : "Inspect your Rustback";
}

export default function RaceDesk({
  state: s,
  open,
  close,
  upgrade,
  start,
  claim,
  tab,
  setTab,
  hiring,
  hireError,
  hire,
  assign,
}: {
  state: WorkshopState;
  open: boolean;
  close: () => void;
  upgrade: (stat: RaceStat, level: number) => void;
  start: () => void;
  claim: () => void;
  tab: "car" | "crew";
  setTab: (tab: "car" | "crew") => void;
  hiring: boolean;
  hireError: string;
  hire: () => void;
  assign: (enabled: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  const r = s.racing,
    stats = carStats(r),
    forecast = sprintResult(stats);
  const home = r.phase === "idle",
    nearby = nearRaceDesk(s.position);
  const result = r.phase === "result" ? r.run : null;
  const names = { engine: "Engine", grip: "Grip", reliability: "Reliability" };
  return (
    <dialog
      ref={dialog}
      className="workshop-dialog race-desk"
      aria-labelledby="race-desk-title"
      onClose={close}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="race-desk-heading">
        <span className="workshop-kicker">BAY 02 / TEAM GARAGE</span>
        <button
          autoFocus
          className="race-close"
          aria-label="Close team desk"
          onClick={close}
        >
          ×
        </button>
      </div>
      <h2 id="race-desk-title">
        {tab === "crew"
          ? "Build your crew."
          : result
            ? "Back from the coast."
            : r.completed
              ? "Tune your Rustback."
              : "Build your first racer."}
      </h2>
      <div
        className="team-desk-sections"
        role="group"
        aria-label="Team desk sections"
      >
        <button aria-pressed={tab === "car"} onClick={() => setTab("car")}>
          Rustback & racing
        </button>
        <button aria-pressed={tab === "crew"} onClick={() => setTab("crew")}>
          Crew{s.mechanic.hired ? " · 01" : ""}
        </button>
      </div>
      <div className="race-meta">
        <span>{tab === "crew" ? "SERVICE CREW" : "RUSTBACK"}</span>
        <span>
          {r.rep} REP · {r.completed} {r.completed === 1 ? "race" : "races"}
        </span>
        <strong>{s.credits} C</strong>
      </div>
      {tab === "crew" ? (
        <WorkshopCrew
          state={s}
          hiring={hiring}
          error={hireError}
          hire={hire}
          assign={assign}
        />
      ) : result ? (
        <section className="race-result" aria-label="Race result">
          <span className="workshop-kicker">
            {SPRINT.name} / RACE {result.id}
          </span>
          <div className="race-result-score">
            <strong>{result.medal}</strong>
            <span>
              {result.score}
              <small>Performance score</small>
            </span>
          </div>
          <p>
            Engine {result.stats.engine} × 60% + Grip {result.stats.grip} × 25%
            + Reliability {result.stats.reliability} × 15%.
          </p>
          <p>
            {result.medal === "Gold"
              ? "Your setup met the Gold target."
              : `Next target: ${result.medal === "Bronze" ? "50 for Silver" : "60 for Gold"}. Improve the setup before your next run.`}
          </p>
          <button className="race-primary" onClick={claim}>
            Collect {result.credits} Credits + {result.rep} REP →
          </button>
        </section>
      ) : (
        <>
          <div className="race-upgrades" aria-label="Rustback upgrades">
            {RACE_STATS.map((k) => {
              const level = r.upgrades[k],
                price = SPRINT.prices[level],
                max = level >= SPRINT.maxLevel;
              return (
                <div className="race-upgrade" key={k}>
                  <div>
                    <strong>
                      {names[k]} <b>{stats[k]}</b>
                    </strong>
                    <small>
                      Level {level} / {SPRINT.maxLevel} ·{" "}
                      {Math.round(SPRINT.weights[k] * 100)}% of score
                    </small>
                    <div className="race-levels" aria-hidden="true">
                      {[1, 2, 3].map((n) => (
                        <i key={n} data-done={n <= level} />
                      ))}
                    </div>
                  </div>
                  <button
                    disabled={!home || !nearby || max || s.credits < price}
                    onClick={() => upgrade(k, level)}
                    aria-label={`Upgrade ${names[k]}${max ? " — maximum level" : ` for ${price} Credits`}`}
                  >
                    {max ? (
                      "Max level"
                    ) : (
                      <>
                        +{SPRINT.gain[k]} <span>· {price} C</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
          <section className="race-event" aria-label="Coastal Sprint">
            <div className="race-event-title">
              <div>
                <span className="workshop-kicker">STREET CLASS / SOLO</span>
                <h3>{SPRINT.name}</h3>
              </div>
              <span>
                45s on track
                <br />
                Free entry
              </span>
            </div>
            <p>
              Engine leads this short coastal run. Your setup determines the
              result; keep serving customers while your car is away.
            </p>
            <div className="race-medals" aria-label="Score targets and rewards">
              {[...SPRINT.medals].reverse().map((m) => (
                <div
                  key={m.name}
                  data-current={(r.run || forecast).medal === m.name}
                >
                  <strong>
                    {m.name} <b>{m.target}+</b>
                  </strong>
                  <span>
                    {m.credits} C · {m.rep} REP
                  </span>
                </div>
              ))}
            </div>
            {home ? (
              <>
                <p className="race-forecast">
                  Current setup:{" "}
                  <strong>
                    {forecast.score} / {forecast.medal}
                  </strong>{" "}
                  · {forecast.credits} Credits + {forecast.rep} REP
                </p>
                <p className="race-preparation">
                  {r.preparation >= 1
                    ? "Inspection complete. Ready to leave."
                    : `Stand in the ring beside the engine for a free ${SPRINT.preparationSeconds - r.upgrades.reliability * 0.5}s inspection. Upgrades require a fresh inspection.`}
                </p>
                <button
                  className="race-primary"
                  onClick={start}
                  disabled={!nearby || r.preparation < 1 || !!s.carried}
                >
                  {s.carried
                    ? "Fit the customer’s wheel first"
                    : !nearby
                      ? "Visit the team desk to enter"
                      : r.preparation < 1
                        ? "Inspect the car before entering"
                        : "Enter Coastal Sprint →"}
                </button>
              </>
            ) : (
              <div className="race-away">
                <strong>{raceStatus(s)}</strong>
                <p>
                  The clock pauses while this panel is open. Close it to
                  continue your shift.
                </p>
                <button className="race-primary" onClick={close}>
                  Back to work →
                </button>
              </div>
            )}
          </section>
          {r.lastResult && (
            <p className="race-last">
              Last run: {r.lastResult.medal} · {r.lastResult.score} points ·{" "}
              {r.lastResult.credits} C + {r.lastResult.rep} REP received. Best
              score: {r.bestScore}.
            </p>
          )}
        </>
      )}
    </dialog>
  );
}
