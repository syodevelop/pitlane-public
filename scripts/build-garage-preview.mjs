import { build } from "vite";
import fs from "node:fs/promises";
const directory = "art/models/garage-3d-v4";
await fs.mkdir(directory, { recursive: true });
const result = await build({ configFile: false, logLevel: "error", build: { write: false, lib: { entry: "scripts/garage-preview.ts", name: "GarageReview", formats: ["iife"] }, minify: true } });
const code = (Array.isArray(result) ? result[0] : result).output.find(o => o.type === "chunk").code;
const gus = (await fs.readFile("public/models/gus-v5.glb")).toString("base64");
const surface = (await fs.readFile("public/art/garage-concrete-painted-v1.png")).toString("base64");
const roof = (await fs.readFile("public/art/garage-roof-painted-v1.png")).toString("base64");
const license = await fs.readFile("node_modules/three/LICENSE", "utf8");
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pitlane — coastal garage</title>
<style>*{box-sizing:border-box}body{margin:0;color:#1d232b;font:16px/1.4 Arial,sans-serif;background:#e7dfca}#scene{position:fixed;inset:0}aside{position:fixed;left:24px;top:24px;padding:18px 22px;background:#f6f2e7;border-left:5px solid #d72028;max-width:325px}h1{font-size:24px;margin:3px 0 8px;font-style:italic}p{margin:6px 0 12px;font-size:13px;color:#505454}button{padding:9px 12px;border:1px solid #686c6d;background:#fffaf0;color:#17202a;cursor:pointer}button:hover{background:#ded8c9}#loading{position:fixed;inset:45% 20%;text-align:center;background:#f6f2e7;padding:20px}@media(max-width:650px){aside{left:12px;top:12px;padding:12px;max-width:260px}h1{font-size:20px}}</style>
<div id="scene" aria-label="Interactive 3D service court"></div><aside><h1>Pitlane / Service court</h1><p>Drag to orbit. Scroll to zoom.<br>Drive-through route preview; repairs come next.</p><button id="route">Full route</button> <button id="replay">Replay arrival</button> <button id="car">Car detail</button> <button id="box">Post 01</button> <button id="box2">Box 02</button> <button id="box3">Box 03</button> <button id="site">Whole building</button> <button id="district">District</button><p><label><input id="roofs" type="checkbox"> Reveal interiors</label></p><p id="traffic-status" aria-live="polite"></p></aside><p id="loading">Opening 3D service court…</p>
<!-- Three.js license: ${license} -->
<script>window.GARAGE_ROOF="data:image/png;base64,${roof}";window.GARAGE_SURFACE="data:image/png;base64,${surface}";window.GARAGE_GUS="data:model/gltf-binary;base64,${gus}";</script><script>${code.replaceAll("</script", "<\\/script")}</script></html>`;
await fs.writeFile(`${directory}/preview.html`, html);
await fs.copyFile("node_modules/three/LICENSE", `${directory}/THREE-LICENSE.txt`);
console.log(`Standalone garage preview: ${directory}/preview.html (${Buffer.byteLength(html)} bytes)`);
