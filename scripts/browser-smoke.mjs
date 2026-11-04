import { chromium } from "@playwright/test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { SERVICES } from "../packages/game-core/catalog.ts";
const development = process.argv.includes("--development");
const character =
  process.argv.find((a) => a.startsWith("--character="))?.split("=")[1] ||
  "Gus";
assert.ok(["Gus", "Dash", "Juno"].includes(character));
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage(),
  errors = [];
page.setDefaultTimeout(20000);
page.on("pageerror", (e) => errors.push(e.message));
if (process.argv.includes("--loop") || development) {
  // Test-only observer installed in the served module, never in the product build.
  await page.route("**/src/Garage.tsx*", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({
      response,
      body:
        body +
        `\nconst reviewBoot=Phaser.Game.prototype.boot;Phaser.Game.prototype.boot=function(){window.__pitlaneReviewGame=this;return reviewBoot.call(this)};`,
    });
  });
}
await fs.mkdir("test-results", { recursive: true });
try {
  for (const path of ["/", "/docs", "/play"]) {
    await page.goto("http://127.0.0.1:5173" + path);
    await page.locator("main h1").waitFor();
    assert.equal(
      await page
        .locator("header nav")
        .innerText()
        .then((s) => s.replace(/\s+/g, " ")),
      "Home Docs Whitelist X Play ↗",
    );
  }
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "No browser wallet" })
    .waitFor();
  await page.goto("http://127.0.0.1:5173/");
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/docs", "/play"]) {
    await page.goto("http://127.0.0.1:5173" + path);
    await page.locator("main h1").waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `Mobile overflow ${path}`,
    );
  }
  await page.screenshot({
    path: "test-results/gate-mobile.png",
    fullPage: true,
  });
  // Real local SIWE verification with an ephemeral in-memory EOA; provider UI is simulated.
  const account = privateKeyToAccount(generatePrivateKey());
  let cancel = true;
  await page.exposeFunction("testWalletRequest", async ({ method, params }) => {
    if (method === "eth_requestAccounts" || method === "eth_accounts")
      return [account.address];
    if (method === "eth_chainId") return "0x1237";
    if (method === "personal_sign") {
      if (cancel) {
        cancel = false;
        throw new Error("Signature cancelled.");
      }
      return account.signMessage({ message: { raw: params[0] } });
    }
    throw new Error("Unsupported test wallet method");
  });
  await page.addInitScript(() => {
    window.ethereum = {
      request: (args) => window.testWalletRequest(args),
      on() {},
      removeListener() {},
    };
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page.getByRole("button", { name: "Sign in to Pitlane" }).click();
  await page.getByRole("alert").filter({ hasText: "cancelled" }).waitFor();
  await page.waitForTimeout(2100);
  await page.getByRole("button", { name: "Sign in to Pitlane" }).click();
  await page.getByRole("button", { name: `Choose ${character}` }).waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/selection-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/selection-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: `Choose ${character}` }).click();
  await page
    .getByRole("button", { name: `Confirm ${character}`, exact: true })
    .click();
  await page.locator("canvas").waitFor();
  assert.equal(
    await page.evaluate(
      async () =>
        (await (await fetch("/api/state")).json()).state.profile.character,
    ),
    character,
  );
  if (development) {
    // Ephemeral unfunded test profile only. Preserve its login cookie for local
    // recovery after a preview failure; never write the in-memory signing key.
    // This file is a session credential, stays ignored, and is removed on success.
    await context.storageState({
      path: "test-results/development-session.json",
    });
  }
  await page.getByRole("button", { name: "Free stock", exact: true }).click();
  await page
    .getByRole("button", { name: "Collect parts", exact: true })
    .waitFor({ timeout: 10000 });
  let loseResponse = true;
  await page.route("**/api/command", async (route) => {
    if (loseResponse) {
      loseResponse = false;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Collect parts", exact: true })
    .click();
  await page.getByRole("button", { name: "Retry saved request" }).waitFor();
  await page.reload(); // session and finite task survive reload
  await page.getByRole("button", { name: "Retry saved request" }).waitFor();
  await page.getByRole("button", { name: "Retry saved request" }).click();
  await page
    .getByRole("button", { name: "Retry saved request" })
    .waitFor({ state: "detached" });
  await page.waitForFunction(async () => {
    const response = await fetch("/api/state");
    const { state } = await response.json();
    return (
      state.progress.actors.player.taskId ||
      state.progress.actors.player.carrying === 2
    );
  });
  await page.locator("canvas").waitFor();
  await page.screenshot({
    path: "test-results/garage-mobile.png",
    fullPage: true,
  });
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll("main *")]
      .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
      .map((el) => ({
        tag: el.tagName,
        class: el.className,
        width: el.getBoundingClientRect().width,
      })),
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "Mobile garage overflow: " + JSON.stringify(overflow),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/garage-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Leaderboard", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.waitForFunction(
    () => document.activeElement?.textContent?.trim() === "Leaderboard",
  );
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Close", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => document.activeElement?.textContent?.trim() === "Leaderboard",
  );
  if (process.argv.includes("--navigation")) {
    await page
      .getByRole("button", { name: "Collect parts", exact: true })
      .waitFor({ timeout: 20000 });
    const stations = {
      stock: ["Free stock", 95, 100],
      tires: ["Tires", 280, 100],
      quick: ["Quick service", 470, 100],
      engine: ["Engine work", 660, 100],
      starter: ["Team preparation", 280, 350],
      race: ["Circuit desk", 660, 350],
      reception: ["Reception", 95, 350],
    };
    async function walk(station, expectDetour = false) {
      const [name, x, y] = stations[station];
      const before = await page.evaluate(
        async () => (await (await fetch("/api/state")).json()).state,
      );
      if (
        before.progress.actors.player.position.x === x &&
        before.progress.actors.player.position.y === y &&
        !before.progress.actors.player.travel
      )
        return;
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/command") &&
          r.request().postDataJSON().command.type === "navigate",
      );
      await page.getByRole("button", { name, exact: true }).click();
      const reply = await response;
      assert.equal(reply.status(), 200, await reply.text());
      const { state } = await reply.json();
      if (expectDetour)
        assert.ok(
          state.progress.actors.player.travel.via?.length,
          "Server must route around the bench",
        );
      await page.waitForFunction(
        async ({ x, y }) => {
          const { state } = await (await fetch("/api/state")).json();
          const a = state.progress.actors.player;
          return !a.travel && a.position.x === x && a.position.y === y;
        },
        { x, y },
        { timeout: 20000, polling: 500 },
      );
      await page.waitForFunction(
        () =>
          !document
            .querySelector(".work-order")
            ?.textContent.includes("Walking to the station"),
      );
    }
    const pairs = [
      ["stock", "race"],
      ["tires", "race"],
      ["quick", "starter"],
      ["engine", "starter"],
      ["engine", "reception"],
    ];
    for (const [index, [from, to]] of pairs.entries()) {
      await page.setViewportSize(
        index < 3 ? { width: 1440, height: 1000 } : { width: 390, height: 844 },
      );
      await walk(from);
      await walk(to, true);
      await walk(from, true);
      console.log(
        `Navigation: ${from} <-> ${to} completed via the server route.`,
      );
    }
    await page
      .locator(".garage-visual")
      .screenshot({ path: "test-results/navigation-mobile.png" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .locator(".garage-visual")
      .screenshot({ path: "test-results/navigation-desktop.png" });
    const final = await page.evaluate(
      async () => (await (await fetch("/api/state")).json()).state,
    );
    assert.equal(final.progress.rep, 0);
    assert.equal(final.progress.credits, 0);
    assert.equal(final.progress.actors.player.carrying, 2);
    console.log(
      "Navigation passed: all ten previously blocked directions, desktop/mobile station controls, no teleport/resource grants.",
    );
  }
  if (
    process.argv.includes("--pilot") ||
    process.argv.includes("--loop") ||
    development
  ) {
    const commandRequests = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/api/command"))
        commandRequests.push(request.postDataJSON());
    });
    await page
      .getByRole("button", { name: "Collect parts", exact: true })
      .waitFor({ timeout: 20000 });
    // Exercise screen-oriented WASD on the real server, not a frame-only fixture.
    const moved = page.waitForResponse(
      (r) => r.url().endsWith("/api/command") && r.status() === 200,
    );
    await page.keyboard.down("d");
    await moved;
    await page.screenshot({
      path: "test-results/pilot-walking-desktop.png",
      fullPage: true,
    });
    await page.keyboard.up("d");
    await page.waitForTimeout(800);
    await page
      .getByRole("button", { name: "Leaderboard", exact: true })
      .click();
    const beforeModal = commandRequests.length;
    await page.keyboard.down("d");
    await page.waitForTimeout(600);
    await page.keyboard.up("d");
    await page.screenshot({
      path: "test-results/pilot-panel-desktop.png",
      fullPage: true,
    });
    assert.equal(
      commandRequests.length,
      beforeModal,
      "Open panel must suspend game controls",
    );
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    const joystick = page.getByRole("group", { name: "Virtual joystick" });
    await joystick.scrollIntoViewIfNeeded();
    const rect = await joystick.boundingBox();
    const joystickMove = page.waitForResponse(
      (r) => r.url().endsWith("/api/command") && r.status() === 200,
    );
    await page.mouse.move(
      rect.x + rect.width / 2 + 20,
      rect.y + rect.height / 2 + 12,
    );
    await page.mouse.down();
    await joystickMove;
    await page.mouse.up();
    await page.waitForTimeout(700);
    const afterRelease = commandRequests.length;
    await page.waitForTimeout(700);
    assert.equal(
      commandRequests.length,
      afterRelease,
      "Released joystick must stop issuing movement",
    );
    await page.getByRole("button", { name: "Reception", exact: true }).click();
    await page
      .getByRole("button", { name: "Accept Tires", exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: "Tires", exact: true }).click();
    await page
      .getByRole("button", { name: "Put down parts", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Start Tires", exact: true })
      .waitFor({ timeout: 10000 });
    await page
      .getByRole("button", { name: "Start Tires", exact: true })
      .click();
    await page.getByText("WORK IN PROGRESS", { exact: true }).waitFor();
    await page
      .locator(".garage-visual")
      .screenshot({ path: "test-results/pilot-service-mobile.png" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForFunction(() => {
      const canvas = document.querySelector("canvas");
      const rect = canvas.getBoundingClientRect();
      return (
        canvas.width === 1100 &&
        Math.abs(rect.width / rect.height - 1100 / 650) < 0.01
      );
    });
    await page
      .locator(".garage-visual")
      .screenshot({ path: "test-results/pilot-service-desktop.png" });
    console.log(
      "Pilot service started; waiting for the real finite server task to finish once.",
    );
    await page
      .getByText("Tires complete: +80 Credits / +10 REP.", { exact: true })
      .waitFor({ timeout: 70000 });
    const hud = page.getByLabel("Live garage resources");
    assert.match(await hud.innerText(), /Credits\s*80/);
    assert.match(await hud.innerText(), /REP\s*10/);
    await page
      .locator(".garage-feedback")
      .getByText("Tires complete · +80 Credits · +10 REP", { exact: true })
      .waitFor();
    await page.waitForTimeout(220);
    await page
      .locator(".garage-visual")
      .screenshot({ path: "test-results/pilot-completion-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(
      () => document.querySelector("canvas")?.width === 550,
    );
    await page
      .locator(".garage-visual")
      .screenshot({ path: "test-results/pilot-completion-mobile.png" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    assert.equal(await page.locator("canvas").count(), 1);
    console.log(
      "Pilot checks passed: WASD, joystick release, modal input suspension, viewport aspect ratio, real Tires completion, server-event feedback and live HUD.",
    );
  }
  if (process.argv.includes("--loop") || development) {
    const button = (name) => page.getByRole("button", { name, exact: true });
    const snapshot = () =>
      page.evaluate(
        async () => (await (await fetch("/api/state")).json()).state,
      );
    async function waitUntil(predicate, timeout = 120000) {
      const deadline = Date.now() + timeout;
      do {
        if (predicate(await snapshot())) return;
        await page.waitForTimeout(1000);
      } while (Date.now() < deadline);
      throw new Error("Timed out waiting for authoritative garage state");
    }
    async function collect() {
      await button("Free stock").click();
      await button("Collect parts").click();
      await waitUntil(
        (g) =>
          !g.progress.actors.player.taskId &&
          g.progress.actors.player.carrying > 0,
        20000,
      );
    }
    await collect();
    await button("Team preparation").click();
    await button("Put down parts").click();
    await button("Restore Rustback").click();
    console.log(
      "Loop: restoration started; keeping the original server duration.",
    );
    // Reload must preserve the originally started restoration and its server schedule.
    await page.reload();
    await waitUntil((g) =>
      Object.values(g.progress.cars).some(
        (c) => c.source === "starter" && c.restored,
      ),
    );
    const restored = await snapshot();
    assert.equal(
      restored.progress.rep,
      10,
      "Restoration must not duplicate work REP",
    );
    await collect();
    await button("Team preparation").click();
    await button("Put down parts").click();
    await button("Prepare Sprint").click();
    console.log("Loop: Sprint preparation started.");
    await waitUntil((g) =>
      Object.values(g.progress.cars).some((c) => c.prepared === "sprint"),
    );
    await page
      .locator(".garage-visual")
      .screenshot({ path: "test-results/pilot-restored-desktop.png" });
    await button("Circuit desk").click();
    await button("Dispatch tutorial race · 45s").click();
    await waitUntil(
      (g) =>
        Object.values(g.progress.races).some((r) => r.status === "started"),
      10000,
    );
    const monitor = page.getByRole("region", { name: "Circuit monitor" });
    await page.waitForFunction(
      () =>
        window.__pitlaneReviewGame?.scene.getScenes()[0]?.traffic?.flights
          .size === 1,
    );
    await page
      .locator(".garage-visual")
      .screenshot({ path: "test-results/traffic-live-depart-desktop.png" });
    const returnEvidence = (async () => {
      await page.waitForFunction(
        () =>
          [
            ...(window.__pitlaneReviewGame?.scene
              .getScenes()[0]
              ?.traffic?.flights.values() || []),
          ].some((f) => f.direction === "return" && f.segment === 3),
        null,
        { timeout: 75000 },
      );
      await page
        .locator(".garage-visual")
        .screenshot({ path: "test-results/traffic-live-return.png" });
      return null;
    })().catch((error) => error);
    await monitor.waitFor();
    const marker = monitor.locator("[data-race-marker]");
    const firstPosition = await marker.getAttribute("transform");
    await page.waitForTimeout(300);
    assert.notEqual(await marker.getAttribute("transform"), firstPosition);
    await button("Pause animation").click();
    const pausedPosition = await marker.getAttribute("transform");
    await page.waitForTimeout(300);
    assert.equal(await marker.getAttribute("transform"), pausedPosition);
    await button("Resume animation").click();
    await monitor.screenshot({ path: "test-results/race-active-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await monitor.screenshot({ path: "test-results/race-active-mobile.png" });
    await page
      .locator(".garage-visual")
      .screenshot({ path: "test-results/traffic-live-depart-mobile.png" });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await button("Reception").click();
    await button("Accept Quick Service").first().click();
    await collect();
    await button("Quick service").click();
    await button("Put down parts").click();
    await button("Start Quick Service").click();
    const concurrent = await snapshot();
    assert.ok(
      Object.values(concurrent.progress.races).some(
        (r) => r.status === "started",
      ),
      "Garage service must run while the owned car races",
    );
    assert.ok(concurrent.progress.actors.player.taskId);
    await waitUntil(
      (g) => g.progress.tutorial.training && !g.progress.actors.player.taskId,
    );
    const partial = await snapshot();
    assert.equal(
      partial.progress.completed.quick,
      0,
      "First step alone must not earn full order rewards",
    );
    assert.equal(partial.progress.rep, 30);
    await button("Start Quick Service").click();
    await waitUntil((g) => g.progress.completed.quick === 1, 30000);
    const finished = await snapshot();
    const trafficError = await returnEvidence;
    if (trafficError) throw trafficError;
    await page.waitForFunction(() => {
      const s = window.__pitlaneReviewGame?.scene.getScenes()[0];
      return s?.traffic?.flights.size === 0 && s.starter.root.visible;
    });
    assert.equal(finished.progress.credits, 300);
    assert.equal(finished.progress.rep, 45);
    assert.equal(
      Object.values(finished.progress.races).filter(
        (r) => r.status === "completed",
      ).length,
      1,
    );
    await page
      .getByText("Quick Service complete: +120 Credits / +15 REP.", {
        exact: true,
      })
      .waitFor();
    const completedHud = page.getByLabel("Live garage resources");
    assert.match(await completedHud.innerText(), /Credits\s*300/);
    assert.match(await completedHud.innerText(), /REP\s*45/);
    await page
      .getByRole("heading", { name: "Race result", exact: true })
      .waitFor();
    await page.screenshot({
      path: "test-results/pilot-loop-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/pilot-loop-mobile.png",
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.reload();
    await page.locator("canvas").waitFor();
    assert.equal(
      (await snapshot()).progress.rep,
      45,
      "Reconnect must not settle the race twice",
    );
    console.log(
      "Full loop passed: physical restoration, reload preservation, Sprint preparation, tutorial race concurrent with two-step Quick Service, exact 300 Credits / 45 REP, race result, mobile layout and settle-once reconnect.",
    );
    if (development) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      const stationLabels = {
        tires: "Tires",
        quick: "Quick service",
        engine: "Engine work",
      };
      async function acceptNext() {
        await page.getByLabel("Controlled worker").selectOption("player");
        await button("Reception").click();
        let offered = Object.values((await snapshot()).progress.jobs).filter(
          (j) => j.status === "offered",
        );
        if (!offered.length) {
          await button("Invite next customers").click();
          await waitUntil(
            (g) =>
              Object.values(g.progress.jobs).some(
                (j) => j.status === "offered",
              ),
            10000,
          );
          offered = Object.values((await snapshot()).progress.jobs).filter(
            (j) => j.status === "offered",
          );
        }
        offered.sort(
          (a, b) =>
            ["tires", "quick", "engine"].indexOf(a.kind) -
            ["tires", "quick", "engine"].indexOf(b.kind),
        );
        assert.ok(
          offered.length,
          "Inviting customers must provide the next balanced pack",
        );
        const job = offered[0];
        await button("Accept " + SERVICES[job.kind].label)
          .first()
          .click();
        await waitUntil(
          (g) => g.progress.jobs[job.id].status === "accepted",
          10000,
        );
        return job;
      }
      async function startStep(job, actorId) {
        const current = (await snapshot()).progress.jobs[job.id];
        const step = SERVICES[job.kind].steps[current.step];
        console.log(
          `Development: ${job.id} step ${current.step + 1} at ${step.station}, actor ${actorId}.`,
        );
        await page.getByLabel("Controlled worker").selectOption(actorId);
        let g = await snapshot();
        if (g.progress.stock[step.station] < step.parts) {
          if (!g.progress.actors[actorId].carrying) {
            await button("Free stock").click();
            await button("Collect parts").click();
            await waitUntil(
              (s) =>
                !s.progress.actors[actorId].taskId &&
                s.progress.actors[actorId].carrying > 0,
              20000,
            );
          }
          await button(stationLabels[step.station]).click();
          await button("Put down parts").click();
        } else await button(stationLabels[step.station]).click();
        await button("Start " + SERVICES[job.kind].label).click();
        await waitUntil((s) => !!s.progress.actors[actorId].taskId, 10000);
      }
      async function finishJob(job, actorId) {
        while (
          (await snapshot()).progress.jobs[job.id].status !== "completed"
        ) {
          await startStep(job, actorId);
          await waitUntil((g) => !g.progress.actors[actorId].taskId, 150000);
        }
        console.log(
          "Development: completed " +
            SERVICES[job.kind].label +
            "; " +
            (await snapshot()).progress.credits +
            " earned Credits available.",
        );
      }
      while ((await snapshot()).progress.credits < 900) {
        await finishJob(await acceptNext(), "player");
      }
      await button("Reception").click();
      const beforeInvestment = await snapshot();
      await button("Hire Mechanic · 500 Credits").click();
      await waitUntil(
        (g) =>
          Object.values(g.progress.actors).some((a) => a.role === "Mechanic"),
        10000,
      );
      const helper = Object.values((await snapshot()).progress.actors).find(
        (a) => a.role === "Mechanic",
      );
      await button("Upgrade · 400 Credits").click();
      await waitUntil((g) => g.progress.upgrades.quickTools === 1, 10000);
      const invested = await snapshot();
      assert.equal(
        invested.progress.credits,
        beforeInvestment.progress.credits - 900,
      );
      assert.equal(
        invested.progress.rep,
        beforeInvestment.progress.rep,
        "Spending or hiring must not mint REP",
      );
      assert.equal(
        await button("Hire Runner · 500 Credits").isDisabled(),
        true,
      );
      const helperJob = await acceptNext();
      await startStep(helperJob, helper.id);
      const assigned = await snapshot();
      const task =
        assigned.progress.tasks[assigned.progress.actors[helper.id].taskId];
      const step = SERVICES[helperJob.kind].steps[0];
      assert.equal(
        task.endsAt - task.startsAt,
        Math.ceil(
          (step.duration * 1000) / (step.station === "engine" ? 1000 : 1100),
        ),
        "Helper must use tools but not Gus's personal modifier",
      );
      await page.getByLabel("Controlled worker").selectOption("player");
      // If hands are full, put parts down at the available preparation stock first.
      if ((await snapshot()).progress.actors.player.carrying) {
        await button("Team preparation").click();
        await button("Put down parts").click();
      }
      await button("Free stock").click();
      await button("Collect parts").click();
      await waitUntil(
        (g) =>
          !!g.progress.actors.player.taskId &&
          !!g.progress.actors[helper.id].taskId,
        10000,
      );
      const concurrentStaff = await snapshot();
      assert.ok(concurrentStaff.progress.actors.player.taskId);
      assert.equal(concurrentStaff.progress.actors[helper.id].taskId, task.id);
      await page.screenshot({
        path: "test-results/development-desktop.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({
        path: "test-results/development-mobile.png",
        fullPage: true,
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await waitUntil((g) => !g.progress.actors[helper.id].taskId, 150000);
      if ((await snapshot()).progress.jobs[helperJob.id].status !== "completed")
        await finishJob(helperJob, helper.id);
      const afterHelper = await snapshot();
      assert.equal(
        afterHelper.progress.rep,
        invested.progress.rep + SERVICES[helperJob.kind].rep,
      );
      assert.equal(
        afterHelper.progress.credits,
        invested.progress.credits + SERVICES[helperJob.kind].credits,
      );
      await page.reload();
      await page.getByLabel("Controlled worker").waitFor();
      const reloaded = await snapshot();
      assert.equal(reloaded.progress.credits, afterHelper.progress.credits);
      assert.equal(reloaded.progress.rep, afterHelper.progress.rep);
      assert.equal(reloaded.progress.upgrades.quickTools, 1);
      assert.ok(reloaded.progress.actors[helper.id]);
      await fs.writeFile(
        "test-results/development-result.json",
        JSON.stringify(
          {
            credits: reloaded.progress.credits,
            rep: reloaded.progress.rep,
            completed: reloaded.progress.completed,
            upgrades: reloaded.progress.upgrades,
            staff: Object.values(reloaded.progress.actors).map((a) => ({
              role: a.role,
              level: a.level,
            })),
            checks: [
              "earned-funds",
              "manual-next-pack",
              "hire",
              "tools-without-REP",
              "helper-rate",
              "concurrent-work",
              "settle-once",
              "reload",
            ],
          },
          null,
          2,
        ),
      );
      console.log(
        "Development passed: earned funds, Mechanic hire, tools purchase without REP, correct helper rate, concurrent player/helper work, one-time rewards and reload persistence.",
      );
    }
  }
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  if (development)
    await fs.unlink("test-results/development-session.json").catch(() => {});
  console.log(
    "Browser smoke passed: four routes, no-wallet/cancel recovery, signed local login, character selection, Phaser scene, stock work, lost-response retry across reload, leaderboard panel, signout; 390px layouts without overflow. Simulated provider, not external wallet proof.",
  );
} catch (error) {
  await page
    .screenshot({ path: "test-results/browser-failure.png", fullPage: true })
    .catch(() => {});
  const diagnostic = await page
    .evaluate(async () => {
      const response = await fetch("/api/state");
      const body = await response.json();
      return {
        progress: body.state?.progress,
        text: document.querySelector("main")?.innerText,
      };
    })
    .catch(() => null);
  await fs.writeFile(
    "test-results/browser-failure.json",
    JSON.stringify(diagnostic, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
