import * as T from "three";

/** Seamless, metre-scaled concrete. Colour and relief are authored separately:
 * dark mottling is not treated as a deep hole in the floor. */
export function createWorkshopConcrete() {
  const size = 1024;
  const color = document.createElement("canvas"),
    relief = document.createElement("canvas");
  color.width = color.height = relief.width = relief.height = size;
  const c = color.getContext("2d")!,
    r = relief.getContext("2d")!;
  const pixels = c.createImageData(size, size),
    heights = r.createImageData(size, size);
  const hash = (x: number, y: number) => {
    let h = Math.imul(x + 31, 374761393) + Math.imul(y + 97, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const noise = (x: number, y: number, cells: number) => {
    const xx = (x / size) * cells,
      yy = (y / size) * cells;
    const ix = Math.floor(xx),
      iy = Math.floor(yy);
    const sx = xx - ix,
      sy = yy - iy,
      u = sx * sx * (3 - 2 * sx),
      v = sy * sy * (3 - 2 * sy);
    const a = T.MathUtils.lerp(hash(ix, iy), hash((ix + 1) % cells, iy), u);
    const b = T.MathUtils.lerp(
      hash(ix, (iy + 1) % cells),
      hash((ix + 1) % cells, (iy + 1) % cells),
      u,
    );
    return T.MathUtils.lerp(a, b, v) - 0.5;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4,
        grain = hash(x, y);
      const tone =
        noise(x, y, 8) * 26 + noise(x, y, 32) * 13 + (grain - 0.5) * 9;
      pixels.data.set([184 + tone, 179 + tone, 165 + tone, 255], i);
      const h = grain < 0.025 ? 157 : 216 + (grain - 0.5) * 14;
      heights.data.set([h, h, h, 255], i);
    }
  c.putImageData(pixels, 0, 0);
  r.putImageData(heights, 0, 0);
  const map = new T.CanvasTexture(color),
    detail = new T.CanvasTexture(relief);
  map.colorSpace = T.SRGBColorSpace;
  for (const texture of [map, detail]) {
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.anisotropy = 8;
  }
  return { map, detail };
}

/** Soft occlusion sits under the real chassis; it moves with the car. */
export function createVehicleContactShadow(width: number, length: number) {
  const size = 64,
    bytes = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const a = Math.abs((x / (size - 1)) * 2 - 1),
        b = Math.abs((y / (size - 1)) * 2 - 1);
      const opacity =
        (1 - T.MathUtils.smoothstep(a, 0.48, 1)) *
        (1 - T.MathUtils.smoothstep(b, 0.58, 1));
      const i = (y * size + x) * 4;
      bytes.set([24, 26, 28, Math.round(opacity * 88)], i);
    }
  const texture = new T.DataTexture(bytes, size, size);
  texture.needsUpdate = true;
  texture.magFilter = T.LinearFilter;
  texture.minFilter = T.LinearFilter;
  const material = new T.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new T.Mesh(
    new T.PlaneGeometry(width * 1.15, length * 0.96),
    material,
  );
  mesh.name = "Chassis_contact_shadow";
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.018;
  return {
    mesh,
    dispose() {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
