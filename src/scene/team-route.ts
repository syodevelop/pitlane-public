import { TEAM_GARAGE } from "../../packages/workshop-core";
import { SPRINT, type RacingState } from "../../packages/workshop-core/racing";
import {
  sampleServiceRoute,
  SERVICE_ROUTE,
  SERVICE_STOP_DISTANCE,
  SERVICE_ROUTE_LENGTH,
  type VehiclePose,
} from "./service-route";

const shift = TEAM_GARAGE.car.x - SERVICE_ROUTE.centerX;
const stop = SERVICE_STOP_DISTANCE + SERVICE_ROUTE.stopZ - TEAM_GARAGE.car.z;
const start = shift,
  end = SERVICE_ROUTE_LENGTH - shift - 3;
export function teamRouteDistance(r: RacingState, aheadSeconds = 0) {
  if (r.phase !== "leaving" && r.phase !== "returning") return stop;
  const duration =
    r.phase === "leaving" ? SPRINT.departureSeconds : SPRINT.returnSeconds;
  const t = Math.max(
    0,
    Math.min(1, (r.elapsed + aheadSeconds - 1) / (duration - 1)),
  );
  const eased = t * t * (3 - 2 * t);
  return r.phase === "leaving"
    ? stop + (end - stop) * eased
    : start + (stop - start) * eased;
}
export function teamRoutePose(r: RacingState, aheadSeconds = 0): VehiclePose {
  const pose = sampleServiceRoute(teamRouteDistance(r, aheadSeconds));
  return { ...pose, x: pose.x + shift };
}
