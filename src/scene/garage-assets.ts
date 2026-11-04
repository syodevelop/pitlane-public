import { LAUNCH_TEXTURES } from "./launch-character";
import { WORK_TEXTURES } from "./work-animation";
import { STOCK_TEXTURES } from "./stock-animation";
import { PAIRED_TEXTURES } from "./character-animation";
import { CAR_TEXTURES, REAR_CAR_TEXTURES } from "./car-appearance";

export const ENVIRONMENT_TEXTURES = [
  "concrete-material",
  "asphalt-material",
  "grass-material",
  "garage-wall-panel",
] as const;
export type GarageAsset = {
  key: string;
  url: string;
  frame?: { frameWidth: number; frameHeight: number };
};
const image = (key: string): GarageAsset => ({ key, url: `/art/${key}.webp` });
const sheet = (
  key: string,
  frameWidth: number,
  frameHeight: number,
): GarageAsset => ({
  ...image(key),
  frame: { frameWidth, frameHeight },
});

// The entry loader and Phaser use the same asset contract. No game is created
// during entry preloading, and decoded images can be reused without a second download.
export const GARAGE_ASSETS: GarageAsset[] = [
  ...ENVIRONMENT_TEXTURES.map(image),
  sheet("guardrail", 384, 256),
  sheet("gus", 128, 192),
  ...[
    ...WORK_TEXTURES,
    ...STOCK_TEXTURES,
    ...PAIRED_TEXTURES,
    ...LAUNCH_TEXTURES,
  ].map((key) => sheet(key, 192, 192)),
  ...[...CAR_TEXTURES, ...REAR_CAR_TEXTURES].map((key) => sheet(key, 384, 320)),
  ...[
    "service-station",
    "service-station-upgraded",
    "stock-rack",
    "circuit-desk",
    "reception",
    "workbench",
  ].map(image),
  sheet("engine-stand", 256, 256),
  sheet("team-trolley", 256, 256),
];
const decoded = new Map<string, HTMLImageElement>();
const inflight = new Map<string, Promise<HTMLImageElement>>();
export const garageImage = (url: string) => decoded.get(url);
export function loadGarageImage(url: string): Promise<HTMLImageElement> {
  const cached = decoded.get(url);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(url);
  if (pending) return pending;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const timer = window.setTimeout(() => fail(), 15000);
    function fail() {
      clearTimeout(timer);
      img.onload = img.onerror = null;
      inflight.delete(url);
      reject(
        new Error(
          "Some garage assets could not load. Check your connection and retry.",
        ),
      );
    }
    img.onerror = fail;
    img.onload = () => {
      void img.decode().then(() => {
        clearTimeout(timer);
        img.onload = img.onerror = null;
        decoded.set(url, img);
        resolve(img);
      }, fail);
    };
    img.src = url;
  });
  inflight.set(url, promise);
  return promise;
}
