import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
const out = "docs/qa/fleet-v2", models = "art/models/fleet-v2";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 }, deviceScaleFactor: 1 });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(models + "/preview.html")).href);
  await page.waitForFunction(() => !!window.FLEET_REVIEW);
  await page.screenshot({ path: out + "/viewer.png" });
  await page.addStyleTag({ content: "#scene{inset:0;width:100%;height:100%}aside,header,footer,#hint{display:none}" });
  await page.setViewportSize({ width: 900, height: 660 }); await page.waitForTimeout(100);
  const all = await page.evaluate(() => window.FLEET_REVIEW.ids);
  const ids = process.argv.includes("--quick") ? all.filter(id => ["rustback", "club-coupe", "track-gt", "enduro", "prototype"].includes(id.split(":")[0]) && id.endsWith("standard")) : all;
  const report = [], images = [];
  for (const id of ids) {
    const result = await page.evaluate(id => { const api = window.FLEET_REVIEW; const png = api.capture(id); return { png, ...api.describe(), animation: api.animate() }; }, id);
    assert(result.finite); assert.equal(result.wheels, 4); assert.equal(result.steering, 2); assert(result.dimensions[2] > 3 && result.dimensions[2] < 5.5);
    assert(result.bounds.min[1] > -.015); assert(result.animation.wheel < 0); assert.equal(result.animation.steer, .35);
    const name = id.replace(":", "-");
    await fs.writeFile(`${out}/${name}.png`, Buffer.from(result.png.split(",")[1], "base64"));
    images.push({ id, png: result.png }); delete result.png;
    if (process.argv.includes("--export")) {
      // Export at neutral steering and wheel phase, after re-creating the model.
      const data = await page.evaluate(async id => { window.FLEET_REVIEW.select(id); return window.FLEET_REVIEW.exportCar(); }, id);
      const bytes = Buffer.from(data, "base64"); assert.equal(bytes.subarray(0, 4).toString(), "glTF");
      await fs.writeFile(`${models}/${name}.glb`, bytes);
      result.asset = { name: name + ".glb", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    }
    report.push(result);
  }
  // Contact sheets contain real WebGL renders, not generated concept images.
  async function sheet(entries, columns, name, heading) {
    const png = await page.evaluate(async ({ entries, columns, heading }) => {
      const cellW = 520, cellH = 400, gap = 16, top = 94;
      const canvas = document.createElement("canvas"); canvas.width = columns * (cellW + gap) + gap; canvas.height = Math.ceil(entries.length / columns) * (cellH + gap) + top;
      const c = canvas.getContext("2d"); c.fillStyle = "#eeeae0"; c.fillRect(0, 0, canvas.width, canvas.height);
      c.fillStyle = "#1c3033"; c.font = "bold 29px Arial"; c.fillText(heading, 24, 41); c.font = "16px Arial"; c.fillText("PITLANE / Original 3D fleet / Actual model renders", 24, 69);
      for (let i = 0; i < entries.length; i++) {
        const item = entries[i], img = new Image(); img.src = item.png; await img.decode();
        const x = gap + i % columns * (cellW + gap), y = top + Math.floor(i / columns) * (cellH + gap);
        c.fillStyle = "#d6dacb"; c.fillRect(x, y, cellW, cellH); c.drawImage(img, x, y + 22, cellW, cellH - 22);
        c.fillStyle = "#1c3033"; c.font = "bold 20px Arial";
        const label = item.id.replace(":", " / ").replaceAll("-", " ").replace(/\b[a-z]/g, l => l.toUpperCase()); c.fillText(label, x + 18, y + 29);
      }
      return canvas.toDataURL("image/png");
    }, { entries, columns, heading });
    await fs.writeFile(out + "/" + name, Buffer.from(png.split(",")[1], "base64"));
  }
  await sheet(images.filter(x => x.id.endsWith("standard")), process.argv.includes("--quick") ? 2 : 3, "collection.png", "Fifteen chassis. Five classes.");
  if (!process.argv.includes("--quick")) for (let n = 0; n < 5; n++) await sheet(images.slice(n * 6, n * 6 + 6), 2, `class-${n + 1}.png`, ["Rustback", "Club Coupe", "Track GT", "Enduro", "Prototype"][n] + " / Standard & upgraded");
  for (const angle of ["rear", "side", "side-right", "front-low", "rear-low"]) {
    const views = [];
    for (const id of ids.filter(id => id.endsWith("standard"))) {
      const png = await page.evaluate(({id, angle}) => window.FLEET_REVIEW.capture(id, angle), {id, angle});
      await fs.writeFile(`${out}/${id.replace(":", "-")}-${angle}.png`, Buffer.from(png.split(",")[1], "base64"));
      views.push({id, png});
    }
    await sheet(views, 3, `collection-${angle}.png`, `Fleet / ${angle} inspection`);
  }
  assert.deepEqual(errors, []);
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(pathToFileURL(path.resolve(models + "/preview.html")).href); await mobile.waitForFunction(() => !!window.FLEET_REVIEW);
  await mobile.getByRole("button", { name: "Vector", exact: true }).click(); await mobile.getByRole("button", { name: "Upgraded", exact: true }).click();
  await mobile.screenshot({path:out+"/viewer-mobile.png"});
  assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth),390);
  await mobile.close();
  await fs.writeFile(out + "/review.json", JSON.stringify({ models: report, errors }, null, 2));
  if (process.argv.includes("--export")) await fs.writeFile(models + "/model-report.json", JSON.stringify({ source: "src/scene/fleet-car.ts", basis: "User-supplied five-class reference; ten additional original chassis", models: report }, null, 2));
  console.log(JSON.stringify({ models: report.length, errors, maxTriangles: Math.max(...report.map(x => x.triangles)), maxCalls: Math.max(...report.map(x => x.calls)) }));
} finally { await browser.close(); }
