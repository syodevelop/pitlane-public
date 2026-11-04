import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const origin = process.env.PITLANE_ORIGIN || "http://127.0.0.1:5173",
  out = "docs/qa/workshop-2026-11-01";
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
    if (Math.abs(vx) > 0.12) next.push(vx > 0 ? "d" : "a");
    if (Math.abs(vy) > 0.12) next.push(vy > 0 ? "s" : "w");
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
          credits: 700,
          serviced: 10,
          tools: 1,
          carried: null,
          collectProgress: 0,
          order: { number: 6, kind: "tires", status: "service", progress: {} },
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
            starts: 1,
            completed: 1,
            rep: 2,
            bestScore: 40,
            run: null,
            lastResult: null,
          },
        }),
      );
  });
  await page.goto(origin + "/play");
  await page.locator(".workshop-hud").waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "Open team desk" }).click();
  await page.getByRole("button", { name: "Crew", exact: true }).click();
  await page.route("**/models/gus-v5.glb", (route) => route.abort());
  await page.getByRole("button", { name: "Hire mechanic" }).click();
  await expect(page.getByRole("alert")).toContainText("were not charged");
  await expect(stage).toHaveAttribute("data-credits", "700");
  await page.unroute("**/models/gus-v5.glb");
  await page.getByRole("button", { name: "Hire mechanic" }).click();
  await expect(page.getByRole("button", { name: "Send on break" })).toBeVisible(
    { timeout: 20000 },
  );
  await expect(stage).toHaveAttribute("data-credits", "400");
  await page.screenshot({ path: out + "/mechanic-hired.png" });
  await page.getByRole("button", { name: "Rustback & racing" }).click();
  await page.getByRole("button", { name: "Enter Coastal Sprint" }).click();
  await walk(18.45, 9.2);
  await walk(13.3, 9.2);
  await walk(13.3, 7.8);
  await walk(9.3, 7.8);
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector(".workshop-stage").dataset.mechanic)
        .carried === "wheel",
    null,
    { timeout: 25000 },
  );
  await page.screenshot({ path: out + "/mechanic-carrying.png" });
  await page.reload();
  await page.locator(".workshop-hud").waitFor({ timeout: 60000 });
  expect(JSON.parse((await data()).mechanic).hired).toBe(true);
  await expect(stage).toHaveAttribute("data-character", "dash");
  await page.waitForFunction(
    () =>
      Number(
        JSON.parse(localStorage.getItem("pitlane.workshop.v1")).order.progress[
          "wheel-left"
        ] || 0,
      ) > 0.2,
    null,
    { timeout: 30000 },
  );
  await page.screenshot({ path: out + "/mechanic-fitting.png" });
  await page.getByRole("button", { name: "Pause and settings" }).click();
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pitlane.workshop.v1")),
  );
  const pausedStaff = (await data()).mechanic;
  await page.waitForTimeout(800);
  expect((await data()).mechanic).toBe(pausedStaff);
  await page.getByRole("button", { name: "Manage crew" }).click();
  await page.getByRole("button", { name: "Send on break" }).click();
  await page.getByRole("button", { name: "Close team desk" }).click();
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector(".workshop-stage").dataset.mechanic)
        .phase === "break",
    null,
    { timeout: 20000 },
  );
  const onBreak = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pitlane.workshop.v1")),
  );
  expect(onBreak.order.progress["wheel-left"]).toBeGreaterThanOrEqual(
    before.order.progress["wheel-left"],
  );
  expect(onBreak.mechanic.enabled).toBe(false);
  expect(onBreak.mechanic.carried).toBeNull();
  const creditOnBreak = Number((await data()).credits);
  await page.screenshot({ path: out + "/mechanic-break.png" });
  await page.getByRole("button", { name: "Pause and settings" }).click();
  await page.getByRole("button", { name: "Manage crew" }).click();
  await page.getByRole("button", { name: "Assign to bay 01" }).click();
  await page.getByRole("button", { name: "Close team desk" }).click();
  await expect(stage).toHaveAttribute("data-serviced", "11", {
    timeout: 65000,
  });
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector(".workshop-stage").dataset.mechanic)
        .earnings === 90,
    null,
    { timeout: 15000 },
  );
  await expect(stage).toHaveAttribute(
    "data-credits",
    String(creditOnBreak + 90),
  );
  await page.screenshot({ path: out + "/mechanic-paid.png" });
  await expect(stage).toHaveAttribute("data-order", "7", { timeout: 25000 });
  await page.waitForFunction(
    () =>
      JSON.parse(document.querySelector(".workshop-stage").dataset.mechanic)
        .phase === "working",
    null,
    { timeout: 20000 },
  );
  await page.screenshot({ path: out + "/mechanic-engine.png" });
  await expect(stage).toHaveAttribute("data-race-phase", "result", {
    timeout: 60000,
  });
  await page.getByRole("button", { name: "Open race report" }).click();
  await page.getByRole("button", { name: "Rustback & racing" }).click();
  await page.getByRole("button", { name: "Collect 70 Credits" }).click();
  await expect(stage).toHaveAttribute("data-race-rep", "4");
  await page.getByRole("button", { name: "Pause and settings" }).click();
  await page.getByRole("button", { name: "Manage crew" }).click();
  await page.getByRole("button", { name: "Send on break" }).click();
  await page.getByRole("button", { name: "Close team desk" }).click();
  await page.reload();
  await page.locator(".workshop-hud").waitFor({ timeout: 60000 });
  expect(JSON.parse((await data()).mechanic).enabled).toBe(false);
  expect(JSON.parse((await data()).mechanic).hired).toBe(true);
  await expect(stage).toHaveAttribute("data-character", "dash");
  expect(errors).toEqual([]);
  await fs.writeFile(
    out + "/mechanic.json",
    JSON.stringify(
      {
        passed: true,
        failedLoadNotCharged: true,
        hireOnce: true,
        independentWheelCarry: true,
        partialWorkAndReload: true,
        breakAndResume: true,
        autonomousPaymentAndNextJob: true,
        raceConcurrent: true,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS hire, asset retry without charge, autonomous wheels/payment/next engine job, pause/break/reload and concurrent race.",
  );
} catch (error) {
  await page
    .screenshot({ path: out + "/mechanic-failure.png" })
    .catch(() => {});
  console.log("FAIL STATE", await data().catch(() => null));
  throw new Error(error.message.split("Call log:")[0]);
} finally {
  await keys([]).catch(() => {});
  await browser.close();
}
