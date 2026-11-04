import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
const character = process.argv[2] || "gus";
if (!["gus", "dash", "juno"].includes(character)) throw new Error("Unknown character");
const revision = character === "gus" ? "v5" : "v1";
const output = `docs/qa/${character}-3d-${revision}`;
const glb = await fs.readFile(`public/models/${character}-${revision}.glb`);
assert.equal(glb.readUInt32LE(8), glb.length, "GLB declared size");
const jsonSize = glb.readUInt32LE(12);
const asset = JSON.parse(glb.subarray(20, 20 + jsonSize).toString());
assert.equal(
  asset.images?.length ?? 0,
  0,
  "V5 uses geometric details, not projected images",
);
for (const name of ["SculptedHead", "HairVolume", character === "gus" ? "WorkShirtVolume" : "JacketVolume"]) {
  const node = asset.nodes.find((n) => n.name === name);
  assert(node, `${name} must exist`);
  const positions =
    asset.accessors[asset.meshes[node.mesh].primitives[0].attributes.POSITION];
  assert(
    positions.max[2] - positions.min[2] > 0.3,
    `${name} must have real front/back volume`,
  );
}
console.log("Volumetric geometry and GLB integrity passed");
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 850 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173/");
  await page.evaluate(async (character) => {
    const { preloadCharacter, GusModel } = await import("/src/scene/gus-model.ts");
    await preloadCharacter(character);
    document.body.replaceChildren();
    document.body.style.cssText =
      "margin:0;background:#e8e3d9;color:#282c32;display:flex;flex-wrap:wrap;font-family:Arial;overflow:hidden";
    window.gusReviews = [];
    for (const [name, angle] of [
      ["Front", 0],
      ["Three quarter", Math.PI / 4],
      ["Side", Math.PI / 2],
      ["Back", Math.PI],
    ]) {
      const g = new GusModel(500, character);
      g.yaw = angle;
      g.update(0, angle, 0, false);
      window.gusReviews.push(g);
      const panel = document.createElement("div");
      panel.style.cssText = "width:300px;text-align:center";
      const title = document.createElement("p");
      title.textContent = name;
      panel.append(title);
      g.renderer.domElement.style.cssText =
        "width:300px;height:400px;object-fit:contain";
      panel.append(g.renderer.domElement);
      document.body.append(panel);
    }
  }, character);
  await page.screenshot({ path: `${output}/model-views.png` });
  await page.evaluate(() => {
    const g = window.gusReviews[0];
    document.body.replaceChildren(g.renderer.domElement);
    g.renderer.setSize(850, 850);
    g.yaw = 0.35;
    g.update(0, 0.35, 0, false);
  });
  await page.screenshot({ path: `${output}/model-closeup.png` });
  const hands = await page.evaluate(() => {
    const g = window.gusReviews[0];
    return ["L", "R"].map((side) => {
      const p = g.model.getObjectByName("SculptedHand" + side).geometry.attributes.position;
      const fingers = [], thumbs = [];
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) < -.15) fingers.push([p.getX(i), p.getZ(i)]);
        if (p.getY(i) > -.13 && p.getY(i) < -.07) thumbs.push(p.getZ(i));
      }
      const range = (axis) => Math.max(...fingers.map(p => p[axis])) - Math.min(...fingers.map(p => p[axis]));
      return { side, fingerWidth: range(1), fingerThickness: range(0), curlInward: fingers.reduce((n,p) => n+p[0],0)/fingers.length*(side === "L" ? 1 : -1), thumbForward: Math.max(...thumbs) };
    });
  });
  for (const hand of hands) {
    assert.ok(hand.fingerWidth > hand.fingerThickness * 1.5, `${hand.side}: fingers lie along the side of the thigh, not across its front`);
    assert.ok(hand.curlInward > .005, `${hand.side}: relaxed fingertips curl toward the body`);
    assert.ok(hand.thumbForward > .085, `${hand.side}: thumb projects forward, not backward`);
  }
  await fs.writeFile(`${output}/hand-orientation.json`, JSON.stringify(hands, null, 2));
  await page.evaluate(() => {
    const g = window.gusReviews[0];
    g.renderer.setSize(1200,650);
    g.renderer.domElement.style.cssText="width:1200px;height:650px";
    g.camera.left=-.9;g.camera.right=.9;g.camera.top=.48;g.camera.bottom=-.48;
    g.camera.position.set(0,1.55,8);g.camera.lookAt(0,1.25,0);g.camera.updateProjectionMatrix();
    g.yaw=0;g.update(0,0,0,true);
  });
  await page.screenshot({path:`${output}/hands-idle.png`});
  await page.evaluate(() => {
    const g = window.gusReviews[0];
    for(let i=0;i<135;i++)g.update(1/60,Math.PI/4,92,false);
  });
  await page.screenshot({path:`${output}/hands-walk.png`});
  await page.evaluate(() => {
    const g=window.gusReviews[0];g.camera.left=-1.75;g.camera.right=1.75;g.camera.top=1.75;g.camera.bottom=-1.75;
    g.camera.position.set(0,6.86,8);g.camera.lookAt(0,1.36,0);g.camera.updateProjectionMatrix();
  });
  const motion = await page.evaluate(() => {
    const g = window.gusReviews[0];
    const samples = [];
    const rotations = [];
    for (let i = 0; i < 128; i++) {
      const angle = (i * Math.PI * 2) / 128;
      g.yaw = angle;
      g.update(0, angle, 0, true);
      rotations.push(
        g.model.quaternion
          .toArray()
          .map((v) => v.toFixed(5))
          .join(","),
      );
    }
    for (let i = 0; i < 240; i++) {
      g.update(1 / 60, Math.PI / 2, 92, false);
      if (i < 90) continue;
      const feet = ["L", "R"].map((side) => {
        const sole = g.model.getObjectByName("BootSole" + side);
        sole.geometry.computeBoundingBox();
        return sole.geometry.boundingBox.clone().applyMatrix4(sole.matrixWorld)
          .min.y;
      });
      samples.push({ phase: g.stride, weight: g.walkWeight, yaw: g.yaw, feet });
    }
    for (let i = 0; i < 180; i++) g.update(1 / 60, 0, 0, true);
    const rest = [];
    for (let i = 0; i < 60; i++) {
      g.update(1 / 60, 0, 0, true);
      rest.push(g.headTurn);
    }
    return {
      samples,
      uniqueRotations: new Set(rotations).size,
      reducedMotionHeadRange: Math.max(...rest) - Math.min(...rest),
    };
  });
  assert.equal(
    motion.uniqueRotations,
    128,
    "The same volumetric mesh must support every sampled heading",
  );
  assert.ok(
    motion.samples.every((s) => s.feet.every((y) => y > -0.025)),
    "Soles must not pass through the floor",
  );
  assert.ok(
    motion.samples.every((s) => Math.min(...s.feet) < 0.035),
    "One planted foot must stay at floor height",
  );
  assert.ok(
    motion.samples.some((s) => Math.max(...s.feet) > 0.05),
    "Swing foot must lift",
  );
  assert.ok(
    motion.reducedMotionHeadRange < 0.00001,
    "Reduced-motion idle must settle",
  );
  await fs.writeFile(
    `${output}/rig-motion.json`,
    JSON.stringify(motion, null, 2),
  );
  await page.evaluate(() => {
    document.body.replaceChildren();
    for (let j = 0; j < 4; j++) {
      const g = window.gusReviews[j];
      g.renderer.setSize(500, 500);
      g.yaw = Math.PI / 2;
      for (let i = 0; i < 120 + j * 15; i++)
        g.update(1 / 60, Math.PI / 2, 92, false);
      const panel = document.createElement("div");
      panel.style.width = "300px";
      g.renderer.domElement.style.cssText =
        "width:300px;height:400px;object-fit:contain";
      panel.append(g.renderer.domElement);
      document.body.append(panel);
    }
  });
  await page.screenshot({ path: `${output}/walk-phases.png` });
  await page.goto(
    pathToFileURL(path.resolve(`art/models/${character}-${revision}/preview.html`)).href,
  );
  await page.locator("#loading").waitFor({ state: "detached" });
  await page.locator("#angle").fill("35");
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${output}/interactive-preview.png` });
  await page.locator("#motion").selectOption("Walk");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${output}/interactive-walk.png` });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    `${character}: four views, 128 headings, skeletal foot contacts, reduced idle and offline interactive viewer passed`,
  );
} finally {
  await browser.close();
}
