import { useEffect, useRef, useState } from "react";
import { CARS, type Garage, type Race } from "../packages/game-core";

// A circuit-desk diagram, not a live position feed or a second race simulation.
function CircuitDiagram({ race, offset }: { race: Race; offset: number }) {
  const path = useRef<SVGPathElement>(null);
  const marker = useRef<SVGGElement>(null);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const line = path.current,
      car = marker.current;
    if (!line || !car) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const length = line.getTotalLength();
    let frame = 0;
    function draw() {
      if (!line || !car || paused) return;
      const elapsed = Math.min(
        1,
        Math.max(
          0,
          (Date.now() + offset - race.startsAt) /
            Math.max(1, race.endsAt - race.startsAt),
        ),
      );
      // Four illustrated circuits across the scheduled duration; no lap/position claims.
      const fraction = media.matches || elapsed >= 1 ? 0 : (elapsed * 4) % 1;
      const point = line.getPointAtLength(fraction * length);
      const next = line.getPointAtLength((fraction * length + 1) % length);
      const angle =
        (Math.atan2(next.y - point.y, next.x - point.x) * 180) / Math.PI;
      car.setAttribute(
        "transform",
        `translate(${point.x} ${point.y}) rotate(${angle})`,
      );
      if (!document.hidden && !media.matches && elapsed < 1)
        frame = requestAnimationFrame(draw);
    }
    function restart() {
      cancelAnimationFrame(frame);
      draw();
    }
    draw();
    media.addEventListener("change", restart);
    document.addEventListener("visibilitychange", restart);
    return () => {
      cancelAnimationFrame(frame);
      media.removeEventListener("change", restart);
      document.removeEventListener("visibilitychange", restart);
    };
  }, [race.startsAt, race.endsAt, offset, paused]);
  return (
    <>
      <svg className="circuit-diagram" viewBox="0 0 340 150" aria-hidden="true">
        <path
          className="circuit-verge"
          d="M80 114 H256 Q306 114 306 77 Q306 42 268 42 H231 Q211 42 202 68 Q195 88 171 88 H143 Q123 88 112 61 Q104 39 76 39 Q34 39 34 77 Q34 114 80 114Z"
        />
        <path
          ref={path}
          className="circuit-road"
          d="M80 114 H256 Q306 114 306 77 Q306 42 268 42 H231 Q211 42 202 68 Q195 88 171 88 H143 Q123 88 112 61 Q104 39 76 39 Q34 39 34 77 Q34 114 80 114Z"
        />
        <path
          className="circuit-center"
          d="M80 114 H256 Q306 114 306 77 Q306 42 268 42 H231 Q211 42 202 68 Q195 88 171 88 H143 Q123 88 112 61 Q104 39 76 39 Q34 39 34 77 Q34 114 80 114Z"
        />
        <path d="M80 102 V126" stroke="#ecebe5" strokeWidth="7" />
        <path
          d="M80 102 V126"
          stroke="#26332b"
          strokeWidth="7"
          strokeDasharray="4 4"
        />
        <g ref={marker} data-race-marker="true" transform="translate(80 114)">
          <rect
            x="-10"
            y="-6"
            width="20"
            height="12"
            rx="3"
            fill="#e9c079"
            stroke="#26332b"
            strokeWidth="2"
          />
          <path d="M1 -4 V4 M-6 -4 V4" stroke="#26332b" strokeWidth="3" />
          <path d="M8 -4 V4" stroke="#fff5d9" strokeWidth="2" />
        </g>
      </svg>
      <div className="circuit-caption">
        <span>Illustrated circuit view</span>
        <button
          className="race-motion-toggle"
          aria-pressed={paused}
          onClick={() => setPaused(!paused)}
        >
          {paused ? "Resume animation" : "Pause animation"}
        </button>
      </div>
    </>
  );
}

export default function RaceMonitor({
  state,
  now,
  offset,
}: {
  state: Garage;
  now: number;
  offset: number;
}) {
  const { races, cars } = state.progress;
  const active = Object.values(races).filter((r) => r.status === "started");
  const completed = Object.values(races)
    .filter((r) => r.status === "completed")
    .slice(-3)
    .reverse();
  if (!active.length && !completed.length) return null;
  return (
    <section className="race-monitor" aria-label="Circuit monitor">
      <span className="eyebrow">CIRCUIT / AUTOMATIC RACING</span>
      {active.map((race) => {
        const remaining = Math.max(0, Math.ceil((race.endsAt - now) / 1000));
        const duration = Math.max(1, race.endsAt - race.startsAt);
        return (
          <article
            className="race-running"
            key={race.id}
            aria-label={`${CARS[cars[race.carId].tier].name} race`}
          >
            <div className="race-heading">
              <h3>{CARS[cars[race.carId].tier].name}</h3>
              <strong className="race-clock">
                {remaining > 0
                  ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
                  : "Finishing…"}
              </strong>
            </div>
            <p className="race-setup">
              {race.kind} · {race.inputs.setup} setup
            </p>
            <CircuitDiagram race={race} offset={offset} />
            <progress
              aria-label="Scheduled race progress"
              max={duration}
              value={Math.min(duration, Math.max(0, now - race.startsAt))}
            />
            <p className="fine">
              {remaining > 0
                ? "Your car is racing. Keep working in the garage."
                : "Waiting for the confirmed result."}
            </p>
          </article>
        );
      })}
      {completed.map((race) => (
        <article className="race-result" key={race.id}>
          <h3>Race result</h3>
          <p>
            {CARS[cars[race.carId].tier].name} ·{" "}
            {race.result
              ? `Position ${race.result.position} / ${race.result.fieldSize}`
              : "Legacy race completed"}
          </p>
          <p>
            +{race.credits} Credits / +{race.rep} REP
          </p>
        </article>
      ))}
    </section>
  );
}
