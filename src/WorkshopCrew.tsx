import type { WorkshopState } from "../packages/workshop-core";
import { MECHANIC } from "../packages/workshop-core/mechanic";
import { nearRaceDesk } from "../packages/workshop-core/racing";

export function mechanicStatus(s: WorkshopState) {
  const m = s.mechanic;
  if (!m.enabled) return "On break";
  if (m.phase === "working")
    return s.order.kind === "tires"
      ? "Fitting a wheel"
      : s.order.kind === "repair"
        ? "Servicing the engine"
        : "Cleaning the lights";
  if (m.phase === "collecting") return "Collecting a wheel";
  if (m.target === "payout") return "Collecting payment";
  if (m.phase === "walking")
    return m.carried ? "Carrying a wheel" : "Moving to the next task";
  return "Waiting for a clear task";
}
export default function WorkshopCrew({
  state: s,
  hiring,
  error,
  hire,
  assign,
}: {
  state: WorkshopState;
  hiring: boolean;
  error: string;
  hire: () => void;
  assign: (enabled: boolean) => void;
}) {
  const m = s.mechanic;
  const eligible = s.racing.completed >= 1;
  return (
    <section className="workshop-crew" aria-label="Workshop mechanic">
      <div className="crew-role">
        <span className="workshop-kicker">MECHANIC / BAY 01</span>
        <strong>
          {m.hired ? mechanicStatus(s) : "Your first pair of extra hands."}
        </strong>
      </div>
      <p>
        Headlights, engine service and wheel changes. Your mechanic walks to
        each task, collects the payment and takes the next customer.
      </p>
      <dl className="crew-terms">
        <div>
          <dt>Service pace</dt>
          <dd>75% of basic tool speed</dd>
        </div>
        <div>
          <dt>Assignment</dt>
          <dd>Customer service · Bay 01</dd>
        </div>
        <div>
          <dt>Hire</dt>
          <dd>{m.hired ? "Paid" : "300 Credits · once"}</dd>
        </div>
      </dl>
      <p className="crew-note">
        Help on another task or work on your Rustback. Staff stop while the game
        is paused or the tab is hidden.
      </p>
      {m.hired ? (
        <>
          <div className="workshop-summary-stats">
            <strong>
              {m.finished}
              <small>Jobs finished</small>
            </strong>
            <strong>
              {m.earnings}
              <small>Credits collected</small>
            </strong>
          </div>
          <button className="race-primary" onClick={() => assign(!m.enabled)}>
            {m.enabled ? "Send on break" : "Assign to bay 01 →"}
          </button>
          <p className="crew-note">
            {m.enabled
              ? "A break pauses work and returns the mechanic to the rest area. Completed work stays saved."
              : "The mechanic stays hired. Assign them again whenever you need a hand."}{" "}
            Close this panel to continue the shift.
          </p>
        </>
      ) : (
        <>
          {!eligible && (
            <p className="crew-requirement">
              Finish your first Coastal Sprint and collect its report to unlock
              hiring.
            </p>
          )}
          <button
            className="race-primary"
            disabled={
              hiring ||
              !eligible ||
              !nearRaceDesk(s.position) ||
              s.credits < MECHANIC.price
            }
            onClick={hire}
          >
            {hiring
              ? "Getting your mechanic ready…"
              : !eligible
                ? "Complete your first race"
                : !nearRaceDesk(s.position)
                  ? "Visit the team desk to hire"
                  : s.credits < MECHANIC.price
                    ? `${MECHANIC.price - s.credits} more Credits needed`
                    : "Hire mechanic · 300 C →"}
          </button>
          {error && (
            <p role="alert" className="crew-error">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
