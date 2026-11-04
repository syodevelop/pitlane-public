import type { WorkshopState } from "../packages/workshop-core";
import {
  PERFORMANCE,
  engineStage,
} from "../packages/workshop-core/performance";
import { mechanicStatus } from "./WorkshopCrew";
export default function PerformanceJob({
  state: s,
  car,
  yielding,
  crew,
}: {
  state: WorkshopState;
  car: string;
  yielding: boolean;
  crew: () => void;
}) {
  const p = s.performance,
    step = engineStage(p);
  const instruction = yielding
    ? "Clear the driveway for the customer."
    : p.status === "arriving"
      ? "Your next engine job is pulling in."
      : p.status === "complete"
        ? p.reward
          ? "Collect the payment beside the bay."
          : "Paid. The next customer is on the way."
        : s.carried
          ? "Fit the wheel in bay 01, then return."
          : step === "diagnose"
            ? "Stop beside the engine to find the fault."
            : step === "bench"
              ? "Head to the workbench by the right wall."
              : "Carry the rebuilt alternator to the engine.";
  return (
    <section
      className="workshop-order performance-job"
      aria-label="Performance customer job"
    >
      <div className="workshop-ticket-number" aria-hidden="true">
        <span>BAY</span>
        <strong>03</strong>
        <span>ENGINE</span>
      </div>
      <div className="workshop-ticket-body">
        <div className="workshop-order-meta">
          <span>ENGINE WORK / {String(p.number).padStart(2, "0")}</span>
          <span>{car}</span>
        </div>
        <h1>
          {p.status === "complete"
            ? "Engine ready."
            : p.status === "arriving"
              ? "Next engine job."
              : step === "diagnose"
                ? "Find the fault."
                : step === "bench"
                  ? "Rebuild the part."
                  : "Fit it. Test it."}
        </h1>
        <p>{instruction}</p>
        <ol className="performance-steps" aria-label="Engine repair steps">
          {(["diagnose", "bench", "install"] as const).map((k, i) => (
            <li
              key={k}
              data-done={p.progress[k] >= 1}
              data-current={k === step && p.status === "service"}
            >
              <span>{p.progress[k] >= 1 ? "✓" : `0${i + 1}`}</span>
              {["Diagnose", "Rebuild", "Install"][i]}
            </li>
          ))}
        </ol>
        {p.carried && (
          <div
            className="workshop-inventory"
            data-filled="true"
            aria-label="Carrying rebuilt alternator"
          >
            <span>Rebuilt alternator</span>
            <b>1 / 1</b>
          </div>
        )}
        <div className="workshop-order-bottom">
          <span>Parts included · +{PERFORMANCE.rep} REP</span>
          <strong>
            +{PERFORMANCE.reward} <small>Credits</small>
          </strong>
        </div>
        {s.mechanic.hired && (
          <button className="workshop-crew-line" onClick={crew}>
            Bay 01 · {mechanicStatus(s)} <span>↗</span>
          </button>
        )}
      </div>
    </section>
  );
}
