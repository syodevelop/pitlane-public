// Visual fixture only: no purchases, API, token funding or real player changes.
import { chromium } from "@playwright/test";
import {
  createGarage,
  BALANCE_VERSION,
  STATIONS,
} from "../packages/game-core/index.ts";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const now = Date.now(),
  g = createGarage("car-review", "car-review", "main", {
    now,
    seed: 1,
    balanceVersion: BALANCE_VERSION,
  });
g.profile.character = "Juno";
g.progress.actors.player.position = { ...STATIONS.starter };
const starter = Object.values(g.progress.cars)[0];
starter.restored = true;
starter.engine = 2;
for (let tier = 2; tier <= 5; tier++)
  g.progress.cars["fixture-car-" + tier] = {
    id: "fixture-car-" + tier,
    tier,
    source: "verified-purchase",
    purchaseEvent: "fixture-only-not-a-chain-event",
    restored: true,
    engine: tier % 2 ? 1 : 2,
    reliability: 1,
    prepared: "sprint",
  };
g.progress.activeSlots = [starter.id, "fixture-car-2", "fixture-car-3"];
g.progress.races.review = {
  id: "review",
  carId: "fixture-car-2",
  kind: "training",
  status: "started",
  startsAt: now - 5000,
  endsAt: now + 595000,
  processedAt: null,
  result: null,
  inputs: {
    pace: 52,
    reliability: 48,
    preparation: 55,
    setup: "sprint",
    opponents: [1, 2, 3],
    balanceVersion: BALANCE_VERSION,
  },
  credits: 100,
  rep: 20,
  contributionWeight: 0,
  balanceVersion: BALANCE_VERSION,
};
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [],
    api = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error("Renderer error:", e.message);
  });
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/")) api.push(r.url());
  });
  await page.route("**/__car_collection_review__", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/style.css"></head><body><main id="root" style="padding:24px"></main><script type="module">
    import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
    const {default:React}=await import('/node_modules/.vite/deps/react.js');
    const {default:ReactDOM}=await import('/node_modules/.vite/deps/react-dom_client.js');
    const sceneSource=await (await fetch('/src/Garage.tsx')).text();
    const phaserUrl=sceneSource.split('\\n').find(line=>line.startsWith('import ')&&line.includes('/phaser.js')).split('"')[1];
    const {default:Phaser}=await import(phaserUrl);
    const boot=Phaser.Game.prototype.boot;Phaser.Game.prototype.boot=function(){window.reviewGame=this;return boot.call(this)};
    const {default:GarageGame}=await import('/src/GarageGame.tsx');
    const {default:CarPortrait}=await import('/src/CarPortrait.tsx');
    const {CARS}=await import('/packages/game-core/index.ts');
    let state=${JSON.stringify(g)},mode='garage';const root=ReactDOM.createRoot(document.getElementById('root'));
    const commands=[];
    function render(){root.render(React.createElement(React.Fragment,null,React.createElement('p',null,'ART REVIEW / fixture collection / no real purchases or rewards'),mode==='garage'?React.createElement(GarageGame,{state,now:${now},offset:0,busy:false,send:c=>commands.push(c),openLeaderboard:()=>{}}):React.createElement('div',{style:{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:20}},...[1,2,3,4,5].flatMap(tier=>[false,true].map(upgraded=>React.createElement('article',{key:tier+'-'+upgraded,style:{background:'#d5d8c7',padding:12}},React.createElement('h3',null,CARS[tier].name+' / '+(upgraded?'upgraded':'standard')),React.createElement(CarPortrait,{car:{tier,restored:true,engine:upgraded?2:1,reliability:1}})))))));}
    window.qa={read:()=>{const s=window.reviewGame?.scene.getScenes()[0],v=s?.starter;return v?{texture:v.car.texture.key,frame:Number(v.car.frame.name),visible:v.root.visible,carId:s.lastCarId}:null},commands,
      sheet:()=>{mode='sheet';render()},
      pinWork:()=>{state=structuredClone(state);state.progress.tasks.fixture={id:'fixture',actorId:'player',kind:'prepare',station:'starter',carId:'fixture-car-3',startsAt:${now},endsAt:${now + 60000},status:'started'};state.progress.actors.player.taskId='fixture';render()}};
    render();
  </script></body></html>`,
    }),
  );
  await page.goto("http://127.0.0.1:5173/__car_collection_review__");
  await page
    .waitForFunction(() => window.qa?.read())
    .catch(async (error) => {
      console.error(
        await page.evaluate(() => ({
          qa: !!window.qa,
          game: !!window.reviewGame,
          canvas: !!document.querySelector("canvas"),
          text: document.body.innerText.slice(0, 300),
        })),
      );
      throw error;
    });
  assert.equal(
    await page
      .getByRole("region", { name: "Owned cars" })
      .locator("li")
      .count(),
    5,
  );
  assert.match(
    await page.getByRole("region", { name: "Owned cars" }).innerText(),
    /In collection/,
  );
  await page
    .getByRole("button", {
      name: "Prepare Track GT fixture-car-3",
      exact: true,
    })
    .click();
  await page.waitForFunction(() => window.qa.read().texture === "track-gt");
  assert.equal(
    await page.getByLabel("Preparation car").inputValue(),
    "fixture-car-3",
  );
  await page.waitForTimeout(750);
  await fs.mkdir("docs/qa", { recursive: true });
  await page
    .locator(".garage-visual")
    .screenshot({ path: "docs/qa/cars-scene-desktop.png" });
  await page
    .locator(".car-preparation")
    .screenshot({ path: "docs/qa/cars-preparation-desktop.png" });
  await page
    .getByRole("region", { name: "Owned cars" })
    .screenshot({ path: "docs/qa/cars-collection-desktop.png" });
  await page.getByLabel("Preparation car").selectOption("fixture-car-2");
  await page.waitForFunction(() => window.qa.read().carId === "fixture-car-2");
  assert.equal(
    (await page.evaluate(() => window.qa.read())).visible,
    false,
    "Racing owned car must be absent",
  );
  await page.getByLabel("Preparation car").selectOption("fixture-car-5");
  await page.waitForFunction(() => window.qa.read().texture === "prototype");
  await page.evaluate(() => window.qa.pinWork());
  await page.waitForFunction(() => window.qa.read().carId === "fixture-car-3");
  assert.equal(
    (await page.evaluate(() => window.qa.read())).texture,
    "track-gt",
    "Started work pins the actual worked-on car",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(
    () => document.querySelector("canvas")?.width === 550,
  );
  await page.waitForTimeout(750);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page
    .locator(".garage-visual")
    .screenshot({ path: "docs/qa/cars-scene-mobile.png" });
  await page
    .getByRole("region", { name: "Owned cars" })
    .screenshot({ path: "docs/qa/cars-collection-mobile.png" });
  assert.deepEqual(
    await page.evaluate(() => window.qa.commands),
    [],
    "Inspecting owned cars at the bay must not grant or purchase anything",
  );
  await page.setViewportSize({ width: 1000, height: 1000 });
  await page.evaluate(() => window.qa.sheet());
  await page.waitForTimeout(200);
  await page.screenshot({ path: "docs/qa/cars-art-sheet.png", fullPage: true });
  assert.deepEqual(errors, []);
  assert.deepEqual(api, []);
  console.log(
    "Car collection renderer passed: five owned tiers with separate slots, selected preparation car, race absence, task pinning, mobile overflow and original base/upgrade art. Fixture only; no purchase verification claimed.",
  );
} finally {
  await browser.close();
}
