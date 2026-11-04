import { restoreWorkshop, type WorkshopState } from "../packages/workshop-core";
export const WORKSHOP_SAVE_KEY = "pitlane.workshop.v1";
// Storage is deliberately outside the simulation. Cloud saves can replace this
// adapter later without changing the scene or accepting local points as PTLN.
export function loadWorkshop() {
  try {
    return restoreWorkshop(localStorage.getItem(WORKSHOP_SAVE_KEY));
  } catch {
    return restoreWorkshop(null);
  }
}
export function saveWorkshop(state: WorkshopState) {
  try {
    localStorage.setItem(WORKSHOP_SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
