export type GarageCameraSettings = {
  version: 1;
  tilt: number;
  yaw: number;
  zoom: number;
  offsetX: number;
  offsetZ: number;
  targetHeight: number;
  follow: boolean;
  anchorX: number;
  anchorY: number;
};

export const CAMERA_STORAGE_KEY = "pitlane.garageCamera.v1";
export const DEFAULT_GARAGE_CAMERA: GarageCameraSettings = {
  version: 1, tilt: 52, yaw: 14, zoom: 1, offsetX: 0, offsetZ: -.6,
  targetHeight: 0, follow: true, anchorX: 166.67, anchorY: 180,
};
export const CAMERA_RANGES = {
  tilt: [35, 80, 1], yaw: [-180, 180, 1], zoom: [.65, 1.6, .01],
  offsetX: [-6, 6, .1], offsetZ: [-6, 6, .1], targetHeight: [0, 3, .05],
} as const;

export function normalizeGarageCamera(value: unknown): GarageCameraSettings {
  const result = { ...DEFAULT_GARAGE_CAMERA };
  if (!value || typeof value !== "object") return result;
  const source = value as Record<string, unknown>;
  if (source.version !== 1) return result;
  for (const key of Object.keys(CAMERA_RANGES) as (keyof typeof CAMERA_RANGES)[]) {
    const v = source[key], [min, max] = CAMERA_RANGES[key];
    if (typeof v === "number" && Number.isFinite(v)) result[key] = Math.max(min, Math.min(max, v));
  }
  if (typeof source.follow === "boolean") result.follow = source.follow;
  for (const key of ["anchorX", "anchorY"] as const) {
    const v = source[key];
    if (typeof v === "number" && Number.isFinite(v)) result[key] = Math.max(key === "anchorX" ? -115 : 18, Math.min(key === "anchorX" ? 315.334 : 312, v));
  }
  return result;
}

export function loadGarageCamera() {
  try { return normalizeGarageCamera(JSON.parse(localStorage.getItem(CAMERA_STORAGE_KEY) || "null")); }
  catch { return { ...DEFAULT_GARAGE_CAMERA }; }
}
export function saveGarageCamera(settings: GarageCameraSettings) {
  try { localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(settings)); return true; }
  catch { return false; }
}
export function cameraRelativeMove(x: number, y: number, yaw: number) {
  const angle = yaw * Math.PI / 180;
  return { x: x * Math.cos(angle) + y * Math.sin(angle), y: -x * Math.sin(angle) + y * Math.cos(angle) };
}
