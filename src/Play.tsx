import { useEffect, useRef, useState } from "react";
import { CHARACTERS, interiorAt, type Character } from "../packages/game-core";
import { CHARACTER_DETAILS } from "./game-view";
import InteriorGarage from "./InteriorGarage";
import Garage3D from "./Garage3D";
import { useGarageSession } from "./useGarageSession";
import { EntryLoader, EntryPass, PlayCity, WalletEntry } from "./PlayEntry";
import { usePlayPreload } from "./play-preload";
import "./play-entry.css";
import type { GaitPreview } from "./scene/gus-model";
import GarageCameraControls from "./GarageCameraControls";
import { loadGarageCamera, saveGarageCamera } from "./scene/garage-camera";
import { FLEET_KINDS, FLEET_IDS, FLEET, parseFleetId, fleetLabel } from "./scene/fleet-catalogue";

type Phase =
  "waiting" | "departing" | "zooming" | "black" | "reveal" | "playing";
export default function Play({
  localPreview = true,
  availability,
}: {
  localPreview?: boolean;
  availability?: { title: string; text: string };
}) {
  const {
    snapshot,
    loading,
    wallet,
    busy,
    error,
    pending,
    identityVersion,
    offset,
    connect,
    signIn,
    signOut,
    send,
    externalAvailable,
    changeWallet,
    injectedWallets,
    networkName,
  } = useGarageSession();
  const resources = usePlayPreload();
  const [chosen, setChosen] = useState<Character | null>(null);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneAttempt, setSceneAttempt] = useState(0);
  const [bootError, setBootError] = useState("");
  const localCrewTools = import.meta.env.DEV && localPreview && ["127.0.0.1", "localhost", "[::1]"].includes(window.location.hostname);
  const [previewCharacter, setPreviewCharacter] = useState("");
  const [previewGait, setPreviewGait] = useState<GaitPreview>("relaxed");
  const [previewVehicle, setPreviewVehicle] = useState("");
  const [garageView, setGarageView] = useState("3d");
  const [cameraSettings, setCameraSettings] = useState(loadGarageCamera);
  const [cameraSaved, setCameraSaved] = useState(true);
  const GarageScene = localCrewTools && garageView === "art" ? InteriorGarage : Garage3D;
  const root = useRef<HTMLElement>(null);
  const s = snapshot?.state;
  useEffect(() => {
    setChosen(null);
    setSceneReady(false);
    setBootError("");
    setPreviewCharacter("");
    setPreviewGait("relaxed");
  }, [identityVersion]);
  const ready = resources.ready && !!s?.profile.character && sceneReady;
  useEffect(() => {
    if (!ready) {
      setPhase("waiting");
      return;
    }
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    setPhase("departing");
    const frames: [Phase, number][] = reduced
      ? [
          ["black", 120],
          ["reveal", 240],
          ["playing", 400],
        ]
      : [
          ["zooming", 250],
          ["black", 2050],
          ["reveal", 2250],
          ["playing", 2700],
        ];
    const timers = frames.map(([next, at]) =>
      setTimeout(() => setPhase(next), at),
    );
    return () => timers.forEach(clearTimeout);
  }, [ready, identityVersion]);
  useEffect(() => {
    if (phase === "playing")
      root.current?.querySelector<HTMLElement>(".interior-heading")?.focus();
  }, [phase]);
  useEffect(() => {
    if (!resources.ready || !s?.profile.character || sceneReady) return;
    const timer = setTimeout(
      () =>
        setBootError(
          "The garage could not open. Retry without changing your saved progress.",
        ),
      15000,
    );
    return () => clearTimeout(timer);
  }, [resources.ready, !!s?.profile.character, sceneReady, sceneAttempt]);
  const notices = (
    <>
      {error && (
        <div className="notice" role="alert">
          {error}
        </div>
      )}
      {pending && (
        <div className="notice">
          <p>
            The result is uncertain. Retry the same action to avoid a duplicate.
          </p>
          <button
            disabled={busy}
            onClick={() => void send(pending.command, pending)}
          >
            Retry saved request
          </button>
        </div>
      )}
    </>
  );
  return (
    <main
      ref={root}
      className={"play-root play-phase-" + phase}
      data-phase={phase}
      data-garage-blocked={phase !== "playing"}
    >
      {phase !== "playing" && <PlayCity phase={phase} />}
      {phase === "waiting" && (
        <a className="entry-back" href="/">
          ← Home
        </a>
      )}
      {phase === "waiting" && (
        <details className="entry-availability">
          <summary>
            <h2>
              {availability?.title ||
                (localPreview ? "Local garage preview" : "Garage access")}
            </h2>
          </summary>
          <p>
            {availability?.text ||
              "Credits and nonfinancial REP only. Real-token features are closed."}
          </p>
        </details>
      )}
      {!resources.ready || loading ? (
        <div className="entry-stage">
          <EntryLoader
            done={resources.done}
            total={resources.total}
            error={resources.error}
            retry={resources.retry}
            checking={resources.ready && loading}
          />
        </div>
      ) : !s ? (
        <div className="entry-stage">
          <EntryPass>
            <WalletEntry
              wallet={wallet}
              busy={busy}
              injectedWallets={injectedWallets}
              externalAvailable={externalAvailable}
              connect={connect}
              signIn={signIn}
              changeWallet={changeWallet}
              networkName={networkName}
            />
            {notices}
          </EntryPass>
        </div>
      ) : !s.profile.character ||
        (chosen && !bootError && ["waiting", "departing"].includes(phase)) ? (
        <div className="entry-stage" inert={!!s.profile.character}>
          <EntryPass wide>
            <ol
              className="entry-steps crew-steps"
              aria-label="Garage entry steps"
            >
              <li>
                <span>✓</span> Connected & signed in
              </li>
              <li aria-current="step">
                <span>02</span> Choose character
              </li>
              <li>
                <span>03</span> Enter garage
              </li>
            </ol>
            <h1>Meet the crew.</h1>
            <p className="lead">
              Same starting resources. Every branch open. Choose whose work
              style fits you.
            </p>
            <div className="characters">
              {Object.entries(CHARACTERS).map(([name, c]) => (
                <article
                  key={name}
                  aria-label={name}
                  className={chosen === name ? "crew-selected" : ""}
                >
                  <div className="portrait" aria-hidden="true">
                    <img
                      className="launch-portrait"
                      src={`/art/launch-${name.toLowerCase()}-portrait.webp`}
                      alt=""
                    />
                  </div>
                  <h2>{name}</h2>
                  <span className="crew-role">{c.role}</span>
                  <div className="crew-rates">
                    {CHARACTER_DETAILS[name as Character]
                      .split(" · ")
                      .map((rate, i) => (
                        <p key={rate}>
                          <strong
                            className={i === 0 ? "crew-plus" : "crew-minus"}
                          >
                            {rate.split(" ")[0]}
                          </strong>{" "}
                          {rate.substring(rate.indexOf(" ") + 1)}
                        </p>
                      ))}
                  </div>
                  <button
                    disabled={busy}
                    aria-pressed={chosen === name}
                    onClick={() => setChosen(name as Character)}
                  >
                    Choose {name}
                  </button>
                </article>
              ))}
            </div>
            {chosen && !s.profile.character && (
              <dialog
                ref={(element) => {
                  if (element && !element.open) element.showModal();
                }}
                onCancel={() => setChosen(null)}
                className="character-confirmation"
                aria-label="Confirm permanent character"
              >
                <h2>Make {chosen} your crew lead?</h2>
                <p>
                  Your character choice is permanent and stays with this wallet
                  after the demo reset.
                </p>
                <button
                  autoFocus
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void send({ type: "select", character: chosen })
                  }
                >
                  Confirm {chosen}
                </button>
                <button disabled={busy} onClick={() => setChosen(null)}>
                  Keep choosing
                </button>
                {notices}
              </dialog>
            )}
            <p className="fine">
              Modifiers affect only your own relevant work rates, never REP,
              token amounts, car performance or helper rates.
            </p>
            {notices}
            <button className="entry-signout" disabled={busy} onClick={signOut}>
              Sign out
            </button>
          </EntryPass>
        </div>
      ) : null}
      {resources.ready && s?.profile.character && (
        <>
          <div
            className="play-workspace interior-workspace"
            inert={phase !== "playing"}
            aria-hidden={phase !== "playing"}
          >
            <GarageScene
              key={identityVersion + ":" + sceneAttempt}
              state={s}
              offset={offset}
              busy={busy || !!pending}
              onReady={() => setSceneReady(true)}
              previewCharacter={localCrewTools ? previewCharacter : undefined}
              previewGait={localCrewTools ? previewGait : "relaxed"}
              previewVehicle={localCrewTools ? previewVehicle : undefined}
              cameraSettings={cameraSettings}
              send={(command) => {
                if (phase === "playing") void send(command);
              }}
            />
            <div className="interior-hud" data-wallet={snapshot?.address}>
              <div>
                <h1 className="interior-heading" tabIndex={-1}>
                  Your garage
                </h1>
                <p>WASD / arrow keys to move</p>
              </div>
              <button onClick={signOut} disabled={busy}>
                Sign out
              </button>
            </div>
            <div className="interior-notices">{notices}</div>
            {garageView === "3d" && <GarageCameraControls settings={cameraSettings} saved={cameraSaved}
              getPosition={() => interiorAt(s.progress.interior, Date.now() + offset)}
              onChange={next => { setCameraSettings(next); setCameraSaved(saveGarageCamera(next)); }} />}
            {localCrewTools && (
              <aside className="local-crew-controls" data-local-crew-controls aria-label="Local character preview">
                <strong>Local character preview</strong>
                <label>Location
                  <select aria-label="Location preview" value={garageView} onChange={e => { setGarageView(e.target.value); e.currentTarget.blur(); }}>
                    <option value="3d">3D coastal garage</option>
                    <option value="art">Previous illustrated garage</option>
                  </select>
                </label>
                <label>Character
                  <select aria-label="Preview character" value={previewCharacter} onChange={e => { setPreviewCharacter(e.target.value); e.currentTarget.blur(); }}>
                    <option value="">Saved lead ({s.profile.character})</option>
                    {Object.keys(CHARACTERS).map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
                <label>Walk style
                  <select aria-label="Walk style" value={previewGait} onChange={e => { setPreviewGait(e.target.value as GaitPreview); e.currentTarget.blur(); }}>
                    <option value="relaxed">Lower steps · selected</option>
                    <option value="original">Previous walk</option>
                  </select>
                </label>
                {garageView === "3d" && <label>Client car
                  <select aria-label="Preview client car" value={previewVehicle} onChange={e => { setPreviewVehicle(e.target.value); e.currentTarget.blur(); }}>
                    <option value="">All 15 models · rotating arrivals</option>
                    {FLEET_KINDS.map(kind => <optgroup key={kind} label={`${FLEET[kind].name} class`}>
                      {FLEET_IDS.filter(id => parseFleetId(id)?.kind === kind).map(id => <option key={id} value={id}>{fleetLabel(id)}</option>)}
                    </optgroup>)}
                  </select>
                </label>}
                <small>Appearance only. Your saved lead and work rates stay the same.</small>
              </aside>
            )}
          </div>
          {["waiting", "departing"].includes(phase) &&
            (!chosen || bootError) && (
              <div className="entry-stage">
                <EntryLoader
                  done={resources.done}
                  total={resources.total}
                  error={bootError}
                  retry={() => {
                    setBootError("");
                    setSceneAttempt((n) => n + 1);
                  }}
                  label="Opening your garage"
                />
              </div>
            )}
        </>
      )}
      {["departing", "zooming", "black", "reveal"].includes(phase) && (
        <div className="entry-transition-mask" aria-hidden="true" />
      )}
    </main>
  );
}
