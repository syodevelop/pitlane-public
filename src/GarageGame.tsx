import { lazy, Suspense, useState } from "react";
import {
  CARS,
  FIXTURES,
  GARAGE_UPGRADES,
  SERVICES,
  basicTutorialDone,
  carryCapacity,
  distance,
  eligibleCar,
  readyToQualify,
  stationCapacity,
  stationStock,
  workPoints,
  nearestWorkPosition,
  type Command,
  type Garage,
  type Station,
  type Upgrade,
} from "../packages/game-core";
import { STATIONS, STATION_LABELS, describeEvent } from "./game-view";
import RaceMonitor from "./RaceMonitor";
import CarPortrait from "./CarPortrait";
const Scene = lazy(() => import("./Garage"));
export default function GarageGame({
  state: g,
  offset,
  now,
  busy,
  send,
  openLeaderboard,
  onReady,
}: {
  state: Garage;
  offset: number;
  now: number;
  busy: boolean;
  send: (command: Command) => void;
  openLeaderboard: () => void;
  onReady?: () => void;
}) {
  const p = g.progress;
  const [selected, setSelected] = useState<Station>("stock");
  const [selectedPosition, setSelectedPosition] = useState<0 | 1>(0);
  const [actorId, setActorId] = useState("player");
  const [selectedCar, setSelectedCar] = useState("");
  const actor = p.actors[actorId] || p.actors.player;
  const work = actor.taskId ? p.tasks[actor.taskId] : null;
  const owned =
    p.cars[selectedCar] ||
    Object.values(p.cars).find((c) => c.source === "starter")!;
  const starter = Object.values(p.cars).find((c) => c.source === "starter")!;
  const points = workPoints(selected, p.upgrades.capacity > 0);
  const currentPoint = points[selectedPosition] ?? points[0];
  const delivered = stationStock(
    g,
    selected,
    points[selectedPosition] ? selectedPosition : 0,
  );
  const near =
    !actor.travel &&
    distance(actor.position, currentPoint) <= FIXTURES.interactionRadius;
  const playerNear =
    !p.actors.player.travel &&
    distance(p.actors.player.position, currentPoint) <=
      FIXTURES.interactionRadius;
  const seconds = (end: number) => Math.max(0, Math.ceil((end - now) / 1000));
  const carBusy = (id: string) =>
    Object.values(p.tasks).some(
      (t) => t.carId === id && t.status === "started",
    ) ||
    Object.values(p.races).some(
      (r) => r.carId === id && r.status === "started",
    );
  function interact(station: Station, requestedPosition?: 0 | 1) {
    setSelected(station);
    const available = workPoints(station, p.upgrades.capacity > 0);
    const occupied = Object.values(p.tasks).some(
      (t) =>
        t.status === "started" &&
        t.station === station &&
        (t.workPosition ?? 0) === 0,
    );
    const position =
      requestedPosition ?? (occupied && available.length > 1 ? 1 : 0);
    setSelectedPosition(position);
    if (work || busy) return;
    const target = available[position] ?? available[0];
    if (
      actor.travel ||
      distance(actor.position, target) > FIXTURES.interactionRadius
    )
      send({
        type: "navigate",
        actorId: actor.id,
        target: { x: target.x, y: target.y },
      });
  }
  const activeJobs = Object.values(p.jobs).filter(
    (j) => j.status === "accepted" || j.status === "working",
  );
  const taskTitle =
    work?.kind === "stock"
      ? "Collecting free parts"
      : work?.kind === "restore"
        ? "Restoring Rustback"
        : work?.kind === "prepare"
          ? "Preparing your car"
          : work?.jobId
            ? SERVICES[p.jobs[work.jobId].kind].label
            : "Work in progress";
  const isOwnWorker = actor.role === "Player" || actor.role === "Team Manager";
  const isMechanic = actor.role === "Player" || actor.role === "Mechanic";
  return (
    <>
      <div className="play-heading">
        <div>
          <span className="eyebrow">{g.profile.character} / GARAGE</span>
          <h1 tabIndex={-1}>Your pit lane.</h1>
        </div>
        <button onClick={openLeaderboard}>Leaderboard</button>
      </div>
      <div className="garage-layout">
        <section>
          <div className="crew-control">
            <label>
              Control{" "}
              <select
                aria-label="Controlled worker"
                value={actor.id}
                onChange={(e) => {
                  setActorId(e.target.value);
                  setSelectedPosition(
                    nearestWorkPosition(g, p.actors[e.target.value], selected),
                  );
                }}
              >
                {Object.values(p.actors).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.role === "Player" ? g.profile.character : a.role}
                  </option>
                ))}
              </select>
            </label>
            <span>
              {actor.role === "Player"
                ? "Your work rates apply to your own actions."
                : "Helper work rates are independent of your character."}
            </span>
          </div>
          <Suspense
            fallback={<div className="scene-loading">Opening the garage…</div>}
          >
            <Scene
              onReady={onReady}
              carId={owned.id}
              state={g}
              actorId={actor.id}
              offset={offset}
              send={send}
              interact={interact}
            />
          </Suspense>
          <div className="station-tabs" aria-label="Garage stations">
            {Object.entries(STATIONS).map(([key, point]) => (
              <button
                key={key}
                aria-pressed={selected === key}
                disabled={busy || !!work}
                onClick={() => interact(key as Station)}
              >
                {point.label}
              </button>
            ))}
          </div>
          <section className="work-order" aria-label="Station actions">
            <span className="eyebrow">
              {work
                ? "WORK IN PROGRESS"
                : "STATION / " + STATION_LABELS[selected]}
            </span>
            <h2>{work ? taskTitle : STATION_LABELS[selected]}</h2>
            {points.length > 1 && !work && (
              <div className="work-positions" aria-label="Work positions">
                {([0, 1] as const).map((position) => (
                  <button
                    key={position}
                    disabled={busy}
                    aria-pressed={selectedPosition === position}
                    onClick={() => interact(selected, position)}
                  >
                    {position === 0 ? "Main bay" : "Annex bay"}
                  </button>
                ))}
                <p>Parts must be delivered to the bay where you work.</p>
              </div>
            )}
            {work ? (
              <>
                <strong className="timer">
                  {seconds(work.endsAt) > 0
                    ? `${seconds(work.endsAt)}s`
                    : "Finishing…"}
                </strong>
                <progress
                  max={work.endsAt - work.startsAt}
                  value={Math.min(
                    work.endsAt - work.startsAt,
                    Math.max(0, now - work.startsAt),
                  )}
                />
                <p>
                  This started task finishes once, even if you leave. Waiting
                  work stays waiting.
                </p>
              </>
            ) : actor.travel ? (
              <p>Walking to the station… {seconds(actor.travel.endsAt)}s</p>
            ) : !near ? (
              <p>
                Select this station to walk here, or use WASD or the joystick.
              </p>
            ) : (
              <>
                {selected === "stock" ? (
                  <>
                    <p>
                      Free parts · finite collection · carrying {actor.carrying}
                      /{carryCapacity(actor)}.
                    </p>
                    <button
                      disabled={busy || actor.carrying >= carryCapacity(actor)}
                      onClick={() =>
                        send({
                          type: "pickUp",
                          actorId: actor.id,
                          station: "stock",
                          amount: Math.min(
                            2,
                            carryCapacity(actor) - actor.carrying,
                          ),
                        })
                      }
                    >
                      Collect parts
                    </button>
                  </>
                ) : (
                  <div className="parts-transfer">
                    <p>
                      Delivered here: {delivered}/{stationCapacity(g)} ·
                      carrying {actor.carrying}/{carryCapacity(actor)}
                    </p>
                    <button
                      disabled={
                        busy ||
                        actor.carrying === 0 ||
                        delivered >= stationCapacity(g)
                      }
                      onClick={() =>
                        send({
                          type: "putDown",
                          actorId: actor.id,
                          station: selected,
                          amount: Math.min(
                            actor.carrying,
                            stationCapacity(g) - delivered,
                          ),
                        })
                      }
                    >
                      Put down parts
                    </button>
                    <button
                      disabled={
                        busy ||
                        delivered === 0 ||
                        actor.carrying >= carryCapacity(actor)
                      }
                      onClick={() =>
                        send({
                          type: "pickUp",
                          actorId: actor.id,
                          station: selected,
                          amount: 1,
                        })
                      }
                    >
                      Pick up one part
                    </button>
                  </div>
                )}
                {["tires", "quick", "engine"].includes(selected) && (
                  <div className="contract-list">
                    {activeJobs
                      .filter(
                        (j) =>
                          SERVICES[j.kind].steps[j.step]?.station === selected,
                      )
                      .map((j) => {
                        const step = SERVICES[j.kind].steps[j.step];
                        return (
                          <article key={j.id}>
                            <h3>{SERVICES[j.kind].label}</h3>
                            <p>
                              Step {j.step + 1}/{SERVICES[j.kind].steps.length}{" "}
                              · {step.parts} delivered part
                              {step.parts === 1 ? "" : "s"} · {j.credits}{" "}
                              Credits / {j.rep} REP when the full order is
                              complete.
                            </p>
                            <button
                              disabled={
                                busy ||
                                !isMechanic ||
                                j.status === "working" ||
                                delivered < step.parts
                              }
                              onClick={() =>
                                send({
                                  type: "startWork",
                                  actorId: actor.id,
                                  kind: "service",
                                  jobId: j.id,
                                })
                              }
                            >
                              {j.status === "working"
                                ? "In progress"
                                : "Start " + SERVICES[j.kind].label}
                            </button>
                          </article>
                        );
                      })}
                    {!activeJobs.some(
                      (j) =>
                        SERVICES[j.kind].steps[j.step]?.station === selected,
                    ) && (
                      <p>
                        Accept a matching customer at Reception, then bring the
                        required parts here.
                      </p>
                    )}
                  </div>
                )}
                {selected === "starter" && (
                  <div className="car-preparation">
                    <CarPortrait car={owned} />
                    <label>
                      Owned car{" "}
                      <select
                        aria-label="Preparation car"
                        value={owned.id}
                        onChange={(e) => setSelectedCar(e.target.value)}
                      >
                        {Object.values(p.cars).map((c) => (
                          <option key={c.id} value={c.id}>
                            {CARS[c.tier].name} ·{" "}
                            {c.id === starter.id
                              ? "starter"
                              : c.id.split(":").at(-1)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p>
                      {CARS[owned.tier].name} · Engine {owned.engine} ·
                      Reliability {owned.reliability} ·{" "}
                      {owned.restored
                        ? owned.prepared
                          ? "Prepared for " + owned.prepared
                          : "Needs race preparation"
                        : "Broken starter"}
                    </p>
                    {!owned.restored ? (
                      <button
                        disabled={
                          busy ||
                          !isOwnWorker ||
                          carBusy(owned.id) ||
                          delivered < 2
                        }
                        onClick={() =>
                          send({
                            type: "startWork",
                            actorId: actor.id,
                            kind: "restore",
                            carId: owned.id,
                          })
                        }
                      >
                        Restore Rustback
                      </button>
                    ) : (
                      <>
                        <div className="button-row">
                          {(["sprint", "endurance"] as const).map(
                            (preparation) => (
                              <button
                                key={preparation}
                                disabled={
                                  busy ||
                                  !isOwnWorker ||
                                  carBusy(owned.id) ||
                                  delivered < 1
                                }
                                onClick={() =>
                                  send({
                                    type: "startWork",
                                    actorId: actor.id,
                                    kind: "prepare",
                                    carId: owned.id,
                                    preparation,
                                  })
                                }
                              >
                                Prepare{" "}
                                {preparation === "sprint"
                                  ? "Sprint"
                                  : "Endurance"}
                              </button>
                            ),
                          )}
                        </div>
                        <p>
                          One delivered part per preparation. Both race setups
                          have the same scheduled race duration.
                        </p>
                        <div className="button-row">
                          {(["engine", "reliability"] as const).map((stat) => (
                            <button
                              key={stat}
                              disabled={
                                busy ||
                                !playerNear ||
                                carBusy(owned.id) ||
                                owned[stat] >= 3 ||
                                p.credits < (owned[stat] === 1 ? 600 : 1000)
                              }
                              onClick={() =>
                                send({
                                  type: "upgradeCar",
                                  carId: owned.id,
                                  stat,
                                })
                              }
                            >
                              Upgrade {stat} ·{" "}
                              {owned[stat] >= 3
                                ? "Max"
                                : owned[stat] === 1
                                  ? 600
                                  : 1000}{" "}
                              Credits
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
                {selected === "reception" && (
                  <>
                    <h3>
                      Customer queue · {activeJobs.length}/
                      {2 + p.upgrades.capacity}
                    </h3>
                    {!playerNear && (
                      <p>
                        Bring your character to Reception to manage orders and
                        investments.
                      </p>
                    )}
                    <div className="contract-list">
                      {Object.values(p.jobs)
                        .filter((j) => j.status === "offered")
                        .map((j) => (
                          <article key={j.id}>
                            <h3>{SERVICES[j.kind].label}</h3>
                            <p>
                              {SERVICES[j.kind].steps.length} step
                              {SERVICES[j.kind].steps.length === 1
                                ? ""
                                : "s"} · {j.credits} Credits / {j.rep} REP
                            </p>
                            <button
                              disabled={
                                busy ||
                                !playerNear ||
                                activeJobs.length >= 2 + p.upgrades.capacity
                              }
                              onClick={() =>
                                send({ type: "acceptService", jobId: j.id })
                              }
                            >
                              Accept {SERVICES[j.kind].label}
                            </button>
                          </article>
                        ))}
                    </div>
                    {!Object.values(p.jobs).some(
                      (j) => j.status === "offered",
                    ) && (
                      <button
                        disabled={busy || !playerNear}
                        onClick={() =>
                          send({ type: "interact", station: "reception" })
                        }
                      >
                        Invite next customers
                      </button>
                    )}
                    <h3>Your first helper</h3>
                    <p>
                      Choose a Runner for parts or a Mechanic for customer work.
                      The demo has one helper; assigned finite work can finish
                      while you work elsewhere.
                    </p>
                    <div className="button-row">
                      {Object.entries(FIXTURES.hire)
                        .filter(
                          ([role]) =>
                            p.mode === "main" || role !== "Team Manager",
                        )
                        .map(([role, cost]) => (
                          <button
                            key={role}
                            disabled={
                              busy ||
                              !playerNear ||
                              p.credits < cost ||
                              Object.values(p.actors).some(
                                (a) => a.role === role,
                              ) ||
                              Object.keys(p.actors).length >=
                                (p.mode === "demo" ? 2 : 4)
                            }
                            onClick={() =>
                              send({
                                type: "hire",
                                role: role as keyof typeof FIXTURES.hire,
                              })
                            }
                          >
                            Hire {role} · {cost} Credits
                          </button>
                        ))}
                    </div>
                    {Object.values(p.actors)
                      .filter((a) => a.role !== "Player")
                      .map((a) => (
                        <button
                          key={a.id}
                          disabled={
                            busy ||
                            !playerNear ||
                            a.level >= 3 ||
                            p.credits < a.level * 400
                          }
                          onClick={() =>
                            send({ type: "upgradeStaff", actorId: a.id })
                          }
                        >
                          Train {a.role} ·{" "}
                          {a.level >= 3 ? "Max" : a.level * 400} Credits
                        </button>
                      ))}
                    <h3>Workshop investments</h3>
                    <div className="investment-list">
                      {Object.entries(GARAGE_UPGRADES).map(([key, v]) => {
                        const level = p.upgrades[key as Upgrade],
                          cost = v.cost * (level + 1);
                        return (
                          <article key={key}>
                            <h3>
                              {v.label} · level {level}
                            </h3>
                            <p>
                              {v.detail} Both development paths remain
                              available.
                            </p>
                            <button
                              disabled={
                                busy ||
                                !playerNear ||
                                level >= 3 ||
                                p.credits < cost
                              }
                              onClick={() =>
                                send({
                                  type: "upgrade",
                                  target: key as Upgrade,
                                })
                              }
                            >
                              {level >= 3
                                ? "Maximum level"
                                : "Upgrade · " + cost + " Credits"}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                    {p.mode === "demo" && (
                      <>
                        <h3>Demo car catalog</h3>
                        <CarPortrait
                          car={{
                            tier: 2,
                            restored: true,
                            engine: 1,
                            reliability: 1,
                          }}
                        />
                        <p>
                          Club Coupe · 3,000 Credits. This demo purchase is
                          wiped with demo progress. Main-game purchases use a
                          separate wallet-token catalog.
                        </p>
                        <button
                          disabled={
                            busy ||
                            !playerNear ||
                            p.credits < FIXTURES.demoCoupeCredits
                          }
                          onClick={() => send({ type: "buyDemoCar", tier: 2 })}
                        >
                          Buy demo Club Coupe
                        </button>
                      </>
                    )}
                  </>
                )}
                {selected === "race" && (
                  <>
                    <h3>Active race slots</h3>
                    <p>
                      All cars stay in your collection. Only assigned cars can
                      race.
                    </p>
                    {p.activeSlots.map((id, slot) => (
                      <label key={slot} className="slot-control">
                        Slot {slot + 1}
                        <select
                          aria-label={"Race slot " + (slot + 1)}
                          value={id || ""}
                          disabled={
                            busy || !playerNear || (!!id && carBusy(id))
                          }
                          onChange={(e) =>
                            send({
                              type: "assignCar",
                              slot,
                              carId: e.target.value || null,
                            })
                          }
                        >
                          <option value="">Unassigned</option>
                          {Object.values(p.cars).map((c) => (
                            <option
                              key={c.id}
                              value={c.id}
                              disabled={
                                !c.restored ||
                                (c.id !== id && p.activeSlots.includes(c.id))
                              }
                            >
                              {CARS[c.tier].name} · {c.id.split(":").at(-1)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                    {p.activeSlots
                      .filter((id): id is string => id !== null)
                      .map((id) => {
                        const car = p.cars[id];
                        const options = !p.tutorial.training
                          ? ["tutorial" as const]
                          : [
                              "training" as const,
                              ...(!p.qualified && readyToQualify(g)
                                ? ["qualification" as const]
                                : []),
                              ...(eligibleCar(g, car)
                                ? ["eligible" as const]
                                : []),
                            ];
                        return (
                          <article className="race-dispatch" key={id}>
                            <CarPortrait car={car} />
                            <h3>{CARS[car.tier].name}</h3>
                            <p>
                              {car.prepared
                                ? "Prepared for " + car.prepared
                                : "Prepare this car at Team preparation before dispatch."}
                            </p>
                            {options.map((kind) => (
                              <button
                                key={kind}
                                disabled={
                                  busy ||
                                  !playerNear ||
                                  !car.prepared ||
                                  !car.restored ||
                                  carBusy(id)
                                }
                                onClick={() =>
                                  send({
                                    type: "dispatchRace",
                                    carId: id,
                                    kind,
                                  })
                                }
                              >
                                Dispatch {kind === "eligible" ? "team" : kind}{" "}
                                race · {kind === "tutorial" ? "45s" : "10m"}
                              </button>
                            ))}
                            <p className="fine">
                              {p.mode === "demo"
                                ? "Credits and REP only. No real-token rewards in the demo."
                                : "Token funding is closed. A race result is not an available token balance."}
                            </p>
                          </article>
                        );
                      })}
                  </>
                )}
              </>
            )}
          </section>
        </section>
        <aside className="garage-sidebar">
          <RaceMonitor state={g} now={now} offset={offset} />
          <span className="eyebrow">YOUR TEAM</span>
          <h2>
            {starter.restored
              ? "Ready for the circuit."
              : "Bring Rustback back."}
          </h2>
          <p>
            Collect parts, carry them to a station and put them down before
            starting work.
          </p>
          <ul className="checklist">
            {[
              [starter.restored, "Restore the free starter"],
              [p.tutorial.training, "Complete the short tutorial race"],
              [
                basicTutorialDone(g),
                "Collect, deliver and complete a customer order",
              ],
              [p.completed.tires >= 6, p.completed.tires + " / 6 Tires orders"],
              [
                p.completed.quick >= 6,
                p.completed.quick + " / 6 Quick Service orders",
              ],
              [
                Object.values(p.completed).reduce((a, b) => a + b, 0) >= 18,
                Object.values(p.completed).reduce((a, b) => a + b, 0) +
                  " / 18 total orders",
              ],
              [starter.engine >= 2, "Starter Engine level 2"],
              [starter.reliability >= 2, "Starter Reliability level 2"],
              [p.qualified, "Complete qualification"],
            ].map(([done, label]) => (
              <li className={done ? "done" : ""} key={String(label)}>
                <span>{done ? "✓" : "○"}</span>
                {label}
              </li>
            ))}
          </ul>
          <p className="fine">
            Prototype progression, not approved contest rules. REP is
            nonfinancial.
          </p>
          <section className="owned-collection" aria-label="Owned cars">
            <h3>Your collection · {Object.keys(p.cars).length}</h3>
            <p className="fine">
              Ownership stays separate from active race slots.
            </p>
            <ul>
              {Object.values(p.cars).map((car) => {
                const slot = p.activeSlots.indexOf(car.id);
                const racing = Object.values(p.races).some(
                  (race) => race.carId === car.id && race.status === "started",
                );
                return (
                  <li key={car.id}>
                    <CarPortrait car={car} compact />
                    <div>
                      <b>{CARS[car.tier].name}</b>
                      <p>
                        {racing
                          ? "On circuit"
                          : slot >= 0
                            ? `Race slot ${slot + 1}`
                            : "In collection"}
                      </p>
                      <p className="fine">
                        Engine {car.engine} · Reliability {car.reliability}
                      </p>
                      <button
                        disabled={busy || !!work}
                        onClick={() => {
                          setSelectedCar(car.id);
                          interact("starter");
                        }}
                        aria-label={`Prepare ${CARS[car.tier].name} ${car.id.split(":").at(-1)}`}
                      >
                        Go to preparation
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
          <h3>Accepted orders</h3>
          {activeJobs.length ? (
            activeJobs.map((j) => (
              <article key={j.id} className="queue-item">
                <b>{SERVICES[j.kind].label}</b>
                <p>
                  Step {j.step + 1}:{" "}
                  {STATION_LABELS[SERVICES[j.kind].steps[j.step].station]} ·{" "}
                  {j.status === "working" ? "In progress" : "Waiting to start"}
                </p>
                <button
                  disabled={busy || !!work}
                  onClick={() =>
                    interact(SERVICES[j.kind].steps[j.step].station)
                  }
                >
                  Go to work station
                </button>
              </article>
            ))
          ) : (
            <p>Customers are waiting at Reception.</p>
          )}
          <h3>Work log</h3>
          {p.events
            .slice()
            .reverse()
            .map((e) => ({ id: e.id, text: describeEvent(g, e) }))
            .filter((e) => e.text)
            .slice(0, 5)
            .map((e) => (
              <p className="event" key={e.id}>
                {e.text}
              </p>
            ))}
        </aside>
      </div>
    </>
  );
}
