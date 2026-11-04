// Real React/Phaser with domain-command snapshots, no API or live rewards.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { Scenario } from "../packages/game-core/scenario.ts";
import { annexScenario, walkTo } from "../tests/fixtures/annex.ts";
import { ANNEX } from "../packages/game-core/index.ts";

function snapshots(annex) {
  const h = annex ? annexScenario().h : new Scenario();
  h.restore();
  if (annex) {
    h.move("stock");
    h.command({
      type: "pickUp",
      actorId: "player",
      station: "stock",
      amount: 1,
    });
    h.finish();
    walkTo(h, ANNEX.starter);
    h.command({
      type: "putDown",
      actorId: "player",
      station: "starter",
      amount: 1,
    });
    h.command({
      type: "startWork",
      actorId: "player",
      kind: "prepare",
      carId: h.starter(),
      preparation: "endurance",
    });
    h.finish();
  } else h.prepare();
  h.move("race");
  const ready = structuredClone(h.state);
  h.command({ type: "dispatchRace", carId: h.starter(), kind: "tutorial" });
  const started = structuredClone(h.state),
    race = Object.values(h.state.progress.races)[0];
  h.advance(race.endsAt - 1);
  const pending = structuredClone(h.state);
  h.advance(race.endsAt);
  const completed = structuredClone(h.state);
  h.deliver("starter", 1);
  h.command({
    type: "startWork",
    actorId: "player",
    kind: "prepare",
    carId: h.starter(),
    preparation: "sprint",
  });
  const workingAgain = structuredClone(h.state);
  return { ready, started, pending, completed, workingAgain };
}
const states = { main: snapshots(false), annex: snapshots(true) };
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
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
  await page.route("**/__traffic_review__", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/style.css"></head><body><main id="root" style="padding:12px"></main><script type="module">
  import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
  const {default:React}=await import('/node_modules/.vite/deps/react.js');
  const {default:ReactDOM}=await import('/node_modules/.vite/deps/react-dom_client.js');
  const source=await (await fetch('/src/Garage.tsx')).text();
  const url=source.split('\\n').find(l=>l.startsWith('import ')&&l.includes('/phaser.js')).split('"')[1];
  const {default:Phaser}=await import(url);const boot=Phaser.Game.prototype.boot;Phaser.Game.prototype.boot=function(){window.reviewGame=this;return boot.call(this)};
  const {default:Garage}=await import('/src/Garage.tsx');
  const {movingCarAppearance}=await import('/src/scene/car-appearance.ts');
  const states=${JSON.stringify(states)};let group='main',phase='ready',key=0;
  const root=ReactDOM.createRoot(document.getElementById('root')),commands=[];
  function render(){const state=states[group][phase];root.render(React.createElement(React.Fragment,null,React.createElement('p',null,'RACE TRAFFIC REVIEW / domain fixture / no API or real rewards'),React.createElement(Garage,{key,state,offset:state.progress.lastNow-Date.now(),send:c=>commands.push(c),interact:()=>{}})));}
  window.qa={commands,set:(p,g=group,reload=false)=>{phase=p;group=g;if(reload){key++;window.reviewGame=null}render()},
    read:()=>{const s=window.reviewGame?.scene.getScenes()[0];if(!s?.traffic)return null;return {flights:[...s.traffic.flights.entries()].map(([id,f])=>({id,raceId:f.raceId,direction:f.direction,segment:f.segment,x:f.root.x,y:f.root.y,depth:f.root.depth,texture:f.image.texture.key,frame:Number(f.image.frame.name),flip:f.image.flipX})),primary:s.starter.root.visible,annex:s.annex.vehicles.get('starter').root.visible,cameraFollowingTraffic:!!s.trafficFocus,credits:states[group][phase].progress.credits,rep:states[group][phase].progress.rep}},
    sheet:()=>{document.querySelector('.scene-hud').style.visibility='hidden';const s=window.reviewGame.scene.getScenes()[0];s.scene.pause();const sheet=s.add.container(0,0).setDepth(2000).setScrollFactor(0);s.cameras.main.setZoom(1).stopFollow();sheet.add(s.add.rectangle(550,325,1100,650,0x597364));
      for(let tier=1;tier<=5;tier++)for(let upgraded=0;upgraded<2;upgraded++)for(let d=0;d<4;d++){
        const direction=['sw','se','nw','ne'][d],a=movingCarAppearance({tier,restored:true,engine:upgraded+1,reliability:1},direction),x=70+d*130+upgraded*540,y=75+(tier-1)*117;
        sheet.add(s.add.rectangle(x,y,130,110,0xd5d8c7));sheet.add(s.add.image(x,y+43,a.texture,a.frame).setOrigin(.5,.975).setDisplaySize(130,108).setFlipX(a.flipX));
        sheet.add(s.add.text(x-50,y-52,'T'+tier+' '+direction+(upgraded?' +':''),{fontSize:'12px',color:'#263c35'}));
      }
    }};render();
  </script></body></html>`,
    }),
  );
  await page.goto("http://127.0.0.1:5173/__traffic_review__");
  await page.waitForFunction(() => window.qa?.read());
  await fs.mkdir("docs/qa", { recursive: true });
  const read = () => page.evaluate(() => window.qa.read());
  const set = async (phase, group = "main", reload = false) => {
    await page.evaluate(
      ({ phase, group, reload }) => window.qa.set(phase, group, reload),
      { phase, group, reload },
    );
    await page.waitForFunction(() => window.qa.read());
  };
  assert.equal((await read()).primary, true);
  assert.equal((await read()).flights.length, 0);
  for (const [group, mobile] of [
    ["main", false],
    ["annex", true],
  ]) {
    if (mobile) {
      await page.setViewportSize({ width: 390, height: 844 });
      await set("ready", group, true);
    }
    const initial = await read();
    assert.equal(mobile ? initial.annex : initial.primary, true);
    await set("started", group);
    await page.waitForFunction(() => window.qa.read().flights.length === 1);
    await page.waitForTimeout(300);
    assert.equal((await read()).primary, false);
    assert.equal((await read()).annex, false);
    await page
      .locator(".garage-visual")
      .screenshot({ path: "docs/qa/traffic-depart-" + group + ".png" });
    const raceId = (await read()).flights[0].raceId;
    await set("started", group);
    assert.equal((await read()).flights[0].raceId, raceId);
    await page.waitForFunction(
      () => window.qa.read().flights[0]?.segment === 2,
    );
    await page.waitForTimeout(400);
    assert.equal((await read()).flights[0].texture, "rustback-rear");
    await page
      .locator(".garage-visual")
      .screenshot({ path: "docs/qa/traffic-apron-" + group + ".png" });
    await page.waitForFunction(
      () => window.qa.read().flights[0]?.segment === 3,
    );
    assert.equal((await read()).flights[0].flip, true);
    assert.ok(
      (await read()).flights[0].depth > 0,
      "Upper circuit car must render above the road",
    );
    if (mobile) assert.equal((await read()).cameraFollowingTraffic, true);
    await page
      .locator(".garage-visual")
      .screenshot({ path: "docs/qa/traffic-circuit-" + group + ".png" });
    // Inspect the crossing behind the new facade, not just the empty corner.
    await page.waitForFunction(() => {
      const f = window.qa.read().flights[0];
      return f?.segment === 3 && f.x > 850;
    });
    await page
      .locator(".garage-visual")
      .screenshot({ path: "docs/qa/traffic-facade-" + group + ".png" });
    if (mobile) {
      const joystick = page.getByRole("group", { name: "Virtual joystick" });
      await joystick.scrollIntoViewIfNeeded();
      const rect = await joystick.boundingBox();
      await page.mouse.move(
        rect.x + rect.width / 2 + 20,
        rect.y + rect.height / 2,
      );
      await page.mouse.down();
      await page.waitForFunction(
        () => !window.qa.read().cameraFollowingTraffic,
      );
      await page.mouse.up();
      assert.ok(
        (await read()).flights.length,
        "Manual camera control must not cancel the race animation",
      );
      const commands = await page.evaluate(() => window.qa.commands.splice(0));
      assert.ok(commands.length > 0);
      assert.ok(
        commands.every((c) => c.type === "move"),
        "Only explicit joystick input may send movement",
      );
    }
    await page.waitForFunction(() => window.qa.read().flights.length === 0);
    await set("pending", group);
    assert.equal(
      (await read()).flights.length,
      0,
      "Timer boundary cannot return a car",
    );
    await set("completed", group);
    await page.waitForFunction(
      () => window.qa.read().flights[0]?.direction === "return",
    );
    await page.waitForFunction(
      () => window.qa.read().flights[0]?.segment === 3,
    );
    await page.waitForTimeout(300);
    await page
      .locator(".garage-visual")
      .screenshot({ path: "docs/qa/traffic-return-" + group + ".png" });
    await page.waitForFunction(() => window.qa.read().flights.length === 0);
    await page.waitForTimeout(100);
    const parked = await read();
    assert.equal(mobile ? parked.annex : parked.primary, true);
    assert.equal(parked.rep, states[group].completed.progress.rep);
    await page
      .locator(".garage-visual")
      .screenshot({ path: "docs/qa/traffic-parked-" + group + ".png" });
    await set("completed", group, true);
    assert.equal(
      (await read()).flights.length,
      0,
      "Reload cannot replay return",
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await set("ready", "main", true);
  await set("started");
  await page.waitForTimeout(100);
  assert.equal((await read()).flights.length, 0);
  assert.equal((await read()).primary, false);
  await set("completed");
  await page.waitForTimeout(100);
  assert.equal((await read()).flights.length, 0);
  assert.equal((await read()).primary, true);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await set("ready", "main", true);
  await set("started");
  await page.waitForFunction(() => window.qa.read().flights.length === 1);
  await set("completed");
  await page.waitForFunction(
    () => window.qa.read().flights[0]?.direction === "return",
  );
  await set("workingAgain");
  await page.waitForFunction(
    () => window.qa.read().flights.length === 0 && window.qa.read().primary,
  );
  await set("started", "main", true);
  assert.equal(
    (await read()).flights.length,
    0,
    "Load during race has no departure",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await set("ready", "main", true);
  await page.evaluate(() => window.qa.sheet());
  await page.waitForTimeout(100);
  // Paused scene still renders; sheet is a test-only overlay of actual game textures.
  await page
    .locator("canvas")
    .screenshot({ path: "docs/qa/car-four-facings.png" });
  assert.deepEqual(await page.evaluate(() => window.qa.commands), []);
  assert.deepEqual(api, []);
  assert.deepEqual(errors, []);
  console.log(
    "Race traffic renderer passed: both physical bays, four directions, full departure/return, no timer settlement, reload/history, reduced motion and mobile. Domain fixtures only; no API or live rewards.",
  );
} finally {
  await browser.close();
}
