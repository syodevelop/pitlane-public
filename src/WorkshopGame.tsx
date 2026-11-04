import {
  PERFORMANCE,
  canOpenPerformance,
  unlockPerformance,
  performancePoint,
  engineStage,
} from "../packages/workshop-core/performance";
import { PerformanceShop } from "./scene/performance-shop";
import PerformanceJob from "./PerformanceJob";
import { useEffect, useRef, useState } from "react";
import * as T from "three";
import {
  JOBS,
  WORKSHOP,
  TEAM_GARAGE,
  activePoint,
  buyTools,
  distance,
  dockClient,
  milestoneReady,
  newWorkshop,
  nextClient,
  tickWorkshop,
  workPoints,
  teamWorkPoints,
  racePreparationPoint,
  teamReady,
  unlockTeamGarage,
  workshopMove,
  type WorkshopState,
} from "../packages/workshop-core";
import { GarageWorld } from "./scene/garage-world";
import { preloadCharacter } from "./scene/gus-model";
import { preloadGarageSurface } from "./scene/garage-surface-asset";
import {
  cameraRelativeMove,
  DEFAULT_GARAGE_CAMERA,
} from "./scene/garage-camera";
import { slideWalkAtCar, insideCar } from "./scene/service-route";
import { WORLD_SCALE } from "./scene/garage-architecture";
import type { FleetId } from "./scene/fleet-catalogue";
import { WorkshopProps } from "./scene/workshop-props";
import { TeamGarage } from "./scene/team-garage";
import { loadWorkshop, saveWorkshop, WORKSHOP_SAVE_KEY } from "./workshop-save";
import type { WorkshopCloud, CloudStatus } from "./workshop-cloud";
import {
  buyCarUpgrade,
  startSprint,
  claimSprint,
  tickSprint,
  nearRaceDesk,
  RACE_DESK,
  RACE_DESK_APPROACH,
  type RaceStat,
} from "../packages/workshop-core/racing";
import {
  hireMechanic,
  assignMechanic,
  MECHANIC,
} from "../packages/workshop-core/mechanic";
import { WorkshopMechanic } from "./scene/workshop-mechanic";
import { mechanicStatus } from "./WorkshopCrew";
import RaceDesk, { raceStatus } from "./RaceDesk";
import "./workshop.css";

const CLIENTS: FleetId[] = [
  "rustback:standard",
  "city-sprint:standard",
  "rallye:standard",
];
const CART_BODY = {
  ...WORKSHOP.cart,
  yaw: 0,
  turning: false,
  halfWidth: 0.5,
  halfLength: 0.33,
};
const RACK_BODY = {
  ...WORKSHOP.rack,
  yaw: 0,
  turning: false,
  halfWidth: 1.1,
  halfLength: 0.35,
};
type View = {
  state: WorkshopState;
  phase: string;
  car: string;
  progress: number;
  step: string;
  done: number;
  total: number;
  nearShop: boolean;
  working: boolean;
  nearTeam: boolean;
  inTeam: boolean;
  teamDone: number;
  nearDesk: boolean;
  raceYielding: boolean;
  inPerformance: boolean;
  performanceCar: string;
  performanceYielding: boolean;
  nearPerformance: boolean;
};
const initialView = (state: WorkshopState): View => ({
  state,
  phase: "arriving",
  car: "Rustback",
  progress: 0,
  step: "",
  done: 0,
  total: 2,
  nearShop: false,
  working: false,
  nearTeam: false,
  inTeam: false,
  teamDone: 0,
  nearDesk: false,
  raceYielding: false,
  inPerformance: false,
  performanceCar: "Rallye",
  performanceYielding: false,
  nearPerformance: false,
});

function WorkshopIcon({
  name,
}: {
  name: "tools" | "lights" | "car" | "credits" | "pause" | "wheel";
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "wheel" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5.5" />
          <circle cx="12" cy="12" r="1.5" />
          <path d="M12 6.5v4M7 10.3l3.5 1.2m-1.6 5 2.2-3.2m4 3.2-2.2-3.2m4.1-3-3.5 1.2" />
        </>
      ) : name === "tools" ? (
        <path d="m14 5 3 3 4-4a6 6 0 0 1-7 8L6 20a2 2 0 0 1-3-3l8-8a6 6 0 0 1 8-7l-5 3Z" />
      ) : name === "lights" ? (
        <>
          <path d="M14 5a7 7 0 0 0 0 14V5Zm4 1 4-2m-4 6 4-1m-4 5 4 1m-4 3 4 2" />
          <path d="m6 2 .5 2L9 5l-2.5.5L6 8l-.5-2.5L3 5l2.5-1L6 2Z" />
        </>
      ) : name === "car" ? (
        <>
          <path d="m4 9 2-5h12l2 5 1 2v7H3v-7l1-2Zm0 0h16M6 18v2m12-2v2M6 13h2m8 0h2" />
        </>
      ) : name === "credits" ? (
        <>
          <path d="m6 3 12 0 4 9-4 9H6l-4-9 4-9Z" />
          <path d="M15 8h-3a4 4 0 0 0 0 8h3" />
        </>
      ) : (
        <>
          <path strokeWidth="3" d="M8 5v14M16 5v14" />
        </>
      )}
    </svg>
  );
}

export default function WorkshopGame({
  cloud,
  signOut,
  accountError,
  signOutBusy,
}: {
  cloud?: WorkshopCloud;
  signOut?: () => void;
  accountError?: string;
  signOutBusy?: boolean;
} = {}) {
  const [initial] = useState(() => cloud?.initial || loadWorkshop()),
    state = useRef(initial);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus | null>(
    cloud?.status || null,
  );
  const [view, setView] = useState(() => initialView(initial));
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [paused, setPaused] = useState(false),
    [confirmReset, setConfirmReset] = useState(false);
  const [attempt, setAttempt] = useState(0),
    [notice, setNotice] = useState(""),
    [saved, setSaved] = useState(true);
  const [summary, setSummary] = useState(false),
    [otherTab, setOtherTab] = useState(false);
  const [racePanel, setRacePanel] = useState(false);
  const [raceTab, setRaceTab] = useState<"car" | "crew">("car");
  const [hiring, setHiring] = useState(false),
    [hireError, setHireError] = useState("");
  const stage = useRef<HTMLDivElement>(null),
    pauseDialog = useRef<HTMLDialogElement>(null),
    summaryDialog = useRef<HTMLDialogElement>(null);
  const workLabel = useRef<HTMLDivElement>(null),
    shopLabel = useRef<HTMLDivElement>(null),
    rackLabel = useRef<HTMLDivElement>(null),
    teamLabel = useRef<HTMLDivElement>(null),
    deskLabel = useRef<HTMLDivElement>(null),
    performanceLabel = useRef<HTMLDivElement>(null),
    performanceMoney = useRef<HTMLDivElement>(null),
    benchLabel = useRef<HTMLDivElement>(null),
    mechanicLabel = useRef<HTMLDivElement>(null),
    moneyLabel = useRef<HTMLDivElement>(null);
  const stick = useRef({ x: 0, y: 0 }),
    stickPointer = useRef<number | null>(null);
  const live = useRef({ paused, summary, otherTab, racePanel });
  live.current = { paused, summary, otherTab, racePanel };
  const commands = useRef<{
    purchase: () => void;
    unlockTeam: () => void;
    unlockPerformance: () => void;
    upgrade: (stat: RaceStat, level: number) => void;
    start: () => void;
    claim: () => void;
    hire: () => void;
    assign: (enabled: boolean) => void;
  } | null>(null);

  useEffect(() => {
    if (!cloud) return;
    const unsubscribe = cloud.subscribe(setCloudStatus);
    const timer = setInterval(() => void cloud.flush(), 5000);
    const leaving = () => {
      cloud.save(state.current);
      void cloud.flush(true);
    };
    window.addEventListener("pagehide", leaving);
    return () => {
      unsubscribe();
      clearInterval(timer);
      window.removeEventListener("pagehide", leaving);
      leaving();
    };
  }, [cloud]);
  useEffect(() => {
    if (cloud && paused) {
      cloud.save(state.current);
      void cloud.flush();
    }
  }, [cloud, paused]);
  useEffect(() => {
    if (cloudStatus?.error) {
      setPaused(false);
      setRacePanel(false);
      setSummary(false);
    }
  }, [cloudStatus?.error]);

  useEffect(() => {
    const dialog = pauseDialog.current;
    if (paused && dialog && !dialog.open) dialog.showModal();
    if (!paused && dialog?.open) {
      dialog.close();
      stage.current?.focus({ preventScroll: true });
    }
  }, [paused]);
  useEffect(() => {
    const dialog = summaryDialog.current;
    if (summary && dialog && !dialog.open) dialog.showModal();
    if (!summary && dialog?.open) {
      dialog.close();
      stage.current?.focus({ preventScroll: true });
    }
  }, [summary]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const host = stage.current!;
    let disposed = false,
      frame = 0,
      world: GarageWorld | undefined,
      props: WorkshopProps | undefined,
      team: TeamGarage | undefined,
      performance: PerformanceShop | undefined,
      mechanic: WorkshopMechanic | undefined;
    let hireBusy = false;
    let lastTime = 0,
      lastPublish = 0,
      lastSave = 0,
      time = 0;
    let velocity = { x: 0, z: 0 };
    const keys = new Set<string>(),
      moveKeys = new Set([
        "w",
        "a",
        "s",
        "d",
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
      ]);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const persist = () => {
      if (!disposed && !live.current.otherTab)
        setSaved(
          cloud ? cloud.save(state.current) : saveWorkshop(state.current),
        );
    };
    const clear = () => {
      keys.clear();
      stick.current = { x: 0, y: 0 };
      velocity = { x: 0, z: 0 };
    };
    const blocked = () =>
      document.hidden ||
      live.current.paused ||
      live.current.summary ||
      live.current.racePanel ||
      !!cloud?.status.error ||
      live.current.otherTab;
    const movementKey = (event: KeyboardEvent) =>
      /^Key[WASD]$/.test(event.code)
        ? event.code.slice(3).toLowerCase()
        : event.key.toLowerCase();
    const keydown = (event: KeyboardEvent) => {
      const key = movementKey(event);
      if (
        key === "escape" &&
        !pauseDialog.current?.open &&
        !live.current.summary &&
        !live.current.racePanel
      ) {
        clear();
        setPaused(true);
        return;
      }
      if (
        blocked() ||
        (event.target as Element)?.closest("input, textarea, select, button, a")
      )
        return;
      if (moveKeys.has(key)) {
        event.preventDefault();
        keys.add(key);
      }
    };
    const keyup = (event: KeyboardEvent) => {
      keys.delete(movementKey(event));
    };
    const visibility = () => {
      clear();
      persist();
      lastTime = 0;
    };
    const storage = (event: StorageEvent) => {
      if (!cloud && event.key === WORKSHOP_SAVE_KEY) {
        live.current.otherTab = true;
        clear();
        setOtherTab(true);
        setPaused(true);
      }
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", visibility);
    window.addEventListener("pagehide", persist);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", visibility);
    const labelProjection = new T.Vector3();
    const labelSizes = new WeakMap<
      HTMLDivElement,
      { width: number; height: number; until: number }
    >();
    const project = (
      element: HTMLDivElement | null,
      x: number,
      y: number,
      z: number,
    ) => {
      if (!element || !world || element.hidden) return;
      const p = labelProjection.set(x, y, z).project(world.camera);
      const left = (p.x * 0.5 + 0.5) * host.clientWidth;
      const top = (-p.y * 0.5 + 0.5) * host.clientHeight;
      // World labels disappear at the HUD/viewport edge instead of leaving
      // half a price tag over the logo on a narrow screen.
      let size = labelSizes.get(element);
      if (!size || size.until < time || !size.width) {
        size = {
          width: element.offsetWidth,
          height: element.offsetHeight,
          until: time + 0.25,
        };
        labelSizes.set(element, size);
      }
      const half = size.width / 2;
      element.style.visibility =
        left < half + 10 ||
        left > host.clientWidth - half - 10 ||
        top - size.height < 94 ||
        top > host.clientHeight - 12
          ? "hidden"
          : "visible";
      element.style.transform = `translate3d(${left}px, ${top}px, 0) translate(-50%, -100%)`;
    };
    const publish = (working = false) => {
      if (!world) return;
      const s = state.current,
        points = workPoints(s.order.kind, world.traffic.client.footprint);
      const active = activePoint(
        s,
        world.traffic.client.footprint,
        !working,
        team?.car.footprint,
        performance?.traffic.client.footprint,
      );
      const teamPoints = teamWorkPoints(team!.car.footprint);
      const actionProgress =
        active?.kind === "collect"
          ? s.collectProgress
          : active?.id === "team-prepare"
            ? s.racing.preparation
            : active
              ? (active.owner === "performance"
                  ? (s.performance.progress as Record<string, number>)
                  : active.owner === "team"
                    ? s.team.progress
                    : s.order.progress)[active.id] || 0
              : 0;
      const incomplete = points.filter(
        (p) => (s.order.progress[p.id] || 0) < 1,
      );
      setView({
        state: structuredClone(s),
        phase: world.traffic.yielding ? "yielding" : world.traffic.phase,
        car: world.traffic.client.spec.name,
        working: !!active,
        progress: actionProgress,
        step: active?.label || incomplete[0]?.label || "",
        done: points.length - incomplete.length,
        total: points.length,
        nearShop: distance(s.position, WORKSHOP.shop) < WORKSHOP.shopRadius,
        nearTeam: distance(s.position, TEAM_GARAGE.door) < WORKSHOP.shopRadius,
        inTeam:
          s.team.unlocked &&
          s.position.x > TEAM_GARAGE.wallX &&
          s.position.x < PERFORMANCE.wallX,
        inPerformance:
          s.performance.unlocked && s.position.x > PERFORMANCE.wallX,
        nearPerformance:
          s.team.unlocked &&
          distance(s.position, PERFORMANCE.door) < WORKSHOP.shopRadius,
        performanceCar: performance!.traffic.client.spec.name,
        performanceYielding: performance!.traffic.yielding,
        teamDone: teamPoints.filter((p) => s.team.progress[p.id] >= 1).length,
        nearDesk: s.team.unlocked && nearRaceDesk(s.position),
        raceYielding: team!.yielding,
      });
      Object.assign(host.dataset, {
        order: String(s.order.number),
        status: s.order.status,
        credits: String(s.credits),
        serviced: String(s.serviced),
        tools: String(s.tools),
        kind: s.order.kind,
        carried: s.carried || "",
        supply: JSON.stringify(WORKSHOP.supply),
        reward: String(JOBS[s.order.kind].reward),
        x: s.position.x.toFixed(3),
        z: s.position.z.toFixed(3),
        points: JSON.stringify(points),
        active: active?.id || "",
        progress: String(actionProgress),
        teamUnlocked: String(s.team.unlocked),
        teamReady: String(teamReady(s)),
        teamPoints: JSON.stringify(teamPoints),
        teamProgress: JSON.stringify(s.team.progress),
        character: s.character,
        racePhase: s.racing.phase,
        raceElapsed: String(s.racing.elapsed),
        racePreparation: String(s.racing.preparation),
        racePrepPoint: JSON.stringify(
          racePreparationPoint(team!.car.footprint),
        ),
        raceDesk: JSON.stringify(RACE_DESK_APPROACH),
        raceCompleted: String(s.racing.completed),
        raceRep: String(s.racing.rep),
        raceCar: JSON.stringify({
          ...team!.body,
          visible: team!.carVisible,
          yielding: team!.yielding,
        }),
        mechanic: JSON.stringify(s.mechanic),
        performance: JSON.stringify(s.performance),
        performancePoint: JSON.stringify(
          performancePoint(s, performance!.traffic.client.footprint) || null,
        ),
        performanceCar: JSON.stringify(performance!.traffic.pose),
        raceGates: JSON.stringify({
          north: team!.northGate,
          south: team!.southGate,
        }),
      });
    };
    const startClient = () => {
      const s = state.current;
      world!.traffic.beginService(
        CLIENTS[(s.order.number - 1) % CLIENTS.length],
        s.order.status,
      );
      // A restored position may overlap a newly docked car; recover to its service side.
      if (insideCar(s.position, world!.traffic.pose)) {
        s.position.x =
          WORKSHOP.car.x - world!.traffic.client.footprint.halfWidth - 0.7;
      }
      if (
        s.mechanic.hired &&
        insideCar(s.mechanic.position, world!.traffic.pose)
      )
        s.mechanic.position = { ...MECHANIC.rest };
      // An older save can be standing where a newly added fixture now lives.
      for (const [body, approach] of [
        [CART_BODY, WORKSHOP.shop],
        [RACK_BODY, WORKSHOP.supply],
      ] as const)
        if (insideCar(s.position, body)) s.position = { ...approach };
      if (
        s.team.unlocked &&
        team!.carVisible &&
        insideCar(s.position, team!.body)
      )
        s.position.x = team!.body.x - team!.body.halfWidth - 0.7;
      if (s.team.unlocked && insideCar(s.position, team!.deskBody))
        s.position = { ...RACE_DESK_APPROACH };
    };
    const tick = (now: number) => {
      if (disposed || !world || !props || !team) return;
      const dt = lastTime
        ? Math.min(0.05, Math.max(0, (now - lastTime) / 1000))
        : 0;
      lastTime = now;
      if (blocked()) {
        clear();
        frame = requestAnimationFrame(tick);
        return;
      }
      cloud?.tick(dt);
      time += dt;
      const s = state.current;
      let x =
        stick.current.x +
        Number(keys.has("d") || keys.has("arrowright")) -
        Number(keys.has("a") || keys.has("arrowleft"));
      let y =
        stick.current.y +
        Number(keys.has("s") || keys.has("arrowdown")) -
        Number(keys.has("w") || keys.has("arrowup"));
      const length = Math.hypot(x, y),
        input = length > 0.12;
      if (input) {
        x /= Math.max(1, length);
        y /= Math.max(1, length);
      } else {
        x = 0;
        y = 0;
      }
      const direction = cameraRelativeMove(x, y, DEFAULT_GARAGE_CAMERA.yaw),
        ease = 1 - Math.exp(-dt * (input ? 13 : 22));
      velocity.x += (direction.x * 2.88 - velocity.x) * ease;
      velocity.z += (direction.y * 2.88 - velocity.z) * ease;
      let target = workshopMove(
        s.position,
        {
          x: s.position.x + velocity.x * dt,
          z: s.position.z + velocity.z * dt,
        },
        s.team.unlocked,
        s.performance.unlocked,
      );
      target = slideWalkAtCar(s.position, target, world.traffic.pose);
      // The tool trolley is a physical object, not a walk-through menu anchor.
      target = slideWalkAtCar(s.position, target, CART_BODY);
      target = slideWalkAtCar(s.position, target, RACK_BODY);
      if (mechanic)
        target = slideWalkAtCar(s.position, target, {
          ...s.mechanic.position,
          yaw: 0,
          turning: false,
          halfWidth: 0.12,
          halfLength: 0.12,
        });
      if (s.team.unlocked) {
        if (team.carVisible)
          target = slideWalkAtCar(s.position, target, team.body);
        target = slideWalkAtCar(s.position, target, team.deskBody);
      }
      if (s.performance.unlocked) {
        target = slideWalkAtCar(s.position, target, performance!.traffic.pose);
        target = slideWalkAtCar(s.position, target, performance!.benchBody);
      }
      const settle = activePoint(
        s,
        world.traffic.client.footprint,
        input || Math.hypot(velocity.x, velocity.z) > 0.12,
        team.car.footprint,
        performance!.traffic.client.footprint,
      );
      if (settle) {
        const blend = 1 - Math.exp(-dt * 12);
        target = slideWalkAtCar(
          target,
          {
            x: target.x + (settle.x - target.x) * blend,
            z: target.z + (settle.z - target.z) * blend,
          },
          settle.owner === "performance"
            ? performance!.traffic.pose
            : settle.owner === "team"
              ? team.body
              : world.traffic.pose,
        );
      }
      const actual =
        dt > 0
          ? {
              x: (target.x - s.position.x) / dt,
              z: (target.z - s.position.z) / dt,
            }
          : { x: 0, z: 0 };
      s.position = target;
      if (world.traffic.phase === "stopped") dockClient(s);
      const moving = input || Math.hypot(actual.x, actual.z) > 0.12;
      const point = activePoint(
        s,
        world.traffic.client.footprint,
        moving,
        team.car.footprint,
        performance!.traffic.client.footprint,
      );
      const event = tickWorkshop(
        s,
        dt,
        world.traffic.client.footprint,
        moving,
        team.car.footprint,
        performance!.traffic.client.footprint,
      );
      if (event?.startsWith("performance-")) {
        persist();
        setNotice(
          event === "performance-paid"
            ? `+${PERFORMANCE.reward} Credits · +${PERFORMANCE.rep} REP`
            : event === "performance-done"
              ? "Engine work complete. Collect the payment beside bay 03."
              : s.performance.carried
                ? "Alternator rebuilt. Carry it to the engine."
                : "Fault found. Rebuild the alternator at the workbench.",
        );
      }
      if (event === "team-step" || event === "team-ready") {
        persist();
        if (event === "team-ready")
          setNotice("Your Rustback is restored. Your team has its first car.");
      }
      if (event === "prepared") {
        persist();
        setNotice(
          "Inspection complete. Visit the team desk to enter Coastal Sprint.",
        );
      }
      if (event === "job") {
        setNotice("Service complete. Pick up your Credits.");
        persist();
      }
      if (event === "pickup") {
        setNotice(`+${JOBS[s.order.kind].reward} Credits`);
        persist();
      }
      if (event === "step") persist();
      if (event === "collected") {
        setNotice("Wheel ready. Take it to a marked wheel hub.");
        persist();
      }
      const staffEvent = mechanic?.update(
        s,
        dt,
        world.traffic.client,
        world.traffic.pose,
        reduced.matches,
        point,
      );
      if (staffEvent) {
        persist();
        if (staffEvent === "paid")
          setNotice(`Mechanic collected +${JOBS[s.order.kind].reward} Credits`);
      }
      world.traffic.pedestrians = mechanic ? [s.mechanic.position] : [];
      if (s.order.status === "complete") world.traffic.releaseClient();
      world.traffic.client.setServiceHood(
        s.order.status === "service" && s.order.kind === "repair",
        dt,
      );
      world.traffic.client.setLightService(
        workPoints(s.order.kind, world.traffic.client.footprint)
          .filter((p) => p.kind === "wipe")
          .map((p) => p.id),
        s.order.progress,
      );
      props.update(
        s,
        world.traffic.client.footprint,
        time,
        reduced.matches,
        point?.owner ? undefined : point,
        mechanic?.work,
      );
      if (
        tickSprint(
          s,
          dt,
          team.canTravel(s, dt, [
            ...(world.traffic.present ? [world.traffic.pose] : []),
            ...(s.performance.unlocked && performance!.traffic.present
              ? [performance!.traffic.pose]
              : []),
          ]),
        )
      ) {
        persist();
        if (s.racing.phase === "result")
          setNotice(
            "Rustback is home. Open the race report to collect your result.",
          );
      }
      team.update(s, dt);
      world.architecture.setTeamGates(team.northGate, team.southGate);
      if (
        performance!.update(s, dt, [
          ...(world.traffic.present ? [world.traffic.pose] : []),
          ...(team.carVisible ? [team.body] : []),
        ])
      )
        persist();
      world.traffic.obstacles = [
        ...(team.carVisible && !team.yielding ? [team.body] : []),
        ...(s.performance.unlocked && performance!.traffic.present
          ? [performance!.traffic.pose]
          : []),
      ];
      world.actor.setCarriedWheel(!!s.carried);
      world.actor.setEnginePart(s.performance.carried);
      world.traffic.client.setWheelService(
        s.order.kind === "tires" ? s.order.progress : {},
        [point, mechanic?.work]
          .filter((p) => p?.kind === "wheel")
          .map((p) => p!.id),
      );
      const contact = point
        ? point.kind === "collect"
          ? new T.Vector3(WORKSHOP.rack.x - 0.49, 1.6, WORKSHOP.rack.z + 0.2)
          : point.owner === "performance"
            ? performance!.contact(point)
            : point.owner === "team"
              ? team.car.serviceContact(
                  point.id === "team-prepare"
                    ? "engine"
                    : point.id.replace("team-", ""),
                )
              : world.traffic.client.serviceContact(point.id)
        : undefined;
      world.update(
        { x: s.position.x / WORLD_SCALE, y: s.position.z / WORLD_SCALE },
        { x: actual.x / WORLD_SCALE, y: actual.z / WORLD_SCALE },
        dt,
        reduced.matches,
        point
          ? {
              kind: point.kind,
              target: contact!,
              progress:
                point.kind === "collect"
                  ? s.collectProgress
                  : point.id === "team-prepare"
                    ? s.racing.preparation
                    : (point.owner === "performance"
                        ? (s.performance.progress as Record<string, number>)
                        : point.owner === "team"
                          ? s.team.progress
                          : s.order.progress)[point.id] || 0,
              heading: Math.atan2(contact!.x - point.x, contact!.z - point.z),
            }
          : undefined,
      );
      if (world.traffic.finished && nextClient(s)) {
        startClient();
        persist();
      }
      project(
        mechanicLabel.current,
        s.mechanic.position.x,
        3.25,
        s.mechanic.position.z,
      );
      project(
        performanceLabel.current,
        PERFORMANCE.wallX - 0.25,
        2.85,
        PERFORMANCE.door.z,
      );
      project(
        performanceMoney.current,
        PERFORMANCE.payout.x,
        0.75,
        PERFORMANCE.payout.z,
      );
      project(
        benchLabel.current,
        PERFORMANCE.bench.x,
        2.8,
        PERFORMANCE.bench.z,
      );
      project(workLabel.current, s.position.x, 3.25, s.position.z);
      project(shopLabel.current, WORKSHOP.cart.x, 1.7, WORKSHOP.cart.z);
      project(rackLabel.current, WORKSHOP.rack.x, 2.6, WORKSHOP.rack.z);
      project(deskLabel.current, RACE_DESK.x, 2.2, RACE_DESK.z);
      project(moneyLabel.current, WORKSHOP.payout.x, 0.75, WORKSHOP.payout.z);
      project(
        teamLabel.current,
        TEAM_GARAGE.wallX - 0.25,
        2.85,
        TEAM_GARAGE.doorZ,
      );
      if (milestoneReady(s) && !s.milestoneSeen) {
        s.milestoneSeen = true;
        persist();
        publish();
        setSummary(true);
      }
      if (now - lastPublish > 100) {
        publish(!!point);
        lastPublish = now;
      }
      if (now - lastSave > 1800) {
        persist();
        lastSave = now;
      }
      frame = requestAnimationFrame(tick);
    };
    void Promise.all([
      preloadCharacter(state.current.character),
      ...(state.current.mechanic.hired ? [preloadCharacter("gus")] : []),
      preloadGarageSurface(
        "/art/garage-concrete-painted-v1.webp",
        "/art/garage-roof-painted-v1.webp",
      ),
    ])
      .then(() => {
        if (disposed) return;
        const p = state.current.position;
        world = new GarageWorld(host, state.current.character, {
          x: p.x / WORLD_SCALE,
          y: p.z / WORLD_SCALE,
        });
        world.setCameraSettings(DEFAULT_GARAGE_CAMERA);
        props = new WorkshopProps();
        team = new TeamGarage();
        performance = new PerformanceShop();
        world.scene.add(performance.root);
        performance.update(state.current, 0);
        world.architecture.setPerformanceOpen(
          state.current.performance.unlocked,
        );
        if (state.current.performance.unlocked) {
          if (insideCar(state.current.position, performance.traffic.pose))
            state.current.position.x =
              PERFORMANCE.car.x -
              performance.traffic.client.footprint.halfWidth -
              0.7;
          if (insideCar(state.current.position, performance.benchBody))
            state.current.position = { ...PERFORMANCE.approach };
        }
        world.scene.add(props.root);
        world.scene.add(team.root);
        world.architecture.setTeamBayOpen(state.current.team.unlocked);
        team.update(state.current, 0);
        world.architecture.setTeamGates(team.northGate, team.southGate);
        startClient();
        if (state.current.mechanic.hired) {
          mechanic = new WorkshopMechanic();
          world.scene.add(mechanic.actor.model);
          mechanic.update(
            state.current,
            0,
            world.traffic.client,
            world.traffic.pose,
            reduced.matches,
          );
        }
        publish();
        setLoading(false);
        host.focus({ preventScroll: true });
        commands.current = {
          unlockPerformance: () => {
            if (live.current.otherTab || !unlockPerformance(state.current))
              return;
            world!.architecture.setPerformanceOpen(true);
            performance!.update(state.current, 0);
            persist();
            publish();
            setNotice(
              "Performance Shop open. Your first engine job is on the way.",
            );
            host.focus({ preventScroll: true });
          },
          hire: () => {
            if (
              hireBusy ||
              live.current.otherTab ||
              state.current.mechanic.hired
            )
              return;
            hireBusy = true;
            setHiring(true);
            setHireError("");
            void preloadCharacter("gus")
              .then(() => {
                if (disposed || live.current.otherTab) return;
                const next = new WorkshopMechanic();
                if (!hireMechanic(state.current)) {
                  next.dispose();
                  setHireError(
                    "Visit the team desk with 300 Credits after your first race.",
                  );
                  return;
                }
                mechanic = next;
                world!.scene.add(mechanic.actor.model);
                mechanic.update(
                  state.current,
                  0,
                  world!.traffic.client,
                  world!.traffic.pose,
                  reduced.matches,
                );
                persist();
                publish();
                setNotice("Mechanic hired. Bay 01 is assigned.");
              })
              .catch(() => {
                if (!disposed)
                  setHireError(
                    "The mechanic could not load. Your Credits were not charged. Try again.",
                  );
              })
              .finally(() => {
                hireBusy = false;
                if (!disposed) setHiring(false);
              });
          },
          assign: (enabled) => {
            if (
              live.current.otherTab ||
              !assignMechanic(state.current, enabled)
            )
              return;
            persist();
            publish();
          },
          upgrade: (stat, level) => {
            if (
              live.current.otherTab ||
              !buyCarUpgrade(state.current, stat, level)
            )
              return;
            persist();
            publish();
          },
          start: () => {
            if (live.current.otherTab || !startSprint(state.current)) return;
            persist();
            publish();
            setRacePanel(false);
            host.focus({ preventScroll: true });
            setNotice(
              "Rustback is heading to the start. Keep the workshop rolling.",
            );
          },
          claim: () => {
            if (live.current.otherTab || !claimSprint(state.current)) return;
            persist();
            publish();
            setRacePanel(false);
            host.focus({ preventScroll: true });
            setNotice(
              `+${state.current.racing.lastResult!.credits} Credits · +${state.current.racing.lastResult!.rep} REP`,
            );
          },
          purchase: () => {
            if (!buyTools(state.current)) return;
            persist();
            publish();
            setNotice("Pro tools fitted. Service speed +40%.");
            host.focus({ preventScroll: true });
          },
          unlockTeam: () => {
            if (!unlockTeamGarage(state.current)) return;
            world!.architecture.setTeamBayOpen(true);
            team!.update(state.current, 0);
            persist();
            publish();
            setNotice(
              "Team Garage open. Step inside and restore your Rustback.",
            );
            host.focus({ preventScroll: true });
          },
        };
        host.addEventListener("webglcontextlost", contextLost, true);
        frame = requestAnimationFrame(tick);
      })
      .catch(() => {
        if (!disposed) {
          setLoading(false);
          setError(
            "The garage could not load. Check your connection and try again.",
          );
        }
      });
    const contextLost = (event: Event) => {
      event.preventDefault();
      clear();
      cancelAnimationFrame(frame);
      persist();
      setError(
        "The 3D view was interrupted. Reopen the garage to continue your saved shift.",
      );
    };
    return () => {
      persist();
      disposed = true;
      cancelAnimationFrame(frame);
      commands.current = null;
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", visibility);
      window.removeEventListener("pagehide", persist);
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", visibility);
      host.removeEventListener("webglcontextlost", contextLost, true);
      props?.dispose();
      team?.dispose();
      performance?.dispose();
      mechanic?.dispose();
      world?.dispose();
    };
  }, [attempt, cloud]);

  const s = view.state,
    job = JOBS[s.order.kind];
  const expansionStage = s.serviced >= TEAM_GARAGE.requiredCars && !!s.tools;
  const restored = teamReady(s);
  const performanceGoal = s.mechanic.hired && !s.performance.unlocked;
  const goal =
    performanceGoal && s.racing.phase !== "result"
      ? s.racing.rep < PERFORMANCE.requiredRep
        ? `Reach ${PERFORMANCE.requiredRep} REP through Coastal Sprint to open bay 03.`
        : `Open Performance Shop at the far door in bay 02. ${PERFORMANCE.price} Credits unlock engine work and a second customer post.`
      : view.inPerformance
        ? "Bay 01 keeps running. Diagnose the engine, rebuild the part and install it in bay 03."
        : restored && s.racing.completed >= 1 && !s.mechanic.hired
          ? `Open Crew at the team desk. Hire a mechanic for ${MECHANIC.price} Credits to run bay 01.`
          : s.team.unlocked
            ? restored
              ? s.racing.phase === "result"
                ? "Rustback is home. Collect your race result."
                : s.racing.phase !== "idle"
                  ? view.raceYielding
                    ? "Step away from the driveway so your car can pass."
                    : "Your car is away. Keep serving customers in bay 01."
                  : s.racing.preparation >= 1
                    ? "Ready to race. Visit the team desk by the right wall."
                    : "Stop beside the engine for a pre-race inspection. Then visit the team desk."
              : "Step into bay 02. Clean both headlights and restore your Rustback’s engine."
            : expansionStage
              ? s.credits >= TEAM_GARAGE.price
                ? "Open the red door on the right. Your Rustback is waiting inside."
                : `Earn ${TEAM_GARAGE.price - s.credits} more Credits to open your Team Garage.`
              : s.serviced < 3
                ? "Complete 3 jobs. Earn your first tool upgrade."
                : !s.tools
                  ? "Visit the red tool cart. Fit your Pro tools."
                  : "Complete 5 jobs to finish your first shift.";
  const reset = () => {
    state.current = newWorkshop(state.current.character);
    saveWorkshop(state.current);
    setView(initialView(state.current));
    setConfirmReset(false);
    setPaused(false);
    setSummary(false);
    setRacePanel(false);
    setHiring(false);
    setHireError("");
    setRaceTab("car");
    setLoading(true);
    setAttempt((a) => a + 1);
  };
  const moveStick = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== stickPointer.current) return;
    const r = e.currentTarget.getBoundingClientRect(),
      x = (e.clientX - r.left - r.width / 2) / 36,
      y = (e.clientY - r.top - r.height / 2) / 36;
    const length = Math.max(1, Math.hypot(x, y));
    stick.current = { x: x / length, y: y / length };
    e.currentTarget.style.setProperty("--stick-x", `${(x / length) * 24}px`);
    e.currentTarget.style.setProperty("--stick-y", `${(y / length) * 24}px`);
  };
  const stopStick = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== stickPointer.current) return;
    stickPointer.current = null;
    stick.current = { x: 0, y: 0 };
    e.currentTarget.style.setProperty("--stick-x", "0px");
    e.currentTarget.style.setProperty("--stick-y", "0px");
  };
  return (
    <main
      className="workshop-game"
      id="main-content"
      aria-label="Pitlane workshop"
    >
      <div
        className="workshop-stage"
        ref={stage}
        tabIndex={0}
        aria-label="Garage. Move with WASD or arrow keys. Stand in a marked circle to work."
        onPointerDown={() => stage.current?.focus({ preventScroll: true })}
      />
      {!loading && !error && (
        <>
          <header className="workshop-hud">
            <a href="/" className="wordmark" aria-label="Pitlane home">
              pitlane
            </a>
            <span className="workshop-edition">
              The workshop <small>Service crew</small>
            </span>
            <div className="workshop-instruments">
              <div
                className="workshop-balance"
                aria-label={`${s.credits} Credits`}
              >
                <WorkshopIcon name="credits" />
                <span>
                  <small>Credits</small>
                  <strong>{s.credits.toLocaleString("en-US")}</strong>
                </span>
              </div>
              <div
                className="workshop-count"
                aria-label={`${s.serviced} cars serviced`}
              >
                <WorkshopIcon name="car" />
                <span>
                  <small>Serviced</small>
                  <strong>{String(s.serviced).padStart(2, "0")}</strong>
                </span>
              </div>
              <button
                className="workshop-menu"
                onClick={() => setPaused(true)}
                aria-label="Pause and settings"
              >
                <WorkshopIcon name="pause" />
              </button>
            </div>
          </header>
          {!view.inTeam && !view.inPerformance && (
            <section
              className="workshop-order"
              data-crew-service={
                s.mechanic.hired && s.order.status === "service"
              }
              aria-label="Current customer job"
            >
              <div className="workshop-ticket-number" aria-hidden="true">
                <span>JOB</span>
                <strong>{String(s.order.number).padStart(2, "0")}</strong>
                <WorkshopIcon
                  name={
                    s.order.kind === "tires"
                      ? "wheel"
                      : s.order.kind === "repair"
                        ? "tools"
                        : "lights"
                  }
                />
              </div>
              <div className="workshop-ticket-body">
                <div className="workshop-order-meta">
                  <span>
                    {s.order.status === "complete"
                      ? "Complete"
                      : s.order.status === "arriving"
                        ? "Incoming"
                        : "Service bay"}
                  </span>
                  <span>{view.car}</span>
                </div>
                <h1>
                  {s.order.status === "arriving"
                    ? "Next customer."
                    : s.order.status === "complete"
                      ? "Job done."
                      : job.label}
                </h1>
                <p>
                  {view.phase === "yielding"
                    ? "Step out of the lane to let the car pass."
                    : s.order.status === "arriving"
                      ? "A car is pulling in. Keep the lane clear."
                      : s.order.status === "complete"
                        ? s.reward
                          ? "Pick up the Credits beside the service bay."
                          : "All paid. The next customer is on the way."
                        : s.order.kind === "tires"
                          ? view.working
                            ? s.carried
                              ? "Fitting the replacement wheel…"
                              : "Taking a wheel from the rack…"
                            : s.carried
                              ? "Carry it to a marked wheel hub. Stop to fit it."
                              : "Collect a wheel from the rack on the left."
                          : view.working
                            ? s.order.kind === "repair"
                              ? "Working under the hood…"
                              : "Polishing the light…"
                            : "Step into a ring. Stop to start working."}
                </p>
                {!view.inTeam && s.mechanic.hired && (
                  <button
                    className="workshop-crew-line"
                    onClick={() => {
                      setRaceTab("crew");
                      setRacePanel(true);
                    }}
                  >
                    <span>Mechanic · {mechanicStatus(s)}</span> <span>↗</span>
                  </button>
                )}
                <div className="workshop-order-bottom">
                  <span>
                    {s.order.status === "service"
                      ? `${view.done} / ${view.total} completed`
                      : "Quick service"}
                  </span>
                  <strong>
                    +{job.reward} <small>Credits</small>
                  </strong>
                </div>
                {s.order.kind === "tires" && s.order.status === "service" && (
                  <div
                    className="workshop-inventory"
                    data-filled={!!s.carried}
                    aria-label={
                      s.carried
                        ? "Carrying one replacement wheel"
                        : "Hands free"
                    }
                  >
                    <WorkshopIcon name="wheel" />
                    <span>
                      {s.carried ? "Replacement wheel" : "Wheel rack →"}
                    </span>
                    <b>{s.carried ? "1 / 1" : "0 / 1"}</b>
                  </div>
                )}
                {s.order.status === "service" && (
                  <div
                    className="workshop-steps"
                    aria-label={`${view.done} of ${view.total} tasks complete`}
                  >
                    {Array.from({ length: view.total }, (_, i) => (
                      <i key={i} data-done={i < view.done} />
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
          {view.inPerformance && (
            <PerformanceJob
              state={s}
              car={view.performanceCar}
              yielding={view.performanceYielding}
              crew={() => {
                setRaceTab("crew");
                setRacePanel(true);
              }}
            />
          )}
          {view.inTeam && (
            <section
              className="workshop-order workshop-team-order"
              aria-label="Your Rustback"
            >
              <div className="workshop-ticket-number" aria-hidden="true">
                <span>BAY</span>
                <strong>02</strong>
                <WorkshopIcon name="car" />
              </div>
              <div className="workshop-ticket-body">
                <div className="workshop-order-meta">
                  <span>YOUR TEAM CAR</span>
                  <span>RUSTBACK</span>
                </div>
                <h1>{restored ? "Coastal Sprint." : "Make it yours."}</h1>
                <p>
                  {restored
                    ? s.racing.phase !== "idle"
                      ? raceStatus(s, view.raceYielding)
                      : s.racing.preparation >= 1
                        ? "Inspection complete. Enter from the team desk."
                        : "Stop beside the engine. Inspect the car before its next race."
                    : s.carried
                      ? "Fit the customer’s wheel before working on your Rustback."
                      : view.working
                        ? view.step === "Restore the engine" ||
                          view.step === "Pre-race inspection"
                          ? "Restoring the engine…"
                          : "Cleaning the headlights…"
                        : "Stop in the marked rings to restore your car."}
                </p>
                <div className="workshop-order-bottom">
                  <span>
                    {restored
                      ? `${s.racing.completed} ${s.racing.completed === 1 ? "race" : "races"} · ${s.racing.rep} REP`
                      : `${view.teamDone} / 3 restored`}
                  </span>
                  <strong>
                    {restored
                      ? s.racing.phase === "idle"
                        ? `${Math.round(s.racing.preparation * 100)}% prepared`
                        : s.racing.phase === "result"
                          ? "Finished"
                          : "Race in progress"
                      : "In progress"}
                  </strong>
                </div>
                {!restored && (
                  <div
                    className="workshop-steps"
                    aria-label={`${view.teamDone} of 3 restoration tasks complete`}
                  >
                    {Array.from({ length: 3 }, (_, i) => (
                      <i key={i} data-done={i < view.teamDone} />
                    ))}
                  </div>
                )}
                <small className="workshop-customer-waiting">
                  {s.order.status === "complete"
                    ? "Customer reward waiting at bay 01."
                    : "Customer service continues at bay 01."}
                </small>
              </div>
            </section>
          )}
          <div
            className="workshop-world-label work-label"
            ref={workLabel}
            hidden={!view.working}
          >
            <strong>
              <WorkshopIcon
                name={
                  view.inPerformance
                    ? "tools"
                    : view.inTeam
                      ? view.step === "Restore the engine" ||
                        view.step === "Pre-race inspection"
                        ? "tools"
                        : "lights"
                      : s.order.kind === "tires"
                        ? "wheel"
                        : s.order.kind === "repair"
                          ? "tools"
                          : "lights"
                }
              />
              {view.step}
            </strong>
            <progress
              aria-label="Service progress"
              max={1}
              value={view.progress}
            />
            <span>{Math.round(view.progress * 100)}%</span>
          </div>
          <div
            className="workshop-world-label shop-label"
            ref={shopLabel}
            hidden={!!s.tools}
          >
            <WorkshopIcon name="tools" /> PRO TOOLS{" "}
            <b>{view.nearShop ? "150 C" : "↗"}</b>
          </div>
          <div
            className="workshop-world-label shop-label"
            ref={rackLabel}
            hidden={
              s.order.kind !== "tires" ||
              s.order.status !== "service" ||
              !!s.carried
            }
          >
            <WorkshopIcon name="wheel" /> WHEEL RACK <b>Pick up</b>
          </div>
          <div
            className="workshop-world-label money-label"
            ref={moneyLabel}
            hidden={!s.reward}
          >
            PICK UP <b>+{s.reward?.amount} C</b>
          </div>
          <div
            className="workshop-world-label shop-label"
            ref={teamLabel}
            hidden={s.team.unlocked}
          >
            <WorkshopIcon name="car" /> TEAM GARAGE{" "}
            <b>{view.nearTeam ? `${TEAM_GARAGE.price} C` : "02 ↗"}</b>
          </div>
          <div
            className="workshop-world-label mechanic-label"
            ref={mechanicLabel}
            hidden={!s.mechanic.hired}
          >
            <strong>MECHANIC </strong>
            <span>{mechanicStatus(s)}</span>
          </div>
          <div
            className="workshop-world-label shop-label"
            ref={deskLabel}
            hidden={!restored || view.inPerformance}
          >
            <WorkshopIcon name="car" /> TEAM DESK <b>RACE ↗</b>
          </div>
          <div
            className="workshop-world-label shop-label"
            ref={performanceLabel}
            hidden={!s.team.unlocked || s.performance.unlocked}
          >
            03 / PERFORMANCE <b>600 C</b>
          </div>
          <div
            className="workshop-world-label money-label"
            ref={performanceMoney}
            hidden={!s.performance.reward}
          >
            +160 C · +1 REP
          </div>
          <div
            className="workshop-world-label shop-label"
            ref={benchLabel}
            hidden={
              !s.performance.unlocked ||
              s.performance.status !== "service" ||
              engineStage(s.performance) !== "bench"
            }
          >
            ENGINE WORKBENCH
          </div>
          <aside className="workshop-goal">
            <div className="workshop-goal-heading">
              <span>
                {performanceGoal || view.inPerformance
                  ? "PERFORMANCE SHOP"
                  : restored
                    ? "COASTAL SPRINT"
                    : s.team.unlocked
                      ? "YOUR RUSTBACK"
                      : expansionStage
                        ? "NEXT / TEAM GARAGE"
                        : "YOUR FIRST SHIFT"}
              </span>
              <b>
                {restored
                  ? s.racing.rep
                  : s.team.unlocked
                    ? view.teamDone
                    : expansionStage
                      ? "02"
                      : Math.min(5, s.serviced)}{" "}
                <small>
                  {restored
                    ? "REP"
                    : s.team.unlocked
                      ? "/ 3"
                      : expansionStage
                        ? ""
                        : "/ 5"}
                </small>
              </b>
            </div>
            {!restored && (
              <div
                className="workshop-shift-track"
                aria-label={
                  s.team.unlocked
                    ? `${view.teamDone} of 3 restoration tasks complete`
                    : `${Math.min(5, s.serviced)} of 5 cars serviced`
                }
              >
                {Array.from({ length: s.team.unlocked ? 3 : 5 }, (_, i) => (
                  <i
                    key={i}
                    data-done={
                      i < (s.team.unlocked ? view.teamDone : s.serviced)
                    }
                  />
                ))}
              </div>
            )}
            {restored && !performanceGoal && !view.inPerformance && (
              <strong className="workshop-race-status">
                {raceStatus(s, view.raceYielding)}
              </strong>
            )}
            <p>{goal}</p>
            {!s.performance.unlocked && view.nearPerformance && (
              <>
                <small className="workshop-unlock-requirements">
                  Hire a mechanic · {PERFORMANCE.requiredRep} REP ·{" "}
                  {PERFORMANCE.price} Credits
                </small>
                <button
                  onClick={() => commands.current?.unlockPerformance()}
                  disabled={
                    !canOpenPerformance(s) || s.credits < PERFORMANCE.price
                  }
                >
                  {!canOpenPerformance(s)
                    ? "Mechanic and 6 REP required"
                    : s.credits < PERFORMANCE.price
                      ? `${PERFORMANCE.price - s.credits} more Credits needed`
                      : "Open Performance Shop · 600 C"}
                </button>
              </>
            )}

            {restored && (view.nearDesk || s.racing.phase !== "idle") && (
              <button onClick={() => setRacePanel(true)}>
                {s.racing.phase === "result"
                  ? "Open race report →"
                  : "Open team desk →"}
              </button>
            )}
            <div className="workshop-tool-status">
              <WorkshopIcon name="tools" />
              <span>
                {s.tools ? "Pro tools fitted" : "Pro tools · 150 Credits"}
              </span>
              <b>{s.tools ? "+40%" : ""}</b>
            </div>
            {!s.tools && view.nearShop && (
              <button
                disabled={!view.nearShop || s.credits < WORKSHOP.upgradePrice}
                onClick={() => commands.current?.purchase()}
              >
                {view.nearShop
                  ? s.credits < 150
                    ? `${150 - s.credits} more Credits needed`
                    : "Fit Pro tools · 150 C"
                  : "Walk to the red tool cart"}
              </button>
            )}
            {!s.team.unlocked && view.nearTeam && (
              <>
                {!expansionStage && (
                  <small className="workshop-unlock-requirements">
                    Complete 5 customer jobs and fit Pro tools.
                  </small>
                )}
                <button
                  onClick={() => commands.current?.unlockTeam()}
                  disabled={!expansionStage || s.credits < TEAM_GARAGE.price}
                >
                  {!expansionStage
                    ? "Build up your workshop first"
                    : s.credits < TEAM_GARAGE.price
                      ? `${TEAM_GARAGE.price - s.credits} more Credits needed`
                      : `Open Team Garage · ${TEAM_GARAGE.price} C`}
                </button>
              </>
            )}
          </aside>
          <div className="workshop-controls">
            <kbd>WASD</kbd>
            <span>or arrow keys · stand still to work</span>
          </div>
          <div
            className="workshop-stick"
            role="group"
            aria-label="Movement joystick"
            onPointerDown={(e) => {
              if (stickPointer.current !== null) return;
              stickPointer.current = e.pointerId;
              e.currentTarget.setPointerCapture(e.pointerId);
              moveStick(e);
            }}
            onPointerMove={moveStick}
            onPointerUp={stopStick}
            onPointerCancel={stopStick}
            onLostPointerCapture={stopStick}
          >
            <span />
          </div>
          <div className="workshop-toast" role="status" aria-live="polite">
            {notice}
          </div>
          {!saved && !cloud && (
            <div className="workshop-save-warning" role="status">
              Progress cannot be saved in this browser. Keep this tab open.
            </div>
          )}
        </>
      )}
      {(loading || error) && (
        <section className="workshop-loading">
          <a href="/" className="wordmark">
            pitlane
          </a>
          <h1>{error ? "Back to the workshop." : "Opening your workshop."}</h1>
          <p role={error ? "alert" : "status"}>
            {error || "Getting the garage and crew ready…"}
          </p>
          {error && (
            <button
              onClick={() => {
                setError("");
                setLoading(true);
                setAttempt((a) => a + 1);
              }}
            >
              Try again
            </button>
          )}
          <a href="/">Back to site ↗</a>
        </section>
      )}
      {cloudStatus?.error && (
        <section className="workshop-loading workshop-sync-error" role="alert">
          <h2>
            {cloudStatus.blocked
              ? "Your garage session changed."
              : "Let’s save your progress."}
          </h2>
          <p>{cloudStatus.error}</p>
          <p>Your shift is paused while the connection is restored.</p>
          {cloudStatus.blocked ? (
            <button onClick={() => location.reload()}>
              Reopen saved garage
            </button>
          ) : (
            <button
              disabled={cloudStatus.saving}
              onClick={() => void cloud?.flush()}
            >
              {cloudStatus.saving ? "Saving…" : "Retry save"}
            </button>
          )}
        </section>
      )}
      <RaceDesk
        state={s}
        tab={raceTab}
        setTab={setRaceTab}
        hiring={hiring}
        hireError={hireError}
        hire={() => commands.current?.hire()}
        assign={(enabled) => commands.current?.assign(enabled)}
        open={racePanel && !otherTab}
        close={() => {
          setRacePanel(false);
          stage.current?.focus({ preventScroll: true });
        }}
        upgrade={(stat, level) => commands.current?.upgrade(stat, level)}
        start={() => commands.current?.start()}
        claim={() => commands.current?.claim()}
      />
      <dialog
        className="workshop-dialog workshop-pause"
        ref={pauseDialog}
        onCancel={(e) => {
          e.preventDefault();
          if (!otherTab) setPaused(false);
        }}
      >
        <span className="workshop-kicker">PITLANE / WORKSHOP</span>
        <h2>{otherTab ? "Open in another tab." : "Taking a pit stop."}</h2>
        {otherTab ? (
          <>
            <p>
              Your progress changed in another tab. Reload to use that saved
              shift.
            </p>
            <button onClick={() => location.reload()}>
              Reload saved shift
            </button>
          </>
        ) : (
          <>
            <p>
              Your shift is paused.{" "}
              {cloud
                ? cloudStatus?.saving
                  ? "Saving to your wallet profile…"
                  : "Progress is saved to your wallet profile."
                : saved
                  ? "Progress is saved in this browser."
                  : "Browser saving is unavailable."}{" "}
              Credits are in-game points with no cash or token value.
            </p>
            <button autoFocus onClick={() => setPaused(false)}>
              Back to work →
            </button>
            {restored && (
              <button
                className="workshop-text-button"
                onClick={() => {
                  setPaused(false);
                  setRaceTab("crew");
                  setRacePanel(true);
                }}
              >
                Manage crew
              </button>
            )}
            {cloud && (
              <>
                <p className="workshop-account-address">
                  {cloud.account.address}
                </p>
                {accountError && <p role="alert">{accountError}</p>}
                <button
                  className="workshop-text-button"
                  onClick={signOut}
                  disabled={signOutBusy}
                >
                  {signOutBusy ? "Saving…" : "Save & sign out"}
                </button>
              </>
            )}
            {!cloud &&
              (confirmReset ? (
                <div className="workshop-reset">
                  <p>Erase this browser’s progress and start a new shift?</p>
                  <button onClick={reset}>Start a new shift</button>
                  <button onClick={() => setConfirmReset(false)}>
                    Keep my progress
                  </button>
                </div>
              ) : (
                <button
                  className="workshop-text-button"
                  onClick={() => setConfirmReset(true)}
                >
                  Start over
                </button>
              ))}
          </>
        )}
        <a href="/">Return to site ↗</a>
      </dialog>
      <dialog
        ref={summaryDialog}
        className="workshop-dialog"
        aria-label="First shift complete"
        onCancel={() => setSummary(false)}
      >
        <span className="workshop-kicker">FIRST SHIFT / COMPLETE</span>
        <h2>Your workshop is rolling.</h2>
        <p>
          Five cars serviced. Pro tools fitted. Keep taking jobs and build up
          your balance.
        </p>
        <div className="workshop-summary-stats">
          <strong>
            {s.serviced}
            <small>Cars serviced</small>
          </strong>
          <strong>
            {s.credits}
            <small>Credits saved</small>
          </strong>
        </div>
        <button autoFocus onClick={() => setSummary(false)}>
          Keep working →
        </button>
        <a href="/">Return to site ↗</a>
      </dialog>
    </main>
  );
}
