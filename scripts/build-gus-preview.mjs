import { build } from "vite";
import fs from "node:fs/promises";
const character = process.argv[2] || "gus";
if (!["gus", "dash", "juno"].includes(character)) throw new Error("Unknown character");
const modelId = `${character}-${character === "gus" ? "v5" : "v1"}`;
const result = await build({
  configFile: false,
  logLevel: "error",
  build: {
    write: false,
    lib: {
      entry: "scripts/gus-preview.ts",
      name: "GusReview",
      formats: ["iife"],
    },
    minify: true,
  },
});
const bundle = (Array.isArray(result) ? result[0] : result).output.find(
  (o) => o.type === "chunk",
).code;
const glb = (await fs.readFile(`public/models/${modelId}.glb`)).toString("base64");
const threeLicense = await fs.readFile("node_modules/three/LICENSE", "utf8");
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pitlane · Gus 3D study</title>
<style>*{box-sizing:border-box}body{margin:0;background:#e8e3d9;color:#262b32;font:16px/1.5 system-ui,sans-serif}main{min-height:100dvh;display:grid;grid-template-columns:minmax(0,1fr) 300px;max-width:1400px;margin:auto}#model{display:grid;place-items:center;min-width:0;position:relative}canvas{width:min(100%,85dvh);height:auto;touch-action:none;cursor:grab}canvas:active{cursor:grabbing}aside{padding:48px 28px;border-left:1px solid #c4c0b7;background:#f5f2ec}h1{font-size:44px;margin:8px 0}p{color:#59616a}small{font-size:12px;letter-spacing:.12em}label{display:block;margin-top:28px}input[type=range],select{display:block;width:100%;margin-top:8px;accent-color:#e32632}select{padding:10px;border:1px solid #aaa;background:transparent;font:inherit}hr{border:0;border-top:1px solid #ccc;margin:36px 0}#loading{position:absolute;padding:24px}a{color:inherit}@media(max-width:700px){main{grid-template-columns:1fr}aside{padding:24px;border-left:0;border-top:1px solid #c4c0b7}canvas{max-height:60dvh;width:auto;max-width:100%}label{margin-top:16px}}</style>
<main><section id="model" aria-label="Interactive Gus model"><p id="loading">Loading Gus…</p></section><aside><small>PITLANE / CHARACTER STUDY 05</small><h1>Gus</h1><p>Mechanic · volumetric revision 5</p><label>Animation<select id="motion"><option>Idle</option><option>Walk</option></select></label><label>Rotation<input id="angle" type="range" min="0" max="360" value="0"></label><label>Camera height<input id="height" type="range" min="0" max="9" step=".1" value="2"></label><label><input id="turn" type="checkbox"> Rotate automatically</label><hr><p>Drag Gus to turn him. The same model is rendered from every angle.</p><p>Original mesh, 16 bones, two animation clips. This is a model review, not the game.</p><a download="gus-v5.glb" href="data:model/gltf-binary;base64,${glb}">Download GLB</a></aside></main>
<!-- Bundled Three.js license:\n${threeLicense}\n-->
<script>window.GUS_GLB="data:model/gltf-binary;base64,${glb}";</script><script>${bundle.replaceAll("</script", "<\\/script")}</script></html>`;
const name = character[0].toUpperCase()+character.slice(1);
// Only replace visible labels, never arbitrary substrings inside the binary base64.
const output = html.replace('download="gus-v5.glb"', `download="${modelId}.glb"`).replace("· Gus 3D study", `· ${name} 3D study`).replace("Interactive Gus model", `Interactive ${name} model`).replace("Loading Gus…", `Loading ${name}…`).replace("<h1>Gus</h1>", `<h1>${name}</h1>`).replace("Drag Gus to turn him.", `Drag ${name} to rotate.`).replace("Mechanic · volumetric revision 5", character === "gus" ? "Mechanic · volumetric revision 5" : `${character === "dash" ? "Runner" : "Tuner"} · volumetric revision 1`).replace("<script>window.GUS_GLB", `<script>window.CREW_CHARACTER=${JSON.stringify(character)};window.GUS_GLB`);
await fs.writeFile(`art/models/${modelId}/preview.html`, output);
await fs.copyFile("node_modules/three/LICENSE", `art/models/${modelId}/THREE-LICENSE.txt`);
console.log(
  `Standalone offline preview: art/models/${modelId}/preview.html (` +
    Buffer.byteLength(output) +
    " bytes)",
);
