// Renderer review driven by real domain events, without API calls or player changes.
import { chromium } from "@playwright/test";
import { Scenario } from "../packages/game-core/scenario.ts";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const h = new Scenario();
const jobId = h.order("quick");
h.deliver("quick", 1);
h.command({ type: "startWork", actorId: "player", kind: "service", jobId });
const initial = structuredClone(h.state);
h.finish();
const partial = structuredClone(h.state);
h.command({ type: "startWork", actorId: "player", kind: "service", jobId });
h.finish();
const complete = structuredClone(h.state);
while (h.state.progress.credits < 2200) h.service();
h.move("reception");
const earned = structuredClone(h.state);
h.command({ type: "upgrade", target: "quickTools" });
const quick = structuredClone(h.state);
h.command({ type: "upgrade", target: "engineTools" });
const upgraded = structuredClone(h.state);
h.command({ type: "upgrade", target: "team" });
const team = structuredClone(h.state);
h.command({ type: "upgrade", target: "capacity" });
const expanded = structuredClone(h.state);
const states = {
  initial,
  partial,
  complete,
  earned,
  quick,
  upgraded,
  team,
  expanded,
};
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [],
    api = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/")) api.push(r.url());
  });
  await page.route("**/__garage_feedback_review__", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/style.css"></head><body><main id="root" style="padding:12px"></main><script type="module">
      import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
      const {default:React}=await import('/node_modules/.vite/deps/react.js');
      const {default:ReactDOM}=await import('/node_modules/.vite/deps/react-dom_client.js');
      const sceneSource=await (await fetch('/src/Garage.tsx')).text();
      const phaserUrl=sceneSource.split('\\n').find(line=>line.startsWith('import ')&&line.includes('/phaser.js')).split('"')[1];
      const {default:Phaser}=await import(phaserUrl);
      const boot=Phaser.Game.prototype.boot;Phaser.Game.prototype.boot=function(){window.reviewGame=this;return boot.call(this)};
      const {default:GarageGame}=await import('/src/GarageGame.tsx');
      const {STATIONS,ANNEX}=await import('/packages/game-core/index.ts');
      const states=${JSON.stringify(states)},root=ReactDOM.createRoot(document.getElementById('root'));
      let state=states.initial,key=0;const commands=[];
      function render(){root.render(React.createElement(React.Fragment,null,React.createElement('p',null,'RENDERER REVIEW / domain events / no API or player changes'),React.createElement(GarageGame,{key,state,now:${h.now},offset:${h.now}-Date.now(),busy:false,send:c=>commands.push(c),openLeaderboard:()=>{}})));}
      window.qa={show:name=>{state=structuredClone(states[name]);render()},remount:()=>{window.reviewGame=null;key++;render()},focus:(station,annex=false)=>{state=structuredClone(state);state.progress.actors.player.position=(annex?ANNEX:STATIONS)[station];state.progress.actors.player.travel=null;state.progress.actors.player.taskId=null;render()},commands,
        equipment:()=>{const e=window.reviewGame?.scene.getScenes()[0]?.equipment;return e?{quick:e.quick.map(x=>x.texture.key),engine:Number(e.engine.frame.name),team:Number(e.team.frame.name),annexTeam:Number(window.reviewGame.scene.getScenes()[0].annexEquipment.team.frame.name)}:null}};
      render();
    </script></body></html>`,
    }),
  );
  await page.goto("http://127.0.0.1:5173/__garage_feedback_review__");
  await page.waitForFunction(() => window.qa?.equipment());
  const notices = page.locator(".garage-feedback p");
  assert.equal(await notices.count(), 0, "Initial history must be silent");
  assert.deepEqual(await page.evaluate(() => window.qa.equipment()), {
    quick: ["service-station", "service-station"],
    engine: 0,
    team: 0,
    annexTeam: 0,
  });
  await page.evaluate(() => window.qa.show("partial"));
  await page.waitForTimeout(100);
  assert.equal(
    await notices.count(),
    0,
    "Intermediate service step is not an order reward",
  );
  await page.evaluate(() => window.qa.show("complete"));
  await page
    .getByText("Quick Service complete · +120 Credits · +15 REP", {
      exact: true,
    })
    .waitFor();
  await fs.mkdir("docs/qa", { recursive: true });
  await page.waitForTimeout(220);
  await page
    .locator(".garage-visual")
    .screenshot({ path: "docs/qa/feedback-desktop.png" });
  await page.evaluate(() => window.qa.show("complete"));
  assert.equal(
    await notices.count(),
    1,
    "Same snapshot cannot duplicate a notice",
  );
  await notices.waitFor({ state: "detached", timeout: 6500 });
  await page.evaluate(() => window.qa.show("complete"));
  await page.waitForTimeout(100);
  assert.equal(await notices.count(), 0, "Expired notice must not replay");
  await page.evaluate(() => {
    window.qa.show("earned");
    window.qa.remount();
  });
  await page.waitForFunction(() => window.qa.equipment()?.engine === 0);
  assert.equal(await notices.count(), 0, "Reload skips historical earnings");
  await page
    .locator(".garage-visual")
    .screenshot({ path: "docs/qa/equipment-base-desktop.png" });
  await page.evaluate(() => window.qa.show("quick"));
  await page
    .getByText("Quick service tools upgraded", { exact: true })
    .waitFor();
  await page.waitForFunction(() =>
    window.qa.equipment()?.quick.every((x) => x === "service-station-upgraded"),
  );
  await page.evaluate(() => window.qa.show("upgraded"));
  await page.getByText("Engine workshop upgraded", { exact: true }).waitFor();
  await page.waitForFunction(() => window.qa.equipment()?.engine === 1);
  await page.waitForTimeout(220);
  await page
    .locator(".garage-visual")
    .screenshot({ path: "docs/qa/equipment-upgraded-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(
    () => document.querySelector("canvas")?.width === 550,
  );
  await page.evaluate(() => window.qa.focus("engine"));
  await page.waitForTimeout(250);
  await page
    .locator(".garage-visual")
    .screenshot({ path: "docs/qa/equipment-upgraded-mobile.png" });
  const bounds = await page.evaluate(() => {
    const rect = (selector) => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
    };
    return {
      notice: rect(".garage-feedback"),
      hud: rect(".scene-hud"),
      joystick: rect(".joystick"),
      canvas: rect("canvas"),
      width: innerWidth,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  assert(!bounds.overflow);
  assert(
    bounds.joystick.y >= bounds.canvas.bottom,
    "Joystick must not cover scene objects",
  );
  assert(bounds.notice.x >= 0 && bounds.notice.right <= bounds.width);
  assert(
    bounds.notice.y >= bounds.hud.bottom &&
      bounds.notice.y >= bounds.joystick.bottom &&
      bounds.notice.y >= bounds.canvas.bottom,
    "Notices must sit below the scene and never obscure its controls or stations",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await notices.first().evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  await page.evaluate(() => window.qa.remount());
  await page.waitForFunction(() => window.qa.equipment()?.engine === 1);
  assert.equal(await notices.count(), 0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.qa.show("team"));
  await page.waitForFunction(() => window.qa.equipment()?.team === 1);
  await page.waitForTimeout(220);
  await page
    .locator(".garage-visual")
    .screenshot({ path: "docs/qa/team-equipment-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.qa.focus("starter"));
  await page.waitForFunction(
    () => document.querySelector("canvas")?.width === 550,
  );
  await page.waitForTimeout(250);
  await page
    .locator(".garage-visual")
    .screenshot({ path: "docs/qa/team-equipment-mobile.png" });
  await page.evaluate(() => {
    window.qa.show("expanded");
    window.qa.focus("starter", true);
  });
  await page.waitForFunction(() => window.qa.equipment()?.annexTeam === 1);
  await page.waitForTimeout(250);
  await page
    .locator(".garage-visual")
    .screenshot({ path: "docs/qa/team-equipment-annex-mobile.png" });
  await page.evaluate(() => window.qa.remount());
  await page.waitForFunction(() => window.qa.equipment()?.annexTeam === 1);
  assert.equal(await page.evaluate(() => window.qa.commands.length), 0);
  assert.deepEqual(api, []);
  assert.deepEqual(errors, []);
  console.log(
    "Feedback/equipment passed: domain-event-only rewards, intermediate step, replay/expiry/reload, quick/engine/team upgrades and annex, mobile controls, reduced motion, no API commands.",
  );
} finally {
  await browser.close();
}
