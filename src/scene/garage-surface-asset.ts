// Decoded images shared by scene rebuilds; each scene owns its GPU textures.
export const GARAGE_CONCRETE = "/art/garage-concrete-painted-v1.png";
export const GARAGE_ROOF = "/art/garage-roof-painted-v1.png";
let surface: HTMLImageElement | undefined;
let roof: HTMLImageElement | undefined;
let request: Promise<void> | undefined;
function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Garage surface could not load"));
    img.src = url;
  });
}
export function preloadGarageSurface(url = GARAGE_CONCRETE, roofUrl = GARAGE_ROOF) {
  if (surface && roof) return Promise.resolve();
  if (request) return request;
  request = Promise.all([loadImage(url), loadImage(roofUrl)])
    .then(([concreteImage, roofImage]) => { surface = concreteImage; roof = roofImage; })
    .catch((error: unknown) => { request = undefined; throw error; });
  return request;
}
export function garageSurfaceImage() {
  if (!surface) throw new Error("Garage surfaces must load before scene creation");
  return surface;
}
export function garageRoofImage() {
  if (!roof) throw new Error("Garage surfaces must load before scene creation");
  return roof;
}
