// Domain-driven renderer review. No API, authenticated player changes or grants.
import { chromium } from "@playwright/test";
import { annexScenario, ownedAnnexScenario } from "../tests/fixtures/annex.ts";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const { h, helper, jobs, locked, expanded } = annexScenario();
const ready = structuredClone(h.state);
h.command({
  type: "startWork",
  actorId: "player",
  kind: "service",
  jobId: jobs[0],
});
h.command({
  type: "startWork",
  actorId: helper,
  kind: "service",
  jobId: jobs[1],
});
const working = structuredClone(h.state);
const times = Object.values(h.state.progress.tasks)
  .filter((t) => t.status === "started")
  .map((t) => t.endsAt)
  .sort((a, b) => a - b);
h.advance(times[0]);
const firstDone = structuredClone(h.state);
h.advance(times[1]);
const finished = structuredClone(h.state);
const own = ownedAnnexScenario();
own.h.command({
  type: "startWork",
  actorId: "player",
  kind: "prepare",
  carId: own.cars[0],
  preparation: "sprint",
});
own.h.command({
  type: "startWork",
  actorId: own.helper,
  kind: "prepare",
  carId: own.cars[1],
  preparation: "endurance",
});
const ownWorking = structuredClone(own.h.state);
const states = {
  ownWorking,
  locked,
  expanded,
  ready,
  working,
  firstDone,
  finished,
};
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
    }),
    errors = [],
    api = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error(e.message);
  });
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/")) api.push(r.url());
  });
  await page.route("**/__annex_review__", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/style.css"></head><body><main id="root" style="padding:12px"></main><script type="module">
 import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
 const {default:React}=await import('/node_modules/.vite/deps/react.js');const {default:ReactDOM}=await import('/node_modules/.vite/deps/react-dom_client.js');
 const source=await(await fetch('/src/Garage.tsx')).text();const url=source.split('\\n').find(l=>l.startsWith('import ')&&l.includes('/phaser.js')).split('"')[1];
 const {default:Phaser}=await import(url);const boot=Phaser.Game.prototype.boot;Phaser.Game.prototype.boot=function(){window.reviewGame=this;return boot.call(this)};
 const {default:GarageGame}=await import('/src/GarageGame.tsx');const {execute,settle,BALANCE_VERSION}=await import('/packages/game-core/index.ts');
 const states=${JSON.stringify(states)};let state=states.locked,key=0,serial=0;const commands=[];const root=ReactDOM.createRoot(document.getElementById('root'));
 const ctx=()=>({now:state.progress.lastNow,seed:state.progress.seed,balanceVersion:BALANCE_VERSION});
 function render(){root.render(React.createElement(React.Fragment,null,React.createElement('p',null,state.progress.mode==='main'?'MAIN REVIEW / synthetic car entitlement / no onchain purchase':'ANNEX REVIEW / earned domain fixture / no player or API changes'),React.createElement(GarageGame,{key,state,now:state.progress.lastNow,offset:state.progress.lastNow-Date.now(),busy:false,openLeaderboard:()=>{},send:command=>{commands.push(command);state=execute(state,{id:'renderer-'+(++serial),command},ctx()).state;render()}})));}
 window.qa={commands,state:()=>state,show:name=>{state=structuredClone(states[name]);render()},arrive:()=>{const times=Object.values(state.progress.actors).filter(a=>a.travel).map(a=>a.travel.endsAt);state=settle(state,{...ctx(),now:Math.max(...times)}).state;render()},reload:()=>{window.reviewGame=null;key++;render()},read:()=>{const s=window.reviewGame?.scene.getScenes()[0];if(!s?.annex)return null;const v=s.annex.vehicles.get('tires'),a=[...s.actors.visuals].map(([id,v])=>({id,x:v.root.x,y:v.root.y,visible:v.root.visible}));return {ownMain:s.starter.key,ownAnnex:s.annex.vehicles.get('starter').key,expanded:s.expanded,main:s.customerCars.get('tires').key,annex:v.key,annexVisible:v.root.visible,actors:a,zoom:s.cameras.main.zoom}}};render();
 </script></body></html>`,
    }),
  );
  await page.goto("http://127.0.0.1:5173/__annex_review__");
  await page.waitForFunction(() => window.qa?.read());
  assert.equal((await page.evaluate(() => window.qa.read())).expanded, false);
  assert.equal(
    (await page.evaluate(() => window.qa.read())).annexVisible,
    false,
  );
  await page.evaluate(() => window.qa.show("expanded"));
  await page.waitForFunction(() => window.qa.read().expanded);
  await fs.mkdir("docs/qa", { recursive: true });
  await page
    .locator(".garage-visual")
    .screenshot({ path: "docs/qa/annex-empty-desktop.png" });
  await page.evaluate(() => window.qa.show("ready"));
  await page.getByRole("button", { name: "Tires", exact: true }).click();
  await page.getByRole("button", { name: "Annex bay", exact: true }).click();
  const last = await page.evaluate(() => window.qa.commands.at(-1));
  assert.deepEqual(last, {
    type: "navigate",
    actorId: "player",
    target: { x: 950, y: 100 },
  });
  assert(
    await page.evaluate(
      () => !!window.qa.state().progress.actors.player.travel,
    ),
  );
  await page.evaluate(() => window.qa.arrive());
  await page.getByText(/Delivered here: 1\/6/).waitFor();
  await page.evaluate(() => window.qa.show("working"));
  await page.waitForFunction(
    ([a, b]) => window.qa.read().main === a && window.qa.read().annex === b,
    jobs,
  );
  await page.waitForTimeout(750);
  const workingRead = await page.evaluate(() => window.qa.read());
  assert.equal(workingRead.annexVisible, true);
  const [a, b] = workingRead.actors;
  assert(
    Math.hypot(a.x - b.x, a.y - b.y) > 300,
    "Actors must occupy distinct authoritative places",
  );
  await page
    .locator(".garage-visual")
    .screenshot({ path: "docs/qa/annex-working-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Controlled worker").selectOption(helper);
  await page.waitForFunction(
    () => document.querySelector("canvas")?.width === 550,
  );
  await page.waitForTimeout(250);
  await page
    .locator(".garage-visual")
    .screenshot({ path: "docs/qa/annex-working-mobile.png" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.evaluate(() => window.qa.show("firstDone"));
  await page.waitForFunction(() => window.qa.read().main === null);
  assert.equal((await page.evaluate(() => window.qa.read())).annex, jobs[1]);
  await page.evaluate(() => window.qa.reload());
  await page.waitForFunction(() => window.qa.read()?.annexVisible);
  assert.equal((await page.evaluate(() => window.qa.read())).annex, jobs[1]);
  await page.evaluate(() => window.qa.show("finished"));
  await page.waitForFunction(() => !window.qa.read().annexVisible);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.evaluate(() => window.qa.show("ownWorking"));
  await page.waitForFunction(
    ([a, b]) =>
      window.qa.read()?.ownMain === a && window.qa.read()?.ownAnnex === b,
    own.cars,
  );
  await page.waitForTimeout(750);
  await page
    .locator(".garage-visual")
    .screenshot({ path: "docs/qa/annex-team-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Controlled worker").selectOption(own.helper);
  await page.waitForFunction(
    () => document.querySelector("canvas")?.width === 550,
  );
  await page.waitForTimeout(250);
  await page
    .locator(".garage-visual")
    .screenshot({ path: "docs/qa/annex-team-mobile.png" });
  assert.deepEqual(api, []);
  assert.deepEqual(errors, []);
  console.log(
    "Annex passed: locked/expanded layout, bay travel and separate inventory, two visible working cars and server-position actors, mobile, partial completion and reload. Domain fixture only.",
  );
} finally {
  await browser.close();
}
