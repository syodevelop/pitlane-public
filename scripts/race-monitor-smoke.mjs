// Presentation boundary fixture only. No authenticated gameplay or financial proof.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createGarage, BALANCE_VERSION } from "../packages/game-core/index.ts";
const now = Date.now();
const state = createGarage("race-view-fixture", "render", "demo", {
  now,
  seed: 1,
  balanceVersion: BALANCE_VERSION,
});
const carId = Object.keys(state.progress.cars)[0];
state.progress.races.first = {
  id: "first",
  carId,
  kind: "tutorial",
  startsAt: now - 15000,
  endsAt: now + 30000,
  processedAt: null,
  status: "started",
  inputs: {
    pace: 40,
    reliability: 40,
    preparation: 50,
    setup: "sprint",
    opponents: [430, 470],
    balanceVersion: BALANCE_VERSION,
  },
  result: null,
  credits: 100,
  rep: 20,
  contributionWeight: 0,
  balanceVersion: BALANCE_VERSION,
};
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => {
  errors.push(e.message);
  console.error(e.message);
});
page.on("console", (m) => {
  if (m.type() === "error") console.error(m.text());
});
await fs.mkdir("test-results", { recursive: true });
try {
  await page.route("**/__race_monitor_test__", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/style.css"></head><body><main id="root" style="padding:20px;max-width:390px"></main><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;
    const {default:React}=await import('/node_modules/.vite/deps/react.js');
    const {default:ReactDOM}=await import('/node_modules/.vite/deps/react-dom_client.js');
    const {default:RaceMonitor}=await import('/src/RaceMonitor.tsx');
    const state=${JSON.stringify(state)}; const root=ReactDOM.createRoot(document.getElementById('root'));
    window.qa={render:(time,complete=false,two=false)=>{
      state.progress.races.first.status=complete?'completed':'started';
      state.progress.races.first.result=complete?{position:3,fieldSize:6,performance:480}:null;
      if(two) {
        state.progress.cars.second={...state.progress.cars[state.progress.races.first.carId],id:'second',tier:2};
        state.progress.races.second={...state.progress.races.first,id:'second',carId:'second',kind:'training',endsAt:${now + 60000},inputs:{...state.progress.races.first.inputs,setup:'endurance'}};
      } else { delete state.progress.races.second; delete state.progress.cars.second; }
      root.render(React.createElement(RaceMonitor,{state,now:time,offset:time-Date.now()}));
    }}; qa.render(${now});
  </script></body></html>`,
    }),
  );
  await page.goto("http://127.0.0.1:5173/__race_monitor_test__");
  const monitor = page.getByRole("region", { name: "Circuit monitor" });
  await monitor.waitFor();
  // Desktop's side column is narrower than the mobile full-width card.
  await page.locator("#root").evaluate((el) => (el.style.maxWidth = "297px"));
  const bounds = await page.locator(".circuit-caption").evaluate((el) => {
    const caption = el.getBoundingClientRect(),
      button = el.querySelector("button").getBoundingClientRect();
    return {
      inside:
        button.left >= caption.left - 1 && button.right <= caption.right + 1,
      touchHeight: button.height,
    };
  });
  assert.equal(
    bounds.inside,
    true,
    "Animation control must fit a 257px sidebar",
  );
  assert.ok(bounds.touchHeight >= 44);
  await monitor.screenshot({
    path: "test-results/race-monitor-narrow-column.png",
  });
  await page.locator("#root").evaluate((el) => (el.style.maxWidth = "390px"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const marker = page.locator("[data-race-marker]");
  await page.waitForTimeout(100);
  const staticPosition = await marker.getAttribute("transform");
  await page.waitForTimeout(400);
  assert.equal(
    await marker.getAttribute("transform"),
    staticPosition,
    "Reduced motion must stop movement",
  );
  assert.doesNotMatch(await monitor.innerText(), /Position|\+100|\+20/);
  await page.evaluate((time) => qa.render(time, false, true), now + 10000);
  await page.locator(".race-running").nth(1).waitFor();
  assert.equal(await page.locator(".race-running").count(), 2);
  await page
    .getByRole("heading", { name: "Club Coupe", exact: true })
    .waitFor();
  assert.match(await monitor.innerText(), /training · endurance setup/i);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({ path: "test-results/race-monitor-two-slots.png" });
  await page.evaluate((time) => qa.render(time), now + 31000);
  await page.getByText("Finishing…", { exact: true }).waitFor();
  assert.doesNotMatch(await monitor.innerText(), /Position|\+100|\+20/);
  assert.equal(
    await page.getByRole("progressbar").getAttribute("value"),
    "45000",
  );
  await page.screenshot({ path: "test-results/race-monitor-awaiting.png" });
  await page.evaluate((time) => qa.render(time, true), now + 31000);
  await page.getByRole("heading", { name: "Race result" }).waitFor();
  assert.match(await monitor.innerText(), /Position 3 \/ 6/);
  assert.match(await monitor.innerText(), /\+100 Credits \/ \+20 REP/);
  assert.equal(await page.locator("[data-race-marker]").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "Race monitor fixture passed: reduced motion, two active slots, narrow layout, elapsed time never grants a result, confirmed result replaces animation. No gameplay state was written.",
  );
} finally {
  await browser.close();
}
