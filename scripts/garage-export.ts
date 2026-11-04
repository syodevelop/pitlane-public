import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import type { Object3D } from "three";
export async function exportGarage(root: Object3D) {
  root.updateMatrixWorld(true);
  const data = await new GLTFExporter().parseAsync(root, { binary: true });
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(new Blob([data as ArrayBuffer], { type: "model/gltf-binary" }));
  });
}
