import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "@playwright/test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const origin = "http://127.0.0.1:5173";
const character = process.argv[2] || "gus";
if (!["gus", "dash", "juno"].includes(character)) throw new Error("Unknown character");
const characterName = character[0].toUpperCase() + character.slice(1);
const output = character === "gus" ? "docs/qa/play-entry" : `docs/qa/play-entry-${character}`;
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const errors = [];
const context = await browser.newContext({
  viewport: { width: 1672, height: 941 },
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
page.on("pageerror", (e) => errors.push(e.message));
const shot = (name) => page.screenshot({ path: `${output}/${name}.png` });
const gate = () =>
  page.getByRole("button", { name: "Connect wallet", exact: true }).waitFor();
const viewportFits = async () => {
  assert.deepEqual(
    await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.scrollHeight,
    ]),
    await page.evaluate(() => [innerWidth, innerHeight]),
  );
  await page.mouse.move(2, 2);
  await page.mouse.wheel(0, 1000);
  assert.equal(await page.evaluate(() => scrollY), 0);
};
let failed = true;
try {
  // A real asset failure must not masquerade as a successful loading screen.
  await page.route("**/art/garage-roof-painted-v1.png", (route) =>
    failed
      ? route.fulfill({ status: 503, body: "Temporary test asset failure" })
      : route.continue(),
  );
  await page.goto(origin + "/play");
  await page
    .getByRole("button", { name: "Retry loading", exact: true })
    .waitFor();
  assert.equal(await page.locator("canvas").count(), 0);
  await shot("01-loading-recovery");
  failed = false;
  await page
    .getByRole("button", { name: "Retry loading", exact: true })
    .click();
  await gate();
  await page.unroute("**/art/garage-roof-painted-v1.png");
  assert.equal(await page.locator("canvas").count(), 0);
  assert.equal(await page.locator("header nav").count(), 0);
  await shot("02-wallet-desktop");
  for (const size of [
    [390, 844],
    [320, 568],
    [844, 390],
    [768, 1024],
    [2560, 1080],
  ]) {
    await page.setViewportSize({ width: size[0], height: size[1] });
    await viewportFits();
    if (size[0] === 390) await shot("03-wallet-mobile");
  }
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "No browser wallet" })
    .waitFor();

  // Two announced providers, two distinct unfunded test identities; the default
  // injected wallet must not silently replace the selected provider on reload.
  const accounts = {
    rabby: privateKeyToAccount(generatePrivateKey()),
    metamask: privateKeyToAccount(generatePrivateKey()),
  };
  let cancel = true;
  const methods = [];
  await page.exposeFunction(
    "entryTestRequest",
    async ({ id, method, params }) => {
      methods.push({ id, method });
      if (method === "eth_accounts" || method === "eth_requestAccounts")
        return [accounts[id].address];
      if (method === "eth_chainId") return "0x1237";
      if (method === "personal_sign") {
        if (cancel) {
          cancel = false;
          throw Error("Signature cancelled. Try again.");
        }
        return accounts[id].signMessage({ message: { raw: params[0] } });
      }
      throw Error("Unexpected test wallet method: " + method);
    },
  );
  await page.addInitScript(() => {
    const providers = ["rabby", "metamask"].map((id) => {
      const listeners = new Map();
      const provider = {
        request: ({ method, params }) =>
          window.entryTestRequest({ id, method, params }),
        on: (name, callback) => {
          const set = listeners.get(name) || new Set();
          set.add(callback);
          listeners.set(name, set);
        },
        removeListener: (name, callback) =>
          listeners.get(name)?.delete(callback),
      };
      return {
        info: {
          rdns: "test." + id,
          name: id === "rabby" ? "Rabby" : "MetaMask",
          uuid: id,
          icon: "",
        },
        provider,
        listeners,
      };
    });
    window.ethereum = providers[0].provider;
    window.entryTestChange = () =>
      providers[1].listeners.get("chainChanged")?.forEach((cb) => cb());
    window.addEventListener("eip6963:requestProvider", () =>
      providers.forEach(({ info, provider }) =>
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: { info, provider },
          }),
        ),
      ),
    );
  });
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.reload();
  await gate();
  await page.getByRole("button", { name: /MetaMask.*Detected/ }).click();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  assert.equal(
    await page.locator("canvas").count(),
    0,
    "Connection alone must not open a garage",
  );
  await page
    .getByRole("button", { name: "Sign in to Pitlane", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Signature cancelled" })
    .waitFor();
  assert.equal(await page.locator("canvas").count(), 0);
  await shot("04-signature-recovery");
  await page.waitForTimeout(2100); // Existing server challenge throttle is intentional.
  await page
    .getByRole("button", { name: "Sign in to Pitlane", exact: true })
    .click();
  await page.getByRole("button", { name: "Choose Gus", exact: true }).waitFor();
  assert.equal(await page.locator("canvas").count(), 0);
  await shot("05-character-selection");
  const passBefore = await page.locator(".entry-pass-wide").boundingBox();
  const circuitBefore = await page
    .locator(".entry-pass-wide .entry-circuit")
    .boundingBox();
  await page.getByRole("button", { name: "Choose Juno", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Confirm permanent character" })
    .waitFor();
  assert.deepEqual(
    await page.locator(".entry-pass-wide").boundingBox(),
    passBefore,
  );
  assert.deepEqual(
    await page.locator(".entry-pass-wide .entry-circuit").boundingBox(),
    circuitBefore,
  );
  assert.ok(
    circuitBefore.y + circuitBefore.height <= passBefore.y + passBefore.height,
  );
  await shot("05b-character-confirmation");
  await page
    .getByRole("button", { name: "Keep choosing", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await viewportFits();
  await shot("06-characters-mobile");
  await page.getByRole("button", { name: `Choose ${characterName}`, exact: true }).click();
  await page.evaluate(() => {
    window.entryTestPhases = [];
    const root = document.querySelector(".play-root");
    new MutationObserver(() =>
      window.entryTestPhases.push({
        phase: root.dataset.phase,
        at: performance.now(),
      }),
    ).observe(root, { attributes: true, attributeFilter: ["data-phase"] });
  });
  let lateAssets = 0;
  page.on("request", (r) => {
    if (/^\/(art|models)\//.test(new URL(r.url()).pathname)) lateAssets++;
  });
  await page.getByRole("button", { name: `Confirm ${characterName}`, exact: true }).click();
  await page.locator('[data-phase="zooming"]').waitFor();
  assert.equal(await page.locator(".play-workspace").getAttribute("inert"), "");
  await shot("07-city-zoom");
  await page.locator('[data-phase="playing"]').waitFor();
  const phases = await page.evaluate(() => window.entryTestPhases);
  assert.deepEqual(
    phases.map((p) => p.phase),
    ["departing", "zooming", "black", "reveal", "playing"],
  );
  const pause =
    phases.find((p) => p.phase === "reveal").at -
    phases.find((p) => p.phase === "black").at;
  assert.ok(pause >= 100 && pause < 1000);
  assert.equal(lateAssets, 0, "Phaser must reuse preloaded decoded images");
  assert.equal(await page.locator("canvas").count(), 1);
  await viewportFits();
  await shot("09-garage-mobile");
  const beforeStick = await page
    .locator(".interior-canvas")
    .getAttribute("data-x");
  const joystick = await page.locator(".interior-stick").boundingBox();
  await page.mouse.move(joystick.x + 10, joystick.y + joystick.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1100);
  await page.mouse.up();
  await page.waitForTimeout(700);
  assert.ok(
    Math.abs(
      +(await page.locator(".interior-canvas").getAttribute("data-x")) -
        +beforeStick,
    ) > 20,
    "Virtual joystick moves the player",
  );
  await page.setViewportSize({ width: 1672, height: 941 });
  await shot("10-garage-desktop");
  const roomPosition = () =>
    page.locator(".interior-canvas").evaluate((el) => ({
      x: +el.dataset.x,
      y: +el.dataset.y,
      cx: +el.dataset.cameraX,
      cy: +el.dataset.cameraY,
    }));
  const beforeWalk = await roomPosition();
  await page.keyboard.down("a");
  await page.waitForTimeout(1500);
  await page.keyboard.up("a");
  await page.waitForTimeout(900);
  const afterWalk = await roomPosition();
  assert.ok(
    Math.hypot(afterWalk.x - beforeWalk.x, afterWalk.y - beforeWalk.y) > 50,
    "WASD must move the player",
  );
  assert.ok(
    Math.hypot(afterWalk.cx - beforeWalk.cx, afterWalk.cy - beforeWalk.cy) > 50,
    "Camera must follow",
  );
  await page.waitForTimeout(700);
  const stopped = await roomPosition();
  assert.ok(
    Math.hypot(stopped.x - afterWalk.x, stopped.y - afterWalk.y) < 2,
    "Releasing input must stop movement",
  );
  await viewportFits();
  await shot("11-interior-follow-camera");
  // Observe actual animation frames under response jitter; no trusted client score/state.
  await page.evaluate(() => {
    window.walkSamples = [];
    window.walkSampling = true;
    const sample = () => {
      if (!window.walkSampling) return;
      const e = document.querySelector(".interior-canvas");
      window.walkSamples.push({
        at: performance.now(),
        x: +e.dataset.visualX,
        y: +e.dataset.visualY,
        facing: +e.dataset.facing,
        frame: +e.dataset.frame,
        renderMode: e.dataset.renderMode,
        yaw: +e.dataset.yaw,
        stride: +e.dataset.stride,
        walkWeight: +e.dataset.walkWeight,
      });
      requestAnimationFrame(sample);
    };
    sample();
  });
  let responseCount = 0;
  await page.route("**/api/command", async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) =>
      setTimeout(resolve, ++responseCount % 2 ? 110 : 30),
    );
    await route.fulfill({ response });
  });
  for (const keys of [["a"], ["w", "d"], ["s"], ["a", "s"], ["d"], ["w"]]) {
    for (const key of keys) await page.keyboard.down(key);
    await page.waitForTimeout(450);
    for (const key of keys) await page.keyboard.up(key);
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(800);
  await page.unroute("**/api/command");
  const samples = await page.evaluate(() => {
    window.walkSampling = false;
    return window.walkSamples;
  });
  assert.ok(
    samples.every((s) => s.renderMode === `${character}-3d`) &&
      new Set(samples.map((s) => s.yaw.toFixed(2))).size > 20,
    `${characterName} must use the actual 3D model and continuous heading, not direction sprites`,
  );
  assert.ok(
    samples.some((s) => s.walkWeight > 0.9),
    "The skeletal walk must blend in",
  );
  assert.ok(
    new Set(samples.map((s) => s.stride.toFixed(2))).size > 30,
    "The skeletal clip must advance",
  );
  const jumps = samples
    .slice(1)
    .map((s, i) => ({
      dt: s.at - samples[i].at,
      d: Math.hypot(s.x - samples[i].x, s.y - samples[i].y),
    }))
    .filter((s) => s.dt < 40);
  assert.ok(
    Math.max(...jumps.map((s) => s.d)) < 10,
    "Jitter must not teleport the displayed character",
  );
  const last = await page.locator(".interior-canvas").evaluate((e) => ({
    error: Math.hypot(
      +e.dataset.x - e.dataset.visualX,
      +e.dataset.y - e.dataset.visualY,
    ),
  }));
  assert.ok(last.error < 1, "Render position must settle on server position");
  await fs.writeFile(
    output + `/${character}-3d-walk-samples.json`,
    JSON.stringify(
      {
        samples,
        maximumFrameStep: Math.max(...jumps.map((s) => s.d)),
        finalError: last.error,
      },
      null,
      2,
    ),
  );
  await shot("12-walk-v3-settled");
  const idleSamples = [];
  for (let i = 0; i < 12; i++) {
    idleSamples.push(
      await page.locator(".interior-canvas").evaluate((e) => ({
        x: +e.dataset.visualX,
        y: +e.dataset.visualY,
        mix: +e.dataset.idleMix,
        frame: +e.dataset.idleFrame,
        scale: +e.dataset.idleScale,
        weight: +e.dataset.walkWeight,
        head: +e.dataset.headTurn,
      })),
    );
    await page.waitForTimeout(220);
  }
  assert.ok(
    idleSamples.every((s) => s.mix > 0.98),
    "Standing settles fully into idle",
  );
  assert.ok(
    idleSamples.every((s) => s.weight < 0.02),
    "The skeletal walk must blend out at rest",
  );
  assert.ok(
    new Set(idleSamples.map((s) => s.head)).size > 3,
    "The head bone must animate in idle",
  );
  assert.ok(
    idleSamples.every(
      (s) => Math.hypot(s.x - idleSamples[0].x, s.y - idleSamples[0].y) < 0.1,
    ),
    "Idle must not move the ground position",
  );
  assert.equal(
    await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .some((r) => r.name.includes("garage-floor-detail")),
    ),
    false,
    "Rejected floor overlay is not loaded",
  );
  await fs.writeFile(
    output + `/${character}-3d-idle-samples.json`,
    JSON.stringify(idleSamples, null, 2),
  );
  await shot("13-idle-whole-garage");
  if (process.argv.includes("--crew-preview")) {
    const saved = await page.evaluate(async (account) => (await (await fetch("/api/state", {headers:{"X-Pitlane-Account":account}})).json()).state, accounts.metamask.address);
    const commands=[];
    const record=r=>{if(new URL(r.url()).pathname==="/api/command")commands.push(r.postDataJSON());};
    page.on("request",record);
    for (const name of ["Dash","Juno","Gus","Juno"]) {
      const before=await roomPosition();
      await page.getByLabel("Preview character",{exact:true}).selectOption(name);
      await page.waitForFunction(name=>document.querySelector(".interior-canvas")?.dataset.renderMode===name.toLowerCase()+"-3d",name);
      await page.getByLabel("Walk style",{exact:true}).selectOption("relaxed");
      await page.waitForTimeout(250);
      const switched=await roomPosition();
      assert(Math.hypot(switched.x-before.x,switched.y-before.y)<2,"Appearance switch preserves position");
      assert.equal(await page.locator("canvas").count(),1);
      await page.keyboard.down("d");await page.waitForTimeout(450);await page.keyboard.up("d");
      await page.keyboard.down("a");await page.waitForTimeout(450);await page.keyboard.up("a");
      await page.waitForTimeout(600);
    }
    await page.getByLabel("Walk style",{exact:true}).selectOption("original");
    await page.waitForTimeout(250);
    await page.getByLabel("Walk style",{exact:true}).selectOption("relaxed");
    await shot("14-local-crew-preview");
    await page.setViewportSize({width:390,height:844});await viewportFits();
    await shot("15-local-crew-preview-mobile");
    await page.setViewportSize({width:1672,height:941});
    assert.equal(await page.locator(".interior-canvas").getAttribute("data-geometry"),"garage-3d-v4");
    const beforeScene=await roomPosition();
    await page.getByLabel("Location preview",{exact:true}).selectOption("art");
    await page.waitForTimeout(800);
    assert.equal(await page.locator("canvas").count(),1);
    await page.getByLabel("Location preview",{exact:true}).selectOption("3d");
    await page.waitForFunction(()=>document.querySelector(".interior-canvas")?.dataset.geometry==="garage-3d-v4");
    const afterScene=await roomPosition();
    assert(Math.hypot(beforeScene.x-afterScene.x,beforeScene.y-afterScene.y)<2,"Scene comparison preserves authoritative position");
    // All four physical room edges agree with the existing authoritative boundary.
    for(const key of ["a","w","d","s"]){
      await page.keyboard.down(key);await page.waitForTimeout(4200);await page.keyboard.up(key);await page.waitForTimeout(500);
      const p=await roomPosition();assert(p.x>=-115.01&&p.x<=315.35&&p.y>=17.99&&p.y<=312.01,"Cannot cross the outer boundary, either road or the closed rooms");
      if(key==="a")assert(p.x<0,"The new west lounge must be walkable");
    }
    const after = await page.evaluate(async (account) => (await (await fetch("/api/state", {headers:{"X-Pitlane-Account":account}})).json()).state, accounts.metamask.address);
    assert.deepEqual(after.profile,saved.profile,"Preview must not mutate profile or character");
    assert(commands.every(c=>["interiorMove","interiorStop"].includes(c.command?.type)),"Preview must not send selection/economy commands");
    page.off("request",record);
    await page.reload();await page.locator('[data-phase="playing"]').waitFor();
    assert.equal(await page.getByLabel("Preview character",{exact:true}).inputValue(),"");
    assert.equal(await page.getByLabel("Walk style",{exact:true}).inputValue(),"relaxed");
    assert.equal(await page.locator(".interior-canvas").getAttribute("data-render-mode"),`${character}-3d`);
  }

  if (process.argv.includes("--fleet-preview")) {
    const commands = [], record = r => { if(new URL(r.url()).pathname === "/api/command") commands.push(r.postDataJSON()); };
    page.on("request", record);
    const selector = page.getByLabel("Preview client car", { exact: true });
    assert.equal(await selector.locator("option").count(), 31);
    const before = await roomPosition();
    for (const id of ["city-sprint:standard", "nightline:upgraded", "vector:standard", "longtail:upgraded", "spire:upgraded"]) {
      await selector.selectOption(id);
      await page.waitForFunction(id => document.querySelector(".interior-canvas")?.dataset.fleetId === id, id);
      assert.equal(await page.locator("canvas").count(), 1);
    }
    const after = await roomPosition(); assert(Math.hypot(before.x-after.x,before.y-after.y)<2, "Car selection preserves player position");
    assert.equal(commands.length, 0, "Car preview sends no server mutations");
    await page.setViewportSize({width:390,height:844}); await viewportFits();
    const panelBox = await page.locator(".local-crew-controls").boundingBox(), trafficBox = await page.locator(".service-traffic-status").boundingBox();
    assert(trafficBox.y + trafficBox.height <= panelBox.y || trafficBox.x + trafficBox.width <= panelBox.x, "Traffic status must not overlap the mobile preview selector");
    await shot("20-fleet-preview-mobile");
    await page.setViewportSize({width:1672,height:941}); await shot("21-fleet-preview-desktop");
    await selector.selectOption("");
    await page.waitForFunction(()=>document.querySelector(".interior-canvas")?.dataset.fleetId === "rustback:standard");
    page.off("request", record);
  }
  if (process.argv.includes("--camera-controls")) {
    await page.getByRole("button", { name: "Camera", exact: true }).click();
    await page.getByRole("slider", { name: "Rotation", exact: true }).fill("90");
    await page.getByRole("slider", { name: "Zoom", exact: true }).fill("0.85");
    await page.getByRole("slider", { name: "Tilt", exact: true }).fill("48");
    await page.waitForTimeout(500);
    const beforeEdit = await roomPosition();
    await page.getByRole("slider", { name: "Tilt", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.down("w"); await page.waitForTimeout(650); await page.keyboard.up("w");
    const afterEdit = await roomPosition();
    assert(Math.hypot(afterEdit.x-beforeEdit.x,afterEdit.y-beforeEdit.y)<1,"Camera controls must not move the player");
    assert.equal(await page.getByRole("slider",{name:"Tilt",exact:true}).inputValue(),"49","Arrow keys must adjust the focused slider");
    await page.getByRole("checkbox", { name: "Follow player" }).uncheck();
    await page.getByRole("button", { name: "Copy settings", exact: true }).click();
    const copied = JSON.parse(await page.getByRole("textbox",{name:"Camera settings to share"}).inputValue());
    assert.equal(copied.yaw,90);assert.equal(copied.follow,false);assert.equal(copied.zoom,.85);
    const persisted=await page.evaluate(()=>JSON.parse(localStorage.getItem("pitlane.garageCamera.v1")));
    assert.deepEqual(copied,persisted,"The export must match the saved view");
    await shot("18-camera-settings-desktop");
    for(const [width,height] of [[390,844],[320,568],[844,390]]) {
      await page.setViewportSize({width,height}); await viewportFits();
      const b=await page.locator(".garage-camera-panel").boundingBox();
      assert(b.x>=0 && b.y>=0 && b.x+b.width<=width+.5 && b.y+b.height<=height+.5,"Camera panel must fit the viewport");
      if(width===390)await shot("19-camera-settings-mobile");
    }
    await page.setViewportSize({width:1672,height:941});
    await page.getByRole("button",{name:"Close camera settings"}).click();await page.waitForTimeout(600);
    const beforeRotatedMove=await roomPosition();
    await page.keyboard.down("w");await page.waitForTimeout(900);await page.keyboard.up("w");await page.waitForTimeout(900);
    const rotated=await roomPosition();
    assert(rotated.x<beforeRotatedMove.x-25 && Math.abs(rotated.y-beforeRotatedMove.y)<2,"W must point screen-up after a 90 degree camera rotation");
    assert(Math.hypot(rotated.cx-beforeRotatedMove.cx,rotated.cy-beforeRotatedMove.cy)<1,"Camera anchor stays fixed when follow is off");
    await page.reload();await page.locator('[data-phase="playing"]').waitFor();
    await page.waitForFunction(()=>document.querySelector(".interior-canvas")?.dataset.cameraRotation==="90");
    assert.equal(await page.locator(".interior-canvas").getAttribute("data-camera-follow"),"false");
    assert.equal(await page.locator(".interior-canvas").getAttribute("data-front-wall"),"open-service-post");
    await page.getByRole("button",{name:"Camera",exact:true}).click();
    await page.getByRole("button",{name:"Reset view",exact:true}).click();
    assert.equal(await page.getByRole("slider",{name:"Rotation",exact:true}).inputValue(),"14");
    assert(await page.getByRole("checkbox",{name:"Follow player"}).isChecked());
    await page.getByRole("button",{name:"Close camera settings"}).click();
  }
  const beforeClick = await roomPosition();
  await page.mouse.click(1100, 600);
  await page.waitForTimeout(600);
  const afterClick = await roomPosition();
  assert.ok(
    Math.hypot(afterClick.x - beforeClick.x, afterClick.y - beforeClick.y) < 2,
    "Floor clicks cannot move the player",
  );
  await page.reload();
  await page.locator('[data-phase="playing"]').waitFor();
  assert.match(
    await page.locator(".interior-hud").getAttribute("data-wallet"),
    new RegExp(accounts.metamask.address.slice(0, 8), "i"),
  );
  const restored = await roomPosition();
  assert.ok(
    Math.hypot(restored.x - beforeClick.x, restored.y - beforeClick.y) < 2,
    "Server position survives reload",
  );
  assert.ok(
    methods
      .filter((m) => m.method === "personal_sign")
      .every((m) => m.id === "metamask"),
  );
  assert.ok(
    methods.every((m) =>
      [
        "eth_accounts",
        "eth_requestAccounts",
        "eth_chainId",
        "personal_sign",
      ].includes(m.method),
    ),
  );
  await page.evaluate(() => window.entryTestChange());
  await gate();
  assert.equal(
    await page.locator("canvas").count(),
    0,
    "Network change must close the previous garage",
  );
  assert.equal(
    await page.getByRole("button", { name: "Choose Gus", exact: true }).count(),
    0,
  );
  await viewportFits();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    window.reducedEntryPhases = [];
    new MutationObserver(() => {
      const phase = document.querySelector(".play-root")?.dataset.phase;
      if (phase && window.reducedEntryPhases.at(-1) !== phase)
        window.reducedEntryPhases.push(phase);
    }).observe(document, { subtree: true, attributes: true, childList: true });
  });
  await page.reload();
  await page.locator('[data-phase="playing"]').waitFor();
  assert.equal(
    (await page.evaluate(() => window.reducedEntryPhases)).includes("zooming"),
    false,
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await gate();
  assert.equal(await page.locator("canvas").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "Play entry passed: failed-asset retry; six viewport sizes without document scroll; no simulation before SIWE/selection; selected EIP-6963 provider, cancellation retry, real local SIWE, transition/black pause, one canvas, restored identity and network-change recovery. Simulated providers, not an external-wallet round trip.",
  );
} catch (error) {
  await shot("failure");
  console.error(await page.getByRole("alert").allTextContents());
  throw error;
} finally {
  await browser.close();
}
