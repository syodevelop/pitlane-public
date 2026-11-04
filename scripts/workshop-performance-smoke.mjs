import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const origin = process.env.PITLANE_ORIGIN || "http://127.0.0.1:5173",
  out = "docs/qa/workshop-2026-11-02";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const stage = page.locator(".workshop-stage"),
  data = () => stage.evaluate((e) => ({ ...e.dataset }));
const pressed = new Set();
async function keys(next) {
  for (const k of pressed)
    if (!next.includes(k)) {
      await page.keyboard.up(k);
      pressed.delete(k);
    }
  for (const k of next)
    if (!pressed.has(k)) {
      await page.keyboard.down(k);
      pressed.add(k);
    }
}
async function walk(x, z) {
  await stage.focus();
  const end = Date.now() + 22000;
  while (Date.now() < end) {
    const d = await data(),
      dx = x - Number(d.x),
      dz = z - Number(d.z);
    if (Math.hypot(dx, dz) < 0.21) {
      await keys([]);
      await page.waitForTimeout(300);
      return;
    }
    const a = (14 * Math.PI) / 180,
      vx = dx * Math.cos(a) - dz * Math.sin(a),
      vy = dx * Math.sin(a) + dz * Math.cos(a),
      next = [];
    if (Math.abs(vx) > Math.max(0.12, Math.abs(vy) * 0.45))
      next.push(vx > 0 ? "d" : "a");
    if (Math.abs(vy) > Math.max(0.12, Math.abs(vx) * 0.45))
      next.push(vy > 0 ? "s" : "w");
    await keys(next);
    await page.waitForTimeout(75);
  }
  await keys([]);
  throw Error(
    "walk timeout " + JSON.stringify({ target: { x, z }, at: await data() }),
  );
}
try {
  await page.addInitScript(() => {
    if (!localStorage.getItem("pitlane.workshop.v1"))
      localStorage.setItem(
        "pitlane.workshop.v1",
        JSON.stringify({
          version: 1,
          character: "dash",
          position: { x: 18.45, z: 8.25 },
          credits: 1000,
          serviced: 18,
          tools: 1,
          carried: null,
          collectProgress: 0,
          order: { number: 7, kind: "repair", status: "service", progress: {} },
          reward: null,
          milestoneSeen: true,
          team: {
            unlocked: true,
            progress: {
              "team-front-left": 1,
              "team-front-right": 1,
              "team-engine": 1,
            },
          },
          racing: {
            upgrades: { engine: 0, grip: 0, reliability: 0 },
            phase: "idle",
            preparation: 1,
            elapsed: 0,
            starts: 3,
            completed: 3,
            rep: 6,
            bestScore: 40,
            run: null,
            lastResult: null,
          },
          mechanic: {
            hired: true,
            enabled: true,
            position: { x: -0.9, z: 8.5 },
            carried: null,
            collectProgress: 0,
            phase: "idle",
            target: null,
            finished: 0,
            earnings: 0,
          },
        }),
      );
  });
  await page.goto(origin + "/play");
  await page.locator(".workshop-hud").waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "Open team desk" }).click();
  await page.getByRole("button", { name: "Enter Coastal Sprint" }).click();
  await walk(18.45, 6.8);
  await walk(20.15, 6.8);
  await page.screenshot({ path: out + "/performance-locked.png" });
  const credits = Number((await data()).credits);
  await page.getByRole("button", { name: "Open Performance Shop" }).click();
  expect(Number((await data()).credits)).toBe(credits - 600);
  await walk(23.4, 6.8);
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector(".workshop-stage").dataset.performance)
        .status === "service",
    null,
    { timeout: 35000 },
  );
  await page.screenshot({ path: out + "/performance-open.png" });
  let p = JSON.parse((await data()).performancePoint);
  await walk(23.4, p.z);
  await walk(p.x, p.z);
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector(".workshop-stage").dataset.performance)
        .progress.diagnose > 0.2,
  );
  await page.screenshot({ path: out + "/performance-diagnose.png" });
  await page.getByRole("button", { name: "Pause and settings" }).click();
  const frozen = (await data()).performance;
  await page.waitForTimeout(700);
  expect((await data()).performance).toBe(frozen);
  await page.getByRole("button", { name: "Back to work" }).click();
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector(".workshop-stage").dataset.performance)
        .progress.diagnose === 1,
  );
  await walk(23.5, 8.9);
  await walk(29.35, 8.9);
  await walk(29.35, 6.5);
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector(".workshop-stage").dataset.performance)
        .progress.bench > 0.2,
  );
  await page.screenshot({ path: out + "/performance-bench.png" });
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector(".workshop-stage").dataset.performance)
        .carried === true,
  );
  await walk(29.35, 8.9);
  await page.screenshot({ path: out + "/performance-carry.png" });
  await page.reload();
  await page.locator(".workshop-hud").waitFor({ timeout: 60000 });
  expect(JSON.parse((await data()).performance).carried).toBe(true);
  await walk(29.35, 8.9);
  await walk(23.5, 8.9);
  p = JSON.parse((await data()).performancePoint);
  await walk(23.5, p.z);
  await walk(p.x, p.z);
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector(".workshop-stage").dataset.performance)
        .progress.install > 0.2,
  );
  await page.screenshot({ path: out + "/performance-install.png" });
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector(".workshop-stage").dataset.performance)
        .status === "complete",
  );
  await page.reload();
  await page.locator(".workshop-hud").waitFor({ timeout: 60000 });
  expect(JSON.parse((await data()).performance).reward).toBe(true);
  const before = Number((await data()).credits),
    earnings = JSON.parse((await data()).mechanic).earnings;
  await walk(23.7, 8.6);
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector(".workshop-stage").dataset.performance)
        .reward === false,
  );
  const d = await data();
  expect(
    Number(d.credits) - before - (JSON.parse(d.mechanic).earnings - earnings),
  ).toBe(160);
  expect(Number(d.raceRep)).toBe(7);
  expect(JSON.parse(d.mechanic).finished).toBeGreaterThan(0);
  await page.screenshot({ path: out + "/performance-paid.png" });
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector(".workshop-stage").dataset.performance)
        .number === 2,
    null,
    { timeout: 40000 },
  );
  await walk(23.4, 6.8);
  await walk(20.15, 6.8);
  await expect(stage).toHaveAttribute("data-character", "dash");
  await expect(stage).toHaveAttribute("data-race-phase", "result", {
    timeout: 60000,
  });
  await page.getByRole("button", { name: "Open race report" }).click();
  await page.getByRole("button", { name: "Collect 70 Credits" }).click();
  await expect(stage).toHaveAttribute("data-race-rep", "9");
  expect(errors).toEqual([]);
  await fs.writeFile(
    out + "/performance.json",
    JSON.stringify(
      {
        passed: true,
        unlock: true,
        realDoor: true,
        diagnoseBenchCarryInstall: true,
        partialPause: true,
        carriedReload: true,
        rewardReload: true,
        onePayment: true,
        parallelMechanic: true,
        parallelRace: true,
        nextCustomer: true,
        errors,
      },
      null,
      2,
    ),
  );
  console.log("PASS performance full loop, mechanic, race, pause and reload.");
} catch (error) {
  await page
    .screenshot({ path: out + "/performance-failure.png" })
    .catch(() => {});
  console.log("FAIL STATE", await data().catch(() => null));
  throw new Error(error.message.split("Call log:")[0]);
} finally {
  await keys([]).catch(() => {});
  await browser.close();
}
